import { euclidean } from "../core/grid.ts";
import {
  CANNON_DEFENSE,
  CAPTIVE_ESCAPE,
  CAPTIVE_REBELLION,
  DESERTION_CHANCE_PER_DAY,
  STARVATION_DAYS,
  ESCAPE_CHANCE_PER_DAY,
  ESCAPE_COURAGE,
  FORT_DEFENSE,
  GUARD_DEFENSE,
  INVASION_CHANCE_PER_MONTH,
  INVASION_RELATIONS,
  PIRATE_REVOLT,
  PIRATE_UNREST,
  REBELLION_COURAGE,
  REBELLION_LEADERSHIP,
  TICKS_PER_DAY,
} from "../data/balance.ts";
import { NATION_IDS, NATIONS, type NationId } from "../data/nations.ts";
import { routeToTile } from "./behaviour.ts";
import { isCoast } from "./island.ts";
import { killPerson, removePerson } from "./people.ts";
import { clampRelations, finishedBuildings, notify, pirates, captives } from "./state.ts";
import type { GameState, Person } from "./types.ts";
import { endGame, pirateHappiness } from "./game.ts";

/**
 * When it goes wrong.
 *
 * Each population fails in its own way, and both failures start from the same
 * number: an unhappy pirate deserts or leads a mutiny, an unresigned captive
 * runs for the water. A captive who reaches the sea tells his nation where you
 * live, and a nation that knows where you live can send a fleet — so an escape
 * you shrugged off in year two is the invasion in year four.
 */

/** Runs the whole unrest layer for one tick. */
export function updateUnrest(state: GameState, hours: number): void {
  const days = hours / TICKS_PER_DAY;

  for (const person of state.people.values()) {
    if (person.activity === "dead" || person.activity === "atSea") continue;
    if (person.kind === "captive") updateCaptiveUnrest(state, person, days);
    else updatePirateUnrest(state, person, days);
  }
}

function updateCaptiveUnrest(state: GameState, person: Person, days: number): void {
  if (person.skeleton || person.wealthy) return;

  if (person.activity === "fleeing") {
    // Made the shore: gone, and the flag they carry knows the way back.
    if (isCoast(state.island, Math.floor(person.x), Math.floor(person.y))) {
      escapeSucceeds(state, person);
    }
    return;
  }

  // Hunger overrules both of the usual gates. A man three days from dying does
  // not need a grievance to run, and does not need to be brave either.
  const hunger = Math.min(1, person.starving / STARVATION_DAYS);
  const famished = hunger > 0.5;
  if (person.mood > CAPTIVE_ESCAPE && !famished) return;
  if (person.courage < ESCAPE_COURAGE && !famished) return;

  // Informants earn their keep here: the player is told who is thinking about
  // it while there is still time to press-gang, ransom or frighten them.
  if (
    state.standing.some((e) => e.edict === "payForInformants") &&
    person.mood <= CAPTIVE_ESCAPE * 0.7 &&
    state.rng.chance(0.02 * days)
  ) {
    notify(
      state,
      "warning",
      `An informant says ${person.name} is planning to run`,
      { x: person.x, y: person.y },
      "informant",
    );
  }

  // Guards on the roads make running a worse idea.
  const guards = countGuards(state);
  const deterrence = 1 / (1 + guards * 0.22);
  const desperation = (CAPTIVE_ESCAPE - person.mood) / CAPTIVE_ESCAPE;

  if (
    person.mood <= CAPTIVE_REBELLION &&
    person.courage >= REBELLION_COURAGE &&
    person.leadership >= REBELLION_LEADERSHIP &&
    state.rng.chance(0.02 * days)
  ) {
    leadRebellion(state, person);
    return;
  }

  /*
   * A starving man runs long before he lies down.
   *
   * Without this the island is bistable: a captive who starves to death is a
   * pair of hands off the farms, so the survivors eat less still, and an island
   * that was merely short of food empties completely — thirty-six dead inside a
   * year on one seed in eight, with nothing the player could have done after
   * the first month. Letting hunger drive him to the water instead costs the
   * haven exactly as much, since the hands are gone either way and he carries
   * the bearing home to his king, but the population settles at what the island
   * can feed rather than falling straight past it. Only those with nowhere to
   * run starve, which is what the original's stockades were for.
   */
  const urge = Math.max(desperation, hunger * hunger);

  if (state.rng.chance(ESCAPE_CHANCE_PER_DAY * days * urge * deterrence)) {
    beginEscape(state, person);
  }
}

