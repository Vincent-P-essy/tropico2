import type { BuildingId } from "./buildings.ts";
import type { JobId, PirateSkill } from "./jobs.ts";
import type { NationId } from "./nations.ts";
import type { PlunderShare } from "./ships.ts";

/**
 * Who the Pirate King is.
 *
 * Every king has one **background** (what he did before), two **qualities**
 * (what he is good at) and one **flaw** (what will cost him). These are not
 * flavour: a background that adds 33% order to the whole island changes where
 * you can put a tavern, and a flaw that forbids peace with England changes which
 * shipping you can afford to leave alone.
 *
 * Effects are data, applied in one place, so a new trait is a new entry here and
 * nothing else.
 */

export interface TraitEffects {
  /** Multipliers applied island-wide to whole aura fields. */
  readonly orderMultiplier?: number;
  readonly anarchyMultiplier?: number;
  readonly fearMultiplier?: number;
  readonly defenseMultiplier?: number;
  /** Starting relations adjustments. */
  readonly relations?: Partial<Readonly<Record<NationId, number>>>;
  /** Applied to every nation that is not the king's own. */
  readonly foreignRelations?: number;
  readonly recruitCaptainCostMultiplier?: number;
  /** Multiplier on how often cruises bring home new recruits. */
  readonly pirateRecruitMultiplier?: number;
  /** Added to every starting pirate's skill. */
  readonly pirateSkills?: Partial<Readonly<Record<PirateSkill, number>>>;
  readonly pirateLeadership?: number;
  readonly pirateCourage?: number;
  readonly pirateMarksmanship?: number;
  /** Added to every captive's working skill; compounds across the whole economy. */
  readonly captiveSkill?: number;
  readonly halfPrice?: readonly BuildingId[];
  readonly noUpkeep?: readonly BuildingId[];
  /** Skilled captives you begin with, which unlocks their buildings immediately. */
  readonly bonusCaptives?: readonly { readonly job: JobId; readonly count: number }[];
  readonly shipSpeedMultiplier?: number;
  /** Extra gold from ships that surrender rather than being taken. */
  readonly surrenderBonus?: number;
  /** Ships engage recklessly: more prizes, more losses. */
  readonly reckless?: boolean;
  /** Only captives of these nationalities may attend church. */
  readonly churchOnlyFor?: readonly NationId[];
  /** Peace and patronage with this nation are impossible. */
  readonly noPeaceWith?: NationId;
  /** Plunder shares the king refuses to offer. */
  readonly forbiddenShares?: readonly PlunderShare[];
  readonly raiseDeadBaseCost?: number;
  /** Multiplier on gold spent by pirates at entertainment buildings. */
  readonly entertainmentSpending?: number;
}

export interface TraitDef {
  readonly id: string;
  readonly name: string;
  readonly effects: TraitEffects;
  /** Traits that cannot be taken alongside this one. */
  readonly excludes?: readonly string[];
  readonly description: string;
}

// ── Backgrounds ─────────────────────────────────────────────────────────────

export type BackgroundId =
  | "alwaysAPirate"
  | "decayedGentleman"
  | "experiencedGambler"
  | "masterGunner"
  | "onceACaptain"
  | "onceAMutineer"
  | "procurer"
  | "shipwrightBg"
  | "sugarPlanter"
  | "tobaccoPlanter";

