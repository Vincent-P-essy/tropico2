import {
  MAX_STASH_RATE,
  RELATIONS_HEALING_PER_MONTH,
  REGION_RECOVERY_PER_MONTH,
  TICKS_PER_MONTH,
} from "../data/balance.ts";
import { HOUSING_LEVELS, PALACE_LEVELS } from "../data/buildings.ts";
import { NATION_IDS, REGION_IDS } from "../data/nations.ts";
import { updatePerson } from "./behaviour.ts";
import { updateFleet } from "./fleet.ts";
import { checkInvasion, updateDiplomacy, updateUnrest } from "./unrest.ts";
import { checkScenario } from "./objectives.ts";
import { updateEffects } from "./edicts.ts";
import { relaxMarket } from "./trade.ts";
import { isMonthBoundary, payUpkeep, produce, runConstruction } from "./economy.ts";
import { autoAssign } from "./employment.ts";
import { clampRelations, notify } from "./state.ts";
import type { GameState, Person } from "./types.ts";

/**
 * The clock.
 *
 * One tick is one game-hour. Everything that happens on a schedule happens here,
 * and it happens in a fixed order, because a deterministic simulation is one
 * where "what ran first" is never in question.
 */

/** Ticks between re-runs of the job market. Nobody changes career hourly. */
const REASSIGN_INTERVAL = 12;
/** Ticks between housing allocations. */
const HOUSING_INTERVAL = 24;

export function tick(state: GameState, hours = 1): void {
  if (state.status !== "playing") return;

  state.tick += hours;

  for (const person of state.people.values()) updatePerson(state, person, hours);

  updateEffects(state, hours);
  updateUnrest(state, hours);
  updateFleet(state, hours);

  for (const building of state.buildings.values()) {
    if (building.construction <= 0) produce(state, building, hours);
  }

  runConstruction(state, hours);

  if (state.tick % REASSIGN_INTERVAL < hours) autoAssign(state);
  if (state.tick % HOUSING_INTERVAL < hours) {
    allocateHousing(state);
    upgradePalace(state);
  }

  if (isMonthBoundary(state.tick, hours)) monthlyTick(state);
}

/** Runs `count` ticks. The main loop calls this once per frame at the chosen speed. */
export function tickMany(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) tick(state, 1);
}

/**
 * Gives homeless pirates a plot, and captives a bunk.
 *
 * A pirate with no house can neither rest properly nor stash his share, so two
 * of his six needs sit at zero permanently — which is why the original told you
 * to keep building plots until your captain had one.
 */
export function allocateHousing(state: GameState): void {
  const freePlots = [];
  const freeBeds = [];

  for (const building of state.buildings.values()) {
    if (building.construction > 0) continue;
    if (building.def === "pirateHousing" && building.owner < 0) freePlots.push(building);
    if (building.def === "bunkhouse" || building.def === "stockade") freeBeds.push(building);
  }

  // Highest rank first: a captain outbids a scurvy dog for the good plot.
  const homeless: Person[] = [];
  for (const person of state.people.values()) {
    if (person.activity === "dead") continue;
    if (person.home >= 0 && state.buildings.has(person.home)) continue;
    person.home = -1;
    homeless.push(person);
  }
  homeless.sort((a, b) => b.rank - a.rank || a.id - b.id);

  for (const person of homeless) {
    if (person.kind === "pirate") {
      const plot = freePlots.shift();
      if (!plot) continue;
      plot.owner = person.id;
      // The plot instantly becomes the house his rank deserves.
      plot.level = Math.min(person.rank, HOUSING_LEVELS.length - 1);
      person.home = plot.id;
    } else {
      const bed = freeBeds[0];
      if (bed) person.home = bed.id;
    }
  }
}

/** The palace grows with the hoard, and its auras grow with it. */
export function upgradePalace(state: GameState): void {
  for (const building of state.buildings.values()) {
    if (building.def !== "piratePalace" || building.construction > 0) continue;
    let level = 0;
    for (let i = 0; i < PALACE_LEVELS.length; i++) {
      if (state.hoard >= (PALACE_LEVELS[i]?.hoard ?? 0)) level = i;
    }
    if (level !== building.level) building.level = level;
  }
}

