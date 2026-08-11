import type { BuildingId } from "./buildings.ts";

/**
 * Edicts: the levers the Pirate King pulls directly.
 *
 * Five categories, as in the original. Some act on one named person, some on
 * one ship, some on a nation; the standing ones stay in force until cancelled
 * and quietly reshape the island while they do.
 */

export type EdictCategory =
  "individual" | "piratePolicy" | "cruiseOrders" | "captivePolicy" | "diplomacy";

export const EDICT_CATEGORY_NAMES: Readonly<Record<EdictCategory, string>> = {
  individual: "Individual Attention",
  piratePolicy: "Pirate Policy",
  cruiseOrders: "Cruise Orders",
  captivePolicy: "Captive Policy",
  diplomacy: "International Diplomacy",
};

/** What the player must pick before the edict can be issued. */
export type EdictTarget = "none" | "pirate" | "captive" | "ship" | "nation" | "craftsman";

export interface EdictRequirement {
  readonly building?: BuildingId;
  /** Needs at least one ship in port. */
  readonly ship?: boolean;
  /** Needs a guard stationed at the palace. */
  readonly palaceGuard?: boolean;
  /** Needs relations with the target nation at or above this. */
  readonly relations?: number;
}

export interface EdictDef {
  readonly id: EdictId;
  readonly name: string;
  readonly category: EdictCategory;
  readonly gold: number;
  readonly target: EdictTarget;
  /** Standing edicts stay in force until cancelled. */
  readonly standing?: boolean;
  readonly requires?: EdictRequirement;
  readonly description: string;
}

export type EdictId =
  | "explore"
  | "raidSettlement"
  | "kidnapCraftsman"
  | "freeCaptive"
  | "educatePirate"
  | "pressGang"
  | "ransomCaptive"
  | "donateMoney"
  | "assassinate"
  | "outfitPirate"
  | "freeBeer"
  | "freeRum"
  | "pirateFestival"
  | "rigGamblingAgainst"
  | "rigGamblingInFavor"
  | "pirateCurfew"
  | "looseLips"
  | "betrayPirates"
  | "donateToCrew"
  | "prohibitVictims"
  | "walkThePlank"
  | "fosterWar"
  | "recruitCaptain"
  | "payForInformants"
  | "freeAllOfNationality"
  | "randomExecutions"
  | "guardPatrols"
  | "raiseDead"
  | "raiseJollyRoger"
  | "announcePeace"
  | "openSmugglersCove"
  | "lettersOfMarque"
  | "declarePatron";

const E = (def: EdictDef): EdictDef => def;

