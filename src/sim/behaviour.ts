import { euclidean, rectCenter, rectPerimeter, type Point } from "../core/grid.ts";
import { findPath, octile } from "../core/path.ts";
import {
  GROUND_PATH_COST,
  JUNGLE_PATH_COST,
  NEED_SATISFIED,
  NEED_URGENT,
  ROAD_PATH_COST,
  ROAD_SPEED_BONUS,
  SERVICE_FILL,
  HAULER_LOAD,
  SERVICE_HOURS,
  TICKS_PER_YEAR,
  WALK_SPEED,
} from "../data/balance.ts";
import { BUILDINGS } from "../data/buildings.ts";
import { NEEDS, type NeedId } from "../data/needs.ts";
import { JUNGLE, isLand } from "./island.ts";
import {
  decayNeeds,
  needsOf,
  RELIGION_GRACE_YEARS,
  satisfyNeed,
  updateMood,
  updateStarvation,
} from "./people.ts";
import { addStock, sourcesFor, stockCap, stockOf, takeStock, wantedGoods } from "./economy.ts";
import { gamblingRig } from "./edicts.ts";
import { findService, providedNeeds } from "./services.ts";
import { isRoad } from "./state.ts";
import type { Building, GameState, Person } from "./types.ts";

/**
 * What everybody does all day.
 *
 * One state machine, run for every person every tick: decide, walk, arrive, be
 * served or work, leave, decide again. Needs drain the whole time, so the shape
 * of the island — how far a captive must walk from the cane field to the chuck
 * tent — is felt directly in whether the population is fed.
 */

/** A person may stand on land that is not built over, or on a road. */
export function passable(state: GameState, x: number, y: number): boolean {
  if (!isLand(state.island, x, y)) return false;
  if (isRoad(state, x, y)) return true;
  return state.occupancy.get(x, y) < 0;
}

/**
 * Passability as seen by someone currently standing inside a building.
 *
 * Anyone working or being served stands on their building's own tiles, and
 * those tiles are impassable to everyone else. Without this exemption a worker
 * in anything bigger than a two-by-two is walled in: every neighbour of the
 * tile he is standing on belongs to the same building, the search finds no
 * route out, and he stays at his post until he starves — beside a full larder.
 */
export function passableFor(state: GameState, person: Person): (x: number, y: number) => boolean {
  const inside = state.occupancy.get(Math.floor(person.x), Math.floor(person.y));
  if (inside < 0) return (x, y) => passable(state, x, y);
  return (x, y) => passable(state, x, y) || state.occupancy.get(x, y) === inside;
}

/** Roads are cheap, jungle is slow, everything else is ordinary going. */
export function stepCost(state: GameState, x: number, y: number): number {
  if (isRoad(state, x, y)) return ROAD_PATH_COST;
  if (state.island.terrain.get(x, y) === JUNGLE) return JUNGLE_PATH_COST;
  return GROUND_PATH_COST;
}

/** Tiles a person can stand on to use a building: its perimeter, or its own tiles. */
export function accessTiles(state: GameState, building: Building): Point[] {
  const tiles = rectPerimeter(building).filter((p) => passable(state, p.x, p.y));
  if (tiles.length > 0) return tiles;
  // Roads are their own access; a 1x1 decor may have no free perimeter at all.
  return [{ x: building.x, y: building.y }];
}

/** Routes a person to a building, returning false when there is no way there. */
export function routeToBuilding(
  state: GameState,
  person: Person,
  building: Building,
  intent: Person["intent"] = "work",
): boolean {
  const goals = new Set(accessTiles(state, building).map((p) => `${p.x},${p.y}`));
  if (goals.size === 0) return false;

  const centre = rectCenter(building);
  const walkable = passableFor(state, person);
  const path = findPath({
    size: state.island,
    passable: walkable,
    cost: (x, y) => stepCost(state, x, y),
    start: { x: person.x, y: person.y },
    isGoal: (x, y) => goals.has(`${x},${y}`),
    heuristic: (x, y) => octile(x, y, Math.floor(centre.x), Math.floor(centre.y)) * ROAD_PATH_COST,
  });

  if (!path) return false;
  vacate(state, person);
  person.path = path;
  person.target = building.id;
  person.intent = intent;
  person.activity = "walking";
  return true;
}