function updatePirateUnrest(state: GameState, person: Person, days: number): void {
  if (person.ship >= 0) return;

  if (person.mood > PIRATE_UNREST) return;

  // Brawling: visible, annoying, and a warning the player can act on.
  if (person.mood > PIRATE_REVOLT) {
    if (state.rng.chance(0.03 * days)) {
      person.activity = "rioting";
      person.timer = 6;
      notify(
        state,
        "warning",
        `${person.name} is brawling — the pirates are unhappy`,
        { x: person.x, y: person.y },
        "brawl",
      );
    }
    return;
  }

  // Below the revolt line: a bold, well-followed pirate is a coup waiting — but
  // only if the band would actually follow him. One malcontent among contented
  // pirates gets laughed at; one among a miserable crew gets a crown.
  if (
    person.courage >= 6 &&
    person.leadership >= 6 &&
    person.loyalty <= 4 &&
    pirateHappiness(state) < 25 &&
    state.rng.chance(0.008 * days)
  ) {
    endGame(
      state,
      "lost",
      `${person.name} has led the pirates against you. The haven has a new king.`,
    );
    return;
  }

  // The further below the line, the faster they go.
  const despair = Math.min(1, (PIRATE_REVOLT - person.mood) / PIRATE_REVOLT);
  if (state.rng.chance(DESERTION_CHANCE_PER_DAY * days * despair)) {
    notify(
      state,
      "bad",
      `${person.name} has deserted the island`,
      { x: person.x, y: person.y },
      "desert",
    );
    removePerson(state, person);
  }
}

function beginEscape(state: GameState, person: Person): void {
  const shore = nearestShore(state, person);
  if (!shore) return;
  if (!routeToTile(state, person, shore.x, shore.y)) return;
  person.activity = "fleeing";
  notify(
    state,
    "warning",
    `${person.name} is running for the water`,
    { x: person.x, y: person.y },
    "flee",
  );
}

function escapeSucceeds(state: GameState, person: Person): void {
  state.stats.escapes++;
  const nation = person.nationality;

  // Loose Lips buys silence; without it, they take the bearing home with them.
  const quiet = state.standing.some((e) => e.edict === "looseLips");
  if (!quiet || state.rng.chance(0.35)) {
    if (!state.nations[nation].knowsLocation) {
      state.nations[nation].knowsLocation = true;
      notify(
        state,
        "bad",
        `${person.name} has escaped and reached ${NATIONS[nation].name}. They know where we are.`,
      );
    } else {
      notify(state, "warning", `${person.name} has escaped`, null, "escape");
    }
  } else {
    notify(
      state,
      "warning",
      `${person.name} has escaped, but told nobody where we lie`,
      null,
      "escape",
    );
  }

  removePerson(state, person);
}

function leadRebellion(state: GameState, leader: Person): void {
  const angry = captives(state).filter((p) => p.mood <= CAPTIVE_ESCAPE && !p.skeleton);
  const guards = countGuards(state);
  const armed = pirates(state).length;

  notify(state, "bad", `${leader.name} has raised the captives in rebellion`, {
    x: leader.x,
    y: leader.y,
  });

  // The pirates put it down, or they do not. Numbers and guards decide.
  const rebels = angry.length;
  const strength = armed * 1.5 + guards * 3;
  if (rebels > strength * 1.6) {
    endGame(state, "lost", "The captives have risen and taken the island.");
    return;
  }

  // Put down: the ringleader and some of the rest pay for it, and the survivors
  // are cowed for a while.
  killPerson(state, leader, `${leader.name} was killed putting down the rebellion`);
  for (const rebel of angry) {
    if (rebel.id === leader.id) continue;
    if (state.rng.chance(0.12)) {
      killPerson(state, rebel, `${rebel.name} died in the rising`);
    } else {
      rebel.mood = Math.min(100, rebel.mood + 22);
    }
  }
  notify(state, "warning", "The rising is put down");
}

