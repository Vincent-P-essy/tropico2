import { euclidean } from "../core/grid.ts";
import { MAX_SERVICE_WALK, SERVICE_STOCK_CAP } from "../data/balance.ts";
import { BUILDINGS, HOUSING_LEVELS, type NeedProvision } from "../data/buildings.ts";
import { FLAWS } from "../data/traits.ts";
import type { NeedId } from "../data/needs.ts";
import { serviceSkill } from "./employment.ts";
import type { Building, GameState, Person } from "./types.ts";

/**
 * Finding somewhere to meet a need.
 *
 * Service quality is not a property of the building — it is a property of the
 * building *right now*: who is serving, and what is in the cellar. A tavern with
 * a skilled server and a barrel of rum is nearly the best drink on the island; the
 * same tavern with an unskilled server and nothing stocked is barely worth the
 * walk. That gap is the entire reason the supply chain matters.
 */

/**
 * How well this building currently meets one of its needs, 0-100.
 *
 * The building's own range sets the floor and ceiling; staff skill moves you
 * through it, and stocking the goods it likes moves you the rest of the way.
 */
export function serviceQuality(
  state: GameState,
  building: Building,
  provision: NeedProvision,
): number {
  if (building.construction > 0 || !building.enabled) return 0;

  const span = provision.max - provision.min;
  if (span <= 0) return provision.min;

  const def = BUILDINGS[building.def];

  // A building that cooks what it serves must actually have some. A chuck tent
  // with no slop feeds nobody, however well staffed it is — which is the whole
  // reason corn matters.
  if (def.recipe && (building.stock[def.recipe.output] ?? 0) <= 0) return 0;

  // Buildings with no staff (a bunkhouse, a hotel) simply work.
  const skill = def.staff && def.staff.length > 0 ? serviceSkill(state, building) : 5;
  if (def.staff && def.staff.length > 0 && skill <= 0) return 0;

  // Skill 1 sits at the floor, skill 6 two thirds of the way up.
  const fromSkill = Math.min(1, Math.max(0, (skill - 1) / 5)) * 0.66;

  let fromGoods: number;
  if (provision.boostedBy && provision.boostedBy.length > 0) {
    let best = 0;
    for (const good of provision.boostedBy) {
      if ((building.stock[good] ?? 0) > 0) {
        // Later entries in the list are the better drink: rum beats beer.
        const rank = provision.boostedBy.indexOf(good);
        best = Math.max(best, 1 - rank * 0.25);
      }
    }
    fromGoods = best * 0.34;
  } else {
    // Nothing to stock, so skill alone carries the full range.
    fromGoods = 0.34;
  }

  return provision.min + span * Math.min(1, fromSkill + fromGoods);
}

/** Pirate housing quality follows the occupant's rank, not the catalogue range. */
function housingQuality(building: Building, need: NeedId): number {
  const level = HOUSING_LEVELS[Math.min(building.level, HOUSING_LEVELS.length - 1)];
  if (!level) return 0;
  return need === "stashing" ? level.stashing : level.resting;
}

/** Every need this building can currently meet, with the quality it would give. */
export function providedNeeds(
  state: GameState,
  building: Building,
): { need: NeedId; quality: number }[] {
  const def = BUILDINGS[building.def];
  if (!def.provides) return [];
  return def.provides.map((provision) => ({
    need: provision.need,
    quality:
      building.def === "pirateHousing"
        ? housingQuality(building, provision.need)
        : serviceQuality(state, building, provision),
  }));
}

export function capacityOf(building: Building): number {
  return BUILDINGS[building.def].serves?.capacity ?? 0;
}

export function hasRoom(building: Building): boolean {
  return building.visitors.length < capacityOf(building);
}

/** Whether this person is allowed through the door at all. */
export function admits(state: GameState, building: Building, person: Person): boolean {
  const def = BUILDINGS[building.def];
  if (!def.serves) return false;
  if (building.construction > 0 || !building.enabled) return false;

  // Wealthy captives patronise pirate entertainment, and are why an inn pays.
  if (def.serves.who === "pirate") {
    if (person.kind === "pirate") return true;
    return person.wealthy;
  }

  if (person.kind !== "captive") return false;
  // A hotel is for wealthy captives; a bunkhouse is not.
  if (building.def === "hotel") return person.wealthy;

  // A fanatic king bars captives of the wrong faith from his church, and they
  // grow resentful for exactly as long as he keeps it up.
  if (building.def === "church") {
    const allowed = FLAWS[state.king.flaw].effects.churchOnlyFor;
    if (allowed && !allowed.includes(person.nationality)) return false;
  }

  // A pirate's own plot is his and nobody else's.
  if (building.def === "pirateHousing") return false;
  return true;
}

