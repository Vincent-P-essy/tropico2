import type { ByteField, IdField, ScalarField } from "../core/field.ts";
import type { Point } from "../core/grid.ts";
import type { Rng } from "../core/rng.ts";
import type { BuildingId } from "../data/buildings.ts";
import type { EdictId } from "../data/edicts.ts";
import type { GoodId } from "../data/goods.ts";
import type { JobId, PirateSkill } from "../data/jobs.ts";
import type { NationId, RegionId } from "../data/nations.ts";
import type { AuraId, NeedId } from "../data/needs.ts";
import type { BackgroundId, FlawId, QualityId } from "../data/traits.ts";
import type { EngagementId, MissionId, PlunderShare, ShipClassId } from "../data/ships.ts";
import type { Scenario } from "../data/scenarios.ts";
import type { Island } from "./island.ts";

/**
 * The shape of the world.
 *
 * Everything here is plain data holding plain data. No behaviour lives on these
 * objects, which buys three things: the state serialises to JSON with no custom
 * logic, tests construct exactly the situation they want with no mocks, and the
 * whole simulation is one pure function of (state, tick).
 */

/** What a person is doing right now. */
export type Activity =
  | "idle"
  | "walking"
  | "working"
  | "using"
  | "resting"
  | "sleepingRough"
  | "fetching"
  | "delivering"
  | "atSea"
  | "fleeing"
  | "rioting"
  | "dead";

export interface Person {
  id: number;
  kind: "pirate" | "captive";
  name: string;
  sex: "male" | "female";
  nationality: NationId;

  /** Continuous tile position. */
  x: number;
  y: number;
  /** Remaining tiles of the current route; empty when standing still. */
  path: Point[];
  activity: Activity;
  /** Building this person is walking to, or -1. */
  target: number;
  /**
   * Building this person is physically inside, or -1.
   *
   * Kept as one field so entering somewhere always removes them from wherever
   * they were. Without it the visitor lists leak: a worker who walks off to eat
   * stays counted at his workplace and is counted again at the kitchen, every
   * building on the island slowly fills with people who left months ago, and
   * eventually the capacity checks refuse everyone.
   */
  inside: number;
  /**
   * Why this person is walking somewhere.
   *
   * Without it, arrival has to be guessed from whether the destination happens
   * to be the walker's workplace — and a cook who needs to eat at the chuck tent
   * he works in gets put straight back to work and starves inside his own
   * kitchen.
   */
  intent: "work" | "serve" | "fetch" | "deliver";
  /** Game-hours left in the current activity. */
  timer: number;

  needs: Record<NeedId, number>;
  /** Happiness for pirates, resignation for captives. Both 0-100. */
  mood: number;

  /** Where this person works, or null when unemployed. */
  job: { building: number; job: JobId } | null;
  /** Housing plot for a pirate, bunkhouse or stockade for a captive. */
  home: number;

  // Pirates only.
  skills: Record<PirateSkill, number>;
  courage: number;
  leadership: number;
  notoriety: number;
  loyalty: number;
  /** Spending money. A pirate with none cannot buy the entertainment he needs. */
  gold: number;
  /** Lifetime earnings, which set rank and therefore house quality. */
  earnings: number;
  /** Index into RANKS, 0-8. */
  rank: number;
  /** Set when this pirate is one of the named captains. */
  captainId: string | null;
  /** Ship this pirate is crewing, or -1. */
  ship: number;

  // Captives only.
  /** Set for skilled captives; unlocks the buildings that need this profession. */
  profession: JobId | null;
  /** Wealthy captives do no work, spend at entertainment, and ransom for more the longer they stay. */
  wealthy: boolean;
  ransom: number;
  /** Working skill, 1-6. Higher means faster production and better service. */
  skill: number;
  /** Consecutive game-days with no food. */
  starving: number;
  /** Skeletons haul without eating, sleeping or praying. */
  skeleton: boolean;

  // Haulers only.
  /** Goods in hand, being carried between two buildings. */
  carrying: { good: GoodId; amount: number } | null;
  /** Building this hauler is fetching from, or -1 when heading home. */
  errand: number;
}

export type BuildingPriority = "low" | "normal" | "high";

export interface Building {
  id: number;
  def: BuildingId;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Builder-hours still needed; 0 means finished. */
  construction: number;
  /** Total builder-hours the job started with, for the progress bar. */
  constructionTotal: number;
  workers: number[];
  /** People inside right now, being served. */
  visitors: number[];
  stock: Partial<Record<GoodId, number>>;
  /** Game-hours accumulated toward the current batch. */
  progress: number;
  priority: BuildingPriority;
  /** Housing and palace levels, 0-based. */
  level: number;
  /** Pirate who owns this housing plot, or -1. */
  owner: number;
  /** Nation the smuggler's cove trades with, if opened. */
  openTo: NationId | null;
  /** Player can shut a building without demolishing it. */
  enabled: boolean;
}

export type ShipStatus = "building" | "inPort" | "outbound" | "onStation" | "returning" | "lost";