/** Routes a person to a bare tile, for fleeing and wandering. */
export function routeToTile(state: GameState, person: Person, x: number, y: number): boolean {
  const walkable = passableFor(state, person);
  const path = findPath({
    size: state.island,
    passable: walkable,
    cost: (px, py) => stepCost(state, px, py),
    start: { x: person.x, y: person.y },
    isGoal: (px, py) => px === x && py === y,
    heuristic: (px, py) => octile(px, py, x, y) * ROAD_PATH_COST,
  });
  if (!path) return false;
  vacate(state, person);
  person.path = path;
  person.target = -1;
  person.activity = "walking";
  return true;
}

/**
 * Moves a walker along its route. Returns true on arrival.
 *
 * Speed is per real hour of game time and nearly doubles on a road, which is
 * what makes a road worth its lumber: the same island with roads feeds more
 * people, because every trip is shorter.
 */
export function advance(state: GameState, person: Person, hours: number): boolean {
  let remaining =
    WALK_SPEED *
    hours *
    (isRoad(state, Math.floor(person.x), Math.floor(person.y)) ? ROAD_SPEED_BONUS : 1);

  while (remaining > 0 && person.path.length > 0) {
    const next = person.path[0];
    if (!next) break;
    const dx = next.x - person.x;
    const dy = next.y - person.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= remaining) {
      person.x = next.x;
      person.y = next.y;
      person.path.shift();
      remaining -= distance;
    } else {
      person.x += (dx / distance) * remaining;
      person.y += (dy / distance) * remaining;
      remaining = 0;
    }
  }

  return person.path.length === 0;
}

/** The need most worth doing something about, or null when all are comfortable. */
export function urgentNeed(person: Person): NeedId | null {
  let worst: NeedId | null = null;
  let worstScore = Infinity;

  for (const need of needsOf(person)) {
    const value = person.needs[need];
    if (value >= NEED_URGENT) continue;
    // Weight by how much the need matters, so hunger outranks a game of dice.
    const score = value / NEEDS[need].weight;
    if (score < worstScore) {
      worstScore = score;
      worst = need;
    }
  }

  return worst;
}

/** Removes a person from whatever building currently lists them as inside. */
export function vacate(state: GameState, person: Person): void {
  if (person.inside < 0) return;
  const building = state.buildings.get(person.inside);
  if (building) building.visitors = building.visitors.filter((id) => id !== person.id);
  person.inside = -1;
}

function enter(
  state: GameState,
  person: Person,
  building: Building,
  activity: Person["activity"],
): void {
  vacate(state, person);
  const centre = rectCenter(building);
  person.x = centre.x - 0.5;
  person.y = centre.y - 0.5;
  person.activity = activity;
  person.target = building.id;
  person.inside = building.id;
  person.path = [];
  // Staff are not customers. A chuck tent that serves seven serves seven
  // diners; its cook does not eat one of the seats.
  if (activity !== "working" && !building.visitors.includes(person.id)) {
    building.visitors.push(person.id);
  }
}

function leave(state: GameState, person: Person): void {
  vacate(state, person);
  person.activity = "idle";
  person.target = -1;
}

/**
 * Serves a person for the time they spend inside, filling whichever needs this
 * building meets — an inn fills three at once, which is what makes it worth the
 * gold.
 */
function serve(state: GameState, person: Person, building: Building, hours: number): void {
  const provisions = providedNeeds(state, building);
  const fraction = Math.min(1, (hours / SERVICE_HOURS) * SERVICE_FILL);
  const rig = gamblingRig(state);
  for (const provision of provisions) {
    if (!needsOf(person).includes(provision.need)) continue;
    // Rigging the tables is felt exactly where you would expect: at the tables.
    const quality =
      provision.need === "gambling" ? provision.quality * rig.satisfaction : provision.quality;
    satisfyNeed(person, provision.need, Math.min(100, quality), fraction);
  }

  // Eating consumes what was cooked. A chuck tent's slop is used up by the
  // captives who eat it, so a stalled corn supply is felt within days.
  const recipe = BUILDINGS[building.def].recipe;
  if (recipe && provisions.length > 0) {
    const eaten = Math.min(building.stock[recipe.output] ?? 0, hours / SERVICE_HOURS);
    building.stock[recipe.output] = (building.stock[recipe.output] ?? 0) - eaten;
  }

  const fee = BUILDINGS[building.def].fee;
  if (fee !== undefined && hours > 0) {
    // Pirates and wealthy captives pay for their pleasures, and the takings are
    // the island's second income after plunder.
    const gambles = provisions.some((p) => p.need === "gambling");
    const share = fee * (hours / SERVICE_HOURS) * (gambles ? rig.profit : 1);
    const paid = Math.min(person.gold, share);
    person.gold -= paid;
    state.treasury += paid;
    if (person.wealthy) person.ransom += paid * 2;
  }
}

