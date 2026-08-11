import type { NationId } from "./nations.ts";
import type { BackgroundId, FlawId, QualityId } from "./traits.ts";

/**
 * The sixteen captains.
 *
 * These stat lines are the original's. Every one of them can be recruited to
 * command a ship, and every one can be chosen as the Pirate King, in which case
 * they bring the background, qualities and flaw listed here.
 *
 * The three numbers that decide a cruise are leadership (keeps your crew
 * fighting), courage (whether you chase or run) and notoriety (whether the other
 * ship's crew loses its nerve before a shot is fired). By that sum the best
 * three in the game are Edward Teach, Henry Morgan and Laurens de Graff, at 17.
 */

export interface CaptainDef {
  readonly id: string;
  readonly name: string;
  readonly sex: "male" | "female";
  readonly nationality: NationId;
  readonly navigation: number;
  readonly seamanship: number;
  readonly gunnery: number;
  readonly marksmanship: number;
  readonly swordsmanship: number;
  /** How reluctant this captain is to turn on you when unhappy. */
  readonly loyalty: number;
  readonly leadership: number;
  readonly courage: number;
  readonly notoriety: number;
  /** The name shown when this captain is chosen as Pirate King, if different. */
  readonly kingName?: string;
  readonly background: BackgroundId;
  readonly qualities: readonly [QualityId, QualityId];
  readonly flaw: FlawId;
  readonly description: string;
}

