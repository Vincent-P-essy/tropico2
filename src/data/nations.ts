/**
 * The three great powers, and the seas they sail.
 *
 * Relations run from -100 (they are fitting out an expedition against you) to
 * +100 (harmonious, and eligible to be declared your patron). Every prize you
 * take costs relations with her flag, which is the standing tension of the game:
 * the shipping worth robbing belongs to somebody, and somebody counts.
 */

export type NationId = "england" | "france" | "spain";

export interface NationDef {
  readonly id: NationId;
  readonly name: string;
  readonly adjective: string;
  /** Flag colours, used for sails, banners and the diplomacy screen. */
  readonly colors: readonly [string, string];
  readonly description: string;
}

export const NATIONS: Readonly<Record<NationId, NationDef>> = {
  england: {
    id: "england",
    name: "England",
    adjective: "English",
    colors: ["#f2f2f2", "#c8102e"],
    description: "Rich shipping, a long memory, and the strongest navy of the three.",
  },
  france: {
    id: "france",
    name: "France",
    adjective: "French",
    colors: ["#00209f", "#f2f2f2"],
    description: "The readiest to look the other way, if the price of friendship is paid.",
  },
  spain: {
    id: "spain",
    name: "Spain",
    adjective: "Spanish",
    colors: ["#aa151b", "#f1bf00"],
    description: "The treasure fleets. The richest prizes afloat, and the heaviest escorts.",
  },
};

export const NATION_IDS = Object.keys(NATIONS) as NationId[];

export function nationDef(id: NationId): NationDef {
  return NATIONS[id];
}

/** Named bands of the relations scale, for the diplomacy panel. */
export const RELATION_BANDS: readonly { readonly min: number; readonly label: string }[] = [
  { min: 75, label: "Harmonious" },
  { min: 40, label: "Friendly" },
  { min: 10, label: "Cordial" },
  { min: -10, label: "Indifferent" },
  { min: -40, label: "Strained" },
  { min: -75, label: "Hostile" },
  { min: -101, label: "At War" },
];

export function relationLabel(value: number): string {
  for (const band of RELATION_BANDS) {
    if (value >= band.min) return band.label;
  }
  return "At War";
}

/**
 * The seas. Each region has its own richness, danger and owner presence, and
 * starts unknown — a region you have not charted yields poor cruises until you
 * explore it. Cruising the same water repeatedly thins the shipping, which is
 * why the original's advice was to keep moving your frigate around.
 */
export type RegionId =
  | "windwardPassage"
  | "spanishMain"
  | "gulfOfHonduras"
  | "floridaStraits"
  | "leewardIslands"
  | "bayOfCampeche";

export interface RegionDef {
  readonly id: RegionId;
  readonly name: string;
  /** Base density of shipping, 0-1. */
  readonly richness: number;
  /** Chance an encounter is a warship rather than a merchant, 0-1. */
  readonly danger: number;
  /** Whose flags fly here most often, in order. */
  readonly traffic: readonly NationId[];
  /** Days of sailing before the ship is on station. */
  readonly distance: number;
  readonly description: string;
}

export const REGIONS: Readonly<Record<RegionId, RegionDef>> = {
  windwardPassage: {
    id: "windwardPassage",
    name: "The Windward Passage",
    richness: 0.5,
    danger: 0.2,
    traffic: ["england", "france"],
    distance: 2,
    description: "Close, busy, and lightly patrolled. Where every pirate king starts.",
  },
  leewardIslands: {
    id: "leewardIslands",
    name: "The Leeward Islands",
    richness: 0.55,
    danger: 0.28,
    traffic: ["france", "england"],
    distance: 3,
    description: "Sugar and small merchantmen, with French cruisers about.",
  },
  gulfOfHonduras: {
    id: "gulfOfHonduras",
    name: "The Gulf of Honduras",
    richness: 0.65,
    danger: 0.35,
    traffic: ["spain", "england"],
    distance: 4,
    description: "Logwood and Spanish coasters. Rich enough to be worth the escorts.",
  },
  bayOfCampeche: {
    id: "bayOfCampeche",
    name: "The Bay of Campeche",
    richness: 0.7,
    danger: 0.45,
    traffic: ["spain"],
    distance: 5,
    description: "Deep in Spanish water. Fat prizes, and guarda costas that hunt in pairs.",
  },
  floridaStraits: {
    id: "floridaStraits",
    name: "The Florida Straits",
    richness: 0.8,
    danger: 0.55,
    traffic: ["spain", "england"],
    distance: 6,
    description:
      "The treasure fleet's road home. The richest water in the world, and the best defended.",
  },
  spanishMain: {
    id: "spanishMain",
    name: "The Spanish Main",
    richness: 0.9,
    danger: 0.65,
    traffic: ["spain"],
    distance: 7,
    description:
      "Silver out of Porto Bello under a wall of guns. Take a galleon or do not go at all.",
  },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

export function regionDef(id: RegionId): RegionDef {
  return REGIONS[id];
}
