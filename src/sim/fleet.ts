import {
  DAYS_PER_RATION,
  ENCOUNTER_CHANCE_PER_DAY,
  MERCHANT_BASE_GOLD,
  RECRUIT_CHANCE,
  REGION_DEPLETION,
  RELATIONS_PER_PRIZE,
  RELATIONS_PER_RAID,
  SETTLEMENT_CAPTIVES,
  SKILLED_CAPTIVE_CHANCE,
  TICKS_PER_DAY,
  WARSHIP_BASE_GOLD,
  WEALTHY_CAPTIVE_CHANCE,
} from "../data/balance.ts";
import { CAPTAINS } from "../data/captains.ts";
import { PIRATE_SKILLS, SKILLED_JOBS, type JobId } from "../data/jobs.ts";
import { NATIONS, REGIONS, type NationId, type RegionId } from "../data/nations.ts";
import {
  ENGAGEMENTS,
  PLUNDER_SHARES,
  SHIP_CLASSES,
  type EngagementId,
  type MissionId,
  type ShipClassId,
} from "../data/ships.ts";
import { kingEffects } from "./auras.ts";
import { addStock, stockOf, takeStock } from "./economy.ts";
import { release } from "./employment.ts";
import { receiveGold } from "./game.ts";
import { shipName } from "./names.ts";
import { payPirate, spawnCaptive, spawnPirate } from "./people.ts";
import { clampRelations, finishedBuildings, nextId, notify } from "./state.ts";
import type { GameState, Person, Ship } from "./types.ts";

/**
 * The fleet, and what it does at sea.
 *
 * This is the half of the game the island exists to serve. Everything ashore —
 * the timber, the iron, the rations, the taverns that keep the crews willing —
 * is there so that a ship can go out and come back heavier than she left.
 *
 * A cruise is resolved as a sequence of encounters rather than a single dice
 * roll, so a voyage has a shape: a frigate with good gunners and a hold full of
 * cannon grinds down what she meets, while a snow with four cutlasses takes one
 * prize and runs for home.
 */

/**
 * Lays down a hull. A yard id of -1 skips the yard checks entirely, which is how
 * a campaign episode hands you the ships it says you start with.
 */
export function buildShip(state: GameState, cls: ShipClassId, yardId: number): Ship | null {
  const def = SHIP_CLASSES[cls];
  if (yardId >= 0) {
    const yard = state.buildings.get(yardId);
    if (!yard || yard.construction > 0) return null;
    if (yard.def !== "boatyard" && yard.def !== "shipyard") return null;
    if (!def.small && yard.def !== "shipyard") return null;
  }

  const taken = new Set([...state.ships.values()].map((s) => s.name));
  const ship: Ship = {
    id: nextId(state),
    cls,
    name: shipName(state.rng, taken),
    dock: -1,
    hull: def.hull,
    maxHull: def.hull,
    captain: -1,
    crew: [],
    cargo: { seaRations: 0, cutlasses: 0, cannon: 0, muskets: 0 },
    status: "building",
    buildProgress: def.buildHours,
    mission: null,
    region: null,
    engagement: "boarding",
    share: "even",
    daysLeft: 0,
    log: [],
    plunder: 0,
    hold: { unskilled: 0, skilled: [], wealthy: [], recruits: 0 },
  };
  state.ships.set(ship.id, ship);
  return ship;
}

/** Docks with no ship berthed at them. */
export function freeDocks(state: GameState): number[] {
  const used = new Set([...state.ships.values()].map((s) => s.dock));
  return finishedBuildings(state, "dock")
    .map((d) => d.id)
    .filter((id) => !used.has(id));
}

/** Advances every hull under construction, using the shipwrights at the yards. */
export function advanceShipbuilding(state: GameState, hours: number): void {
  const building = [...state.ships.values()].filter((s) => s.status === "building");
  if (building.length === 0) return;

  let shipwrightHours = 0;
  for (const yard of state.buildings.values()) {
    if (yard.def !== "boatyard" && yard.def !== "shipyard") continue;
    if (yard.construction > 0) continue;
    for (const id of yard.workers) {
      const worker = state.people.get(id);
      if (worker?.job?.job === "shipwright" && worker.activity === "working") {
        shipwrightHours += hours * (0.7 + worker.skill * 0.12);
      }
    }
  }
  if (shipwrightHours <= 0) return;

  for (const ship of building) {
    if (shipwrightHours <= 0) break;
    const spent = Math.min(shipwrightHours, ship.buildProgress);
    ship.buildProgress -= spent;
    shipwrightHours -= spent;
    if (ship.buildProgress > 0) continue;

    const berth = freeDocks(state)[0];
    if (berth === undefined) {
      // Launched with nowhere to tie up: she waits, which is the game telling
      // the player to build another dock.
      ship.buildProgress = 1;
      notify(state, "warning", `${ship.name} is finished but every dock is taken`);
      continue;
    }
    ship.dock = berth;
    ship.status = "inPort";
    notify(state, "good", `${ship.name} is launched`, dockPosition(state, ship));
  }
}

