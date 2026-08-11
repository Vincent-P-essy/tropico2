import { describe, expect, it } from "vitest";
import { BUILDINGS, HOUSING_LEVELS, PALACE_LEVELS, RANKS, type BuildingId } from "./buildings.ts";
import { CAPTAINS } from "./captains.ts";
import { GOODS } from "./goods.ts";
import { CAMPAIGN, monthIndex } from "./scenarios.ts";
import { SHIP_CLASSES, type ShipClassId } from "./ships.ts";
import type { AuraId } from "./needs.ts";

/**
 * The resemblance test.
 *
 * Everything asserted here is a number the original published, transcribed from
 * the game's own data. It is separate from `catalogue.test.ts`, which only
 * checks the content is internally coherent — this file checks it is the *right*
 * content, and it is the thing to run after any balance work to be sure a tuning
 * pass has not quietly rewritten the game into something else.
 *
 * Numbers that were never published — production rates, need decay, encounter
 * odds — are deliberately absent. Those live in `balance.ts` and are tuned to
 * reproduce the original's behaviour rather than copied from it.
 */

describe("the fleet is the original's", () => {
  // gold, lumber, speed, officers, crew, rations, cutlasses, cannon, muskets
  const TABLE: Record<ShipClassId, readonly number[]> = {
    snow: [0, 20, 28, 1, 3, 5, 4, 4, 4],
    schooner: [100, 30, 32, 2, 5, 8, 7, 8, 7],
    sloop: [250, 50, 28, 2, 8, 10, 10, 16, 10],
    brigantine: [500, 70, 26, 2, 8, 30, 10, 12, 10],
    frigate: [1000, 125, 22, 4, 13, 40, 17, 26, 17],
    galleon: [1000, 150, 15, 5, 15, 60, 20, 40, 20],
  };

  it("matches the published ship table exactly", () => {
    for (const [id, row] of Object.entries(TABLE) as [ShipClassId, number[]][]) {
      const def = SHIP_CLASSES[id];
      expect(
        [
          def.gold,
          def.lumber,
          def.speed,
          def.officers,
          def.crew,
          def.capacity.seaRations,
          def.capacity.cutlasses,
          def.capacity.cannon,
          def.capacity.muskets,
        ],
        def.name,
      ).toEqual(row);
    }
  });

  it("keeps the Brigantine's endurance, which is the whole point of her", () => {
    // Thirty rations against a Sloop's ten: slower and worse armed, but she can
    // stay out. That trade is the reason both hulls exist.
    expect(SHIP_CLASSES.brigantine.capacity.seaRations).toBe(30);
    expect(SHIP_CLASSES.sloop.capacity.seaRations).toBe(10);
    expect(SHIP_CLASSES.sloop.capacity.cannon).toBeGreaterThan(
      SHIP_CLASSES.brigantine.capacity.cannon,
    );
  });
});

describe("the captains are the original's", () => {
  // navigation, seamanship, gunnery, marksmanship, swordsmanship,
  // loyalty, leadership, courage, notoriety
  const TABLE: Record<string, readonly number[]> = {
    anneBonny: [3, 4, 2, 3, 4, 7, 3, 8, 3],
    bartholomewRoberts: [4, 5, 3, 2, 2, 3, 6, 4, 4],
    bloodyMary: [4, 2, 4, 4, 2, 3, 5, 4, 2],
    calicoJack: [3, 4, 3, 3, 3, 2, 6, 3, 2],
    capnHook: [5, 2, 1, 4, 4, 3, 5, 4, 3],
    charlotteDeBerry: [3, 5, 3, 3, 2, 8, 4, 6, 3],
    edwardTeach: [2, 4, 3, 3, 4, 3, 5, 7, 5],
    francisLOnnonais: [2, 3, 4, 3, 4, 3, 5, 5, 4],
    henryMorgan: [4, 3, 2, 3, 4, 4, 7, 5, 5],
    laurensDeGraff: [3, 3, 3, 4, 3, 4, 6, 6, 5],
    longJohnSilver: [2, 4, 5, 3, 2, 3, 7, 2, 3],
    maryRead: [3, 2, 3, 5, 3, 6, 4, 7, 3],
    nickolaasVanHoorn: [3, 3, 3, 3, 4, 2, 3, 6, 2],
    rockBrazilliano: [2, 3, 1, 5, 5, 5, 3, 7, 3],
    roseanneWinnefree: [3, 4, 1, 4, 4, 3, 4, 5, 2],
    williamKidd: [3, 4, 3, 3, 3, 2, 2, 7, 5],
  };

  it("matches every published stat line", () => {
    expect(CAPTAINS).toHaveLength(Object.keys(TABLE).length);
    for (const captain of CAPTAINS) {
      const row = TABLE[captain.id];
      expect(row, `${captain.name} is not in the published table`).toBeDefined();
      expect(
        [
          captain.navigation,
          captain.seamanship,
          captain.gunnery,
          captain.marksmanship,
          captain.swordsmanship,
          captain.loyalty,
          captain.leadership,
          captain.courage,
          captain.notoriety,
        ],
        captain.name,
      ).toEqual(row);
    }
  });

  it("keeps Charlotte de Berry the most loyal and Anne Bonny the bravest", () => {
    const mostLoyal = [...CAPTAINS].sort((a, b) => b.loyalty - a.loyalty)[0];
    const bravest = [...CAPTAINS].sort((a, b) => b.courage - a.courage)[0];
    expect(mostLoyal?.name).toBe("Charlotte de Berry");
    expect(bravest?.name).toBe("Anne Bonny");
  });

  it("keeps Long John Silver the best gunner who will not fight", () => {
    expect(SHIP_CLASSES.snow.crew).toBe(3);
    const captain = CAPTAINS.find((c) => c.id === "longJohnSilver");
    expect(captain?.gunnery).toBe(5);
    expect(captain?.courage).toBe(2);
  });
});

