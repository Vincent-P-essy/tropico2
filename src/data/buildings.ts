import type { GoodId } from "./goods.ts";
import type { JobId } from "./jobs.ts";
import type { AuraId, NeedId } from "./needs.ts";

/**
 * The building catalogue.
 *
 * Sizes, gold and lumber costs, upkeep, staffing, capacities, inputs, outputs
 * and aura strengths are the original game's own numbers. An aura written
 * `(34:3)` in the game's data appears here as `strength: 34, radius: 3`.
 *
 * Read this file as the design document it is: the shape of the whole economy is
 * visible in the `consumes`/`produces` pairs, and the shape of the zoning puzzle
 * is visible in which categories emit which auras.
 */

export type BuildingCategory =
  | "infrastructure"
  | "resource"
  | "production"
  | "entertainment"
  | "nautical"
  | "captiveControl"
  | "education"
  | "defense"
  | "accoutrement";

export const CATEGORY_NAMES: Readonly<Record<BuildingCategory, string>> = {
  infrastructure: "Infrastructure",
  resource: "Resource",
  production: "Production",
  entertainment: "Entertainment",
  nautical: "Nautical",
  captiveControl: "Captive Control",
  education: "Education",
  defense: "Defense",
  accoutrement: "Accoutrement",
};

export const CATEGORY_ORDER: readonly BuildingCategory[] = [
  "infrastructure",
  "resource",
  "production",
  "entertainment",
  "nautical",
  "captiveControl",
  "defense",
  "education",
  "accoutrement",
];

/** Terrain a building must be sited on or beside. */
export type SiteRequirement = "coast" | "forest" | "ore" | "fertile";

export interface StaffSlot {
  readonly job: JobId;
  readonly count: number;
}

export interface AuraEmission {
  readonly aura: AuraId;
  readonly strength: number;
  readonly radius: number;
}

export interface NeedProvision {
  readonly need: NeedId;
  /** Satisfaction at the worst possible staffing, 0-100. */
  readonly min: number;
  /** Satisfaction at the best possible staffing, 0-100. */
  readonly max: number;
  /** Stocking any of these goods pushes satisfaction toward the maximum. */
  readonly boostedBy?: readonly GoodId[];
}

export interface Recipe {
  /** Input goods consumed per batch. Empty for extractors like farms and mines. */
  readonly inputs: readonly { good: GoodId; amount: number }[];
  readonly output: GoodId;
  readonly amount: number;
  /** Game-hours a fully staffed building takes to complete one batch. */
  readonly hours: number;
}

export interface BuildingDef {
  readonly id: BuildingId;
  readonly name: string;
  readonly category: BuildingCategory;
  readonly w: number;
  readonly h: number;
  readonly gold: number;
  readonly lumber: number;
  /** Gold per month while it stands. */
  readonly upkeep: number;
  /** Only one may exist on the island. */
  readonly unique?: boolean;
  /** Must touch a road tile, so haulers and visitors can reach it. */
  readonly needsRoad?: boolean;
  readonly site?: SiteRequirement;
  /** A skilled captive of this profession must already be on the island to build it. */
  readonly requires?: JobId;
  readonly staff?: readonly StaffSlot[];
  /** How many people may use it at once, and which population. */
  readonly serves?: { readonly who: "pirate" | "captive"; readonly capacity: number };
  readonly provides?: readonly NeedProvision[];
  readonly recipe?: Recipe;
  readonly auras?: readonly AuraEmission[];
  /** Pirates and wealthy captives pay this per visit; it is income. */
  readonly fee?: number;
  readonly description: string;
}

export type BuildingId =
  | "road"
  | "constructionTent"
  | "chuckTent"
  | "bunkhouse"
  | "pirateHousing"
  | "pirateCave"
  | "piratePalace"
  | "blackMarket"
  | "smugglersCove"
  | "timberCamp"
  | "cornFarm"
  | "sugarcaneFarm"
  | "tobaccoFarm"
  | "bananaFarm"
  | "papayaFarm"
  | "ironMine"
  | "sawmill"
  | "brewery"
  | "rumDistillery"
  | "cigarFactory"
  | "bakery"
  | "blastFurnace"
  | "blacksmithy"
  | "cannonFoundry"
  | "gunsmithy"
  | "smugglersDive"
  | "cheapEatery"
  | "tavern"
  | "inn"
  | "animalPit"
  | "gamblingDen"
  | "casino"
  | "wenchMasseuse"
  | "brothelSalon"
  | "courtesanSpa"
  | "dock"
  | "boatyard"
  | "shipyard"
  | "seaRationFactory"
  | "church"
  | "stockade"
  | "gallows"
  | "interrogationChamber"
  | "apothecary"
  | "hotel"
  | "orderlyShrubs"
  | "veryOrderlyDecor"
  | "scaryDecor"
  | "veryScaryDecor"
  | "gunnerySchool"
  | "marksmanshipSchool"
  | "navigationSchool"
  | "seamanshipSchool"
  | "swordsmanshipSchool"
  | "watchTower"
  | "protectiveCannon"
  | "safeHarborAnchor"
  | "anarchyShrubs"
  | "anarchyDecor"
  | "fort"
  | "observatory"
  | "surgery"
  | "carpenterShop"
  | "hatShop"
  | "parrotAviary"
  | "graveyard";

