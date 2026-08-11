import type { BuildingId } from "./buildings.ts";
import type { GoodId } from "./goods.ts";
import type { NationId } from "./nations.ts";
import type { ShipClassId } from "./ships.ts";

/**
 * The campaign: sixteen episodes across a century of piracy, 1650 to 1747.
 *
 * The start and end dates, starting resources, objectives and the
 * bronze/silver/gold time thresholds are the original's. Episodes chain — from
 * the sixth onward you begin with the hoard you finished the last one with, so
 * a sloppy early run is felt for the rest of the century.
 */

export type Objective =
  | { readonly kind: "build"; readonly building: BuildingId; readonly count: number }
  | {
      readonly kind: "buildAnyOf";
      readonly buildings: readonly BuildingId[];
      readonly count: number;
      readonly label: string;
    }
  | { readonly kind: "treasury"; readonly amount: number }
  | { readonly kind: "hoard"; readonly amount: number }
  | { readonly kind: "pirateHappiness"; readonly percent: number }
  | { readonly kind: "pirateCount"; readonly count: number }
  | { readonly kind: "captainCount"; readonly count: number }
  | {
      readonly kind: "shipCount";
      readonly count: number;
      readonly classes?: readonly ShipClassId[];
      readonly label?: string;
    }
  | {
      readonly kind: "relations";
      readonly value: number;
      readonly nations: readonly NationId[];
      readonly label: string;
    }
  | { readonly kind: "patronOrDefense"; readonly defense: number }
  | { readonly kind: "openCove" };

/** A rule the player must not break, checked continuously. */
export interface Restriction {
  readonly kind: "doNotPlunder";
  readonly nation: NationId;
}

export interface ScenarioStart {
  readonly treasury: number;
  /** Added to the hoard carried over from the previous episode. */
  readonly hoard: number;
  /** True when the previous episode's hoard carries into this one. */
  readonly carriesHoard: boolean;
  readonly goods: Partial<Readonly<Record<GoodId, number>>>;
  readonly ships: readonly ShipClassId[];
  readonly captives: number;
  readonly pirates: number;
}

export interface Scenario {
  readonly id: string;
  readonly index: number;
  readonly name: string;
  /** Game start, as [year, month] with month 1 = January. */
  readonly start: readonly [number, number];
  /** Hard end of the episode; reaching it without the objectives is a loss. */
  readonly end: readonly [number, number];
  readonly resources: ScenarioStart;
  readonly objectives: readonly Objective[];
  readonly restrictions?: readonly Restriction[];
  /** Months allowed for each medal, measured from the start date. */
  readonly bronze: number;
  readonly silver: number;
  readonly gold: number;
  readonly briefing: string;
  readonly hint: string;
}

const months = (years: number, extra = 0): number => years * 12 + extra;

