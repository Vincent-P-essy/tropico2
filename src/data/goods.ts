/**
 * The commodities of the island.
 *
 * Sale prices are the Smuggler's Cove's own: cannon a hundred, muskets
 * twenty-five, cutlasses twenty, rum and cigars fifteen, pastries ten, beer
 * five. It deals in those seven and nothing else — you cannot sell a cove full
 * of corn, which is why the weapons chain is the island's export trade.
 *
 * Two of these are special. **Lumber** is the build currency — nearly every
 * structure costs lumber rather than gold, so the timber chain is the spine of
 * the whole economy. **Slop** is the only thing captives eat, which is why a
 * corn shortage becomes a rebellion two months later.
 */

export type GoodId =
  | "wood"
  | "lumber"
  | "corn"
  | "slop"
  | "sugarcane"
  | "tobacco"
  | "bananas"
  | "papayas"
  | "ore"
  | "pigIron"
  | "beer"
  | "rum"
  | "cigars"
  | "pastries"
  | "seaRations"
  | "cutlasses"
  | "cannon"
  | "muskets"
  | "pegLegs"
  | "hats"
  | "parrots";

export type GoodClass = "raw" | "material" | "consumable" | "armament" | "accoutrement";

export interface GoodDef {
  readonly id: GoodId;
  readonly name: string;
  readonly kind: GoodClass;
  /** Base price at the Smuggler's Cove, in gold per unit. Zero means unsellable. */
  readonly salePrice: number;
  /** Base price at the Black Market, in gold per unit. Zero means unbuyable. */
  readonly buyPrice: number;
  readonly description: string;
}

export const GOODS: Readonly<Record<GoodId, GoodDef>> = {
  wood: {
    id: "wood",
    name: "Wood",
    kind: "raw",
    salePrice: 0,
    buyPrice: 0,
    description: "Felled timber. Useless until a sawmill cuts it into lumber.",
  },
  lumber: {
    id: "lumber",
    name: "Lumber",
    kind: "material",
    salePrice: 0,
    buyPrice: 0,
    description: "The building currency. Everything you raise is paid for in lumber.",
  },
  corn: {
    id: "corn",
    name: "Corn",
    kind: "raw",
    salePrice: 0,
    buyPrice: 0,
    description: "Feeds captives as slop, pirates as beer, and crews as sea rations.",
  },
  slop: {
    id: "slop",
    name: "Slop",
    kind: "consumable",
    salePrice: 0,
    buyPrice: 0,
    description: "What captives eat. Nobody has ever asked for seconds.",
  },
  sugarcane: {
    id: "sugarcane",
    name: "Sugarcane",
    kind: "raw",
    salePrice: 0,
    buyPrice: 0,
    description: "Distilled into rum, the best drink on the island.",
  },
  tobacco: {
    id: "tobacco",
    name: "Tobacco",
    kind: "raw",
    salePrice: 0,
    buyPrice: 0,
    description: "Rolled into cigars, which make gambling and company sweeter.",
  },
  bananas: {
    id: "bananas",
    name: "Bananas",
    kind: "raw",
    salePrice: 0,
    buyPrice: 0,
    description: "Eaten fresh at a dive, or baked into pastries.",
  },
  papayas: {
    id: "papayas",
    name: "Papayas",
    kind: "raw",
    salePrice: 0,
    buyPrice: 0,
    description: "Eaten fresh at a dive, or baked into pastries.",
  },
  ore: {
    id: "ore",
    name: "Iron Ore",
    kind: "raw",
    salePrice: 0,
    buyPrice: 0,
    description: "Dug from the hills. The beginning of every weapon you own.",
  },
  pigIron: {
    id: "pigIron",
    name: "Pig Iron",
    kind: "material",
    salePrice: 0,
    buyPrice: 0,
    description: "Smelted ore, worked into cutlasses, cannon and muskets.",
  },
  beer: {
    id: "beer",
    name: "Beer",
    kind: "consumable",
    salePrice: 5,
    buyPrice: 0,
    description: "Cheap drink. Better than no drink, which is what starts brawls.",
  },
  rum: {
    id: "rum",
    name: "Rum",
    kind: "consumable",
    salePrice: 15,
    buyPrice: 0,
    description: "The good stuff. Worth more to a pirate than the gold it costs.",
  },
  cigars: {
    id: "cigars",
    name: "Cigars",
    kind: "consumable",
    salePrice: 15,
    buyPrice: 0,
    description: "Raises the takings at the tables and the mood at the salon.",
  },
  pastries: {
    id: "pastries",
    name: "Pastries",
    kind: "consumable",
    salePrice: 10,
    buyPrice: 0,
    description: "Turns a meal into a feast at an eatery or an inn.",
  },
  seaRations: {
    id: "seaRations",
    name: "Sea Rations",
    kind: "consumable",
    salePrice: 0,
    buyPrice: 8,
    description: "How long a ship can stay out. Run out at sea and the crew starves.",
  },
  cutlasses: {
    id: "cutlasses",
    name: "Cutlasses",
    kind: "armament",
    salePrice: 20,
    buyPrice: 50,
    description: "Required to board an enemy ship and take her cargo intact.",
  },
  cannon: {
    id: "cannon",
    name: "Cannon",
    kind: "armament",
    salePrice: 100,
    buyPrice: 200,
    description: "Required to pound a ship into surrender from a distance.",
  },
  muskets: {
    id: "muskets",
    name: "Muskets",
    kind: "armament",
    salePrice: 25,
    buyPrice: 75,
    description: "Required to harass a ship's deck, and useful in a boarding.",
  },
  pegLegs: {
    id: "pegLegs",
    name: "Peg Legs",
    kind: "accoutrement",
    salePrice: 0,
    buyPrice: 0,
    description: "A carpenter's finest work. Fitted to a pirate, it raises notoriety.",
  },
  hats: {
    id: "hats",
    name: "Hats",
    kind: "accoutrement",
    salePrice: 0,
    buyPrice: 0,
    description: "A fine hat raises a pirate's leadership. Men follow a good hat.",
  },
  parrots: {
    id: "parrots",
    name: "Parrots",
    kind: "accoutrement",
    salePrice: 0,
    buyPrice: 0,
    description: "A bird on the shoulder raises a pirate's courage.",
  },
};

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];

/** Goods a ship loads before a cruise. */
export const CARGO_GOODS: readonly GoodId[] = ["seaRations", "cutlasses", "cannon", "muskets"];

/** Goods the Black Market will sell you, at a price that rises with each purchase. */
export const BLACK_MARKET_GOODS: readonly GoodId[] = CARGO_GOODS;

export function goodDef(id: GoodId): GoodDef {
  return GOODS[id];
}