/** Everything billed, healed or recovered once a month. */
function monthlyTick(state: GameState): void {
  payUpkeep(state);
  updateDiplomacy(state);
  // Diplomacy first, so a month's healing counts before anybody sails: a nation
  // that has just come round does not send a squadron on the same day.
  checkInvasion(state);
  relaxMarket(state);
  checkScenario(state);

  for (const id of NATION_IDS) {
    const nation = state.nations[id];
    nation.monthsSinceRaid++;
    // Memories fade. Leave a nation's shipping alone and they come round.
    if (nation.monthsSinceRaid > 2 && nation.relations < 0) {
      nation.relations = clampRelations(nation.relations + RELATIONS_HEALING_PER_MONTH);
    }
  }

  for (const id of REGION_IDS) {
    const region = state.regions[id];
    region.shipping = Math.min(1, region.shipping + REGION_RECOVERY_PER_MONTH);
  }

  // Wealthy captives grow more valuable the longer they enjoy themselves.
  for (const person of state.people.values()) {
    if (person.kind === "captive" && person.wealthy && person.activity !== "dead") {
      person.ransom += 12;
    }
  }
}

/** Diverts a share of incoming gold to the hoard, if a Pirate Cave stands. */
export function receiveGold(state: GameState, amount: number): { treasury: number; hoard: number } {
  if (amount <= 0) return { treasury: 0, hoard: 0 };

  let hasCave = false;
  for (const building of state.buildings.values()) {
    if (building.def === "pirateCave" && building.construction <= 0) hasCave = true;
  }

  const rate = hasCave ? Math.min(state.stashRate, MAX_STASH_RATE) : 0;
  const stashed = amount * rate;
  state.hoard += stashed;
  state.treasury += amount - stashed;
  return { treasury: amount - stashed, hoard: stashed };
}

/** Absolute month index right now, for dates and deadlines. */
export function currentMonth(state: GameState): number {
  return state.startMonth + Math.floor(state.tick / TICKS_PER_MONTH);
}

/** Months elapsed since the scenario began. */
export function elapsedMonths(state: GameState): number {
  return Math.floor(state.tick / TICKS_PER_MONTH);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDate(state: GameState): string {
  const month = currentMonth(state);
  const year = Math.floor(month / 12);
  const name = MONTH_NAMES[month % 12] ?? "Jan";
  const day = Math.floor((state.tick % TICKS_PER_MONTH) / 24) + 1;
  return `${day} ${name} ${year}`;
}

/** Average happiness of the pirates, as a percentage. Campaign goals score this. */
export function pirateHappiness(state: GameState): number {
  let total = 0;
  let count = 0;
  for (const person of state.people.values()) {
    if (person.kind !== "pirate" || person.activity === "dead") continue;
    total += person.mood;
    count++;
  }
  return count === 0 ? 0 : total / count;
}

/** Average resignation of the captives. Below the threshold, they run. */
export function captiveResignation(state: GameState): number {
  let total = 0;
  let count = 0;
  for (const person of state.people.values()) {
    if (person.kind !== "captive" || person.activity === "dead" || person.skeleton) continue;
    total += person.mood;
    count++;
  }
  return count === 0 ? 100 : total / count;
}

export function population(state: GameState): { pirates: number; captives: number } {
  let pirates = 0;
  let captives = 0;
  for (const person of state.people.values()) {
    if (person.activity === "dead") continue;
    if (person.kind === "pirate") pirates++;
    else captives++;
  }
  return { pirates, captives };
}

/** Ends the run, one way or the other. */
export function endGame(state: GameState, status: "won" | "lost", reason: string): void {
  if (state.status !== "playing") return;
  state.status = status;
  state.ending = reason;
  notify(state, status === "won" ? "good" : "bad", reason);
}