function dockPosition(state: GameState, ship: Ship): { x: number; y: number } | null {
  const dock = ship.dock >= 0 ? state.buildings.get(ship.dock) : undefined;
  return dock ? { x: dock.x, y: dock.y } : null;
}

/** Pirates ashore who could be spared for a crew, best first. */
export function availableCrew(state: GameState): Person[] {
  const out: Person[] = [];
  for (const person of state.people.values()) {
    if (person.kind !== "pirate" || person.activity === "dead") continue;
    if (person.ship >= 0) continue;
    out.push(person);
  }
  // A pirate prefers a berth to a job ashore, and the best sail first.
  out.sort((a, b) => b.skills.seamanship + b.courage - (a.skills.seamanship + a.courage));
  return out;
}

/** Recruits one of the named captains, if the treasury can stand it. */
export function recruitCaptain(state: GameState): Person | null {
  let cost = 1500;
  for (const effect of kingEffects(state.king)) {
    if (effect.recruitCaptainCostMultiplier) cost *= effect.recruitCaptainCostMultiplier;
  }
  if (state.treasury < cost) return null;

  const taken = new Set(
    [...state.people.values()].map((p) => p.captainId).filter((id) => id !== null),
  );
  const available = CAPTAINS.filter((c) => !taken.has(c.id));
  const pick = state.rng.pick(available);
  if (!pick) return null;

  state.treasury -= cost;
  const site = finishedBuildings(state, "dock")[0] ?? finishedBuildings(state, "stockade")[0];
  const captain = spawnPirate(state, {
    x: site?.x ?? 10,
    y: site?.y ?? 10,
    sex: pick.sex,
    nationality: pick.nationality,
    captainId: pick.id,
  });

  captain.name = pick.name;
  captain.leadership = pick.leadership;
  captain.courage = pick.courage;
  captain.notoriety = pick.notoriety;
  captain.loyalty = pick.loyalty;
  captain.skills.navigation = pick.navigation;
  captain.skills.seamanship = pick.seamanship;
  captain.skills.gunnery = pick.gunnery;
  captain.skills.marksmanship = pick.marksmanship;
  captain.skills.swordsmanship = pick.swordsmanship;

  notify(state, "good", `Captain ${pick.name} has signed on`);
  return captain;
}

/** Puts a captain and a crew aboard. Returns false when there are not enough hands. */
export function crewShip(state: GameState, ship: Ship, captainId?: number): boolean {
  if (ship.status !== "inPort") return false;
  const def = SHIP_CLASSES[ship.cls];

  if (ship.captain < 0) {
    const wanted =
      captainId !== undefined
        ? state.people.get(captainId)
        : availableCrew(state).find((p) => p.captainId !== null);
    if (wanted?.kind !== "pirate" || wanted.ship >= 0) return false;
    release(state, wanted);
    wanted.ship = ship.id;
    ship.captain = wanted.id;
  }

  const wantedCrew = def.crew + def.officers;
  const pool = availableCrew(state);
  for (const person of pool) {
    if (ship.crew.length >= wantedCrew) break;
    release(state, person);
    person.ship = ship.id;
    ship.crew.push(person.id);
  }

  return ship.crew.length >= Math.ceil(wantedCrew * 0.6);
}

/** Loads the ship from the stores at her dock. */
export function loadShip(state: GameState, ship: Ship): void {
  const dock = ship.dock >= 0 ? state.buildings.get(ship.dock) : undefined;
  if (!dock) return;
  const capacity = SHIP_CLASSES[ship.cls].capacity;
  for (const good of ["seaRations", "cutlasses", "cannon", "muskets"] as const) {
    const wanted = capacity[good] - ship.cargo[good];
    if (wanted <= 0) continue;
    ship.cargo[good] += takeStock(dock, good, wanted);
  }
}

