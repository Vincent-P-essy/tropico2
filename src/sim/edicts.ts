import { clamp } from "../core/grid.ts";
import { RELATIONS_PER_RELEASE, TICKS_PER_DAY } from "../data/balance.ts";
import { EDICTS, type EdictId } from "../data/edicts.ts";
import { JOBS, PIRATE_SKILLS, type JobId, type PirateSkill } from "../data/jobs.ts";
import { NATIONS, type NationId } from "../data/nations.ts";
import type { GoodId } from "../data/goods.ts";
import type { MissionId } from "../data/ships.ts";
import type { RegionId } from "../data/nations.ts";
import type { BuildingId } from "../data/buildings.ts";
import { kingEffects } from "./auras.ts";
import { stockOf, takeStock } from "./economy.ts";
import { release } from "./employment.ts";
import { launch, recruitCaptain } from "./fleet.ts";
import { receiveGold } from "./game.ts";
import { killPerson, raiseSkeleton, removePerson, satisfyNeed, spawnPirate } from "./people.ts";
import { clampRelations, finishedBuildings, hasBuilding, notify } from "./state.ts";
import type { GameState, Person } from "./types.ts";
import { fail, OK, type CommandResult } from "./types.ts";

/**
 * Issuing edicts.
 *
 * These are the levers the Pirate King pulls directly, and between them they
 * are most of what makes him a king rather than a foreman. Everything else in
 * the game is indirect — you build a tavern and hope — but an edict acts on a
 * named person, a named ship or a named nation, now.
 *
 * Standing edicts stay in force and quietly reshape the island while they do;
 * the aura layer reads them every tick.
 */

export interface EdictContext {
  /** A pirate or a captive, for the edicts that act on one person. */
  person?: number;
  ship?: number;
  nation?: NationId;
  /** Which craftsman to steal, for Kidnap Craftsman. */
  craft?: JobId;
  /** Where to send the ship, for the edicts that are really sailing orders. */
  region?: RegionId;
  /** Which accoutrement to fit, for Outfit Pirate. */
  gift?: "pegLegs" | "hats" | "parrots";
  /** Which skill to teach, for Educate Pirate. */
  skill?: PirateSkill;
}

/** How much gold this edict costs, after the king's traits. */
export function edictCost(state: GameState, id: EdictId): number {
  const def = EDICTS[id];
  if (id === "recruitCaptain") {
    let cost = def.gold;
    for (const effect of kingEffects(state.king)) {
      if (effect.recruitCaptainCostMultiplier) cost *= effect.recruitCaptainCostMultiplier;
    }
    return Math.round(cost);
  }
  if (id === "raiseDead") {
    // The price climbs twenty gold each time somebody is persuaded to get up.
    let base = def.gold;
    for (const effect of kingEffects(state.king)) {
      if (effect.raiseDeadBaseCost) base = effect.raiseDeadBaseCost;
    }
    return base + state.raisings * 20;
  }
  return def.gold;
}

export function isStanding(state: GameState, id: EdictId, nation?: NationId): boolean {
  return state.standing.some(
    (e) => e.edict === id && (nation === undefined || e.nation === nation),
  );
}

/**
 * Whether this edict can be issued right now, and if not, why not.
 *
 * Same shape as building placement: the panel asks before the player clicks, so
 * a greyed-out edict can say what it is waiting for.
 */