describe("the auras are the original's", () => {
  // Published as (strength:radius) in the game's own data.
  const AURAS: [BuildingId, AuraId, number, number][] = [
    ["anarchyDecor", "anarchy", 23, 3],
    ["anarchyShrubs", "anarchy", 11, 2],
    ["animalPit", "anarchy", 23, 2],
    ["brothelSalon", "anarchy", 34, 3],
    ["casino", "anarchy", 46, 4],
    ["cheapEatery", "anarchy", 34, 3],
    ["courtesanSpa", "anarchy", 34, 3],
    ["gamblingDen", "anarchy", 34, 3],
    ["inn", "anarchy", 46, 4],
    ["smugglersDive", "anarchy", 23, 2],
    ["surgery", "anarchy", 46, 4],
    ["tavern", "anarchy", 34, 3],
    ["wenchMasseuse", "anarchy", 23, 2],

    ["apothecary", "order", 47, 4],
    ["hatShop", "order", 59, 4],
    ["hotel", "order", 31, 2],
    ["orderlyShrubs", "order", 12, 2],
    ["stockade", "order", 59, 2],
    ["veryOrderlyDecor", "order", 24, 3],

    ["blackMarket", "fear", 47, 4],
    ["carpenterShop", "fear", 59, 4],
    ["fort", "fear", 47, 4],
    ["gallows", "fear", 47, 4],
    ["graveyard", "fear", 47, 4],
    ["interrogationChamber", "fear", 86, 4],
    ["parrotAviary", "fear", 59, 4],
    ["scaryDecor", "fear", 12, 2],
    ["stockade", "fear", 69, 5],
    ["veryScaryDecor", "fear", 24, 3],
    ["watchTower", "fear", 47, 2],

    ["blacksmithy", "defense", 39, 2],
    ["blastFurnace", "defense", 39, 2],
    ["boatyard", "defense", 39, 2],
    ["cannonFoundry", "defense", 39, 2],
    ["dock", "defense", 35, 2],
    ["fort", "defense", 59, 4],
    ["gunnerySchool", "defense", 35, 3],
    ["gunsmithy", "defense", 39, 2],
    ["marksmanshipSchool", "defense", 35, 3],
    ["navigationSchool", "defense", 35, 3],
    ["observatory", "defense", 59, 4],
    ["protectiveCannon", "defense", 24, 3],
    ["safeHarborAnchor", "defense", 12, 2],
    ["seamanshipSchool", "defense", 35, 3],
    ["shipyard", "defense", 39, 2],
    ["swordsmanshipSchool", "defense", 35, 3],
    ["watchTower", "defense", 47, 2],

    ["fort", "awe", 47, 4],
    ["parrotAviary", "awe", 59, 4],
  ];

  it("emits every published aura at its published strength and radius", () => {
    for (const [id, aura, strength, radius] of AURAS) {
      const emitted = BUILDINGS[id].auras?.find((a) => a.aura === aura);
      expect(emitted, `${id} should emit ${aura}`).toBeDefined();
      expect([emitted?.strength, emitted?.radius], `${id} ${aura}`).toEqual([strength, radius]);
    }
  });

  it("gives awe to nothing but the fort, the aviary and pirate housing", () => {
    // The original was specific about this, and it matters: the way to impress
    // your captives is to let your pirates get rich.
    const emitters = (Object.keys(BUILDINGS) as BuildingId[]).filter((id) =>
      BUILDINGS[id].auras?.some((a) => a.aura === "awe"),
    );
    expect(emitters.sort()).toEqual(["fort", "parrotAviary", "pirateHousing"]);
  });

  it("keeps the interrogation chamber the strongest fear on the island", () => {
    const strongest = (Object.keys(BUILDINGS) as BuildingId[])
      .flatMap((id) => (BUILDINGS[id].auras ?? []).map((a) => ({ id, ...a })))
      .filter((a) => a.aura === "fear")
      .sort((a, b) => b.strength - a.strength)[0];
    expect(strongest?.id).toBe("interrogationChamber");
    expect(strongest?.strength).toBe(86);
  });
});