export interface LaunchResult {
  ok: boolean;
  reason?: string;
}

/** Sends a ship out. Everything she needs must already be aboard. */
export function launch(
  state: GameState,
  ship: Ship,
  mission: MissionId,
  region: RegionId,
): LaunchResult {
  if (ship.status !== "inPort") return { ok: false, reason: "She is not in port" };
  if (ship.captain < 0) return { ok: false, reason: "She has no captain" };
  if (ship.crew.length === 0) return { ok: false, reason: "She has no crew" };
  if (ship.cargo.seaRations <= 0) return { ok: false, reason: "She has no rations aboard" };

  ship.mission = mission;
  ship.region = region;
  ship.status = "outbound";
  ship.daysLeft = REGIONS[region].distance;
  ship.log = [`Sailed for ${REGIONS[region].name}`];
  ship.plunder = 0;

  for (const id of ship.crew) {
    const person = state.people.get(id);
    if (person) person.activity = "atSea";
  }
  const captain = state.people.get(ship.captain);
  if (captain) captain.activity = "atSea";

  notify(state, "info", `${ship.name} sails for ${REGIONS[region].name}`);
  return { ok: true };
}

/** Turns a ship for home early. */
export function recall(state: GameState, ship: Ship): void {
  if (ship.status !== "onStation" && ship.status !== "outbound") return;
  ship.status = "returning";
  ship.daysLeft = ship.region ? REGIONS[ship.region].distance : 2;
  ship.log.push("Recalled home");
  void state;
}

/** One tick of every voyage. */
export function updateFleet(state: GameState, hours: number): void {
  advanceShipbuilding(state, hours);

  const days = hours / TICKS_PER_DAY;
  for (const ship of state.ships.values()) {
    if (ship.status === "building" || ship.status === "inPort" || ship.status === "lost") continue;

    ship.daysLeft -= days;

    if (ship.status === "outbound") {
      if (ship.daysLeft > 0) continue;
      ship.status = "onStation";
      // How long she can stay is how much she can eat.
      ship.daysLeft = ship.cargo.seaRations * DAYS_PER_RATION;
      ship.log.push("On station");
      continue;
    }

    if (ship.status === "onStation") {
      consumeRations(ship, days);
      if (ship.daysLeft <= 0 || ship.cargo.seaRations <= 0) {
        ship.status = "returning";
        ship.daysLeft = ship.region ? REGIONS[ship.region].distance : 2;
        ship.log.push("Turned for home");
        continue;
      }
      if (state.rng.chance(ENCOUNTER_CHANCE_PER_DAY * days * missionActivity(ship))) {
        resolveEncounter(state, ship);
      }
      continue;
    }

    if (ship.daysLeft <= 0) {
      comeHome(state, ship);
    }
  }
}

/** Exploring and raiding find their prize faster than a blind cruise. */
function missionActivity(ship: Ship): number {
  switch (ship.mission) {
    case "explore":
      return 1.4;
    case "raidSettlement":
      return 1.2;
    case "kidnapCraftsman":
      return 1.6;
    default:
      return 1;
  }
}

function consumeRations(ship: Ship, days: number): void {
  const eaten = days * (1 + ship.crew.length * 0.06);
  ship.cargo.seaRations = Math.max(0, ship.cargo.seaRations - eaten);
}

/** The five skills of everybody aboard, averaged, plus the captain's weight. */
export function crewStrength(state: GameState, ship: Ship): Record<string, number> {
  const totals: Record<string, number> = {
    navigation: 0,
    seamanship: 0,
    gunnery: 0,
    marksmanship: 0,
    swordsmanship: 0,
    courage: 0,
  };
  let count = 0;
  for (const id of ship.crew) {
    const person = state.people.get(id);
    if (!person) continue;
    for (const skill of PIRATE_SKILLS) totals[skill] = (totals[skill] ?? 0) + person.skills[skill];
    totals.courage = (totals.courage ?? 0) + person.courage;
    count++;
  }
  if (count === 0) return totals;
  for (const key of Object.keys(totals)) totals[key] = (totals[key] ?? 0) / count;

  const captain = state.people.get(ship.captain);
  if (captain) {
    // A captain's leadership stiffens the whole crew.
    totals.courage = (totals.courage ?? 0) + captain.leadership * 0.5;
    for (const skill of PIRATE_SKILLS) {
      totals[skill] = (totals[skill] ?? 0) * 0.75 + captain.skills[skill] * 0.25;
    }
  }
  return totals;
}