export function canIssue(state: GameState, id: EdictId, ctx: EdictContext = {}): CommandResult {
  const def = EDICTS[id];

  const cost = edictCost(state, id);
  if (cost > 0 && state.treasury < cost) {
    return fail(`Costs ${cost} gold; the treasury holds ${Math.floor(state.treasury)}`);
  }

  const need = def.requires;
  if (need?.building && !hasBuilding(state, need.building)) {
    return fail(`Needs a ${need.building}`);
  }
  if (need?.ship && !anyShipInPort(state)) {
    return fail("Needs a ship in port");
  }
  if (need?.palaceGuard && palaceGuards(state).length === 0) {
    return fail("Needs a guard at the palace");
  }

  switch (def.target) {
    case "pirate": {
      const person = personOf(state, ctx.person);
      if (person?.kind !== "pirate") return fail("Pick a pirate");
      break;
    }
    case "captive": {
      const person = personOf(state, ctx.person);
      if (person?.kind !== "captive") return fail("Pick a captive");
      break;
    }
    case "ship":
      if (ctx.ship === undefined || !state.ships.has(ctx.ship)) return fail("Pick a ship");
      break;
    case "nation":
      if (!ctx.nation) return fail("Pick a nation");
      break;
    case "craftsman":
      if (!ctx.craft) return fail("Pick a trade");
      break;
    default:
      break;
  }

  if (ctx.nation && need?.relations !== undefined) {
    const standing = state.nations[ctx.nation].relations;
    if (standing < need.relations) {
      return fail(
        `${NATIONS[ctx.nation].name} would want relations of ${need.relations}; they stand at ${standing.toFixed(0)}`,
      );
    }
  }

  return specificChecks(state, id, ctx);
}

/** The conditions that are particular to one edict rather than general. */
function specificChecks(state: GameState, id: EdictId, ctx: EdictContext): CommandResult {
  const person = personOf(state, ctx.person);

  switch (id) {
    case "ransomCaptive":
      if (!person) return fail("Pick a captive");
      if (!person.wealthy && !person.profession) {
        return fail("Only a skilled or a wealthy captive is worth ransoming");
      }
      break;

    case "pressGang":
      if (!person) return fail("Pick a captive");
      if (person.profession) return fail("A craftsman is worth more at his trade");
      if (person.wealthy) return fail("A wealthy captive is worth more ransomed");
      break;

    case "assassinate":
      if (!person) return fail("Pick somebody");
      if (person.captainId) return fail("You cannot have a captain killed");
      if (person.wealthy) return fail("A wealthy captive is worth more alive");
      break;

    case "educatePirate": {
      const schools = schoolFor(ctx.skill);
      if (!ctx.skill || !schools) return fail("Pick a skill");
      if (!hasBuilding(state, schools)) return fail(`Needs a ${schools}`);
      break;
    }

    case "outfitPirate": {
      if (!ctx.gift) return fail("Pick a peg leg, a hat or a parrot");
      if (stockOfGood(state, ctx.gift) <= 0) return fail(`No ${ctx.gift} have been made yet`);
      break;
    }

    case "announcePeace":
    case "declarePatron": {
      if (!ctx.nation) return fail("Pick a nation");
      for (const effect of kingEffects(state.king)) {
        if (effect.noPeaceWith === ctx.nation) {
          return fail(`You will never make peace with ${NATIONS[ctx.nation].name}`);
        }
      }
      break;
    }

    case "openSmugglersCove": {
      const cove = finishedBuildings(state, "smugglersCove")[0];
      if (!cove) return fail("Needs a smuggler's cove");
      if (cove.openTo) return fail(`Already open to ${NATIONS[cove.openTo].name}`);
      break;
    }

    case "raiseJollyRoger":
      if (state.standing.some((e) => e.edict === "raiseJollyRoger")) {
        return fail("The black flag is already flying");
      }
      break;

    case "freeAllOfNationality":
    case "betrayPirates":
      if (!ctx.nation) return fail("Pick a nation");
      break;

    default:
      break;
  }

  if (EDICTS[id].standing && isStanding(state, id, ctx.nation)) {
    return fail("Already in force");
  }

  return OK;
}

/**
 * Issues the edict. Assumes `canIssue` passed; the panel checks first, and this
 * checks again so a stale button cannot spend money on nothing.
 */