/** One person, one tick. */
export function updatePerson(state: GameState, person: Person, hours: number): void {
  if (person.activity === "dead" || person.activity === "atSea") return;

  decayNeeds(person, hours, state.tick >= RELIGION_GRACE_YEARS * TICKS_PER_YEAR);
  if (updateStarvation(state, person, hours)) return;

  switch (person.activity) {
    case "idle":
      decide(state, person);
      break;

    case "walking": {
      const arrived = advance(state, person, hours);
      if (!arrived) break;
      const building = person.target >= 0 ? state.buildings.get(person.target) : undefined;
      if (!building) {
        person.activity = "idle";
        break;
      }
      if (person.intent === "serve") {
        enter(state, person, building, "using");
        person.timer = SERVICE_HOURS;
      } else {
        enter(state, person, building, "working");
      }
      break;
    }

    case "fetching": {
      // Out to a store that has what this hauler's workplace needs.
      if (!advance(state, person, hours)) break;
      const source = person.errand >= 0 ? state.buildings.get(person.errand) : undefined;
      const home = person.job ? state.buildings.get(person.job.building) : undefined;
      if (!source || !home) {
        person.errand = -1;
        person.activity = "idle";
        break;
      }
      loadFrom(source, home, person);
      person.errand = -1;
      if (!routeHome(state, person, home)) person.activity = "idle";
      break;
    }

    case "delivering": {
      // Back again with it on his shoulder.
      if (!advance(state, person, hours)) break;
      const home = person.job ? state.buildings.get(person.job.building) : undefined;
      if (!home) {
        person.carrying = null;
        person.activity = "idle";
        break;
      }
      if (person.carrying) {
        addStock(home, person.carrying.good, person.carrying.amount);
        person.carrying = null;
      }
      enter(state, person, home, "working");
      break;
    }

    case "using": {
      const building = person.target >= 0 ? state.buildings.get(person.target) : undefined;
      if (!building) {
        person.activity = "idle";
        break;
      }
      serve(state, person, building, hours);
      person.timer -= hours;
      if (person.timer <= 0) leave(state, person);
      break;
    }

    case "working": {
      const building = person.target >= 0 ? state.buildings.get(person.target) : undefined;
      if (!building || person.job?.building !== building.id) {
        leave(state, person);
        break;
      }
      // A need gone critical pulls a worker off the job — but only if there is
      // somewhere to take it. Leaving anyway deadlocks the island: the hungry
      // cook abandons the chuck tent, the chuck tent stops serving, and now
      // nobody on the island can eat, including the cook. A worker with nowhere
      // to go stays at his post, which is also what a real one would do.
      // Checked a few times a day rather than hourly: searching every building
      // on the island for somewhere to eat is the most expensive thing a person
      // does, and a worker who has been hungry for an hour is no more likely to
      // find a kitchen than he was the hour before.
      const need = (person.id + state.tick) % 6 === 0 ? urgentNeed(person) : null;
      if (need !== null && person.needs[need] < NEED_URGENT * 0.6) {
        if (findService(state, person, need)) {
          leave(state, person);
          break;
        }
      }
      if (person.job.job === "hauler") startErrand(state, person, building);
      break;
    }

    case "resting":
    case "sleepingRough": {
      satisfyNeed(person, "resting", 42, Math.min(1, hours / (SERVICE_HOURS * 2)));
      person.timer -= hours;
      if (person.timer <= 0) person.activity = "idle";
      break;
    }

    case "fleeing": {
      const arrived = advance(state, person, hours * 1.5);
      if (arrived) person.activity = "idle";
      break;
    }

    case "rioting":
      person.timer -= hours;
      if (person.timer <= 0) person.activity = "idle";
      break;

    default:
      break;
  }

  updateMood(state, person, hours);
}