export const BACKGROUNDS: Readonly<Record<BackgroundId, TraitDef>> = {
  alwaysAPirate: {
    id: "alwaysAPirate",
    name: "Always a Pirate",
    effects: { recruitCaptainCostMultiplier: 1.5, pirateRecruitMultiplier: 1.2 },
    description:
      "You were never anything else, and it shows. Cruises bring home far more recruits — but a captain who knows your history charges you more to sign on.",
  },
  decayedGentleman: {
    id: "decayedGentleman",
    name: "Decayed Gentleman",
    effects: {
      orderMultiplier: 1.33,
      relations: { england: 100, france: 100, spain: 100 },
      bonusCaptives: [{ job: "trader", count: 1 }],
    },
    description:
      "You had an estate once. The great powers still receive you, and the captives still call you sir — order across the whole island runs a third higher.",
  },
  experiencedGambler: {
    id: "experiencedGambler",
    name: "Experienced Gambler",
    effects: {
      halfPrice: ["casino", "gamblingDen"],
      noUpkeep: ["casino", "gamblingDen"],
    },
    excludes: ["luckyWithCards"],
    description: "You know exactly how the house wins. Tables cost half and cost nothing to run.",
  },
  masterGunner: {
    id: "masterGunner",
    name: "Master Gunner",
    effects: {
      pirateSkills: { gunnery: 2 },
      halfPrice: ["cannonFoundry", "gunnerySchool"],
      bonusCaptives: [{ job: "engineer", count: 1 }],
    },
    description: "A navy career at the great guns. Your pirates already shoot straight.",
  },
  onceACaptain: {
    id: "onceACaptain",
    name: "Once a Captain",
    effects: {
      recruitCaptainCostMultiplier: 0.5,
      pirateRecruitMultiplier: 0.9,
      orderMultiplier: 1.33,
    },
    description:
      "You have kept a balky crew in line before. Captains sign for half — though your reputation for discipline thins the queue of volunteers.",
  },
  onceAMutineer: {
    id: "onceAMutineer",
    name: "Once a Mutineer",
    effects: {
      recruitCaptainCostMultiplier: 1.25,
      pirateRecruitMultiplier: 1.1,
      fearMultiplier: 1.19,
      orderMultiplier: 0.81,
    },
    description:
      "A dirty secret, and common sailors love you for it. Captains are wary and cost more.",
  },
  procurer: {
    id: "procurer",
    name: "Procurer",
    effects: {
      halfPrice: ["brothelSalon"],
      bonusCaptives: [
        { job: "courtesan", count: 1 },
        { job: "wench", count: 2 },
      ],
    },
    description: "A service in demand since the dawn of time, and you were good at it.",
  },
  shipwrightBg: {
    id: "shipwrightBg",
    name: "Shipwright",
    effects: { halfPrice: ["shipyard"], bonusCaptives: [{ job: "shipwright", count: 2 }] },
    description: "You built ships before you stole them. Two shipwrights already answer to you.",
  },
  sugarPlanter: {
    id: "sugarPlanter",
    name: "Sugar Planter",
    effects: {
      halfPrice: ["rumDistillery"],
      bonusCaptives: [
        { job: "distiller", count: 1 },
        { job: "farmer", count: 1 },
      ],
    },
    description: "You ran a plantation, and you know exactly what cane is for.",
  },
  tobaccoPlanter: {
    id: "tobaccoPlanter",
    name: "Tobacco Planter",
    effects: {
      halfPrice: ["cigarFactory"],
      bonusCaptives: [
        { job: "tobacconist", count: 1 },
        { job: "farmer", count: 1 },
      ],
    },
    description: "Your leaf was famous. Cigars are half the price to set up.",
  },
};

export const BACKGROUND_IDS = Object.keys(BACKGROUNDS) as BackgroundId[];

// ── Qualities ───────────────────────────────────────────────────────────────

export type QualityId =
  | "charismatic"
  | "courageousLeader"
  | "battleCraftiness"
  | "diplomacy"
  | "expertDuelist"
  | "funLoving"
  | "industrious"
  | "inquisitor"
  | "ironHanded"
  | "luckyWithCards"
  | "expertNavigator"
  | "dreadfulNotoriety"
  | "religious"
  | "expertSeafarer"
  | "trilingual"
  | "voodooAdept";