export const CAMPAIGN: readonly Scenario[] = [
  {
    id: "beerForBuccaneers",
    index: 1,
    name: "Beer for Buccaneers",
    start: [1650, 1],
    end: [1651, 1],
    resources: {
      treasury: 250,
      hoard: 0,
      carriesHoard: false,
      goods: { lumber: 17 },
      ships: [],
      captives: 14,
      pirates: 6,
    },
    objectives: [
      { kind: "build", building: "brewery", count: 1 },
      { kind: "build", building: "smugglersDive", count: 1 },
    ],
    bronze: 13,
    silver: 6,
    gold: 4,
    briefing:
      "You have an island, a handful of pirates and no beer. The pirates have noticed. Get a brewery and somewhere to drink it standing before they take an interest in the alternatives.",
    hint: "Put a timber camp behind the sawmill and two construction tents where you intend to build. Lumber is the only thing standing between you and both buildings.",
  },
  {
    id: "pirateIndustry",
    index: 2,
    name: "Pirate Industry",
    start: [1650, 11],
    end: [1652, 5],
    resources: {
      treasury: 500,
      hoard: 0,
      carriesHoard: false,
      goods: { lumber: 8 },
      ships: [],
      captives: 20,
      pirates: 8,
    },
    objectives: [
      { kind: "build", building: "seaRationFactory", count: 1 },
      { kind: "build", building: "ironMine", count: 1 },
      { kind: "build", building: "blastFurnace", count: 1 },
      { kind: "build", building: "blacksmithy", count: 1 },
      { kind: "build", building: "dock", count: 1 },
    ],
    bronze: 19,
    silver: 15,
    gold: 13,
    briefing:
      "Drink is not a war chest. Build the industry that arms a ship: rations to keep her at sea, iron to make her dangerous, and a dock to load it all.",
    hint: "The iron chain is mine, then furnace, then smithy — and every link needs a hauler. Site the mine on the ore and keep the chain short.",
  },
  {
    id: "raidersOfTheCaribbean",
    index: 3,
    name: "Raiders of the Caribbean",
    start: [1652, 1],
    end: [1656, 1],
    resources: {
      treasury: 500,
      hoard: 0,
      carriesHoard: false,
      goods: { lumber: 15 },
      ships: [],
      captives: 24,
      pirates: 10,
    },
    objectives: [
      { kind: "build", building: "boatyard", count: 1 },
      { kind: "treasury", amount: 3000 },
    ],
    bronze: 48,
    silver: 21,
    gold: 13,
    briefing:
      "Everything so far has been preparation. Build a boatyard, put a hull in the water, and find out what the Windward Passage is carrying.",
    hint: "A boatyard needs a shipwright, and a shipwright must be stolen. A snow costs no gold and only three men — send her out again and again.",
  },
  {
    id: "privateersNotPirates",
    index: 4,
    name: "Privateers, not Pirates",
    start: [1655, 4],
    end: [1660, 4],
    resources: {
      treasury: 3000,
      hoard: 0,
      carriesHoard: false,
      goods: { lumber: 12 },
      ships: [],
      captives: 30,
      pirates: 14,
    },
    objectives: [
      { kind: "shipCount", count: 1, classes: ["sloop"], label: "Build a sloop for Henry Morgan" },
      { kind: "pirateHappiness", percent: 62.5 },
    ],
    bronze: 60,
    silver: 33,
    gold: 24,
    briefing:
      "Captain Morgan wants a sloop, and your pirates want everything else. Keep them above two thirds happy while you build it — a discontented crew is no use to a privateer.",
    hint: "Happiness is six needs and two auras. Cluster the taverns and houses away from the captive works and let anarchy pool where the pirates actually stand.",
  },
  {
    id: "jamaicanRum",
    index: 5,
    name: "Jamaican Rum",
    start: [1657, 3],
    end: [1665, 3],
    resources: {
      treasury: 2000,
      hoard: 0,
      carriesHoard: false,
      goods: { lumber: 10 },
      ships: ["snow"],
      captives: 34,
      pirates: 16,
    },
    objectives: [{ kind: "hoard", amount: 1000 }],
    bronze: 96,
    silver: 96,
    gold: 96,
    briefing:
      "Eight years, and the only number that matters is what ends up in your cave. The treasury is not your money. The hoard is.",
    hint: "Build the Pirate Cave immediately and set it to stash the maximum. It skims a quarter of everything — but only from the moment it exists.",
  },
  {
    id: "diplomacyAndWar",
    index: 6,
    name: "Diplomacy and War",
    start: [1663, 4],
    end: [1669, 4],
    resources: {
      treasury: 900,
      hoard: 100,
      carriesHoard: true,
      goods: { lumber: 10 },
      ships: ["schooner"],
      captives: 38,
      pirates: 18,
    },
    objectives: [
      {
        kind: "relations",
        value: 75,
        nations: ["france", "spain"],
        label: "Harmonious relations with France or Spain",
      },
      { kind: "hoard", amount: 1500 },
    ],
    bronze: 72,
    silver: 58,
    gold: 46,
    briefing:
      "You cannot rob everyone forever. Pick a friend among the great powers and keep your ships off their shipping long enough to be believed.",
    hint: "Announce the peace policy and issue the matching cruise order together. One without the other is a promise your captains will break by accident.",
  },
  {
    id: "aTurncoatPirate",
    index: 7,
    name: "A Turncoat Pirate",
    start: [1667, 4],
    end: [1677, 4],
    resources: {
      treasury: 1080,
      hoard: 120,
      carriesHoard: true,
      goods: { lumber: 10, seaRations: 20 },
      ships: ["schooner"],
      captives: 42,
      pirates: 22,
    },
    objectives: [
      {
        kind: "buildAnyOf",
        buildings: [
          "gunnerySchool",
          "marksmanshipSchool",
          "navigationSchool",
          "seamanshipSchool",
          "swordsmanshipSchool",
        ],
        count: 2,
        label: "Own two pirate schools",
      },
      { kind: "shipCount", count: 4 },
    ],
    bronze: 120,
    silver: 69,
    gold: 56,
    briefing:
      "Morgan is coming, and he is no longer on your side. Have four hulls in the water and two schools training the men who crew them before he arrives.",
    hint: "Schools cost six hundred gold each and radiate defense, so they earn their keep twice: better crews, and happier pirates standing near them.",
  },
  {
    id: "frigatesAndShipbuilding",
    index: 8,
    name: "Frigates and Shipbuilding",
    start: [1674, 5],
    end: [1682, 12],
    resources: {
      treasury: 1080,
      hoard: 120,
      carriesHoard: true,
      goods: { lumber: 10 },
      ships: ["sloop"],
      captives: 46,
      pirates: 26,
    },
    objectives: [
      { kind: "shipCount", count: 2, classes: ["frigate"], label: "Own two frigates" },
      { kind: "hoard", amount: 2000 },
    ],
    bronze: 104,
    silver: 82,
    gold: 66,
    briefing:
      "Small hulls have taken you as far as they can. Two frigates, and the hoard to show they were worth building.",
    hint: "A frigate needs a shipyard, and a shipyard costs eight thousand gold. Cruise first, build second, and keep the lumber coming.",
  },
  {
    id: "aSmugglersCove",
    index: 9,
    name: "A Smuggler's Cove",
    start: [1681, 1],
    end: [1689, 12],
    resources: {
      treasury: 720,
      hoard: 80,
      carriesHoard: true,
      goods: { lumber: 10, seaRations: 80 },
      ships: ["brigantine"],
      captives: 50,
      pirates: 30,
    },
    objectives: [
      { kind: "build", building: "smugglersCove", count: 1 },
      { kind: "openCove" },
      { kind: "hoard", amount: 3000 },
    ],
    bronze: 108,
    silver: 75,
    gold: 59,
    briefing:
      "Your warehouses are full of goods nobody on this island wants. Open a cove, find a buyer among the great powers, and turn the surplus into hoard.",
    hint: "Opening the cove tells that nation exactly where you live. Open it to the one you have been keeping sweet, not the one you have been robbing.",
  },
  {
    id: "tortuga",
    index: 10,
    name: "Tortuga",
    start: [1686, 1],
    end: [1699, 12],
    resources: {
      treasury: 720,
      hoard: 80,
      carriesHoard: true,
      goods: { lumber: 20, seaRations: 50 },
      ships: ["brigantine"],
      captives: 56,
      pirates: 34,
    },
    objectives: [
      { kind: "hoard", amount: 10000 },
      { kind: "treasury", amount: 20000 },
    ],
    restrictions: [{ kind: "doNotPlunder", nation: "france" }],
    bronze: 168,
    silver: 144,
    gold: 120,
    briefing:
      "Tortuga's scale, and Tortuga's terms: ten thousand in your cave and twenty in the treasury, by any means you like — except a French deck.",
    hint: "Prohibit French victims on day one. One French prize taken by a captain who did not know is the whole episode.",
  },
  {
    id: "theTreasureFleet",
    index: 11,
    name: "The Treasure Fleet",
    start: [1692, 1],
    end: [1700, 12],
    resources: {
      treasury: 720,
      hoard: 80,
      carriesHoard: true,
      goods: { lumber: 20, seaRations: 70 },
      ships: ["schooner", "frigate"],
      captives: 60,
      pirates: 38,
    },
    objectives: [{ kind: "hoard", amount: 10000 }],
    bronze: 108,
    silver: 82,
    gold: 65,
    briefing:
      "The silver of the Indies sails home once a year through the Florida Straits. Ten thousand in the cave says you were waiting for it.",
    hint: "The Straits are the richest water on the map and the best escorted. Take the frigate, keep her rations full, and move region when the shipping thins.",
  },
  {
    id: "theJollyRoger",
    index: 12,
    name: "The Jolly Roger",
    start: [1699, 1],
    end: [1707, 12],
    resources: {
      treasury: 720,
      hoard: 80,
      carriesHoard: true,
      goods: { lumber: 20, seaRations: 70 },
      ships: ["frigate"],
      captives: 64,
      pirates: 40,
    },
    objectives: [
      { kind: "pirateCount", count: 50 },
      { kind: "pirateHappiness", percent: 62.5 },
      { kind: "hoard", amount: 5000 },
    ],
    bronze: 108,
    silver: 79,
    gold: 66,
    briefing:
      "Fifty pirates, happy, and five thousand in the cave. Numbers are easy. Fifty happy pirates is a town, and a town needs building.",
    hint: "Every new pirate needs a plot, a drink and a table. Recruit hard, but build the quarter before the men arrive, not after.",
  },
  {
    id: "aNewWar",
    index: 13,
    name: "A New War",
    start: [1704, 1],
    end: [1716, 12],
    resources: {
      treasury: 450,
      hoard: 50,
      carriesHoard: true,
      goods: { lumber: 20, seaRations: 70 },
      ships: ["frigate"],
      captives: 68,
      pirates: 42,
    },
    objectives: [
      {
        kind: "relations",
        value: 75,
        nations: ["england", "france", "spain"],
        label: "Harmonious relations with a great power",
      },
      {
        kind: "shipCount",
        count: 4,
        classes: ["frigate", "galleon"],
        label: "Four frigates or galleons",
      },
      { kind: "hoard", amount: 5000 },
    ],
    bronze: 156,
    silver: 115,
    gold: 95,
    briefing:
      "Europe is at war again, which means two of the three will forgive a great deal. Pick your friend, build a real fleet, and take the rest.",
    hint: "Letters of marque make one nation's enemies free of diplomatic cost. It is the cheapest fleet-building tool in the game.",
  },
  {
    id: "pirateDefense",
    index: 14,
    name: "Pirate Defense",
    start: [1710, 1],
    end: [1719, 12],
    resources: {
      treasury: 450,
      hoard: 50,
      carriesHoard: true,
      goods: { lumber: 20, seaRations: 70 },
      ships: ["frigate"],
      captives: 72,
      pirates: 44,
    },
    objectives: [
      { kind: "patronOrDefense", defense: 90 },
      { kind: "hoard", amount: 10000 },
    ],
    bronze: 120,
    silver: 99,
    gold: 82,
    briefing:
      "They know where you are. Either make yourself too expensive to attack, or find a great power willing to say you are theirs.",
    hint: "A patron is cheaper than a fort, and a fort is more reliable than a patron. Ten thousand in the cave either way.",
  },
  {
    id: "theLastGoldenAge",
    index: 15,
    name: "The Last Golden Age",
    start: [1718, 1],
    end: [1729, 12],
    resources: {
      treasury: 450,
      hoard: 50,
      carriesHoard: true,
      goods: { lumber: 20, seaRations: 70 },
      ships: ["frigate"],
      captives: 76,
      pirates: 48,
    },
    objectives: [
      { kind: "captainCount", count: 6 },
      { kind: "shipCount", count: 6 },
    ],
    bronze: 144,
    silver: 132,
    gold: 120,
    briefing:
      "The age is ending and everyone can feel it. Six captains, six ships, and a haven that looks like the last great pirate republic — because it is.",
    hint: "Captains cost fifteen hundred each, and every ship needs its own dock. This is an infrastructure episode wearing a romantic hat.",
  },
  {
    id: "theWarOfJenkinsEar",
    index: 16,
    name: "The War of Jenkins' Ear",
    start: [1738, 1],
    end: [1747, 12],
    resources: {
      treasury: 150,
      hoard: 50,
      carriesHoard: true,
      goods: { lumber: 40, seaRations: 70 },
      ships: ["frigate"],
      captives: 80,
      pirates: 50,
    },
    objectives: [{ kind: "hoard", amount: 7500 }],
    bronze: 120,
    silver: 96,
    gold: 72,
    briefing:
      "You are past a hundred years old and the Royal Navy is your problem now. Seven and a half thousand in the cave, and England is the target.",
    hint: "England's warships are rich in reputation and poor in gold. Take her merchants and let her frigates chase the horizon.",
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return CAMPAIGN.find((s) => s.id === id);
}

/** Absolute month index, so dates and deadlines are one comparable number. */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function scenarioStartMonth(scenario: Scenario): number {
  return monthIndex(scenario.start[0], scenario.start[1]);
}

export function scenarioEndMonth(scenario: Scenario): number {
  return monthIndex(scenario.end[0], scenario.end[1]);
}

/** Which medal a completion at `elapsed` months earns, or null for none. */
export function medalFor(scenario: Scenario, elapsed: number): "gold" | "silver" | "bronze" | null {
  if (elapsed <= scenario.gold) return "gold";
  if (elapsed <= scenario.silver) return "silver";
  if (elapsed <= scenario.bronze) return "bronze";
  return null;
}

export { months };

/** Free play: no objectives, no clock, and a choice of how hard the island is. */
export interface SandboxOptions {
  readonly seed: number;
  readonly difficulty: "calm" | "standard" | "hard";
  readonly startingPirates: number;
  readonly startingCaptives: number;
  readonly treasury: number;
}

export const SANDBOX_DEFAULTS: SandboxOptions = {
  seed: 1650,
  difficulty: "standard",
  startingPirates: 12,
  startingCaptives: 26,
  treasury: 1500,
};