function nearestShore(state: GameState, person: Person): { x: number; y: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  const step = 2;
  for (let y = 0; y < state.island.height; y += step) {
    for (let x = 0; x < state.island.width; x += step) {
      if (!isCoast(state.island, x, y)) continue;
      const distance = euclidean(person.x, person.y, x, y);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Pirates employed as guards, who are what stands between you and a rising. */
export function countGuards(state: GameState): number {
  let total = 0;
  for (const person of state.people.values()) {
    if (person.kind === "pirate" && person.job?.job === "guard" && person.activity !== "dead") {
      total++;
    }
  }
  return total;
}

/**
 * How hard the island is to take.
 *
 * Forts do most of the work, cannon add up, and guards matter because somebody
 * has to be behind the walls. Campaign missions score this directly.
 */
export function islandDefense(state: GameState): number {
  let total = 0;
  for (const building of finishedBuildings(state)) {
    if (building.def === "fort") total += FORT_DEFENSE;
    if (building.def === "protectiveCannon") total += CANNON_DEFENSE;
    if (building.def === "watchTower") total += CANNON_DEFENSE * 0.6;
  }
  total += countGuards(state) * GUARD_DEFENSE;
  return total;
}

/** Monthly: does anybody come for you? */
export function checkInvasion(state: GameState): void {
  for (const id of NATION_IDS) {
    const nation = state.nations[id];
    if (!nation.knowsLocation) continue;
    if (nation.isPatron) continue;
    if (nation.relations > INVASION_RELATIONS) continue;
    // A patron protects you from everyone, not only from themselves.
    if (Object.values(state.nations).some((n) => n.isPatron)) continue;

    if (!state.rng.chance(INVASION_CHANCE_PER_MONTH)) continue;
    resolveInvasion(state, id);
    return;
  }
}

function resolveInvasion(state: GameState, id: NationId): void {
  const attack = 55 + Math.abs(state.nations[id].relations) * 0.8 + state.rng.range(0, 40);
  const defense = islandDefense(state);

  notify(state, "bad", `A ${NATIONS[id].adjective} squadron is standing in toward the harbour`);

  if (defense >= attack) {
    notify(state, "good", "The guns have driven them off");
    state.nations[id].relations = clampRelations(state.nations[id].relations - 6);
    return;
  }

  // They land. The haven loses people and gold; if there is nothing to defend
  // it at all, the run ends.
  if (defense < attack * 0.35) {
    endGame(state, "lost", `${NATIONS[id].name} has burned the haven to the waterline.`);
    return;
  }

  const losses = Math.max(1, Math.round((attack - defense) / 18));
  const defenders = pirates(state);
  for (let i = 0; i < losses && i < defenders.length; i++) {
    const victim = state.rng.pick(defenders);
    if (victim) killPerson(state, victim, `${victim.name} fell defending the harbour`);
  }
  const looted = Math.min(state.treasury, state.treasury * 0.2 + 200);
  state.treasury -= looted;
  notify(
    state,
    "bad",
    `The raid cost us ${losses} pirates and ${Math.round(looted)} gold, but the haven stands`,
  );
}

/** Relations healing and other monthly diplomacy. */
export function updateDiplomacy(state: GameState): void {
  for (const id of NATION_IDS) {
    const nation = state.nations[id];
    // A patron's goodwill drifts up; an enemy's grudge does not fade as fast.
    if (nation.isPatron) nation.relations = clampRelations(nation.relations + 1.5);
    if (nation.atPeace && nation.monthsSinceRaid > 3) {
      nation.relations = clampRelations(nation.relations + 0.8);
    }
  }
  checkInvasion(state);
}