export const QUALITIES: Readonly<Record<QualityId, TraitDef>> = {
  charismatic: {
    id: "charismatic",
    name: "Charismatic",
    effects: { pirateLeadership: 3 },
    description:
      "Your appeal passes down to your captains, and a captain's leadership is what keeps a crew fighting.",
  },
  courageousLeader: {
    id: "courageousLeader",
    name: "Courageous Leader",
    effects: { pirateCourage: 2 },
    excludes: ["cowardly"],
    description: "Your example makes every pirate on the island braver than the average buccaneer.",
  },
  battleCraftiness: {
    id: "battleCraftiness",
    name: "Battle Craftiness",
    effects: { shipSpeedMultiplier: 1.1 },
    description:
      "Tactics come naturally. Your ships move faster in a chase, whichever end of it they are on.",
  },
  diplomacy: {
    id: "diplomacy",
    name: "Diplomacy",
    effects: {
      defenseMultiplier: 1.19,
      relations: { england: 20, france: 20, spain: 20 },
    },
    description:
      "You negotiate well, and your pirates sense it as safety — defense runs higher across the island.",
  },
  expertDuelist: {
    id: "expertDuelist",
    name: "Expert Duelist",
    effects: { pirateMarksmanship: 2 },
    description:
      "You can put a ball through a needle at thirty paces, drunk, and you are merciless about anyone who cannot.",
  },
  funLoving: {
    id: "funLoving",
    name: "Fun-Loving",
    effects: { anarchyMultiplier: 1.33, orderMultiplier: 0.67 },
    excludes: ["ironHanded"],
    description:
      "Enjoy life while you can. Wonderful for pirates, and a standing problem for every captive you own.",
  },
  industrious: {
    id: "industrious",
    name: "Industrious",
    effects: { captiveSkill: 1 },
    excludes: ["lazy"],
    description:
      "Every captive works a grade better. It compounds through the entire economy and is quietly the strongest pick on the list.",
  },
  inquisitor: {
    id: "inquisitor",
    name: "Inquisitor",
    effects: { fearMultiplier: 1.25 },
    description: "You know how to ask questions. Fear carries a quarter further.",
  },
  ironHanded: {
    id: "ironHanded",
    name: "Iron-Handed",
    effects: { orderMultiplier: 1.33, anarchyMultiplier: 0.67 },
    excludes: ["funLoving"],
    description: "Order across the island, at the exact cost of every pirate's good humour.",
  },
  luckyWithCards: {
    id: "luckyWithCards",
    name: "Lucky with Cards",
    effects: { halfPrice: ["gamblingDen", "casino"], noUpkeep: ["gamblingDen", "casino"] },
    excludes: ["experiencedGambler"],
    description: "The cards simply like you. Gambling houses are cheap and free to run.",
  },
  expertNavigator: {
    id: "expertNavigator",
    name: "Expert Navigator",
    effects: { pirateSkills: { navigation: 2 } },
    description: "Your crews find their way home faster, which is a free cruise every few voyages.",
  },
  dreadfulNotoriety: {
    id: "dreadfulNotoriety",
    name: "Dreadful Notoriety",
    effects: { surrenderBonus: 0.1 },
    description:
      "They have heard of you. Ships that strike their colours rather than fight give up a tenth more gold.",
  },
  religious: {
    id: "religious",
    name: "Religious",
    effects: { orderMultiplier: 1.12, halfPrice: ["church"] },
    excludes: ["voodooAdept"],
    description: "You keep the faith, and your captives are steadier for the churches you build.",
  },
  expertSeafarer: {
    id: "expertSeafarer",
    name: "Expert Seafarer",
    effects: { pirateSkills: { seamanship: 2 } },
    description: "Your crews handle a ship better than the men chasing them.",
  },
  trilingual: {
    id: "trilingual",
    name: "Trilingual",
    effects: { foreignRelations: 40 },
    description: "You do business in three languages, and every foreign court warms to you for it.",
  },
  voodooAdept: {
    id: "voodooAdept",
    name: "Voodoo Adept",
    effects: { raiseDeadBaseCost: 50, fearMultiplier: 1.12 },
    excludes: ["religious"],
    description: "The dead get up cheaper for you, and the living are careful around you.",
  },
};