export function issue(state: GameState, id: EdictId, ctx: EdictContext = {}): CommandResult {
  const check = canIssue(state, id, ctx);
  if (!check.ok) return check;

  const def = EDICTS[id];
  const cost = edictCost(state, id);
  state.treasury -= cost;

  if (def.standing) {
    state.standing.push({ edict: id, nation: ctx.nation ?? null });
    notify(state, "info", `${def.name} is in force`);
    return OK;
  }

  const person = personOf(state, ctx.person);

  switch (id) {
    // ── Sailing orders that happen to be edicts ─────────────────────────────
    case "explore":
    case "raidSettlement":
    case "kidnapCraftsman": {
      const ship = ctx.ship === undefined ? undefined : state.ships.get(ctx.ship);
      const region = ctx.region ?? "windwardPassage";
      if (!ship) return fail("Pick a ship");
      const mission: MissionId =
        id === "explore"
          ? "explore"
          : id === "raidSettlement"
            ? "raidSettlement"
            : "kidnapCraftsman";
      const result = launch(state, ship, mission, region);
      if (!result.ok) state.treasury += cost;
      return result;
    }

    case "recruitCaptain": {
      // recruitCaptain does its own accounting, so hand the gold back first.
      state.treasury += cost;
      return recruitCaptain(state) ? OK : fail("No captain would sign");
    }

    // ── People ──────────────────────────────────────────────────────────────
    case "freeCaptive": {
      if (!person) return fail("Pick a captive");
      improveRelations(state, person.nationality, RELATIONS_PER_RELEASE);
      notify(state, "info", `${person.name} has been released`);
      removePerson(state, person);
      return OK;
    }

    case "ransomCaptive": {
      if (!person) return fail("Pick a captive");
      const paid = person.wealthy
        ? Math.max(200, person.ransom)
        : JOBS[person.profession ?? "hauler"].ransom || 250;
      receiveGold(state, paid);
      // They go home grateful to nobody, but their nation notices.
      improveRelations(state, person.nationality, RELATIONS_PER_RELEASE * 0.5);
      notify(state, "good", `${person.name} ransomed for ${Math.round(paid)} gold`);
      removePerson(state, person);
      return OK;
    }

    case "pressGang": {
      if (!person) return fail("Pick a captive");
      release(state, person);
      const recruit = spawnPirate(state, { x: person.x, y: person.y });
      recruit.nationality = person.nationality;
      recruit.courage = person.courage;
      recruit.leadership = person.leadership;
      notify(state, "info", `${person.name} has signed the articles as ${recruit.name}`);
      removePerson(state, person);
      return OK;
    }

    case "assassinate": {
      if (!person) return fail("Pick somebody");
      killPerson(state, person, `${person.name} was found dead. Nobody saw anything.`);
      return OK;
    }

    case "donateMoney": {
      if (!person) return fail("Pick a pirate");
      person.gold += 100;
      notify(state, "info", `${person.name} is a hundred gold richer`);
      return OK;
    }

    case "donateToCrew": {
      const ship = ctx.ship === undefined ? undefined : state.ships.get(ctx.ship);
      if (!ship) return fail("Pick a ship");
      const hands = [ship.captain, ...ship.crew]
        .map((personId) => state.people.get(personId))
        .filter((crewman): crewman is Person => crewman !== undefined);
      if (hands.length === 0) return fail("She has nobody aboard");
      const each = 500 / hands.length;
      for (const hand of hands) hand.gold += each;
      notify(state, "good", `Five hundred gold split among ${ship.name}'s people`);
      return OK;
    }

    case "educatePirate": {
      if (!person || !ctx.skill) return fail("Pick a pirate and a skill");
      person.skills[ctx.skill] = Math.min(9, person.skills[ctx.skill] + 1);
      notify(state, "good", `${person.name} has been schooled in ${ctx.skill}`);
      return OK;
    }

    case "outfitPirate": {
      if (!person || !ctx.gift) return fail("Pick a pirate and a gift");
      if (!consumeGood(state, ctx.gift)) return fail(`No ${ctx.gift} in stock`);
      if (ctx.gift === "pegLegs") person.notoriety = Math.min(9, person.notoriety + 1);
      if (ctx.gift === "hats") person.leadership = Math.min(9, person.leadership + 1);
      if (ctx.gift === "parrots") person.courage = Math.min(9, person.courage + 1);
      notify(state, "good", `${person.name} is fitted out`);
      return OK;
    }

    case "raiseDead": {
      const graveyard = finishedBuildings(state, "graveyard")[0];
      if (!graveyard) return fail("Needs a graveyard");
      raiseSkeleton(state, graveyard.x, graveyard.y + graveyard.h);
      state.raisings++;
      notify(state, "warning", "Something has got up in the graveyard and gone to work");
      return OK;
    }

    // ── The whole island at once ────────────────────────────────────────────
    case "freeBeer":
    case "freeRum": {
      const quality = id === "freeRum" ? 92 : 68;
      let served = 0;
      for (const drinker of state.people.values()) {
        if (drinker.kind !== "pirate" || drinker.activity === "dead") continue;
        satisfyNeed(drinker, "drinking", quality, 1);
        served++;
      }
      notify(state, "good", `${id === "freeRum" ? "Rum" : "Beer"} for all ${served} of them`);
      return OK;
    }

    case "pirateFestival": {
      state.effects.push({ kind: "festival", ticksLeft: TICKS_PER_DAY * 10 });
      for (const reveller of state.people.values()) {
        if (reveller.kind !== "pirate" || reveller.activity === "dead") continue;
        satisfyNeed(reveller, "gambling", 80, 1);
        satisfyNeed(reveller, "companionship", 80, 1);
        satisfyNeed(reveller, "feasting", 80, 1);
      }
      notify(state, "good", "The island is throwing a party, and will regret it in the morning");
      return OK;
    }

    case "betrayPirates": {
      if (!ctx.nation) return fail("Pick a nation");
      const doomed = [...state.people.values()].filter(
        (p) => p.kind === "pirate" && p.nationality === ctx.nation && p.activity !== "dead",
      );
      for (const victim of doomed) removePerson(state, victim);
      improveRelations(state, ctx.nation, 45);
      notify(
        state,
        "bad",
        `${doomed.length} ${NATIONS[ctx.nation].adjective} pirates handed over to hang`,
      );
      return OK;
    }

    case "freeAllOfNationality": {
      if (!ctx.nation) return fail("Pick a nation");
      const freed = [...state.people.values()].filter(
        (p) => p.kind === "captive" && p.nationality === ctx.nation && p.activity !== "dead",
      );
      for (const captive of freed) removePerson(state, captive);
      improveRelations(state, ctx.nation, Math.min(60, 6 + freed.length * 1.5));
      notify(state, "info", `${freed.length} ${NATIONS[ctx.nation].adjective} captives released`);
      return OK;
    }

    // ── Diplomacy ───────────────────────────────────────────────────────────
    case "announcePeace": {
      if (!ctx.nation) return fail("Pick a nation");
      state.nations[ctx.nation].atPeace = true;
      improveRelations(state, ctx.nation, 12);
      notify(state, "info", `Peace announced with ${NATIONS[ctx.nation].name}`);
      return OK;
    }

    case "declarePatron": {
      if (!ctx.nation) return fail("Pick a nation");
      for (const id2 of Object.keys(state.nations) as NationId[]) {
        state.nations[id2].isPatron = false;
      }
      state.nations[ctx.nation].isPatron = true;
      state.nations[ctx.nation].atPeace = true;
      // A patron knows the way to your harbour. That is the price.
      state.nations[ctx.nation].knowsLocation = true;
      notify(state, "good", `${NATIONS[ctx.nation].name} is now your patron`);
      return OK;
    }

    case "lettersOfMarque": {
      if (!ctx.nation) return fail("Pick a nation");
      state.nations[ctx.nation].lettersOfMarque = true;
      state.nations[ctx.nation].atPeace = true;
      notify(state, "good", `${NATIONS[ctx.nation].name} has granted you a commission`);
      return OK;
    }

    case "openSmugglersCove": {
      if (!ctx.nation) return fail("Pick a nation");
      const cove = finishedBuildings(state, "smugglersCove")[0];
      if (!cove) return fail("Needs a smuggler's cove");
      cove.openTo = ctx.nation;
      state.nations[ctx.nation].knowsLocation = true;
      notify(
        state,
        "info",
        `The cove is open to ${NATIONS[ctx.nation].name} — who now know where we lie`,
      );
      return OK;
    }

    case "raiseJollyRoger": {
      for (const id2 of Object.keys(state.nations) as NationId[]) {
        const nation = state.nations[id2];
        nation.isPatron = false;
        nation.atPeace = false;
        nation.prohibited = false;
        nation.lettersOfMarque = false;
        nation.relations = clampRelations(nation.relations - 40);
        nation.knowsLocation = true;
      }
      state.standing.push({ edict: "raiseJollyRoger", nation: null });
      notify(state, "bad", "The black flag is up. It is you against all three of them now.");
      return OK;
    }

    case "fosterWar": {
      const ship = ctx.ship === undefined ? undefined : state.ships.get(ctx.ship);
      if (!ship) return fail("Pick a ship");
      ship.log.push("Sailing under false colours");
      notify(state, "info", `${ship.name} will wear another nation's flag`);
      return OK;
    }

    default:
      return fail("That edict has no effect yet");
  }
}

