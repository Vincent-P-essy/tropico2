import { BASE_WORK_RATE, OVERSEER_BONUS, SKILL_OUTPUT_STEP } from "../data/balance.ts";
import { BUILDINGS, type BuildingDef } from "../data/buildings.ts";
import { JOBS, type JobId } from "../data/jobs.ts";
import type { Building, GameState, Person } from "./types.ts";

/**
 * Who works where.
 *
 * The original assigned captives to buildings by itself and gave the player no
 * say at all, which meant a tavern could sit dry for a year because the game had
 * quietly decided its hauler was better used on a farm. Auto-assignment is kept,
 * because managing two hundred people by hand is not a game — but it can be
 * overridden per person, and a manual assignment is never taken away again.
 */

/**
 * The largest share of the band that will take a job ashore. The rest lounge
 * about waiting for a berth, which is what pirates do.
 */
const PIRATE_SHORE_WORK = 0.35;

/** Staffing priority decides who gets the last spare captive. */
const PRIORITY_WEIGHT: Record<Building["priority"], number> = {
  low: 0.5,
  normal: 1,
  high: 2.5,
};

export interface OpenSlot {
  building: Building;
  job: JobId;
  /** How many of this job are still wanted here. */
  count: number;
}

/** Jobs this building still wants filled. */
export function openSlots(state: GameState, building: Building): OpenSlot[] {
  if (building.construction > 0 || !building.enabled) return [];
  const def = BUILDINGS[building.def];
  if (!def.staff) return [];

  const filled = new Map<JobId, number>();
  for (const id of building.workers) {
    const worker = state.people.get(id);
    if (!worker?.job) continue;
    filled.set(worker.job.job, (filled.get(worker.job.job) ?? 0) + 1);
  }

  const out: OpenSlot[] = [];
  for (const slot of def.staff) {
    const missing = slot.count - (filled.get(slot.job) ?? 0);
    if (missing > 0) out.push({ building, job: slot.job, count: missing });
  }
  return out;
}

/** Whether this person could hold this job at all. */
export function canWork(person: Person, job: JobId): boolean {
  if (person.activity === "dead") return false;
  const def = JOBS[job];

  if (def.workforce === "pirate") {
    if (person.kind !== "pirate") return false;
    // A pirate at sea is not available for work ashore.
    return person.ship < 0;
  }

  if (person.kind !== "captive") return false;
  // Wealthy captives do no work; that is rather the point of them.
  if (person.wealthy) return false;
  // Skeletons are strong backs and nothing else.
  if (person.skeleton) return job === "hauler";
  if (def.skilled && person.profession !== job) return false;
  if (def.sex && person.sex !== def.sex) return false;
  return true;
}

export function isEmployed(person: Person): boolean {
  return person.job !== null;
}

/** Puts a person into a specific job at a specific building. */
export function assignTo(
  state: GameState,
  person: Person,
  building: Building,
  job: JobId,
): boolean {
  if (!canWork(person, job)) return false;
  release(state, person);
  person.job = { building: building.id, job };
  building.workers.push(person.id);
  return true;
}

/** Takes a person out of whatever job they hold. */
export function release(state: GameState, person: Person): void {
  if (!person.job) return;
  const building = state.buildings.get(person.job.building);
  if (building) building.workers = building.workers.filter((id) => id !== person.id);
  person.job = null;
  if (person.activity === "working") {
    person.activity = "idle";
    person.target = -1;
    person.path = [];
  }
}

/**
 * Assigns the person to any job this building still wants and they can do.
 * This is what the building panel's "hire" button calls.
 */
export function assignToBuilding(state: GameState, person: Person, building: Building): boolean {
  for (const slot of openSlots(state, building)) {
    if (canWork(person, slot.job)) return assignTo(state, person, building, slot.job);
  }
  return false;
}

/**
 * Fills open jobs from the unemployed, best-priority first.
 *
 * Runs periodically rather than every tick — nobody changes career hourly, and
 * the sort is over every building on the island.
 */