export const QUALITY_IDS = Object.keys(QUALITIES) as QualityId[];

// ── Flaws ───────────────────────────────────────────────────────────────────

export type FlawId =
  | "alcoholic"
  | "fanaticCatholic"
  | "cowardly"
  | "greedy"
  | "illiterate"
  | "lazy"
  | "fanaticProtestant"
  | "suicidalBravery"
  | "torturedByEngland"
  | "torturedByFrance"
  | "torturedBySpain";

export const FLAWS: Readonly<Record<FlawId, TraitDef>> = {
  alcoholic: {
    id: "alcoholic",
    name: "Alcoholic",
    effects: { entertainmentSpending: 0.85 },
    description:
      "A worrying share of the island's drink goes down your own throat, and the takings show it.",
  },
  fanaticCatholic: {
    id: "fanaticCatholic",
    name: "Fanatic Catholic",
    effects: { churchOnlyFor: ["france", "spain"] },
    description:
      "No English captive sets foot in your church, and in time every one of them resents it.",
  },
  fanaticProtestant: {
    id: "fanaticProtestant",
    name: "Fanatic Protestant",
    effects: { churchOnlyFor: ["england"] },
    description:
      "No French or Spanish captive sets foot in your church, and in time every one of them resents it.",
  },
  cowardly: {
    id: "cowardly",
    name: "Cowardly",
    effects: { pirateCourage: -1 },
    excludes: ["courageousLeader"],
    description: "Your caution runs downhill. Crews break off engagements they could have won.",
  },
  greedy: {
    id: "greedy",
    name: "Greedy",
    effects: { forbiddenShares: ["generous", "bigSpender"] },
    description:
      "You cannot bring yourself to offer a fair share. You can still donate to a crew afterwards, if you must.",
  },
  illiterate: {
    id: "illiterate",
    name: "Illiterate",
    effects: { pirateSkills: { navigation: -1 } },
    description: "Charts mean nothing to you, and it costs your navigators something.",
  },
  lazy: {
    id: "lazy",
    name: "Lazy",
    effects: { captiveSkill: -1 },
    excludes: ["industrious"],
    description:
      "Standards slip from the top down. Every captive works a grade worse, everywhere, forever.",
  },
  suicidalBravery: {
    id: "suicidalBravery",
    name: "Suicidal Bravery",
    effects: { reckless: true },
    description:
      "Your ships engage anything. Sometimes that is a galleon full of silver; sometimes it is a ship of the line.",
  },
  torturedByEngland: {
    id: "torturedByEngland",
    name: "Tortured by England",
    effects: { relations: { england: -50 }, noPeaceWith: "england" },
    description: "You remember what they did. There will be no peace with England, ever.",
  },
  torturedByFrance: {
    id: "torturedByFrance",
    name: "Tortured by France",
    effects: { relations: { france: -50 }, noPeaceWith: "france" },
    description: "You remember what they did. There will be no peace with France, ever.",
  },
  torturedBySpain: {
    id: "torturedBySpain",
    name: "Tortured by Spain",
    effects: { relations: { spain: -50 }, noPeaceWith: "spain" },
    description: "You remember what they did. There will be no peace with Spain, ever.",
  },
};

export const FLAW_IDS = Object.keys(FLAWS) as FlawId[];

export function backgroundDef(id: BackgroundId): TraitDef {
  return BACKGROUNDS[id];
}

export function qualityDef(id: QualityId): TraitDef {
  return QUALITIES[id];
}

export function flawDef(id: FlawId): TraitDef {
  return FLAWS[id];
}

/** True when two traits may be taken together. */
export function traitsCompatible(a: TraitDef, b: TraitDef): boolean {
  return !(a.excludes?.includes(b.id) ?? false) && !(b.excludes?.includes(a.id) ?? false);
}