/**
 * Sends a person to be served at a building.
 *
 * Handles the case the original state machine got wrong: when the place that
 * meets the need is the place the person already stands in — his own workplace —
 * he sits down to be served rather than setting off on a zero-length walk that
 * lands him straight back at his post.
 */
function serveAt(state: GameState, person: Person, building: Building): boolean {
  if (person.inside === building.id) {
    enter(state, person, building, "using");
    person.timer = SERVICE_HOURS;
    return true;
  }
  return routeToBuilding(state, person, building, "serve");
}

/**
 * Sends a hauler out for whatever his workplace is short of.
 *
 * This is the single most load-bearing behaviour in the economy. Every recipe
 * building and every tavern depends on somebody physically walking its inputs
 * over, so a workplace whose hauler slot is empty simply stops — visibly, and
 * with a reason the building will give you if asked.
 */
export function startErrand(state: GameState, person: Person, home: Building): boolean {
  if (person.carrying) return false;

  for (const good of wantedGoods(home)) {
    if (stockOf(home, good) >= stockCap(home.def) * 0.75) continue;
    for (const source of sourcesFor(state, home, good)) {
      if (!routeToBuilding(state, person, source, "fetch")) continue;
      person.errand = source.id;
      person.activity = "fetching";
      return true;
    }
  }
  return false;
}

/** Loads as much as one pair of arms will carry of whatever the workplace wants. */
function loadFrom(source: Building, home: Building, person: Person): void {
  for (const good of wantedGoods(home)) {
    if (stockOf(home, good) >= stockCap(home.def)) continue;
    const taken = takeStock(source, good, HAULER_LOAD);
    if (taken > 0) {
      person.carrying = { good, amount: taken };
      return;
    }
  }
}

function routeHome(state: GameState, person: Person, home: Building): boolean {
  if (!routeToBuilding(state, person, home, "deliver")) return false;
  person.activity = "delivering";
  return true;
}

/**
 * Picks the next thing to do.
 *
 * Scores every unmet need at once rather than fixating on the single worst one.
 * The earlier version took the most urgent need, tried to reach it, and on
 * failure fell through to whichever need happened to be first in the list —
 * so a pirate with no reachable house would walk to the tavern, come back,
 * and walk to the tavern again while his need for sleep drained to nothing.
 * Considering the alternatives together fixes that, and it also produces
 * better behaviour in general: a slightly less urgent need with a much better
 * provider nearby wins, which is what a person would actually do.
 */
function decide(state: GameState, person: Person): void {
  let best: { building: Building; score: number } | null = null;
  let restingUnmet = false;

  for (const need of needsOf(person)) {
    const value = person.needs[need];
    if (value >= NEED_SATISFIED) continue;

    const option = findService(state, person, need);
    if (!option) {
      if (need === "resting" && value < NEED_URGENT) restingUnmet = true;
      continue;
    }

    // How much this trip is worth: what it would fill, weighted by how much the
    // need matters and how badly it is wanting, less the walk.
    const gain = Math.max(0, option.quality - value);
    const urgency = 1 + Math.max(0, (NEED_URGENT - value) / NEED_URGENT) * 2.5;
    const score = gain * urgency * NEEDS[need].weight - option.distance * 1.4;
    if (!best || score > best.score) best = { building: option.building, score };
  }

  if (best && best.score > 0 && serveAt(state, person, best.building)) return;

  if (person.job) {
    const workplace = state.buildings.get(person.job.building);
    if (workplace) {
      const centre = rectCenter(workplace);
      if (euclidean(person.x, person.y, centre.x, centre.y) < 1.5) {
        enter(state, person, workplace, "working");
        return;
      }
      if (routeToBuilding(state, person, workplace, "work")) return;
    }
  }

  // Nowhere to sleep and nothing else to do: lie down where you are, which
  // recovers rest slowly and is the visible symptom of too few bunks.
  if (restingUnmet) {
    person.activity = "sleepingRough";
    person.timer = SERVICE_HOURS * 2;
    return;
  }

  person.activity = "idle";
}