/** Cancels a standing edict. */
export function cancel(state: GameState, id: EdictId, nation?: NationId): CommandResult {
  const before = state.standing.length;
  state.standing = state.standing.filter(
    (e) => !(e.edict === id && (nation === undefined || e.nation === nation)),
  );
  if (state.standing.length === before) return fail("That edict is not in force");
  notify(state, "info", `${EDICTS[id].name} lifted`);
  return OK;
}

/** Runs down the clock on timed effects. Called once per tick. */
export function updateEffects(state: GameState, hours: number): void {
  if (state.effects.length === 0) return;
  for (const effect of state.effects) effect.ticksLeft -= hours;
  const expired = state.effects.filter((e) => e.ticksLeft <= 0);
  if (expired.length > 0) {
    state.effects = state.effects.filter((e) => e.ticksLeft > 0);
    // Only one kind of timed effect so far, so one message covers them all.
    if (expired.length > 0) notify(state, "info", "The festival is over");
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function personOf(state: GameState, id: number | undefined): Person | undefined {
  if (id === undefined) return undefined;
  const person = state.people.get(id);
  return person?.activity === "dead" ? undefined : person;
}

function anyShipInPort(state: GameState): boolean {
  for (const ship of state.ships.values()) if (ship.status === "inPort") return true;
  return false;
}

/** Pirates working as guards at the palace, who are the only assassins available. */
export function palaceGuards(state: GameState): Person[] {
  const palace = finishedBuildings(state, "piratePalace")[0];
  if (!palace) return [];
  return palace.workers
    .map((id) => state.people.get(id))
    .filter((p): p is Person => p !== undefined && p.job?.job === "guard");
}

function schoolFor(skill: PirateSkill | undefined): BuildingId | null {
  switch (skill) {
    case "gunnery":
      return "gunnerySchool";
    case "marksmanship":
      return "marksmanshipSchool";
    case "navigation":
      return "navigationSchool";
    case "seamanship":
      return "seamanshipSchool";
    case "swordsmanship":
      return "swordsmanshipSchool";
    default:
      return null;
  }
}

function stockOfGood(state: GameState, good: GoodId): number {
  let total = 0;
  for (const building of state.buildings.values()) total += stockOf(building, good);
  return total;
}

function consumeGood(state: GameState, good: GoodId): boolean {
  for (const building of state.buildings.values()) {
    if (takeStock(building, good, 1) > 0) return true;
  }
  return false;
}

function improveRelations(state: GameState, nation: NationId, amount: number): void {
  state.nations[nation].relations = clampRelations(state.nations[nation].relations + amount);
}

/** Which skills a pirate could still be taught, given the schools that stand. */
export function teachableSkills(state: GameState): PirateSkill[] {
  return PIRATE_SKILLS.filter((skill) => {
    const school = schoolFor(skill);
    return school !== null && hasBuilding(state, school);
  });
}

/** Accoutrements that have actually been made and are sitting in a shop. */
export function availableGifts(state: GameState): ("pegLegs" | "hats" | "parrots")[] {
  return (["pegLegs", "hats", "parrots"] as const).filter((good) => stockOfGood(state, good) > 0);
}

/** Multiplier on gambling takings from the two rigging edicts. */
export function gamblingRig(state: GameState): { profit: number; satisfaction: number } {
  if (isStanding(state, "rigGamblingAgainst")) return { profit: 1.6, satisfaction: 0.7 };
  if (isStanding(state, "rigGamblingInFavor")) return { profit: 0.55, satisfaction: 1.3 };
  return { profit: 1, satisfaction: 1 };
}

export { clamp };