describe("the buildings are the original's", () => {
  // Footprints published in the game's own data.
  const SIZES: [BuildingId, number, number][] = [
    ["chuckTent", 2, 2],
    ["bunkhouse", 2, 2],
    ["constructionTent", 2, 2],
    ["pirateHousing", 3, 3],
    ["pirateCave", 3, 3],
    ["piratePalace", 9, 6],
    ["blackMarket", 3, 3],
    ["smugglersCove", 4, 3],
    ["timberCamp", 4, 4],
    ["cornFarm", 3, 2],
    ["ironMine", 4, 3],
    ["sawmill", 6, 4],
    ["brewery", 3, 3],
    ["rumDistillery", 6, 5],
    ["cigarFactory", 4, 3],
    ["bakery", 3, 3],
    ["blastFurnace", 5, 4],
    ["blacksmithy", 3, 3],
    ["cannonFoundry", 6, 5],
    ["gunsmithy", 4, 4],
    ["smugglersDive", 3, 2],
    ["cheapEatery", 3, 2],
    ["tavern", 3, 3],
    ["inn", 5, 4],
    ["animalPit", 3, 3],
    ["gamblingDen", 4, 3],
    ["casino", 5, 4],
    ["wenchMasseuse", 2, 2],
    ["brothelSalon", 6, 4],
    ["courtesanSpa", 3, 3],
    ["dock", 5, 4],
    ["boatyard", 5, 5],
    ["shipyard", 9, 6],
    ["seaRationFactory", 4, 4],
    ["church", 6, 3],
    ["stockade", 5, 5],
    ["gallows", 4, 3],
    ["interrogationChamber", 5, 4],
    ["apothecary", 3, 3],
    ["hotel", 6, 6],
    ["gunnerySchool", 6, 3],
    ["marksmanshipSchool", 5, 3],
    ["navigationSchool", 5, 4],
    ["seamanshipSchool", 4, 4],
    ["swordsmanshipSchool", 5, 4],
    ["watchTower", 2, 2],
    ["fort", 9, 6],
    ["observatory", 3, 3],
    ["surgery", 3, 3],
    ["hatShop", 3, 3],
    ["parrotAviary", 3, 2],
    ["graveyard", 3, 2],
  ];

  it("has every published footprint", () => {
    for (const [id, w, h] of SIZES) {
      expect([BUILDINGS[id].w, BUILDINGS[id].h], id).toEqual([w, h]);
    }
  });

  it("has the published costs for the things that cost gold", () => {
    const COSTS: [BuildingId, number, number][] = [
      ["chuckTent", 0, 2],
      ["bunkhouse", 0, 2],
      ["pirateCave", 150, 15],
      ["blackMarket", 100, 20],
      ["smugglersCove", 100, 20],
      ["stockade", 500, 30],
      ["interrogationChamber", 250, 25],
      ["hotel", 500, 50],
      ["inn", 350, 35],
      ["casino", 300, 30],
      ["fort", 1000, 60],
      ["shipyard", 8000, 30],
      ["gunnerySchool", 600, 40],
      ["marksmanshipSchool", 600, 40],
      ["navigationSchool", 600, 40],
      ["seamanshipSchool", 600, 40],
      ["swordsmanshipSchool", 600, 40],
      ["carpenterShop", 100, 20],
      ["hatShop", 100, 20],
      ["parrotAviary", 100, 20],
    ];
    for (const [id, gold, lumber] of COSTS) {
      expect([BUILDINGS[id].gold, BUILDINGS[id].lumber], id).toEqual([gold, lumber]);
    }
  });

  it("keeps the capacities that shape how many you need", () => {
    // A masseuse serving one pirate at a time is why the original's advice was
    // four of them per dive.
    expect(BUILDINGS.wenchMasseuse.serves?.capacity).toBe(1);
    expect(BUILDINGS.courtesanSpa.serves?.capacity).toBe(1);
    expect(BUILDINGS.chuckTent.serves?.capacity).toBe(7);
    expect(BUILDINGS.bunkhouse.serves?.capacity).toBe(5);
    expect(BUILDINGS.stockade.serves?.capacity).toBe(15);
    expect(BUILDINGS.church.serves?.capacity).toBe(9);
    expect(BUILDINGS.inn.serves?.capacity).toBe(12);
    expect(BUILDINGS.brothelSalon.serves?.capacity).toBe(5);
  });

  it("keeps the production chains the original had", () => {
    const chain: [BuildingId, string[], string][] = [
      ["timberCamp", [], "wood"],
      ["sawmill", ["wood"], "lumber"],
      ["cornFarm", [], "corn"],
      ["chuckTent", ["corn"], "slop"],
      ["brewery", ["corn"], "beer"],
      ["seaRationFactory", ["corn"], "seaRations"],
      ["rumDistillery", ["sugarcane"], "rum"],
      ["cigarFactory", ["tobacco"], "cigars"],
      ["bakery", ["bananas", "papayas"], "pastries"],
      ["ironMine", [], "ore"],
      ["blastFurnace", ["ore"], "pigIron"],
      ["blacksmithy", ["pigIron"], "cutlasses"],
      ["cannonFoundry", ["pigIron", "wood"], "cannon"],
      ["gunsmithy", ["pigIron"], "muskets"],
    ];
    for (const [id, inputs, output] of chain) {
      const recipe = BUILDINGS[id].recipe;
      expect(recipe, `${id} should have a recipe`).toBeDefined();
      expect(recipe?.output, id).toBe(output);
      expect(recipe?.inputs.map((i) => i.good).sort(), id).toEqual([...inputs].sort());
    }
  });
});