export function autoAssign(state: GameState): number {
  const idle: Person[] = [];
  let pirates = 0;
  let piratesWorking = 0;
  for (const person of state.people.values()) {
    if (person.activity === "dead") continue;
    if (person.kind === "pirate" && person.ship < 0) {
      pirates++;
      if (isEmployed(person)) piratesWorking++;
    }
    if (isEmployed(person)) continue;
    if (person.kind === "captive" && person.wealthy) continue;
    if (person.kind === "pirate" && person.ship >= 0) continue;
    idle.push(person);
  }
  if (idle.length === 0) return 0;

  /*
   * Only a minority of the band will stand over somebody else's work.
   *
   * The original was explicit that overseer and guard berths are poorly paid
   * and that pirates would rather be at sea. Signing every pirate up as an
   * overseer also quietly wrecks them: an employed pirate only ever addresses
   * his single most urgent need before going back to his post, and he has six,
   * so the whole band settles at a permanent misery no amount of taverns fixes.
   */
  let pirateBerths = Math.max(1, Math.round(pirates * PIRATE_SHORE_WORK) - piratesWorking);

  const slots: OpenSlot[] = [];
  for (const building of state.buildings.values()) {
    slots.push(...openSlots(state, building));
  }
  if (slots.length === 0) return 0;

  // High-priority buildings first; within a priority, skilled work first,
  // because a distillery with no distiller is idle no matter how many haulers
  // it has. Ties break on building id so the result is deterministic.
  slots.sort((a, b) => {
    const weight = PRIORITY_WEIGHT[b.building.priority] - PRIORITY_WEIGHT[a.building.priority];
    if (weight !== 0) return weight;
    // Up the supply chain, not down it. Crewing the kitchens before the farms
    // puts five cooks to work on the corn one farmer can grow, and the island
    // starves with its kitchens fully manned.
    const chain = chainDepth(a.building) - chainDepth(b.building);
    if (chain !== 0) return chain;
    const skilled = Number(JOBS[b.job].skilled) - Number(JOBS[a.job].skilled);
    if (skilled !== 0) return skilled;
    return a.building.id - b.building.id;
  });

  let assigned = 0;

  /** Puts one idle hand into this slot, or reports that nobody suitable was free. */
  const take = (slot: OpenSlot): boolean => {
    if (slot.count <= 0) return false;
    const pirateJob = JOBS[slot.job].workforce === "pirate";
    if (pirateJob && pirateBerths <= 0) return false;

    const index = idle.findIndex((person) => canWork(person, slot.job));
    if (index < 0) return false;
    const person = idle[index];
    if (!person) return false;
    idle.splice(index, 1);
    if (!assignTo(state, person, slot.building, slot.job)) return false;

    slot.count--;
    assigned++;
    if (pirateJob) pirateBerths--;
    return true;
  };

  const bands = new Map<number, OpenSlot[]>();
  for (const slot of slots) {
    const weight = PRIORITY_WEIGHT[slot.building.priority];
    const band = bands.get(weight);
    if (band) band.push({ ...slot });
    else bands.set(weight, [{ ...slot }]);
  }

  for (const weight of [...bands.keys()].sort((a, b) => b - a)) {
    const band = bands.get(weight) ?? [];
    if (idle.length === 0) break;

    // One man everywhere in the band before anybody gets a second. A tavern with
    // a single barman pours rum; a tavern with none is a shed.
    const opened = new Set<number>();
    for (const slot of band) {
      if (idle.length === 0) break;
      if (opened.has(slot.building.id)) continue;
      if (take(slot)) opened.add(slot.building.id);
    }

    // Then round and round the band until it is full or nobody is left.
    for (;;) {
      let placed = false;
      for (const slot of band) placed = take(slot) || placed;
      if (!placed || idle.length === 0) break;
    }
  }
  return assigned;
}

/** Workers actually present and working, by job. */
/**
 * Who is at their post, by job.
 *
 * A hauler out fetching counts as present, and that is not a leniency — it is
 * the difference between modelling the building and double-counting the walk.
 * His job is to be away. Marking him missing while he does it halved every
 * kitchen's output permanently: a chuck tent has a cook and a hauler, so with
 * the hauler on the road it ran at one half for ever, which put two kitchens at
 * nine bowls a day against thirty-six captives eating seven. That is a margin
 * of two bowls, and on any island where the corn happened to be a few tiles
 * further the walk got longer, the margin went negative and everybody starved -
 * about one island in four, with nothing to distinguish it from the others.
 *
 * The corn he carries is already the constraint. Charging the building for the
 * time he spends carrying it counts the same delay twice.
 */