export const CAPTAINS: readonly CaptainDef[] = [
  {
    id: "anneBonny",
    name: "Anne Bonny",
    sex: "female",
    nationality: "england",
    navigation: 3,
    seamanship: 4,
    gunnery: 2,
    marksmanship: 3,
    swordsmanship: 4,
    loyalty: 7,
    leadership: 3,
    courage: 8,
    notoriety: 3,
    background: "alwaysAPirate",
    qualities: ["charismatic", "funLoving"],
    flaw: "illiterate",
    description: "Courage of eight and loyalty of seven. She will follow you anywhere, at speed.",
  },
  {
    id: "bartholomewRoberts",
    name: "Bartholomew Roberts",
    kingName: "Black Bart",
    sex: "male",
    nationality: "england",
    navigation: 4,
    seamanship: 5,
    gunnery: 3,
    marksmanship: 2,
    swordsmanship: 2,
    loyalty: 3,
    leadership: 6,
    courage: 4,
    notoriety: 4,
    background: "onceACaptain",
    qualities: ["charismatic", "ironHanded"],
    flaw: "greedy",
    description: "The finest seaman on the list, and a fine leader. Just do not trust him too far.",
  },
  {
    id: "bloodyMary",
    name: "Bloody Mary",
    sex: "female",
    nationality: "england",
    navigation: 4,
    seamanship: 2,
    gunnery: 4,
    marksmanship: 4,
    swordsmanship: 2,
    loyalty: 3,
    leadership: 5,
    courage: 4,
    notoriety: 2,
    background: "experiencedGambler",
    qualities: ["diplomacy", "religious"],
    flaw: "alcoholic",
    description: "A gunner and a navigator, with no patience for boarding actions.",
  },
  {
    id: "calicoJack",
    name: "Calico Jack",
    sex: "male",
    nationality: "england",
    navigation: 3,
    seamanship: 4,
    gunnery: 3,
    marksmanship: 3,
    swordsmanship: 3,
    loyalty: 2,
    leadership: 6,
    courage: 3,
    notoriety: 2,
    background: "sugarPlanter",
    qualities: ["battleCraftiness", "funLoving"],
    flaw: "cowardly",
    description: "Good at everything, brave at nothing, and liable to sell you out.",
  },
  {
    id: "capnHook",
    name: "Cap'n Hook",
    sex: "male",
    nationality: "spain",
    navigation: 5,
    seamanship: 2,
    gunnery: 1,
    marksmanship: 4,
    swordsmanship: 4,
    loyalty: 3,
    leadership: 5,
    courage: 4,
    notoriety: 3,
    background: "decayedGentleman",
    qualities: ["inquisitor", "religious"],
    flaw: "fanaticCatholic",
    description: "The best navigator afloat. Keep him away from the guns.",
  },
  {
    id: "charlotteDeBerry",
    name: "Charlotte de Berry",
    sex: "female",
    nationality: "england",
    navigation: 3,
    seamanship: 5,
    gunnery: 3,
    marksmanship: 3,
    swordsmanship: 2,
    loyalty: 8,
    leadership: 4,
    courage: 6,
    notoriety: 3,
    background: "onceAMutineer",
    qualities: ["expertNavigator", "industrious"],
    flaw: "fanaticProtestant",
    description: "The most loyal captain in the Caribbean, and a superb sailor with it.",
  },
  {
    id: "edwardTeach",
    name: "Edward Teach",
    kingName: "Blackbeard",
    sex: "male",
    nationality: "england",
    navigation: 2,
    seamanship: 4,
    gunnery: 3,
    marksmanship: 3,
    swordsmanship: 4,
    loyalty: 3,
    leadership: 5,
    courage: 7,
    notoriety: 5,
    background: "shipwrightBg",
    qualities: ["courageousLeader", "dreadfulNotoriety"],
    flaw: "suicidalBravery",
    description:
      "Blackbeard. Seventeen points of leadership, courage and dread — ships strike to him before he fires.",
  },
  {
    id: "francisLOnnonais",
    name: "Francis L'Onnonais",
    sex: "male",
    nationality: "france",
    navigation: 2,
    seamanship: 3,
    gunnery: 4,
    marksmanship: 3,
    swordsmanship: 4,
    loyalty: 3,
    leadership: 5,
    courage: 5,
    notoriety: 4,
    background: "masterGunner",
    qualities: ["inquisitor", "trilingual"],
    flaw: "torturedByEngland",
    description: "A fighting captain: guns and cutlasses both.",
  },
  {
    id: "henryMorgan",
    name: "Henry Morgan",
    sex: "male",
    nationality: "england",
    navigation: 4,
    seamanship: 3,
    gunnery: 2,
    marksmanship: 3,
    swordsmanship: 4,
    loyalty: 4,
    leadership: 7,
    courage: 5,
    notoriety: 5,
    background: "decayedGentleman",
    qualities: ["dreadfulNotoriety", "ironHanded"],
    flaw: "greedy",
    description:
      "The best leader in the game, and the face the campaign's Pirate King wears. Seventeen points, like Teach.",
  },
  {
    id: "laurensDeGraff",
    name: "Laurens de Graff",
    sex: "male",
    nationality: "france",
    navigation: 3,
    seamanship: 3,
    gunnery: 3,
    marksmanship: 4,
    swordsmanship: 3,
    loyalty: 4,
    leadership: 6,
    courage: 6,
    notoriety: 5,
    background: "alwaysAPirate",
    qualities: ["battleCraftiness", "expertDuelist"],
    flaw: "torturedBySpain",
    description: "No weaknesses anywhere, and seventeen points where it counts.",
  },
  {
    id: "longJohnSilver",
    name: "Long John Silver",
    sex: "male",
    nationality: "spain",
    navigation: 2,
    seamanship: 4,
    gunnery: 5,
    marksmanship: 3,
    swordsmanship: 2,
    loyalty: 3,
    leadership: 7,
    courage: 2,
    notoriety: 3,
    background: "alwaysAPirate",
    qualities: ["expertDuelist", "funLoving"],
    flaw: "lazy",
    description:
      "The best gunner and joint-best leader on the list — who will run from anything that shoots back.",
  },
  {
    id: "maryRead",
    name: "Mary Read",
    sex: "female",
    nationality: "england",
    navigation: 3,
    seamanship: 2,
    gunnery: 3,
    marksmanship: 5,
    swordsmanship: 3,
    loyalty: 6,
    leadership: 4,
    courage: 7,
    notoriety: 3,
    background: "onceAMutineer",
    qualities: ["courageousLeader", "expertDuelist"],
    flaw: "suicidalBravery",
    description: "The finest shot afloat, brave, and loyal with it.",
  },
  {
    id: "nickolaasVanHoorn",
    name: "Nickolaas Van Hoorn",
    sex: "male",
    nationality: "spain",
    navigation: 3,
    seamanship: 3,
    gunnery: 3,
    marksmanship: 3,
    swordsmanship: 4,
    loyalty: 2,
    leadership: 3,
    courage: 6,
    notoriety: 2,
    background: "masterGunner",
    qualities: ["dreadfulNotoriety", "luckyWithCards"],
    flaw: "suicidalBravery",
    description: "Brave, disloyal and reckless. A cheap hull and a short leash.",
  },
  {
    id: "rockBrazilliano",
    name: "Rock Brazilliano",
    sex: "male",
    nationality: "spain",
    navigation: 2,
    seamanship: 3,
    gunnery: 1,
    marksmanship: 5,
    swordsmanship: 5,
    loyalty: 5,
    leadership: 3,
    courage: 7,
    notoriety: 3,
    background: "tobaccoPlanter",
    qualities: ["funLoving", "inquisitor"],
    flaw: "alcoholic",
    description:
      "Give him cutlasses and muskets and point him at something. Never give him cannon.",
  },
  {
    id: "roseanneWinnefree",
    name: "Roseanne Winnefree",
    sex: "female",
    nationality: "spain",
    navigation: 3,
    seamanship: 4,
    gunnery: 1,
    marksmanship: 4,
    swordsmanship: 4,
    loyalty: 3,
    leadership: 4,
    courage: 5,
    notoriety: 2,
    background: "procurer",
    qualities: ["charismatic", "voodooAdept"],
    flaw: "torturedByFrance",
    description: "A boarder, not a gunner. Sound at everything else.",
  },
  {
    id: "williamKidd",
    name: "William Kidd",
    sex: "male",
    nationality: "england",
    navigation: 3,
    seamanship: 4,
    gunnery: 3,
    marksmanship: 3,
    swordsmanship: 3,
    loyalty: 2,
    leadership: 2,
    courage: 7,
    notoriety: 5,
    background: "onceACaptain",
    qualities: ["dreadfulNotoriety", "expertSeafarer"],
    flaw: "lazy",
    description:
      "Feared and brave, but he cannot lead and he will not stay bought. Loyalty two, leadership two.",
  },
];

export const CAPTAIN_IDS: readonly string[] = CAPTAINS.map((c) => c.id);

export function captainDef(id: string): CaptainDef | undefined {
  return CAPTAINS.find((c) => c.id === id);
}

/** The name a captain goes by when ruling, which differs for two of them. */
export function kingNameOf(captain: CaptainDef): string {
  return captain.kingName ?? captain.name;
}

/** Leadership + courage + notoriety: the shorthand for how good a captain is at sea. */
export function captainRating(captain: CaptainDef): number {
  return captain.leadership + captain.courage + captain.notoriety;
}