describe("the prices are the original's", () => {
  it("charges the published Black Market rates", () => {
    expect(GOODS.cannon.buyPrice).toBe(200);
    expect(GOODS.muskets.buyPrice).toBe(75);
    expect(GOODS.cutlasses.buyPrice).toBe(50);
    expect(GOODS.seaRations.buyPrice).toBe(8);
  });

  it("pays the published Smuggler's Cove rates", () => {
    expect(GOODS.cannon.salePrice).toBe(100);
    expect(GOODS.muskets.salePrice).toBe(25);
    expect(GOODS.cutlasses.salePrice).toBe(20);
    expect(GOODS.rum.salePrice).toBe(15);
    expect(GOODS.cigars.salePrice).toBe(15);
    expect(GOODS.pastries.salePrice).toBe(10);
    expect(GOODS.beer.salePrice).toBe(5);
  });

  it("deals in those seven goods and nothing else", () => {
    // You cannot sell a cove full of corn, which is why the weapons chain is
    // the island's export trade.
    const sellable = Object.values(GOODS)
      .filter((g) => g.salePrice > 0)
      .map((g) => g.id)
      .sort();
    expect(sellable).toEqual(
      ["beer", "cannon", "cigars", "cutlasses", "muskets", "pastries", "rum"].sort(),
    );
  });
});