export interface ServiceOption {
  building: Building;
  quality: number;
  distance: number;
  /** Quality discounted by how far it is; the walk is part of the cost. */
  score: number;
}

/**
 * The best place for this person to go for this need, or null when there is
 * nowhere they can reach.
 *
 * A pirate goes to his own house for resting and stashing and nowhere else,
 * which is why a captain with no plot is a standing problem.
 */
export function findService(state: GameState, person: Person, need: NeedId): ServiceOption | null {
  if (person.kind === "pirate" && (need === "resting" || need === "stashing")) {
    const home = person.home >= 0 ? state.buildings.get(person.home) : undefined;
    if (!home || home.construction > 0) {
      // A pirate aboard ship sleeps aboard ship; ashore with no plot, rough.
      return null;
    }
    return {
      building: home,
      quality: housingQuality(home, need),
      distance: euclidean(person.x, person.y, home.x, home.y),
      score: housingQuality(home, need),
    };
  }

  let best: ServiceOption | null = null;

  for (const building of state.buildings.values()) {
    if (!admits(state, building, person)) continue;
    if (!hasRoom(building)) continue;

    const provisions = providedNeeds(state, building);
    const match = provisions.find((p) => p.need === need);
    if (!match || match.quality <= 0) continue;
    if (match.quality <= person.needs[need]) continue;

    const distance = euclidean(
      person.x,
      person.y,
      building.x + building.w / 2,
      building.y + building.h / 2,
    );
    if (distance > MAX_SERVICE_WALK) continue;

    // A slightly better tavern twice as far away is not better.
    const score = match.quality - distance * 1.6;
    if (!best || score > best.score) {
      best = { building, quality: match.quality, distance, score };
    }
  }

  return best;
}

/** A captive with nowhere assigned sleeps in any bunkhouse or the stockade. */
export function findBed(state: GameState, person: Person): Building | null {
  const option = findService(state, person, "resting");
  return option?.building ?? null;
}

/** Stock cap for a service building, which is smaller than a factory's. */
export function serviceStockCap(): number {
  return SERVICE_STOCK_CAP;
}

/**
 * Why this building is not doing its job, in the player's words.
 *
 * The original's most-cited flaw was that a broken supply chain was invisible:
 * a tavern with no hauler simply never had grog, and nothing on screen said so.
 * Every building can answer this question now.
 */
export function diagnose(state: GameState, building: Building): string | null {
  const def = BUILDINGS[building.def];

  if (building.construction > 0) return "Still under construction";
  if (!building.enabled) return "You have shut it down";

  if (def.staff) {
    const missing: string[] = [];
    const present = new Map<string, number>();
    for (const id of building.workers) {
      const worker = state.people.get(id);
      if (!worker?.job) continue;
      present.set(worker.job.job, (present.get(worker.job.job) ?? 0) + 1);
    }
    for (const slot of def.staff) {
      const have = present.get(slot.job) ?? 0;
      if (have < slot.count) missing.push(`${slot.count - have} ${slot.job}`);
    }
    if (missing.length > 0) return `Short of staff: ${missing.join(", ")}`;
  }

  if (def.recipe) {
    const starved = def.recipe.inputs.filter(
      (input) => (building.stock[input.good] ?? 0) < input.amount,
    );
    if (starved.length > 0) {
      return `No ${starved.map((s) => s.good).join(" or ")} delivered — check the haulers`;
    }
  }

  if (def.provides) {
    const wanted = def.provides.flatMap((p) => p.boostedBy ?? []);
    const empty = wanted.filter((good) => (building.stock[good] ?? 0) <= 0);
    if (wanted.length > 0 && empty.length === wanted.length) {
      return `Nothing stocked — no ${empty.join(" or ")} has arrived`;
    }
  }

  return null;
}