/** Which way this ship can fight, given what is in her hold. */
export function chooseEngagement(ship: Ship): EngagementId | null {
  const wanted = ENGAGEMENTS[ship.engagement];
  if (wanted.requires.every((good) => ship.cargo[good as keyof typeof ship.cargo] > 0)) {
    return ship.engagement;
  }
  for (const id of ["boarding", "pounding", "harassing"] as const) {
    const option = ENGAGEMENTS[id];
    if (option.requires.every((good) => ship.cargo[good as keyof typeof ship.cargo] > 0)) return id;
  }
  return null;
}

/** One sail sighted, and what came of it. */
function resolveEncounter(state: GameState, ship: Ship): void {
  const regionId = ship.region;
  if (!regionId) return;
  const region = REGIONS[regionId];
  const regionState = state.regions[regionId];

  if (ship.mission === "explore") {
    regionState.knowledge = Math.min(1, regionState.knowledge + 0.2);
    if (state.rng.chance(0.4)) {
      regionState.settlements++;
      ship.log.push(`Charted a settlement in ${region.name}`);
    } else {
      ship.log.push(`Charted more of ${region.name}`);
    }
    return;
  }

  if (ship.mission === "raidSettlement") {
    if (regionState.settlements <= 0) {
      ship.log.push("Found no settlement worth raiding");
      return;
    }
    const taken = state.rng.int(SETTLEMENT_CAPTIVES[0], SETTLEMENT_CAPTIVES[1]);
    ship.log.push(`Raided a settlement and took ${taken} captives`);
    stowCaptives(ship, taken);
    const flag = state.rng.pick(region.traffic) ?? "spain";
    damageRelations(state, flag, RELATIONS_PER_RAID);
    // A raid costs blood even when it costs no ship.
    if (state.rng.chance(0.25)) killCrewman(state, ship, "lost in the raid");
    return;
  }

  if (ship.mission === "kidnapCraftsman") {
    const job = state.rng.pick(SKILLED_JOBS);
    if (job) {
      ship.log.push(`Took a ${job} off a merchant`);
      stowSkilled(ship, job);
    }
    return;
  }

  if (ship.mission === "trade") {
    const sold = sellCargoAbroad(state, ship);
    if (sold > 0) ship.log.push(`Sold cargo abroad for ${Math.round(sold)} gold`);
    return;
  }

  // A cruise for plunder.
  const flag = pickVictim(state, region.traffic);
  if (!flag) {
    ship.log.push("Sighted a sail, but her flag was one we spare");
    return;
  }

  const warship = state.rng.chance(region.danger);
  const engagement = chooseEngagement(ship);
  if (!engagement) {
    ship.log.push("Sighted a prize but had nothing to fight her with");
    return;
  }

  const strength = crewStrength(state, ship);
  const captain = state.people.get(ship.captain);

  // Our side: the right skill for the engagement, the guns to back it, and the
  // captain's reputation doing some of the work before a shot is fired.
  const skillKey =
    engagement === "boarding"
      ? "swordsmanship"
      : engagement === "pounding"
        ? "gunnery"
        : "marksmanship";
  const armament =
    engagement === "boarding"
      ? ship.cargo.cutlasses
      : engagement === "pounding"
        ? ship.cargo.cannon
        : ship.cargo.cannon + ship.cargo.muskets;

  const ours =
    (strength[skillKey] ?? 1) * 2.2 +
    Math.sqrt(Math.max(1, armament)) * 1.8 +
    ship.crew.length * 0.35 +
    (captain?.notoriety ?? 0) * 0.9 +
    (ship.hull / ship.maxHull) * 3;

  const theirs =
    (warship ? 11 : 5) * (0.7 + region.danger) * state.rng.range(0.75, 1.3) +
    (1 - state.regions[regionId].knowledge) * 2.5;

  const reckless = kingEffects(state.king).some((e) => e.reckless);
  const odds = ours / (ours + theirs);
  const won = state.rng.chance(reckless ? odds * 0.92 : odds);

  if (!won) {
    ship.log.push(`Beaten off by ${warship ? "a warship" : "a stubborn merchant"}`);
    ship.hull -= state.rng.int(12, 34) * (reckless ? 1.4 : 1);
    if (state.rng.chance(0.5)) killCrewman(state, ship, "killed in the action");
    if (ship.hull <= 0) {
      loseShip(state, ship);
      return;
    }
    // A mauled ship goes home.
    ship.status = "returning";
    ship.daysLeft = region.distance;
    return;
  }

  // Won. Spend the ammunition that took her.
  if (engagement === "boarding") ship.cargo.cutlasses = Math.max(0, ship.cargo.cutlasses - 2);
  if (engagement !== "boarding") ship.cargo.cannon = Math.max(0, ship.cargo.cannon - 2);
  if (engagement === "harassing") ship.cargo.muskets = Math.max(0, ship.cargo.muskets - 1);

  const base = warship ? WARSHIP_BASE_GOLD : MERCHANT_BASE_GOLD;
  let gold = base * region.richness * state.regions[regionId].shipping * state.rng.range(0.7, 1.5);
  for (const effect of kingEffects(state.king)) {
    if (effect.surrenderBonus) gold *= 1 + effect.surrenderBonus;
  }
  ship.plunder += gold;
  state.stats.prizesTaken++;
  state.stats.goldPlundered += gold;

  ship.log.push(
    `Took ${NATIONS[flag].adjective} ${warship ? "warship" : "merchantman"} by ${ENGAGEMENTS[engagement].name.toLowerCase()} — ${Math.round(gold)} gold`,
  );

  damageRelations(state, flag, RELATIONS_PER_PRIZE);
  state.regions[regionId].shipping = Math.max(
    0.1,
    state.regions[regionId].shipping - REGION_DEPLETION,
  );

  // Boarding takes people; pounding leaves a wreck.
  const walkThePlank = state.standing.some((e) => e.edict === "walkThePlank");
  if (!walkThePlank && engagement !== "pounding") {
    if (state.rng.chance(RECRUIT_CHANCE)) {
      stowRecruit(ship);
      ship.log.push("A hand from her crew signed our articles");
    }
    if (state.rng.chance(SKILLED_CAPTIVE_CHANCE)) {
      const job = state.rng.pick(SKILLED_JOBS);
      if (job) {
        stowSkilled(ship, job);
        ship.log.push(`Her ${job} is coming with us`);
      }
    }
    if (state.rng.chance(WEALTHY_CAPTIVE_CHANCE)) {
      stowWealthy(ship, flag);
      ship.log.push("A passenger worth ransoming is in the hold");
    }
    if (warship || state.rng.chance(0.5)) stowCaptives(ship, state.rng.int(1, 4));
  }

  // Sea time teaches, at a price.
  for (const id of ship.crew) {
    const person = state.people.get(id);
    if (!person) continue;
    if (state.rng.chance(0.12)) {
      const skill = state.rng.pick(PIRATE_SKILLS);
      if (skill) person.skills[skill] = Math.min(9, person.skills[skill] + 1);
    }
  }
  if (state.rng.chance(0.18)) killCrewman(state, ship, "killed taking the prize");
}