describe("rank and housing are the original's", () => {
  it("has the published earnings thresholds and titles", () => {
    const TABLE: [number, string][] = [
      [0, "Scurvy Dog"],
      [75, "Pirate Lad"],
      [200, "Rogue"],
      [350, "Buccaneer"],
      [550, "Pirate"],
      [800, "Senior Pirate"],
      [1100, "Pirate Champion"],
      [1500, "Pirate Master"],
      [2000, "Pirate Lord"],
    ];
    TABLE.forEach(([earnings, title], i) => {
      expect([RANKS[i]?.earnings, RANKS[i]?.title], title).toEqual([earnings, title]);
    });
  });

  it("has the published awe from each grade of pirate house", () => {
    const AWE = [4, 16, 24, 29, 35, 41, 47, 53, 59];
    const RADIUS = [2, 2, 3, 3, 3, 3, 4, 4, 4];
    AWE.forEach((value, i) => {
      expect([HOUSING_LEVELS[i]?.awe, HOUSING_LEVELS[i]?.aweRadius], `level ${i + 1}`).toEqual([
        value,
        RADIUS[i],
      ]);
    });
  });

  it("has the published anarchy from each grade of pirate house", () => {
    // Rank one throws off none at all; a rank-nine mansion throws off 38.
    const ANARCHY = [0, 3, 7, 11, 15, 19, 23, 26, 38];
    ANARCHY.forEach((value, i) => {
      expect(HOUSING_LEVELS[i]?.anarchy, `level ${i + 1}`).toBe(value);
    });
  });

  it("has the published palace order and defense", () => {
    expect(PALACE_LEVELS.map((l) => l.order)).toEqual([69, 73, 76, 80]);
    expect(PALACE_LEVELS.map((l) => l.defense)).toEqual([27, 39, 51, 63]);
  });
});

describe("the campaign is the original's", () => {
  it("starts and ends every episode on the published dates", () => {
    const DATES: [string, [number, number], [number, number]][] = [
      ["beerForBuccaneers", [1650, 1], [1651, 1]],
      ["pirateIndustry", [1650, 11], [1652, 5]],
      ["raidersOfTheCaribbean", [1652, 1], [1656, 1]],
      ["privateersNotPirates", [1655, 4], [1660, 4]],
      ["jamaicanRum", [1657, 3], [1665, 3]],
      ["diplomacyAndWar", [1663, 4], [1669, 4]],
      ["aTurncoatPirate", [1667, 4], [1677, 4]],
      ["frigatesAndShipbuilding", [1674, 5], [1682, 12]],
      ["aSmugglersCove", [1681, 1], [1689, 12]],
      ["tortuga", [1686, 1], [1699, 12]],
      ["theTreasureFleet", [1692, 1], [1700, 12]],
      ["theJollyRoger", [1699, 1], [1707, 12]],
      ["aNewWar", [1704, 1], [1716, 12]],
      ["pirateDefense", [1710, 1], [1719, 12]],
      ["theLastGoldenAge", [1718, 1], [1729, 12]],
      ["theWarOfJenkinsEar", [1738, 1], [1747, 12]],
    ];
    expect(CAMPAIGN).toHaveLength(DATES.length);
    for (const [id, start, end] of DATES) {
      const scenario = CAMPAIGN.find((s) => s.id === id);
      expect(scenario, id).toBeDefined();
      expect(monthIndex(scenario?.start[0] ?? 0, scenario?.start[1] ?? 1), `${id} start`).toBe(
        monthIndex(start[0], start[1]),
      );
      expect(monthIndex(scenario?.end[0] ?? 0, scenario?.end[1] ?? 1), `${id} end`).toBe(
        monthIndex(end[0], end[1]),
      );
    }
  });

  it("starts the first three episodes with the published purse and lumber", () => {
    const RESOURCES: [string, number, number][] = [
      ["beerForBuccaneers", 250, 17],
      ["pirateIndustry", 500, 8],
      ["raidersOfTheCaribbean", 500, 15],
      ["privateersNotPirates", 3000, 12],
      ["jamaicanRum", 2000, 10],
    ];
    for (const [id, gold, lumber] of RESOURCES) {
      const scenario = CAMPAIGN.find((s) => s.id === id);
      expect(scenario?.resources.treasury, `${id} gold`).toBe(gold);
      expect(scenario?.resources.goods.lumber, `${id} lumber`).toBe(lumber);
    }
  });

  it("has the published gold-medal deadlines", () => {
    const GOLD: [string, number][] = [
      ["beerForBuccaneers", 4],
      ["pirateIndustry", 13],
      ["privateersNotPirates", 24],
      ["tortuga", 120],
      ["theLastGoldenAge", 120],
      ["theWarOfJenkinsEar", 72],
    ];
    for (const [id, months] of GOLD) {
      expect(CAMPAIGN.find((s) => s.id === id)?.gold, id).toBe(months);
    }
  });

  it("keeps Tortuga's rule against French prizes", () => {
    const tortuga = CAMPAIGN.find((s) => s.id === "tortuga");
    expect(tortuga?.restrictions?.[0]?.nation).toBe("france");
    expect(tortuga?.objectives).toContainEqual({ kind: "hoard", amount: 10000 });
    expect(tortuga?.objectives).toContainEqual({ kind: "treasury", amount: 20000 });
  });
});