export function presentWorkers(state: GameState, building: Building): Map<JobId, Person[]> {
  const byJob = new Map<JobId, Person[]>();
  for (const id of building.workers) {
    const person = state.people.get(id);
    if (!person?.job || person.activity === "dead") continue;
    const onAnErrand =
      person.job.building === building.id &&
      (person.activity === "fetching" || person.activity === "delivering");
    if (person.activity !== "working" && !onAnErrand) continue;
    const list = byJob.get(person.job.job) ?? [];
    list.push(person);
    byJob.set(person.job.job, list);
  }
  return byJob;
}

/**
 * How fast this building is running, as a multiple of its nominal rate.
 *
 * Zero when a required worker is missing — a sawmill with no lumberjack does
 * not run slowly, it does not run. An overseer standing over the work adds a
 * third again, which is the only reason to spend a pirate on it.
 */
/**
 * How far down the supply chain a building sits.
 *
 * Nothing to nobody: a farm or a timber camp takes from the ground and needs no
 * delivery, so it can be worked first and always usefully. A brewery or a
 * kitchen is idle until something upstream has run for a while. A tavern is
 * worth staffing only once there is something to serve.
 */
function chainDepth(building: Building): number {
  const def = BUILDINGS[building.def];
  if (def.recipe) return def.recipe.inputs.length === 0 ? 0 : 1;
  return 2;
}

export function workRate(state: GameState, building: Building): number {
  if (building.construction > 0 || !building.enabled) return 0;
  const def: BuildingDef = BUILDINGS[building.def];
  if (!def.staff || def.staff.length === 0) return BASE_WORK_RATE;

  const present = presentWorkers(state, building);
  let productive = 0;
  let wanted = 0;
  let skillSum = 0;
  let skillCount = 0;
  let overseer = false;

  for (const slot of def.staff) {
    const workers = present.get(slot.job) ?? [];
    if (JOBS[slot.job].workforce === "pirate") {
      if (slot.job === "overseer" && workers.length > 0) overseer = true;
      continue;
    }
    wanted += slot.count;
    productive += Math.min(workers.length, slot.count);
    for (const worker of workers) {
      skillSum += worker.skill;
      skillCount++;
    }
  }

  if (wanted === 0) return BASE_WORK_RATE;
  if (productive === 0) return 0;

  const staffing = productive / wanted;
  const averageSkill = skillCount === 0 ? 3 : skillSum / skillCount;
  const skillFactor = 1 + (averageSkill - 3) * SKILL_OUTPUT_STEP;
  return staffing * Math.max(0.2, skillFactor) * (overseer ? 1 + OVERSEER_BONUS : 1);
}

/**
 * Average skill of the people who serve here, which sets service quality.
 *
 * Deliberately counts everyone *assigned*, not only those standing inside right
 * now. Staff are forever stepping out to eat and sleep, and tying quality to
 * momentary presence made every tavern and chuck tent on the island flicker
 * between excellent and non-existent from hour to hour — a captive would arrive
 * to find the counter had ceased to exist. Production still needs hands on the
 * job; being open for business does not.
 */
export function serviceSkill(state: GameState, building: Building): number {
  let sum = 0;
  let count = 0;
  for (const id of building.workers) {
    const worker = state.people.get(id);
    if (worker?.kind !== "captive") continue;
    if (worker.activity === "dead" || worker.activity === "atSea") continue;
    sum += worker.skill;
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

/** How many of each job this building wants in total. */
export function requiredStaff(building: Building): Map<JobId, number> {
  const out = new Map<JobId, number>();
  for (const slot of BUILDINGS[building.def].staff ?? []) {
    out.set(slot.job, (out.get(slot.job) ?? 0) + slot.count);
  }
  return out;
}

export function isFullyStaffed(state: GameState, building: Building): boolean {
  return openSlots(state, building).length === 0;
}