/** Which flags this ship is allowed to prey on. */
function pickVictim(state: GameState, traffic: readonly NationId[]): NationId | null {
  const allowed = traffic.filter((id) => {
    const nation = state.nations[id];
    if (nation.prohibited) return false;
    if (nation.isPatron) return false;
    if (nation.atPeace) return false;
    return true;
  });
  return state.rng.pick(allowed) ?? null;
}

function damageRelations(state: GameState, flag: NationId, amount: number): void {
  const nation = state.nations[flag];
  // A letter of marque from someone else makes this somebody else's problem.
  const licensed = Object.values(state.nations).some((n) => n.lettersOfMarque);
  nation.relations = clampRelations(nation.relations - (licensed ? amount * 0.4 : amount));
  nation.monthsSinceRaid = 0;
}

// ── The hold ────────────────────────────────────────────────────────────────
//
// People taken at sea are carried as counts on the voyage and only become
// entities when the ship ties up, so a cruise does not spawn a crowd standing
// in the water waiting for a boat.

function stowCaptives(ship: Ship, count: number): void {
  ship.hold.unskilled += count;
}

function stowSkilled(ship: Ship, job: JobId): void {
  ship.hold.skilled.push(job);
}

function stowWealthy(ship: Ship, flag: NationId): void {
  ship.hold.wealthy.push(flag);
}

function stowRecruit(ship: Ship): void {
  ship.hold.recruits++;
}