const B = (def: BuildingDef): BuildingDef => def;

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  // ── Infrastructure ────────────────────────────────────────────────────────
  road: B({
    id: "road",
    name: "Road",
    category: "infrastructure",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 1,
    upkeep: 0,
    description:
      "Everyone walks faster on a road, and most buildings must touch one. Roads are the cheapest speed you will ever buy.",
  }),
  constructionTent: B({
    id: "constructionTent",
    name: "Construction Tent",
    category: "infrastructure",
    w: 2,
    h: 2,
    gold: 0,
    lumber: 0,
    upkeep: 0,
    staff: [
      { job: "builder", count: 5 },
      { job: "overseer", count: 1 },
    ],
    description:
      "Houses the builders who raise everything else. Free and instant, so put one wherever you are about to build and tear it down after.",
  }),
  chuckTent: B({
    id: "chuckTent",
    name: "Chuck Tent",
    category: "infrastructure",
    w: 2,
    h: 2,
    gold: 0,
    lumber: 2,
    upkeep: 2,
    needsRoad: true,
    staff: [
      { job: "cook", count: 1 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "captive", capacity: 7 },
    recipe: { inputs: [{ good: "corn", amount: 1 }], output: "slop", amount: 3, hours: 8 },
    provides: [{ need: "feasting", min: 0, max: 82 }],
    description:
      "Turns corn into slop and slop into working captives. About one for every thirty captives; too few and they starve, which is slower and worse than a rebellion.",
  }),
  bunkhouse: B({
    id: "bunkhouse",
    name: "Bunkhouse",
    category: "infrastructure",
    w: 2,
    h: 2,
    gold: 0,
    lumber: 2,
    upkeep: 1,
    needsRoad: true,
    serves: { who: "captive", capacity: 5 },
    provides: [{ need: "resting", min: 86, max: 86 }],
    description: "Somewhere for captives to sleep that is not the bare ground.",
  }),
  pirateHousing: B({
    id: "pirateHousing",
    name: "Pirate Housing Plot",
    category: "infrastructure",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 6,
    upkeep: 0,
    needsRoad: true,
    serves: { who: "pirate", capacity: 1 },
    provides: [
      { need: "resting", min: 20, max: 96 },
      { need: "stashing", min: 20, max: 96 },
    ],
    auras: [
      { aura: "anarchy", strength: 3, radius: 1 },
      { aura: "awe", strength: 4, radius: 2 },
    ],
    description:
      "Land for one pirate to build on. He improves it himself as he grows rich — a plot becomes a tent, a tent a hovel, and a mansion by the time he is a Pirate Lord. A captain with nowhere to stash his share is a captain thinking about mutiny.",
  }),
  pirateCave: B({
    id: "pirateCave",
    name: "Pirate Cave",
    category: "infrastructure",
    w: 3,
    h: 3,
    gold: 150,
    lumber: 15,
    upkeep: 5,
    unique: true,
    needsRoad: true,
    description:
      "Where your personal hoard goes. Most campaign missions score the hoard, not the treasury — so build this first and set it to stash the maximum.",
  }),
  piratePalace: B({
    id: "piratePalace",
    name: "Pirate Palace",
    category: "infrastructure",
    w: 9,
    h: 6,
    gold: 0,
    lumber: 40,
    upkeep: 10,
    unique: true,
    needsRoad: true,
    staff: [{ job: "guard", count: 4 }],
    auras: [
      { aura: "order", strength: 69, radius: 3 },
      { aura: "defense", strength: 27, radius: 3 },
    ],
    description:
      "Your seat, and it grows with your hoard. Palace guards are the only pirates who can be sent to assassinate someone.",
  }),
  blackMarket: B({
    id: "blackMarket",
    name: "Black Market",
    category: "infrastructure",
    w: 3,
    h: 3,
    gold: 100,
    lumber: 20,
    upkeep: 5,
    unique: true,
    needsRoad: true,
    staff: [
      { job: "trader", count: 2 },
      { job: "overseer", count: 1 },
    ],
    auras: [{ aura: "fear", strength: 47, radius: 4 }],
    description:
      "Buys ship supplies you have not built yet. Prices climb with every purchase and settle again if you leave it alone, so buy in bulk. Early on it pays for itself in one cruise.",
  }),
  smugglersCove: B({
    id: "smugglersCove",
    name: "Smuggler's Cove",
    category: "infrastructure",
    w: 4,
    h: 3,
    gold: 100,
    lumber: 20,
    upkeep: 5,
    unique: true,
    needsRoad: true,
    site: "coast",
    requires: "trader",
    staff: [
      { job: "trader", count: 2 },
      { job: "hauler", count: 1 },
      { job: "overseer", count: 1 },
    ],
    description:
      "Sells your surplus abroad. It only works once you open it to a nation — and that nation then knows exactly where you live.",
  }),

  // ── Resource ──────────────────────────────────────────────────────────────
  timberCamp: B({
    id: "timberCamp",
    name: "Timber Camp",
    category: "resource",
    w: 4,
    h: 4,
    gold: 0,
    lumber: 0,
    upkeep: 1,
    site: "forest",
    staff: [
      { job: "lumberjack", count: 3 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [], output: "wood", amount: 2, hours: 5 },
    description:
      "Fells the forest around it. When the trees run out, move it closer to the treeline — but let the old one finish hauling first, or the wood in it is lost.",
  }),
  cornFarm: B({
    id: "cornFarm",
    name: "Corn Farm",
    category: "resource",
    w: 3,
    h: 2,
    gold: 0,
    lumber: 3,
    upkeep: 1,
    site: "fertile",
    staff: [
      { job: "farmer", count: 4 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [], output: "corn", amount: 3, hours: 8 },
    description: "Slop for captives, beer for pirates, rations for crews. Plant these first.",
  }),
  sugarcaneFarm: B({
    id: "sugarcaneFarm",
    name: "Sugarcane Farm",
    category: "resource",
    w: 3,
    h: 2,
    gold: 0,
    lumber: 3,
    upkeep: 1,
    site: "fertile",
    staff: [
      { job: "farmer", count: 4 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [], output: "sugarcane", amount: 3, hours: 8 },
    description: "Rum starts here.",
  }),
  tobaccoFarm: B({
    id: "tobaccoFarm",
    name: "Tobacco Farm",
    category: "resource",
    w: 3,
    h: 2,
    gold: 0,
    lumber: 3,
    upkeep: 1,
    site: "fertile",
    staff: [
      { job: "farmer", count: 4 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [], output: "tobacco", amount: 3, hours: 8 },
    description: "Cigars start here.",
  }),
  bananaFarm: B({
    id: "bananaFarm",
    name: "Banana Farm",
    category: "resource",
    w: 3,
    h: 2,
    gold: 0,
    lumber: 3,
    upkeep: 1,
    site: "fertile",
    staff: [
      { job: "farmer", count: 2 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [], output: "bananas", amount: 2, hours: 7 },
    description: "Eaten at a dive, or baked with papaya into pastries.",
  }),
  papayaFarm: B({
    id: "papayaFarm",
    name: "Papaya Farm",
    category: "resource",
    w: 3,
    h: 2,
    gold: 0,
    lumber: 3,
    upkeep: 1,
    site: "fertile",
    staff: [
      { job: "farmer", count: 2 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [], output: "papayas", amount: 2, hours: 7 },
    description: "Eaten at a dive, or baked with banana into pastries.",
  }),
  ironMine: B({
    id: "ironMine",
    name: "Iron Mine",
    category: "resource",
    w: 4,
    h: 3,
    gold: 0,
    lumber: 10,
    upkeep: 2,
    site: "ore",
    staff: [
      { job: "miner", count: 3 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [], output: "ore", amount: 2, hours: 9 },
    description: "Ore, and therefore every cutlass, cannon and musket you will ever own.",
  }),

  // ── Production ────────────────────────────────────────────────────────────
  sawmill: B({
    id: "sawmill",
    name: "Sawmill",
    category: "production",
    w: 6,
    h: 4,
    gold: 0,
    lumber: 20,
    upkeep: 2,
    needsRoad: true,
    staff: [
      { job: "lumberjack", count: 2 },
      { job: "hauler", count: 1 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [{ good: "wood", amount: 2 }], output: "lumber", amount: 1, hours: 4 },
    description:
      "Wood in, lumber out — and lumber is what every building costs. One timber camp will out-produce one sawmill, so a second sawmill is the cheapest way to build faster.",
  }),
  brewery: B({
    id: "brewery",
    name: "Brewery",
    category: "production",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 10,
    upkeep: 2,
    needsRoad: true,
    staff: [
      { job: "cook", count: 2 },
      { job: "hauler", count: 1 },
    ],
    recipe: { inputs: [{ good: "corn", amount: 2 }], output: "beer", amount: 2, hours: 7 },
    description: "Corn into beer. The first drink your island can make for itself.",
  }),
  rumDistillery: B({
    id: "rumDistillery",
    name: "Rum Distillery",
    category: "production",
    w: 6,
    h: 5,
    gold: 0,
    lumber: 25,
    upkeep: 3,
    needsRoad: true,
    requires: "distiller",
    staff: [
      { job: "distiller", count: 2 },
      { job: "hauler", count: 1 },
    ],
    recipe: { inputs: [{ good: "sugarcane", amount: 2 }], output: "rum", amount: 2, hours: 9 },
    description: "Sugarcane into rum. Worth building the moment you have stolen a distiller.",
  }),
  cigarFactory: B({
    id: "cigarFactory",
    name: "Cigar Factory",
    category: "production",
    w: 4,
    h: 3,
    gold: 0,
    lumber: 20,
    upkeep: 3,
    needsRoad: true,
    requires: "tobacconist",
    staff: [
      { job: "tobacconist", count: 2 },
      { job: "hauler", count: 1 },
    ],
    recipe: { inputs: [{ good: "tobacco", amount: 2 }], output: "cigars", amount: 2, hours: 9 },
    description: "Tobacco into cigars, which raise the takings at every table on the island.",
  }),
  bakery: B({
    id: "bakery",
    name: "Bakery",
    category: "production",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 20,
    upkeep: 3,
    needsRoad: true,
    requires: "cook",
    staff: [
      { job: "cook", count: 2 },
      { job: "hauler", count: 1 },
    ],
    recipe: {
      inputs: [
        { good: "bananas", amount: 1 },
        { good: "papayas", amount: 1 },
      ],
      output: "pastries",
      amount: 2,
      hours: 8,
    },
    description: "Fruit into pastries, which turn a pirate's meal into a feast.",
  }),
  blastFurnace: B({
    id: "blastFurnace",
    name: "Blast Furnace",
    category: "production",
    w: 5,
    h: 4,
    gold: 0,
    lumber: 20,
    upkeep: 4,
    needsRoad: true,
    staff: [
      { job: "blacksmith", count: 3 },
      { job: "hauler", count: 1 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [{ good: "ore", amount: 2 }], output: "pigIron", amount: 1, hours: 8 },
    auras: [{ aura: "defense", strength: 39, radius: 2 }],
    description: "Ore into pig iron. Everything armed on this island passes through here.",
  }),
  blacksmithy: B({
    id: "blacksmithy",
    name: "Blacksmithy",
    category: "production",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 15,
    upkeep: 3,
    needsRoad: true,
    staff: [
      { job: "blacksmith", count: 2 },
      { job: "hauler", count: 1 },
    ],
    recipe: { inputs: [{ good: "pigIron", amount: 1 }], output: "cutlasses", amount: 2, hours: 7 },
    auras: [{ aura: "defense", strength: 39, radius: 2 }],
    description: "Cutlasses. No cutlasses, no boarding — and boarding is where the cargo is.",
  }),
  cannonFoundry: B({
    id: "cannonFoundry",
    name: "Cannon Foundry",
    category: "production",
    w: 6,
    h: 5,
    gold: 0,
    lumber: 25,
    upkeep: 5,
    needsRoad: true,
    requires: "engineer",
    staff: [
      { job: "engineer", count: 2 },
      { job: "hauler", count: 1 },
    ],
    recipe: {
      inputs: [
        { good: "pigIron", amount: 2 },
        { good: "wood", amount: 1 },
      ],
      output: "cannon",
      amount: 1,
      hours: 14,
    },
    auras: [{ aura: "defense", strength: 39, radius: 2 }],
    description: "Cannon, for pounding a ship until she strikes her colours.",
  }),
  gunsmithy: B({
    id: "gunsmithy",
    name: "Gunsmithy",
    category: "production",
    w: 4,
    h: 4,
    gold: 0,
    lumber: 20,
    upkeep: 4,
    needsRoad: true,
    requires: "gunsmith",
    staff: [
      { job: "gunsmith", count: 2 },
      { job: "hauler", count: 1 },
    ],
    recipe: { inputs: [{ good: "pigIron", amount: 1 }], output: "muskets", amount: 1, hours: 9 },
    auras: [{ aura: "defense", strength: 39, radius: 2 }],
    description: "Muskets, for harassing a deck and for winning the boarding that follows.",
  }),

  // ── Entertainment ─────────────────────────────────────────────────────────
  smugglersDive: B({
    id: "smugglersDive",
    name: "Smuggler's Dive",
    category: "entertainment",
    w: 3,
    h: 2,
    gold: 0,
    lumber: 8,
    upkeep: 2,
    needsRoad: true,
    fee: 2,
    staff: [
      { job: "server", count: 2 },
      { job: "cook", count: 1 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "pirate", capacity: 6 },
    provides: [
      { need: "drinking", min: 12, max: 46, boostedBy: ["beer"] },
      { need: "feasting", min: 12, max: 46, boostedBy: ["bananas", "papayas"] },
    ],
    auras: [{ aura: "anarchy", strength: 23, radius: 2 }],
    description: "The bottom of the market: something to eat, something to drink, no questions.",
  }),
  cheapEatery: B({
    id: "cheapEatery",
    name: "Cheap Eatery",
    category: "entertainment",
    w: 3,
    h: 2,
    gold: 0,
    lumber: 10,
    upkeep: 3,
    needsRoad: true,
    fee: 4,
    staff: [
      { job: "server", count: 2 },
      { job: "cook", count: 1 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "pirate", capacity: 6 },
    provides: [
      { need: "drinking", min: 24, max: 62, boostedBy: ["beer"] },
      { need: "feasting", min: 24, max: 66, boostedBy: ["pastries"] },
    ],
    auras: [{ aura: "anarchy", strength: 34, radius: 3 }],
    description: "A step up from a dive, and pastries make it two.",
  }),
  tavern: B({
    id: "tavern",
    name: "Tavern",
    category: "entertainment",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 12,
    upkeep: 3,
    needsRoad: true,
    fee: 5,
    staff: [
      { job: "server", count: 3 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "pirate", capacity: 8 },
    provides: [{ need: "drinking", min: 31, max: 94, boostedBy: ["rum", "beer"] }],
    auras: [{ aura: "anarchy", strength: 34, radius: 3 }],
    description:
      "Drink, and nothing else. Stock it with rum and it is the best thing on the island; stock it with nothing and the hauler is your problem, not the tavern.",
  }),
  inn: B({
    id: "inn",
    name: "Inn",
    category: "entertainment",
    w: 5,
    h: 4,
    gold: 350,
    lumber: 35,
    upkeep: 8,
    needsRoad: true,
    fee: 12,
    requires: "server",
    staff: [
      { job: "server", count: 3 },
      { job: "cook", count: 1 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "pirate", capacity: 12 },
    provides: [
      { need: "drinking", min: 40, max: 98, boostedBy: ["rum"] },
      { need: "feasting", min: 40, max: 98, boostedBy: ["pastries"] },
      { need: "resting", min: 30, max: 60 },
    ],
    auras: [{ aura: "anarchy", strength: 46, radius: 4 }],
    description:
      "The high end: drink, dinner and a bed for twelve. Wealthy captives will pay through the nose for the bed, which is the point.",
  }),
  animalPit: B({
    id: "animalPit",
    name: "Animal Pit",
    category: "entertainment",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 10,
    upkeep: 2,
    needsRoad: true,
    fee: 3,
    staff: [{ job: "server", count: 1 }],
    serves: { who: "pirate", capacity: 6 },
    provides: [{ need: "gambling", min: 14, max: 44 }],
    auras: [{ aura: "anarchy", strength: 23, radius: 2 }],
    description: "Two animals, a ring of shouting men, and a great deal of money changing hands.",
  }),
  gamblingDen: B({
    id: "gamblingDen",
    name: "Gambling Den",
    category: "entertainment",
    w: 4,
    h: 3,
    gold: 0,
    lumber: 15,
    upkeep: 4,
    needsRoad: true,
    fee: 6,
    staff: [
      { job: "server", count: 1 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "pirate", capacity: 5 },
    provides: [
      { need: "gambling", min: 28, max: 70, boostedBy: ["cigars"] },
      { need: "drinking", min: 20, max: 52, boostedBy: ["beer"] },
    ],
    auras: [{ aura: "anarchy", strength: 34, radius: 3 }],
    description: "Cards and dice, with a drink at the elbow.",
  }),
  casino: B({
    id: "casino",
    name: "Casino",
    category: "entertainment",
    w: 5,
    h: 4,
    gold: 300,
    lumber: 30,
    upkeep: 9,
    needsRoad: true,
    fee: 14,
    staff: [
      { job: "server", count: 2 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "pirate", capacity: 8 },
    provides: [
      { need: "gambling", min: 38, max: 96, boostedBy: ["cigars"] },
      { need: "drinking", min: 24, max: 59, boostedBy: ["rum"] },
    ],
    auras: [{ aura: "anarchy", strength: 46, radius: 4 }],
    description:
      "Where the ranking pirates lose their share back to you. The house edge is an edict away.",
  }),
  wenchMasseuse: B({
    id: "wenchMasseuse",
    name: "Wench & Masseuse",
    category: "entertainment",
    w: 2,
    h: 2,
    gold: 0,
    lumber: 2,
    upkeep: 1,
    needsRoad: true,
    fee: 3,
    staff: [{ job: "wench", count: 1 }],
    serves: { who: "pirate", capacity: 1 },
    provides: [{ need: "companionship", min: 16, max: 48 }],
    auras: [{ aura: "anarchy", strength: 23, radius: 2 }],
    description:
      "Serves exactly one pirate at a time, so you need about four of these for every dive.",
  }),
  brothelSalon: B({
    id: "brothelSalon",
    name: "Brothel & Salon",
    category: "entertainment",
    w: 6,
    h: 4,
    gold: 0,
    lumber: 30,
    upkeep: 6,
    needsRoad: true,
    fee: 8,
    requires: "wench",
    staff: [
      { job: "wench", count: 5 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "pirate", capacity: 5 },
    provides: [{ need: "companionship", min: 30, max: 74, boostedBy: ["cigars"] }],
    auras: [{ aura: "anarchy", strength: 34, radius: 3 }],
    description: "Five at a time, and cheaper to run than five masseuses.",
  }),
  courtesanSpa: B({
    id: "courtesanSpa",
    name: "Courtesan & Spa",
    category: "entertainment",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 8,
    upkeep: 5,
    needsRoad: true,
    fee: 18,
    requires: "courtesan",
    staff: [
      { job: "courtesan", count: 1 },
      { job: "hauler", count: 1 },
    ],
    serves: { who: "pirate", capacity: 1 },
    provides: [{ need: "companionship", min: 55, max: 99, boostedBy: ["cigars"] }],
    auras: [{ aura: "anarchy", strength: 34, radius: 3 }],
    description: "One pirate, one courtesan, and a bill to match.",
  }),

  // ── Nautical ──────────────────────────────────────────────────────────────
  dock: B({
    id: "dock",
    name: "Dock",
    category: "nautical",
    w: 5,
    h: 4,
    gold: 0,
    lumber: 5,
    upkeep: 1,
    needsRoad: true,
    site: "coast",
    staff: [
      { job: "hauler", count: 2 },
      { job: "overseer", count: 1 },
    ],
    auras: [{ aura: "defense", strength: 35, radius: 2 }],
    description:
      "One berth per ship. Haulers bring rations, cutlasses, cannon and muskets here to be loaded.",
  }),
  boatyard: B({
    id: "boatyard",
    name: "Boatyard",
    category: "nautical",
    w: 5,
    h: 5,
    gold: 0,
    lumber: 10,
    upkeep: 3,
    unique: true,
    needsRoad: true,
    site: "coast",
    requires: "shipwright",
    staff: [{ job: "shipwright", count: 2 }],
    auras: [{ aura: "defense", strength: 39, radius: 2 }],
    description: "Builds the small hulls: snows, schooners, sloops and brigantines.",
  }),
  shipyard: B({
    id: "shipyard",
    name: "Shipyard",
    category: "nautical",
    w: 9,
    h: 6,
    gold: 8000,
    lumber: 30,
    upkeep: 12,
    unique: true,
    needsRoad: true,
    site: "coast",
    requires: "shipwright",
    staff: [{ job: "shipwright", count: 3 }],
    auras: [{ aura: "defense", strength: 39, radius: 2 }],
    description:
      "Builds anything that floats, up to a galleon. It costs a fortune and is worth it.",
  }),
  seaRationFactory: B({
    id: "seaRationFactory",
    name: "Sea Ration Factory",
    category: "nautical",
    w: 4,
    h: 4,
    gold: 0,
    lumber: 10,
    upkeep: 2,
    needsRoad: true,
    staff: [
      { job: "cook", count: 2 },
      { job: "hauler", count: 1 },
      { job: "overseer", count: 1 },
    ],
    recipe: { inputs: [{ good: "corn", amount: 2 }], output: "seaRations", amount: 3, hours: 6 },
    description: "Corn into sea rations. Rations are how long your ships can stay out.",
  }),

  // ── Captive control ───────────────────────────────────────────────────────
  church: B({
    id: "church",
    name: "Church",
    category: "captiveControl",
    w: 6,
    h: 3,
    gold: 0,
    lumber: 18,
    upkeep: 2,
    needsRoad: true,
    requires: "priest",
    staff: [{ job: "priest", count: 3 }],
    serves: { who: "captive", capacity: 9 },
    provides: [{ need: "religion", min: 40, max: 59 }],
    description:
      "Captives start asking for one about two years in. Cheaper than a stockade and it works on the same problem.",
  }),
  stockade: B({
    id: "stockade",
    name: "Stockade",
    category: "captiveControl",
    w: 5,
    h: 5,
    gold: 500,
    lumber: 30,
    upkeep: 1,
    needsRoad: true,
    serves: { who: "captive", capacity: 15 },
    provides: [{ need: "resting", min: 59, max: 59 }],
    auras: [
      { aura: "order", strength: 59, radius: 2 },
      { aura: "fear", strength: 69, radius: 5 },
    ],
    description:
      "Holds captives with no job to go to, and radiates enough order and fear to hold the ones who do. Every island starts with one.",
  }),
  gallows: B({
    id: "gallows",
    name: "Gallows",
    category: "captiveControl",
    w: 4,
    h: 3,
    gold: 0,
    lumber: 20,
    upkeep: 1,
    unique: true,
    auras: [{ aura: "fear", strength: 47, radius: 4 }],
    description: "It does not need to be used to do its work.",
  }),
  interrogationChamber: B({
    id: "interrogationChamber",
    name: "Interrogation Chamber",
    category: "captiveControl",
    w: 5,
    h: 4,
    gold: 250,
    lumber: 25,
    upkeep: 4,
    unique: true,
    needsRoad: true,
    staff: [{ job: "overseer", count: 1 }],
    auras: [{ aura: "fear", strength: 86, radius: 4 }],
    description: "The strongest fear on the island by a wide margin.",
  }),
  apothecary: B({
    id: "apothecary",
    name: "Apothecary",
    category: "captiveControl",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 12,
    upkeep: 3,
    unique: true,
    needsRoad: true,
    requires: "surgeon",
    staff: [{ job: "surgeon", count: 2 }],
    auras: [{ aura: "order", strength: 47, radius: 4 }],
    description: "Keeps working captives on their feet, and steadies the district around it.",
  }),
  hotel: B({
    id: "hotel",
    name: "Hotel",
    category: "captiveControl",
    w: 6,
    h: 6,
    gold: 500,
    lumber: 50,
    upkeep: 10,
    needsRoad: true,
    fee: 25,
    serves: { who: "captive", capacity: 8 },
    provides: [{ need: "resting", min: 98, max: 98 }],
    auras: [{ aura: "order", strength: 31, radius: 2 }],
    description:
      "For wealthy captives, who pay handsomely and whose ransom climbs the longer they enjoy themselves.",
  }),
  orderlyShrubs: B({
    id: "orderlyShrubs",
    name: "Orderly Shrubs",
    category: "captiveControl",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 5,
    upkeep: 0,
    auras: [{ aura: "order", strength: 12, radius: 2 }],
    description: "A neatly clipped hedge. Captives find it reassuring.",
  }),
  veryOrderlyDecor: B({
    id: "veryOrderlyDecor",
    name: "Very Orderly Decor",
    category: "captiveControl",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 10,
    upkeep: 0,
    auras: [{ aura: "order", strength: 24, radius: 3 }],
    description: "Straight lines, right angles, no surprises.",
  }),
  scaryDecor: B({
    id: "scaryDecor",
    name: "Scary Decor",
    category: "captiveControl",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 5,
    upkeep: 0,
    auras: [{ aura: "fear", strength: 12, radius: 2 }],
    description:
      "A skull on a pole. Cheap, and pirates cannot see it — so it fits anywhere a captive works.",
  }),
  veryScaryDecor: B({
    id: "veryScaryDecor",
    name: "Very Scary Decor",
    category: "captiveControl",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 10,
    upkeep: 0,
    auras: [{ aura: "fear", strength: 24, radius: 3 }],
    description: "More skulls, and a worse arrangement of them.",
  }),

  // ── Education ─────────────────────────────────────────────────────────────
  gunnerySchool: B({
    id: "gunnerySchool",
    name: "Gunnery School",
    category: "education",
    w: 6,
    h: 3,
    gold: 600,
    lumber: 40,
    upkeep: 6,
    unique: true,
    needsRoad: true,
    auras: [{ aura: "defense", strength: 35, radius: 3 }],
    description: "Teaches a pirate the great guns, without the usual tuition of being shot at.",
  }),
  marksmanshipSchool: B({
    id: "marksmanshipSchool",
    name: "Marksmanship School",
    category: "education",
    w: 5,
    h: 3,
    gold: 600,
    lumber: 40,
    upkeep: 6,
    unique: true,
    needsRoad: true,
    auras: [{ aura: "defense", strength: 35, radius: 3 }],
    description: "Musketry, for a boarding party and for trouble ashore.",
  }),
  navigationSchool: B({
    id: "navigationSchool",
    name: "Navigation School",
    category: "education",
    w: 5,
    h: 4,
    gold: 600,
    lumber: 40,
    upkeep: 6,
    unique: true,
    needsRoad: true,
    auras: [{ aura: "defense", strength: 35, radius: 3 }],
    description: "A navigator brings the ship home sooner, which is a cruise you did not pay for.",
  }),
  seamanshipSchool: B({
    id: "seamanshipSchool",
    name: "Seamanship School",
    category: "education",
    w: 4,
    h: 4,
    gold: 600,
    lumber: 40,
    upkeep: 6,
    unique: true,
    needsRoad: true,
    auras: [{ aura: "defense", strength: 35, radius: 3 }],
    description: "Speed under sail: catching the runner, escaping the frigate.",
  }),
  swordsmanshipSchool: B({
    id: "swordsmanshipSchool",
    name: "Swordsmanship School",
    category: "education",
    w: 5,
    h: 4,
    gold: 600,
    lumber: 40,
    upkeep: 6,
    unique: true,
    needsRoad: true,
    auras: [{ aura: "defense", strength: 35, radius: 3 }],
    description: "The cutlass, which is what actually takes a ship.",
  }),

  // ── Defense ───────────────────────────────────────────────────────────────
  watchTower: B({
    id: "watchTower",
    name: "Watch Tower",
    category: "defense",
    w: 2,
    h: 2,
    gold: 0,
    lumber: 8,
    upkeep: 1,
    needsRoad: true,
    staff: [{ job: "guard", count: 2 }],
    auras: [
      { aura: "defense", strength: 47, radius: 2 },
      { aura: "fear", strength: 47, radius: 2 },
    ],
    description:
      "Defense for the pirates and fear for the captives out of one small building — the best value on the island, if you can spare the guards.",
  }),
  protectiveCannon: B({
    id: "protectiveCannon",
    name: "Protective Cannon",
    category: "defense",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 10,
    upkeep: 0,
    auras: [{ aura: "defense", strength: 24, radius: 3 }],
    description: "A gun pointed out to sea. It shortens an invasion and settles the neighbours.",
  }),
  safeHarborAnchor: B({
    id: "safeHarborAnchor",
    name: "Safe Harbor Anchor",
    category: "defense",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 5,
    upkeep: 0,
    auras: [{ aura: "defense", strength: 12, radius: 2 }],
    description: "An anchor set in the ground. Pirates find it comforting; nobody knows why.",
  }),
  anarchyShrubs: B({
    id: "anarchyShrubs",
    name: "Anarchy Shrubs",
    category: "defense",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 5,
    upkeep: 0,
    auras: [{ aura: "anarchy", strength: 11, radius: 2 }],
    description: "Deliberately unkempt. Keep it away from anywhere captives work.",
  }),
  anarchyDecor: B({
    id: "anarchyDecor",
    name: "Anarchy Decor",
    category: "defense",
    w: 1,
    h: 1,
    gold: 0,
    lumber: 10,
    upkeep: 0,
    auras: [{ aura: "anarchy", strength: 23, radius: 3 }],
    description: "The cheapest way to make a pirate quarter feel like one.",
  }),
  fort: B({
    id: "fort",
    name: "Fort",
    category: "defense",
    w: 9,
    h: 6,
    gold: 1000,
    lumber: 60,
    upkeep: 15,
    needsRoad: true,
    site: "coast",
    staff: [{ job: "guard", count: 4 }],
    auras: [
      { aura: "defense", strength: 59, radius: 4 },
      { aura: "fear", strength: 47, radius: 4 },
      { aura: "awe", strength: 47, radius: 4 },
    ],
    description:
      "Real protection against invasion, and the one building that lets you raise the Jolly Roger and cut every tie at once.",
  }),
  observatory: B({
    id: "observatory",
    name: "Observatory",
    category: "defense",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 20,
    upkeep: 3,
    unique: true,
    needsRoad: true,
    auras: [{ aura: "defense", strength: 59, radius: 4 }],
    description: "Warning of what is coming over the horizon, and a calmer harbour for it.",
  }),
  surgery: B({
    id: "surgery",
    name: "Surgery",
    category: "defense",
    w: 3,
    h: 3,
    gold: 0,
    lumber: 12,
    upkeep: 4,
    unique: true,
    needsRoad: true,
    requires: "surgeon",
    staff: [{ job: "surgeon", count: 2 }],
    auras: [{ aura: "anarchy", strength: 46, radius: 4 }],
    description: "Patches up wounded pirates. They are noisy about it, hence the anarchy.",
  }),

  // ── Accoutrement ──────────────────────────────────────────────────────────
  carpenterShop: B({
    id: "carpenterShop",
    name: "Carpenter",
    category: "accoutrement",
    w: 4,
    h: 2,
    gold: 100,
    lumber: 20,
    upkeep: 3,
    unique: true,
    needsRoad: true,
    requires: "carpenter",
    staff: [{ job: "carpenter", count: 2 }],
    recipe: { inputs: [{ good: "lumber", amount: 1 }], output: "pegLegs", amount: 1, hours: 20 },
    auras: [{ aura: "fear", strength: 59, radius: 4 }],
    description: "Peg legs, which raise a pirate's notoriety. Site it where captives can see it.",
  }),
  hatShop: B({
    id: "hatShop",
    name: "Hat Shop",
    category: "accoutrement",
    w: 3,
    h: 3,
    gold: 100,
    lumber: 20,
    upkeep: 3,
    unique: true,
    needsRoad: true,
    requires: "hatter",
    staff: [{ job: "hatter", count: 2 }],
    recipe: { inputs: [], output: "hats", amount: 1, hours: 24 },
    auras: [{ aura: "order", strength: 59, radius: 4 }],
    description:
      "Hats, which raise leadership. It needs no haulers and radiates order, so it belongs in a captive district.",
  }),
  parrotAviary: B({
    id: "parrotAviary",
    name: "Parrot Aviary",
    category: "accoutrement",
    w: 3,
    h: 2,
    gold: 100,
    lumber: 20,
    upkeep: 3,
    unique: true,
    needsRoad: true,
    requires: "birdHandler",
    staff: [{ job: "birdHandler", count: 2 }],
    recipe: { inputs: [], output: "parrots", amount: 1, hours: 26 },
    auras: [
      { aura: "fear", strength: 59, radius: 4 },
      { aura: "awe", strength: 59, radius: 4 },
    ],
    description:
      "Parrots, which raise courage. The only building that gives off both fear and awe.",
  }),
  graveyard: B({
    id: "graveyard",
    name: "Graveyard",
    category: "accoutrement",
    w: 3,
    h: 2,
    gold: 0,
    lumber: 20,
    upkeep: 1,
    unique: true,
    auras: [{ aura: "fear", strength: 47, radius: 4 }],
    description:
      "Where your dead pirates are buried, and — for a fee that rises each time — where they can be persuaded to get up again and haul crates.",
  }),
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export function buildingDef(id: BuildingId): BuildingDef {
  return BUILDINGS[id];
}

export function buildingsInCategory(category: BuildingCategory): BuildingDef[] {
  return BUILDING_IDS.map((id) => BUILDINGS[id]).filter((def) => def.category === category);
}

/**
 * Pirate housing improves itself as its occupant grows rich. Index 0 is rank 1,
 * a bare plot; index 8 is rank 9, a mansion.
 */
export interface HousingLevel {
  readonly name: string;
  readonly anarchy: number;
  readonly anarchyRadius: number;
  readonly awe: number;
  readonly aweRadius: number;
  readonly resting: number;
  readonly stashing: number;
  /** Gold the pirate spends improving it, taken from his own earnings. */
  readonly upgradeCost: number;
}

export const HOUSING_LEVELS: readonly HousingLevel[] = [
  {
    name: "Housing Plot",
    anarchy: 0,
    anarchyRadius: 1,
    awe: 4,
    aweRadius: 2,
    resting: 20,
    stashing: 20,
    upgradeCost: 0,
  },
  {
    name: "Tent",
    anarchy: 3,
    anarchyRadius: 1,
    awe: 16,
    aweRadius: 2,
    resting: 32,
    stashing: 30,
    upgradeCost: 20,
  },
  {
    name: "Hovel",
    anarchy: 7,
    anarchyRadius: 1,
    awe: 24,
    aweRadius: 3,
    resting: 44,
    stashing: 42,
    upgradeCost: 45,
  },
  {
    name: "Shack",
    anarchy: 11,
    anarchyRadius: 1,
    awe: 29,
    aweRadius: 3,
    resting: 54,
    stashing: 52,
    upgradeCost: 80,
  },
  {
    name: "Adobe",
    anarchy: 15,
    anarchyRadius: 1,
    awe: 35,
    aweRadius: 3,
    resting: 64,
    stashing: 62,
    upgradeCost: 130,
  },
  {
    name: "Dwelling",
    anarchy: 19,
    anarchyRadius: 1,
    awe: 41,
    aweRadius: 3,
    resting: 72,
    stashing: 71,
    upgradeCost: 190,
  },
  {
    name: "House",
    anarchy: 23,
    anarchyRadius: 1,
    awe: 47,
    aweRadius: 4,
    resting: 80,
    stashing: 80,
    upgradeCost: 260,
  },
  {
    name: "Estate",
    anarchy: 26,
    anarchyRadius: 1,
    awe: 53,
    aweRadius: 4,
    resting: 88,
    stashing: 88,
    upgradeCost: 350,
  },
  {
    name: "Mansion",
    anarchy: 38,
    anarchyRadius: 1,
    awe: 59,
    aweRadius: 4,
    resting: 96,
    stashing: 96,
    upgradeCost: 480,
  },
];

export interface PalaceLevel {
  readonly name: string;
  readonly hoard: number;
  readonly order: number;
  readonly defense: number;
}

/**
 * The palace grows with the hoard. Order and defense are the original's exact
 * figures; the hoard thresholds are not published anywhere and are chosen so the
 * four levels span a campaign.
 *
 * It emits no awe. Only the fort, the parrot aviary and pirate housing do — a
 * detail worth keeping, because it means the way to impress your captives is to
 * let your pirates get rich.
 */
export const PALACE_LEVELS: readonly PalaceLevel[] = [
  { name: "Pirate Palace", hoard: 0, order: 69, defense: 27 },
  { name: "Grand Palace", hoard: 2500, order: 73, defense: 39 },
  { name: "Royal Palace", hoard: 7500, order: 76, defense: 51 },
  { name: "Palace of the Pirate King", hoard: 15000, order: 80, defense: 63 },
];

/** Lifetime earnings needed for each pirate rank, and what the rank is called. */
export const RANKS: readonly { readonly earnings: number; readonly title: string }[] = [
  { earnings: 0, title: "Scurvy Dog" },
  { earnings: 75, title: "Pirate Lad" },
  { earnings: 200, title: "Rogue" },
  { earnings: 350, title: "Buccaneer" },
  { earnings: 550, title: "Pirate" },
  { earnings: 800, title: "Senior Pirate" },
  { earnings: 1100, title: "Pirate Champion" },
  { earnings: 1500, title: "Pirate Master" },
  { earnings: 2000, title: "Pirate Lord" },
];

/** Rank index 0-8 for a given lifetime earnings figure. */
export function rankForEarnings(earnings: number): number {
  let rank = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (earnings >= (RANKS[i]?.earnings ?? 0)) rank = i;
  }
  return rank;
}