export const EDICTS: Readonly<Record<EdictId, EdictDef>> = {
  // ── Individual attention ──────────────────────────────────────────────────
  explore: E({
    id: "explore",
    name: "Explore",
    category: "individual",
    gold: 0,
    target: "ship",
    requires: { ship: true },
    description:
      "Send a ship to chart a region. No plunder, no risk — but it finds the trade routes and settlements that make later cruises pay.",
  }),
  raidSettlement: E({
    id: "raidSettlement",
    name: "Raid Settlement",
    category: "individual",
    gold: 0,
    target: "ship",
    requires: { ship: true },
    description:
      "Take unskilled captives from a settlement. The ship is never lost, though some crew may be. You will do this often: a growing haven eats labour.",
  }),
  kidnapCraftsman: E({
    id: "kidnapCraftsman",
    name: "Kidnap Craftsman",
    category: "individual",
    gold: 250,
    target: "craftsman",
    requires: { ship: true },
    description:
      "Take one named craftsman, at no risk. Often the only way to unlock the building you actually need.",
  }),
  freeCaptive: E({
    id: "freeCaptive",
    name: "Free Captive",
    category: "individual",
    gold: 0,
    target: "captive",
    description:
      "Release a captive for a small improvement in relations with their nation. Useful for shedding a troublemaker you cannot afford to keep.",
  }),
  educatePirate: E({
    id: "educatePirate",
    name: "Educate Pirate",
    category: "individual",
    gold: 100,
    target: "pirate",
    description:
      "Send a pirate to one of your schools. The same skills can be learned at sea, at the risk of dying there.",
  }),
  pressGang: E({
    id: "pressGang",
    name: "Press Gang",
    category: "individual",
    gold: 0,
    target: "captive",
    description:
      "Make a pirate of an unskilled captive. Bolsters your numbers, and it is the neatest way to remove a captive whose courage and leadership are becoming a problem.",
  }),
  ransomCaptive: E({
    id: "ransomCaptive",
    name: "Ransom Captive",
    category: "individual",
    gold: 0,
    target: "captive",
    description:
      "Sell a skilled or wealthy captive back. A craftsman's price is fixed; a wealthy captive's climbs the longer they enjoy your hospitality.",
  }),
  donateMoney: E({
    id: "donateMoney",
    name: "Donate Money",
    category: "individual",
    gold: 100,
    target: "pirate",
    description:
      "Hand one pirate a hundred gold. A poor pirate cannot pay for the entertainment that would keep him happy, and an unhappy pirate is a problem later.",
  }),
  assassinate: E({
    id: "assassinate",
    name: "Assassinate",
    category: "individual",
    gold: 100,
    target: "pirate",
    requires: { palaceGuard: true },
    description:
      "Send a palace guard to kill someone. Cannot touch a captain or a wealthy captive. The last resort for a pirate who is about to become a rebellion.",
  }),
  outfitPirate: E({
    id: "outfitPirate",
    name: "Outfit Pirate",
    category: "individual",
    gold: 0,
    target: "pirate",
    description:
      "Give a pirate a peg leg, a hat or a parrot — notoriety, leadership or courage, depending on which shop you built.",
  }),

  // ── Pirate policy ─────────────────────────────────────────────────────────
  freeBeer: E({
    id: "freeBeer",
    name: "Free Beer",
    category: "piratePolicy",
    gold: 1000,
    target: "none",
    requires: { building: "brewery" },
    description: "Beer for every pirate on the island, and a sharp jump in drinking satisfaction.",
  }),
  freeRum: E({
    id: "freeRum",
    name: "Free Rum",
    category: "piratePolicy",
    gold: 1500,
    target: "none",
    requires: { building: "rumDistillery" },
    description: "Rum for everyone. Dearer than beer, and worth every coin of the difference.",
  }),
  pirateFestival: E({
    id: "pirateFestival",
    name: "Pirate Festival",
    category: "piratePolicy",
    gold: 1000,
    target: "none",
    description:
      "A island-wide party. Anarchy surges for a while, which delights the pirates and costs you captive resignation for exactly as long.",
  }),
  rigGamblingAgainst: E({
    id: "rigGamblingAgainst",
    name: "Rig Gambling Against",
    category: "piratePolicy",
    gold: 500,
    target: "none",
    standing: true,
    description: "The house wins more. The players enjoy it less. In force until cancelled.",
  }),
  rigGamblingInFavor: E({
    id: "rigGamblingInFavor",
    name: "Rig Gambling in Favor",
    category: "piratePolicy",
    gold: 500,
    target: "none",
    standing: true,
    description:
      "The players win more and love you for it, and your takings suffer. Worth it once the economy no longer needs the tables.",
  }),
  pirateCurfew: E({
    id: "pirateCurfew",
    name: "Pirate Curfew",
    category: "piratePolicy",
    gold: 750,
    target: "none",
    standing: true,
    description: "Order across the island, bought with fear. In force until cancelled.",
  }),
  looseLips: E({
    id: "looseLips",
    name: "Loose Lips",
    category: "piratePolicy",
    gold: 100,
    target: "none",
    standing: true,
    description:
      "Escaped and released captives are less likely to tell their nation where you live. Raises order too.",
  }),
  betrayPirates: E({
    id: "betrayPirates",
    name: "Betray Pirates",
    category: "piratePolicy",
    gold: 0,
    target: "nation",
    description:
      "Hand over every pirate of one nationality to hang. They vanish from the island at once, captains included, and that nation becomes a great deal friendlier.",
  }),
  donateToCrew: E({
    id: "donateToCrew",
    name: "Donate Money to Crew",
    category: "piratePolicy",
    gold: 500,
    target: "ship",
    description: "Five hundred gold split among a ship's captain, officers and crew.",
  }),

  // ── Cruise orders ─────────────────────────────────────────────────────────
  prohibitVictims: E({
    id: "prohibitVictims",
    name: "Prohibit Victims",
    category: "cruiseOrders",
    gold: 0,
    target: "nation",
    standing: true,
    description:
      "Order every ship to leave one nation's shipping alone. Pair it with a peace policy or the peace will not last.",
  }),
  walkThePlank: E({
    id: "walkThePlank",
    name: "Walk the Plank",
    category: "cruiseOrders",
    gold: 0,
    target: "none",
    standing: true,
    description:
      "Take no captives and no recruits from beaten ships. For when your population has outgrown what your island can feed.",
  }),
  fosterWar: E({
    id: "fosterWar",
    name: "Foster War",
    category: "cruiseOrders",
    gold: 0,
    target: "ship",
    requires: { ship: true },
    description:
      "Send a ship out under another nation's flag, to make two of the great powers blame each other for your work.",
  }),
  recruitCaptain: E({
    id: "recruitCaptain",
    name: "Recruit Captain",
    category: "cruiseOrders",
    gold: 1500,
    target: "none",
    description:
      "Sign a new captain. Every ship needs one before she can sail, so this is the real cost of a fleet.",
  }),

  // ── Captive policy ────────────────────────────────────────────────────────
  payForInformants: E({
    id: "payForInformants",
    name: "Pay for Informants",
    category: "captivePolicy",
    gold: 1000,
    target: "none",
    standing: true,
    description:
      "Buy warning of trouble before it starts: plots, escapes and rebellions are flagged while they can still be stopped.",
  }),
  freeAllOfNationality: E({
    id: "freeAllOfNationality",
    name: "Free All of Nationality",
    category: "captivePolicy",
    gold: 0,
    target: "nation",
    description:
      "Release every captive of one nation at once. Relations leap; your workforce collapses. Time it carefully.",
  }),
  randomExecutions: E({
    id: "randomExecutions",
    name: "Random Executions",
    category: "captivePolicy",
    gold: 500,
    target: "none",
    standing: true,
    description:
      "Let pirates kill captives they happen to meet. Anarchy and fear both rise, and so does the number of captives willing to risk the water.",
  }),
  guardPatrols: E({
    id: "guardPatrols",
    name: "Pirate Guard Patrols",
    category: "captivePolicy",
    gold: 500,
    target: "none",
    standing: true,
    description:
      "Pirates walk the roads. Order rises everywhere and the pirates resent every minute of it.",
  }),
  raiseDead: E({
    id: "raiseDead",
    name: "Raise Dead",
    category: "captivePolicy",
    gold: 100,
    target: "none",
    requires: { building: "graveyard" },
    description:
      "Bring back a pirate who died under your rule. Skeletons only haul — but they never eat, never sleep, never pray, and haul better than the living. The price climbs with each one.",
  }),

  // ── Diplomacy ─────────────────────────────────────────────────────────────
  raiseJollyRoger: E({
    id: "raiseJollyRoger",
    name: "Raise the Jolly Roger",
    category: "diplomacy",
    gold: 0,
    target: "none",
    requires: { building: "fort" },
    description:
      "Cut every tie at once, patron included. From here it is you against all three of them.",
  }),
  announcePeace: E({
    id: "announcePeace",
    name: "Announce Peace Policy",
    category: "diplomacy",
    gold: 0,
    target: "nation",
    description:
      "Promise one nation your ships will leave hers alone. Issue the matching cruise order too, or the promise is worse than useless.",
  }),
  openSmugglersCove: E({
    id: "openSmugglersCove",
    name: "Open Smuggler's Cove",
    category: "diplomacy",
    gold: 0,
    target: "nation",
    requires: { building: "smugglersCove" },
    description:
      "Let one nation buy your goods. It is the only way to sell a surplus — and it tells them exactly where you live.",
  }),
  lettersOfMarque: E({
    id: "lettersOfMarque",
    name: "Letters of Marque",
    category: "diplomacy",
    gold: 0,
    target: "nation",
    requires: { relations: 40 },
    description:
      "Take a commission from one nation. Her enemies become fair game with no diplomatic cost at all — while the commission lasts.",
  }),
  declarePatron: E({
    id: "declarePatron",
    name: "Declare Patron",
    category: "diplomacy",
    gold: 0,
    target: "nation",
    requires: { relations: 75 },
    description:
      "Put yourself under one nation's protection. No one invades you — and your patron knows the way to your harbour.",
  }),
};

export const EDICT_IDS = Object.keys(EDICTS) as EdictId[];

export function edictDef(id: EdictId): EdictDef {
  return EDICTS[id];
}

export function edictsInCategory(category: EdictCategory): EdictDef[] {
  return EDICT_IDS.map((id) => EDICTS[id]).filter((def) => def.category === category);
}