function killCrewman(state: GameState, ship: Ship, reason: string): void {
  const id = state.rng.pick(ship.crew);
  if (id === undefined) return;
  const person = state.people.get(id);
  ship.crew = ship.crew.filter((c) => c !== id);
  if (person) {
    person.ship = -1;
    person.activity = "dead";
    state.stats.piratesLost++;
  }
  ship.log.push(`A hand ${reason}`);
}

function loseShip(state: GameState, ship: Ship): void {
  ship.status = "lost";
  state.stats.shipsLost++;
  for (const id of [...ship.crew, ship.captain]) {
    const person = state.people.get(id);
    if (!person) continue;
    person.ship = -1;
    person.activity = "dead";
    state.stats.piratesLost++;
  }
  ship.crew = [];
  ship.captain = -1;
  notify(state, "bad", `${ship.name} is lost with all hands`);
  state.ships.delete(ship.id);
}

/** She ties up: the crew comes ashore, the hold is emptied, the shares are paid. */
function comeHome(state: GameState, ship: Ship): void {
  ship.status = "inPort";
  ship.daysLeft = 0;
  ship.mission = null;
  ship.region = null;

  const dock = ship.dock >= 0 ? state.buildings.get(ship.dock) : undefined;
  const x = dock?.x ?? 8;
  const y = dock?.y ?? 8;

  for (const id of [...ship.crew, ship.captain]) {
    const person = state.people.get(id);
    if (!person) continue;
    person.activity = "idle";
    person.x = x;
    person.y = y;
  }

  const hold = ship.hold;
  for (let i = 0; i < hold.unskilled; i++) spawnCaptive(state, { x, y });
  for (const job of hold.skilled) spawnCaptive(state, { x, y, profession: job });
  for (const flag of hold.wealthy) {
    const captive = spawnCaptive(state, { x, y, nationality: flag, wealthy: true });
    captive.ransom = 400 + state.rng.int(0, 400);
  }
  for (let i = 0; i < hold.recruits; i++) spawnPirate(state, { x, y });
  state.stats.captivesTaken += hold.unskilled + hold.skilled.length + hold.wealthy.length;
  ship.hold = { unskilled: 0, skilled: [], wealthy: [], recruits: 0 };

  // The shares: the crew's cut, then whatever the Pirate Cave skims, then the
  // treasury. A generous split buys loyalty and comes back over the bar anyway.
  const plunder = ship.plunder;
  ship.plunder = 0;
  if (plunder > 0) {
    const crewShare = plunder * PLUNDER_SHARES[ship.share].crewShare;
    const captain = state.people.get(ship.captain);
    if (captain) payPirate(state, captain, crewShare * 0.35);
    const each = ship.crew.length > 0 ? (crewShare * 0.65) / ship.crew.length : 0;
    for (const id of ship.crew) {
      const person = state.people.get(id);
      if (person) payPirate(state, person, each);
    }
    receiveGold(state, plunder - crewShare);
  }

  // Unload what is left into the dock's stores.
  if (dock) {
    for (const good of ["cutlasses", "cannon", "muskets"] as const) {
      const returned = Math.floor(ship.cargo[good]);
      if (returned > 0) ship.cargo[good] -= addStock(dock, good, returned);
    }
  }

  const summary = ship.log.slice(-1)[0] ?? "no prizes";
  notify(
    state,
    plunder > 0 ? "good" : "info",
    `${ship.name} is home — ${Math.round(plunder)} gold. ${summary}`,
    dockPosition(state, ship),
  );
}

/** Selling abroad on a trading voyage, which pays better than the cove. */
function sellCargoAbroad(state: GameState, ship: Ship): number {
  let total = 0;
  const dock = ship.dock >= 0 ? state.buildings.get(ship.dock) : undefined;
  if (!dock) return 0;
  for (const good of ["cutlasses", "cannon", "muskets"] as const) {
    const held = stockOf(dock, good);
    if (held <= 0) continue;
    total += held * 12;
  }
  ship.plunder += total;
  return total;
}

/** For the fleet panel: a one-line description of what a ship is doing. */
export function describeShip(ship: Ship): string {
  switch (ship.status) {
    case "building":
      return `building (${Math.ceil(ship.buildProgress)} hours of work left)`;
    case "inPort":
      return ship.captain < 0 ? "in port, no captain" : "in port";
    case "outbound":
      return `outbound for ${ship.region ? REGIONS[ship.region].name : "sea"}`;
    case "onStation":
      return `cruising ${ship.region ? REGIONS[ship.region].name : "the sea"}`;
    case "returning":
      return "homeward bound";
    default:
      return "lost";
  }
}