export interface Ship {
  id: number;
  cls: ShipClassId;
  name: string;
  /** Dock building this ship berths at, or -1 while building. */
  dock: number;
  hull: number;
  maxHull: number;
  /** Person id of the captain, or -1. */
  captain: number;
  crew: number[];
  cargo: Record<"seaRations" | "cutlasses" | "cannon" | "muskets", number>;
  status: ShipStatus;
  /** Builder-hours remaining while under construction. */
  buildProgress: number;
  mission: MissionId | null;
  region: RegionId | null;
  engagement: EngagementId;
  share: PlunderShare;
  /** Game-days left in the current leg. */
  daysLeft: number;
  /** What happened on this voyage, newest last. */
  log: string[];
  /** Gold taken so far this voyage, paid out on return. */
  plunder: number;
  /**
   * People taken at sea, carried as counts until she ties up.
   *
   * Kept on the ship rather than beside it so a save file is the whole world:
   * a voyage in progress restores with its prisoners still in the hold.
   */
  hold: {
    unskilled: number;
    skilled: JobId[];
    wealthy: NationId[];
    recruits: number;
  };
}

export interface NationState {
  relations: number;
  /** They know where the island is, and can therefore invade it. */
  knowsLocation: boolean;
  atPeace: boolean;
  isPatron: boolean;
  /** Ships of this nation are off limits to your captains. */
  prohibited: boolean;
  /** Their enemies are fair game at no diplomatic cost. */
  lettersOfMarque: boolean;
  /** Months since one of their ships was taken, used for relations healing. */
  monthsSinceRaid: number;
}

export interface RegionState {
  /** 0-1: how well charted. Poor knowledge means poor cruises. */
  knowledge: number;
  /** 0-1: how much shipping is left after being hunted. Recovers monthly. */
  shipping: number;
  /** Settlements found by exploring, which can then be raided for captives. */
  settlements: number;
}

/** A standing edict, with the target it was issued against. */
export interface StandingEdict {
  edict: EdictId;
  nation: NationId | null;
}

/** A one-off edict whose effect fades rather than stopping dead. */
export interface TimedEffect {
  kind: "festival";
  ticksLeft: number;
}

export interface King {
  name: string;
  captainId: string;
  sex: "male" | "female";
  nationality: NationId;
  background: BackgroundId;
  qualities: QualityId[];
  flaw: FlawId;
}

export type NoticeKind = "info" | "good" | "warning" | "bad";

export interface Notice {
  id: number;
  tick: number;
  kind: NoticeKind;
  text: string;
  /** Camera target, so clicking the notice shows the problem. */
  at: Point | null;
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  /** Game-hours since the scenario began. */
  tick: number;
  /** Absolute month index of tick 0, so dates read as real years. */
  startMonth: number;
  rng: Rng;
  island: Island;
  king: King;

  /** Island funds, which pay for buildings and edicts. */
  treasury: number;
  /** The Pirate King's personal hoard, which is what most missions score. */
  hoard: number;
  /** Fraction of incoming gold the Pirate Cave diverts to the hoard. */
  stashRate: number;
  /** The build currency, pooled island-wide as in the original. */
  lumber: number;

  buildings: Map<number, Building>;
  people: Map<number, Person>;
  ships: Map<number, Ship>;
  nextId: number;

  /** One field per aura, rebuilt only when buildings change. */
  auras: Record<AuraId, ScalarField>;
  /** Building id occupying each tile, or -1. */
  occupancy: IdField;
  /** 1 where a road has been laid. */
  roads: ByteField;

  nations: Record<NationId, NationState>;
  regions: Record<RegionId, RegionState>;
  standing: StandingEdict[];
  /**
   * Effects with a clock on them: a festival's surge of anarchy, the lift a
   * shipment of free rum gives every pirate on the island. Kept as data so they
   * survive a save and expire on their own.
   */
  effects: TimedEffect[];
  /** Black-market price multipliers, which climb as you buy. */
  marketMarkup: Partial<Record<GoodId, number>>;
  /** Times the graveyard has been used; each raising costs more. */
  raisings: number;

  notices: Notice[];
  scenario: Scenario | null;
  status: GameStatus;
  /** Set when the scenario ends, for the results screen. */
  medal: "gold" | "silver" | "bronze" | null;
  /** Why the run ended. */
  ending: string | null;

  /** Rolling counters the almanac reads. */
  stats: {
    prizesTaken: number;
    captivesTaken: number;
    escapes: number;
    piratesLost: number;
    shipsLost: number;
    goldPlundered: number;
  };
}

/** Everything the player can do, as data. Commands are the only way state changes. */
export type Command =
  | { kind: "place"; building: BuildingId; x: number; y: number }
  | { kind: "demolish"; building: number }
  | { kind: "setPriority"; building: number; priority: BuildingPriority }
  | { kind: "setEnabled"; building: number; enabled: boolean }
  | { kind: "assign"; person: number; building: number }
  | { kind: "release"; person: number }
  | { kind: "setStashRate"; rate: number }
  | { kind: "buildShip"; cls: ShipClassId; yard: number }
  | { kind: "loadShip"; ship: number; good: GoodId; amount: number }
  | { kind: "setShipOrders"; ship: number; engagement: EngagementId; share: PlunderShare }
  | { kind: "launch"; ship: number; mission: MissionId; region: RegionId }
  | { kind: "recall"; ship: number }
  | { kind: "assignCaptain"; ship: number; person: number }
  | { kind: "edict"; edict: EdictId; person?: number; ship?: number; nation?: NationId }
  | { kind: "cancelEdict"; edict: EdictId }
  | { kind: "openCove"; nation: NationId }
  | { kind: "sell"; good: GoodId; amount: number }
  | { kind: "buy"; good: GoodId; amount: number };

/** Why a command was refused, so the UI can say something useful. */
export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export const OK: CommandResult = { ok: true };

export function fail(reason: string): CommandResult {
  return { ok: false, reason };
}
