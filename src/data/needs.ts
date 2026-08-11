/**
 * Needs and auras — the two halves of how anyone on the island feels.
 *
 * A **need** is personal and is filled by walking somewhere: a pirate wants a
 * drink, so he goes to a tavern. An **aura** is environmental and is felt just
 * by standing still: fear radiates from a gallows whether you look at it or not.
 *
 * The design turns on one fact: anarchy and order are the same axis pointing in
 * opposite directions, pirates want one and captives want the other, and both
 * live on the same island. Everything else is detail.
 */

export type AuraId = "anarchy" | "order" | "fear" | "defense" | "awe";

export interface AuraDef {
  readonly id: AuraId;
  /** Which population reads this aura at all; the other is blind to it. */
  readonly feltBy: "pirate" | "captive";
  readonly name: string;
  readonly description: string;
}

export const AURAS: Readonly<Record<AuraId, AuraDef>> = {
  anarchy: {
    id: "anarchy",
    feltBy: "pirate",
    name: "Anarchy",
    description:
      "Pirates came here to be free of rules. Taverns and pirate homes give off anarchy.",
  },
  order: {
    id: "order",
    feltBy: "captive",
    name: "Order",
    description:
      "Captives are calmer where things are orderly. Order is the exact opposite of anarchy, so a captive standing in a tavern district feels none of it.",
  },
  fear: {
    id: "fear",
    feltBy: "captive",
    name: "Fear",
    description:
      "A gallows in sight keeps captives at their work. Pirates do not notice it, so fear is the cheap way to hold a captive workplace next to a pirate quarter.",
  },
  defense: {
    id: "defense",
    feltBy: "pirate",
    name: "Defense",
    description:
      "Pirates want to feel the guns are theirs. Captives do not notice it, so defense is the cheap way to keep an overseer content in an orderly zone.",
  },
  awe: {
    id: "awe",
    feltBy: "captive",
    name: "Awe",
    description:
      "The Pirate King's palace, a fort, a mansion. Captives who are impressed are captives who do not run.",
  },
};

export const AURA_IDS = Object.keys(AURAS) as AuraId[];

/** Needs filled by visiting a building. */
export type NeedId =
  "feasting" | "drinking" | "gambling" | "companionship" | "resting" | "stashing" | "religion";

export interface NeedDef {
  readonly id: NeedId;
  readonly name: string;
  /** Which populations have this need. Feasting and resting are wanted by both. */
  readonly feltBy: readonly ("pirate" | "captive")[];
  /** Points lost per game-day when the need is not being met. */
  readonly decayPerDay: number;
  /** How heavily this need counts toward the population's aggregate mood. */
  readonly weight: number;
  readonly description: string;
}

/**
 * Decay rates are per game-day, and they are the number that decides whether an
 * island is playable.
 *
 * They are set against the original's own rule of thumb — one chuck tent per
 * thirty captives — and against how long it takes to walk anywhere.
 *
 * A meal fills feasting to roughly fifty-five; at nine a day that lasts about
 * six days, so thirty captives want five meals a day and one chuck tent makes
 * nine. Tuned any faster and the population spends its entire life walking to
 * and from the kitchen and starves in transit, which is exactly what the first
 * calibration did.
 */
export const NEEDS: Readonly<Record<NeedId, NeedDef>> = {
  feasting: {
    id: "feasting",
    name: "Feasting",
    feltBy: ["pirate", "captive"],
    decayPerDay: 9,
    weight: 1.4,
    description:
      "Hunger. Captives eat slop at a chuck tent; pirates eat at a dive, an eatery or an inn. A captive who cannot eat will eventually starve.",
  },
  drinking: {
    id: "drinking",
    name: "Drinking",
    feltBy: ["pirate"],
    decayPerDay: 8,
    weight: 1.3,
    description:
      "Grog. Served anywhere pirates gather; beer will do, rum is far better, and nothing at all starts fights.",
  },
  gambling: {
    id: "gambling",
    name: "Gambling",
    feltBy: ["pirate"],
    decayPerDay: 5,
    weight: 0.9,
    description:
      "Betting, at an animal pit, a gambling den or a casino. Cigars sweeten the tables.",
  },
  companionship: {
    id: "companionship",
    name: "Companionship",
    feltBy: ["pirate"],
    decayPerDay: 5,
    weight: 0.9,
    description: "Company, at a masseuse, a salon or a spa.",
  },
  resting: {
    id: "resting",
    name: "Resting",
    feltBy: ["pirate", "captive"],
    decayPerDay: 11,
    weight: 1.2,
    description:
      "Sleep. Captives sleep in bunkhouses or, badly, on the ground; pirates sleep at home or aboard their ship.",
  },
  stashing: {
    id: "stashing",
    name: "Stashing",
    feltBy: ["pirate"],
    decayPerDay: 4,
    weight: 1.0,
    description:
      "A pirate wants somewhere of his own to hide his share. Only his own house will do — and a captain with no house is a dangerous man.",
  },
  religion: {
    id: "religion",
    name: "Religion",
    feltBy: ["captive"],
    decayPerDay: 3,
    weight: 0.8,
    description:
      "Captives start wanting a church about two years in, and grow restless without one.",
  },
};

export const NEED_IDS = Object.keys(NEEDS) as NeedId[];

export const PIRATE_NEEDS: readonly NeedId[] = NEED_IDS.filter((id) =>
  NEEDS[id].feltBy.includes("pirate"),
);

export const CAPTIVE_NEEDS: readonly NeedId[] = NEED_IDS.filter((id) =>
  NEEDS[id].feltBy.includes("captive"),
);

/** How much each aura counts toward a population's aggregate mood. */
export const AURA_WEIGHTS: Readonly<Record<AuraId, number>> = {
  anarchy: 1.1,
  defense: 0.8,
  order: 1.1,
  fear: 1.0,
  awe: 0.6,
};

export function needDef(id: NeedId): NeedDef {
  return NEEDS[id];
}

export function auraDef(id: AuraId): AuraDef {
  return AURAS[id];
}
