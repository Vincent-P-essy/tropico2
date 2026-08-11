import type { GoodId } from "./goods.ts";

/**
 * The fleet.
 *
 * These are the original's numbers, and they encode a real set of trade-offs: a
 * Snow is free of gold and needs three men, so you can send it out again and
 * again; a Galleon costs a fortune, sails like a barn door, and wins.
 *
 * `rations` is the hold's capacity, and rations are how long a ship can stay at
 * sea, so a Brigantine's 30 is why it endures where a Sloop's 10 does not.
 */

export type ShipClassId = "snow" | "schooner" | "sloop" | "brigantine" | "frigate" | "galleon";

export interface ShipClassDef {
  readonly id: ShipClassId;
  readonly name: string;
  readonly gold: number;
  readonly lumber: number;
  /** Base speed. Higher catches runners and escapes stronger ships. */
  readonly speed: number;
  readonly officers: number;
  readonly crew: number;
  /** Maximum of each cargo good the hold takes. */
  readonly capacity: Readonly<Record<"seaRations" | "cutlasses" | "cannon" | "muskets", number>>;
  /** Hull points. Damage accumulates across a cruise and is repaired in port. */
  readonly hull: number;
  /** Buildable at a Boatyard; the rest need a full Shipyard. */
  readonly small: boolean;
  /** Game-hours to build when fully staffed with shipwrights. */
  readonly buildHours: number;
  readonly description: string;
}

export const SHIP_CLASSES: Readonly<Record<ShipClassId, ShipClassDef>> = {
  snow: {
    id: "snow",
    name: "Snow",
    gold: 0,
    lumber: 20,
    speed: 28,
    officers: 1,
    crew: 3,
    capacity: { seaRations: 5, cutlasses: 4, cannon: 4, muskets: 4 },
    hull: 40,
    small: true,
    buildHours: 90,
    description:
      "A tiny crew, so she can go out again the moment she is back. The best hull on the island for snatching a skilled craftsman.",
  },
  schooner: {
    id: "schooner",
    name: "Schooner",
    gold: 100,
    lumber: 30,
    speed: 32,
    officers: 2,
    crew: 5,
    capacity: { seaRations: 8, cutlasses: 7, cannon: 8, muskets: 7 },
    hull: 60,
    small: true,
    buildHours: 130,
    description: "The fastest thing afloat. Nothing outruns her, and she is good at everything.",
  },
  sloop: {
    id: "sloop",
    name: "Sloop",
    gold: 250,
    lumber: 50,
    speed: 28,
    officers: 2,
    crew: 8,
    capacity: { seaRations: 10, cutlasses: 10, cannon: 16, muskets: 10 },
    hull: 90,
    small: true,
    buildHours: 190,
    description:
      "Cheaper, quicker and better armed than a Brigantine — but she carries ten rations, so she cannot stay out.",
  },
  brigantine: {
    id: "brigantine",
    name: "Brigantine",
    gold: 500,
    lumber: 70,
    speed: 26,
    officers: 2,
    crew: 8,
    capacity: { seaRations: 30, cutlasses: 10, cannon: 12, muskets: 10 },
    hull: 120,
    small: true,
    buildHours: 260,
    description: "Thirty rations of endurance, and fast enough to run down a fleeing merchant.",
  },
  frigate: {
    id: "frigate",
    name: "Frigate",
    gold: 1000,
    lumber: 125,
    speed: 22,
    officers: 4,
    crew: 13,
    capacity: { seaRations: 40, cutlasses: 17, cannon: 26, muskets: 17 },
    hull: 200,
    small: false,
    buildHours: 420,
    description:
      "The cruising ship. Strong, well armed, and quick enough to matter. One well-handled frigate can carry an entire campaign.",
  },
  galleon: {
    id: "galleon",
    name: "Galleon",
    gold: 1000,
    lumber: 150,
    speed: 15,
    officers: 5,
    crew: 15,
    capacity: { seaRations: 60, cutlasses: 20, cannon: 40, muskets: 20 },
    hull: 300,
    small: false,
    buildHours: 560,
    description:
      "Forty guns and sixty rations. She sails like a church, and nothing she catches gets away.",
  },
};

export const SHIP_CLASS_IDS = Object.keys(SHIP_CLASSES) as ShipClassId[];

export function shipClass(id: ShipClassId): ShipClassDef {
  return SHIP_CLASSES[id];
}

/** What a cruise is being sent to do. */
export type MissionId = "cruise" | "explore" | "raidSettlement" | "kidnapCraftsman" | "trade";

export interface MissionDef {
  readonly id: MissionId;
  readonly name: string;
  /** Whether the ship can be sunk or the crew killed on this mission. */
  readonly risky: boolean;
  readonly description: string;
}

export const MISSIONS: Readonly<Record<MissionId, MissionDef>> = {
  cruise: {
    id: "cruise",
    name: "Cruise for Plunder",
    risky: true,
    description:
      "Hunt shipping in a region. Gold, cargo, recruits and captives — and the only mission that can lose you the ship.",
  },
  explore: {
    id: "explore",
    name: "Explore",
    risky: false,
    description:
      "Chart a region. No plunder and no danger, but it uncovers trade routes and settlements worth returning for.",
  },
  raidSettlement: {
    id: "raidSettlement",
    name: "Raid Settlement",
    risky: false,
    description:
      "Take unskilled captives from a known settlement. The ship is never lost, though some of the crew may not come back.",
  },
  kidnapCraftsman: {
    id: "kidnapCraftsman",
    name: "Kidnap Craftsman",
    risky: false,
    description:
      "Take one named craftsman, for gold and with no risk. The only reliable way to get the skilled captive a building demands.",
  },
  trade: {
    id: "trade",
    name: "Trading Voyage",
    risky: false,
    description: "Sell cargo abroad at better prices than the cove pays, and come home with gold.",
  },
};

/** How a ship engages what it catches. */
export type EngagementId = "boarding" | "pounding" | "harassing";

export interface EngagementDef {
  readonly id: EngagementId;
  readonly name: string;
  readonly requires: readonly GoodId[];
  readonly helps: readonly GoodId[];
  readonly description: string;
}

export const ENGAGEMENTS: Readonly<Record<EngagementId, EngagementDef>> = {
  boarding: {
    id: "boarding",
    name: "Board her",
    requires: ["cutlasses"],
    helps: ["muskets"],
    description:
      "Swords across the rail. The cargo survives intact and captives can be taken, but so can your crew's lives.",
  },
  pounding: {
    id: "pounding",
    name: "Pound her",
    requires: ["cannon"],
    helps: [],
    description:
      "Guns at a distance until she strikes. Safe for your crew, hard on the prize — and you cannot take captives from a wreck.",
  },
  harassing: {
    id: "harassing",
    name: "Harass her",
    requires: ["cannon", "muskets"],
    helps: [],
    description:
      "Chip away at rigging and deck until her nerve breaks. Slower, but she surrenders whole and her crew mostly alive.",
  },
};

/** How the plunder is split, which is what decides whether pirates stay loyal. */
export type PlunderShare = "miserly" | "selfish" | "even" | "generous" | "bigSpender";

export interface PlunderShareDef {
  readonly id: PlunderShare;
  readonly name: string;
  /** Fraction of the plunder that goes to the crew rather than the treasury. */
  readonly crewShare: number;
  readonly description: string;
}

export const PLUNDER_SHARES: Readonly<Record<PlunderShare, PlunderShareDef>> = {
  miserly: {
    id: "miserly",
    name: "Miserly",
    crewShare: 0.05,
    description: "Almost all of it is yours. They will notice.",
  },
  selfish: {
    id: "selfish",
    name: "Selfish",
    crewShare: 0.15,
    description: "A thin cut for the crew.",
  },
  even: {
    id: "even",
    name: "Even Split",
    crewShare: 0.3,
    description: "The customary share. Nobody is delighted and nobody mutinies.",
  },
  generous: {
    id: "generous",
    name: "Generous",
    crewShare: 0.45,
    description: "They will sail for you gladly, and spend it all in your taverns anyway.",
  },
  bigSpender: {
    id: "bigSpender",
    name: "Big Spender",
    crewShare: 0.6,
    description: "Most of the prize goes forward. Ranks climb fast, and so does happiness.",
  },
};

export const PLUNDER_SHARE_IDS = Object.keys(PLUNDER_SHARES) as PlunderShare[];
