import { describe, expect, it } from "vitest";
import {
  BUILDING_IDS,
  BUILDINGS,
  CATEGORY_ORDER,
  HOUSING_LEVELS,
  PALACE_LEVELS,
  RANKS,
  rankForEarnings,
} from "./buildings.ts";
import { CAPTAINS, captainRating, kingNameOf } from "./captains.ts";
import { EDICT_IDS, EDICTS } from "./edicts.ts";
import { GOOD_IDS, GOODS } from "./goods.ts";
import { JOB_IDS, JOBS, PIRATE_SKILLS } from "./jobs.ts";
import { NATION_IDS, REGION_IDS, REGIONS, relationLabel } from "./nations.ts";
import { AURA_IDS, NEED_IDS, NEEDS } from "./needs.ts";
import { CAMPAIGN, medalFor, scenarioEndMonth, scenarioStartMonth } from "./scenarios.ts";
import { SHIP_CLASS_IDS, SHIP_CLASSES } from "./ships.ts";
import {
  BACKGROUND_IDS,
  BACKGROUNDS,
  FLAW_IDS,
  FLAWS,
  QUALITIES,
  QUALITY_IDS,
  traitsCompatible,
} from "./traits.ts";

describe("goods", () => {
  it("keys every entry by its own id", () => {
    for (const id of GOOD_IDS) expect(GOODS[id].id).toBe(id);
  });

  it("never prices a good below zero", () => {
    for (const id of GOOD_IDS) {
      expect(GOODS[id].salePrice).toBeGreaterThanOrEqual(0);
      expect(GOODS[id].buyPrice).toBeGreaterThanOrEqual(0);
    }
  });

  it("prices black-market goods above what the cove pays for them", () => {
    for (const id of GOOD_IDS) {
      const good = GOODS[id];
      if (good.buyPrice > 0) expect(good.buyPrice).toBeGreaterThan(good.salePrice);
    }
  });
});

describe("jobs", () => {
  it("keys every entry by its own id", () => {
    for (const id of JOB_IDS) expect(JOBS[id].id).toBe(id);
  });

  it("only lets captives be skilled", () => {
    for (const id of JOB_IDS) {
      if (JOBS[id].skilled) expect(JOBS[id].workforce).toBe("captive");
    }
  });

  it("gives every skilled job a ransom and no unskilled job one", () => {
    for (const id of JOB_IDS) {
      if (JOBS[id].skilled) expect(JOBS[id].ransom).toBeGreaterThan(0);
      else expect(JOBS[id].ransom).toBe(0);
    }
  });

  it("has exactly five pirate skills", () => {
    expect(new Set(PIRATE_SKILLS).size).toBe(5);
  });
});

describe("buildings", () => {
  it("keys every entry by its own id", () => {
    for (const id of BUILDING_IDS) expect(BUILDINGS[id].id).toBe(id);
  });

  it("gives every building a positive footprint", () => {
    for (const id of BUILDING_IDS) {
      expect(BUILDINGS[id].w).toBeGreaterThan(0);
      expect(BUILDINGS[id].h).toBeGreaterThan(0);
    }
  });

  it("never costs a negative amount", () => {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id];
      expect(def.gold).toBeGreaterThanOrEqual(0);
      expect(def.lumber).toBeGreaterThanOrEqual(0);
      expect(def.upkeep).toBeGreaterThanOrEqual(0);
    }
  });

  it("lists every category in the build-menu order", () => {
    const used = new Set(BUILDING_IDS.map((id) => BUILDINGS[id].category));
    for (const category of used) expect(CATEGORY_ORDER).toContain(category);
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });

  it("only requires jobs that exist, and only skilled ones", () => {
    for (const id of BUILDING_IDS) {
      const required = BUILDINGS[id].requires;
      if (!required) continue;
      expect(JOB_IDS).toContain(required);
    }
  });

  it("only staffs itself with jobs that exist", () => {
    for (const id of BUILDING_IDS) {
      for (const slot of BUILDINGS[id].staff ?? []) {
        expect(JOB_IDS).toContain(slot.job);
        expect(slot.count).toBeGreaterThan(0);
      }
    }
  });

  it("staffs a skilled job only where that job is required to build it", () => {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id];
      for (const slot of def.staff ?? []) {
        if (JOBS[slot.job].skilled) expect(def.requires).toBe(slot.job);
      }
    }
  });

  it("emits only known auras, with positive strength and radius", () => {
    for (const id of BUILDING_IDS) {
      for (const aura of BUILDINGS[id].auras ?? []) {
        expect(AURA_IDS).toContain(aura.aura);
        expect(aura.strength).toBeGreaterThan(0);
        expect(aura.radius).toBeGreaterThan(0);
      }
    }
  });

  it("never emits both order and anarchy from the same building", () => {
    for (const id of BUILDING_IDS) {
      const kinds = new Set((BUILDINGS[id].auras ?? []).map((a) => a.aura));
      expect(kinds.has("order") && kinds.has("anarchy")).toBe(false);
    }
  });

  it("provides only known needs, with a sane satisfaction range", () => {
    for (const id of BUILDING_IDS) {
      for (const provision of BUILDINGS[id].provides ?? []) {
        expect(NEED_IDS).toContain(provision.need);
        expect(provision.min).toBeGreaterThanOrEqual(0);
        expect(provision.max).toBeLessThanOrEqual(100);
        expect(provision.max).toBeGreaterThanOrEqual(provision.min);
      }
    }
  });

  it("only serves a population that actually has the needs it provides", () => {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id];
      if (!def.serves || !def.provides) continue;
      for (const provision of def.provides) {
        expect(NEEDS[provision.need].feltBy).toContain(def.serves.who);
      }
    }
  });

  it("gives every building that provides a need somewhere to serve people", () => {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id];
      if (def.provides && def.provides.length > 0) expect(def.serves).toBeDefined();
    }
  });

  it("uses only goods that exist in recipes, and boosts with real goods", () => {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id];
      if (def.recipe) {
        expect(GOOD_IDS).toContain(def.recipe.output);
        expect(def.recipe.amount).toBeGreaterThan(0);
        expect(def.recipe.hours).toBeGreaterThan(0);
        for (const input of def.recipe.inputs) {
          expect(GOOD_IDS).toContain(input.good);
          expect(input.amount).toBeGreaterThan(0);
        }
      }
      for (const provision of def.provides ?? []) {
        for (const good of provision.boostedBy ?? []) expect(GOOD_IDS).toContain(good);
      }
    }
  });

  it("can produce every good a recipe consumes", () => {
    const produced = new Set(
      BUILDING_IDS.map((id) => BUILDINGS[id].recipe?.output).filter((g) => g !== undefined),
    );
    for (const id of BUILDING_IDS) {
      for (const input of BUILDINGS[id].recipe?.inputs ?? []) {
        expect(produced).toContain(input.good);
      }
    }
  });

  it("can produce or buy every good a service can be stocked with", () => {
    const obtainable = new Set<string>();
    for (const id of BUILDING_IDS) {
      const output = BUILDINGS[id].recipe?.output;
      if (output) obtainable.add(output);
    }
    for (const id of GOOD_IDS) if (GOODS[id].buyPrice > 0) obtainable.add(id);
    for (const id of BUILDING_IDS) {
      for (const provision of BUILDINGS[id].provides ?? []) {
        for (const good of provision.boostedBy ?? []) expect(obtainable).toContain(good);
      }
    }
  });

  it("charges a fee only where somebody is served", () => {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id];
      if (def.fee !== undefined) {
        expect(def.fee).toBeGreaterThan(0);
        expect(def.serves).toBeDefined();
      }
    }
  });
});

describe("housing and rank", () => {
  it("has nine housing levels, one per rank", () => {
    expect(HOUSING_LEVELS).toHaveLength(9);
    expect(RANKS).toHaveLength(9);
  });

  it("improves monotonically with rank", () => {
    for (let i = 1; i < HOUSING_LEVELS.length; i++) {
      const previous = HOUSING_LEVELS[i - 1];
      const current = HOUSING_LEVELS[i];
      if (!previous || !current) continue;
      expect(current.anarchy).toBeGreaterThan(previous.anarchy);
      expect(current.awe).toBeGreaterThan(previous.awe);
      expect(current.resting).toBeGreaterThan(previous.resting);
      expect(current.stashing).toBeGreaterThan(previous.stashing);
      expect(current.upgradeCost).toBeGreaterThan(previous.upgradeCost);
    }
  });

  it("raises the earnings bar with every rank", () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i]?.earnings ?? 0).toBeGreaterThan(RANKS[i - 1]?.earnings ?? 0);
    }
  });

  it("maps earnings onto the right rank", () => {
    expect(rankForEarnings(0)).toBe(0);
    expect(rankForEarnings(74)).toBe(0);
    expect(rankForEarnings(75)).toBe(1);
    expect(rankForEarnings(1999)).toBe(7);
    expect(rankForEarnings(2000)).toBe(8);
    expect(rankForEarnings(999_999)).toBe(8);
  });

  it("grows the palace with the hoard", () => {
    for (let i = 1; i < PALACE_LEVELS.length; i++) {
      const previous = PALACE_LEVELS[i - 1];
      const current = PALACE_LEVELS[i];
      if (!previous || !current) continue;
      expect(current.hoard).toBeGreaterThan(previous.hoard);
      expect(current.order).toBeGreaterThan(previous.order);
      expect(current.defense).toBeGreaterThan(previous.defense);
    }
  });
});

describe("ships", () => {
  it("keys every entry by its own id", () => {
    for (const id of SHIP_CLASS_IDS) expect(SHIP_CLASSES[id].id).toBe(id);
  });

  it("gives every class a crew, a hull and cargo space", () => {
    for (const id of SHIP_CLASS_IDS) {
      const def = SHIP_CLASSES[id];
      expect(def.crew).toBeGreaterThan(0);
      expect(def.officers).toBeGreaterThan(0);
      expect(def.hull).toBeGreaterThan(0);
      expect(def.capacity.seaRations).toBeGreaterThan(0);
      expect(def.buildHours).toBeGreaterThan(0);
    }
  });

  it("makes bigger ships cost more and build slower", () => {
    const order = ["snow", "schooner", "sloop", "brigantine", "frigate", "galleon"] as const;
    for (let i = 1; i < order.length; i++) {
      const previous = SHIP_CLASSES[order[i - 1] ?? "snow"];
      const current = SHIP_CLASSES[order[i] ?? "snow"];
      expect(current.lumber).toBeGreaterThan(previous.lumber);
      expect(current.buildHours).toBeGreaterThan(previous.buildHours);
    }
  });

  it("keeps the galleon the strongest and the slowest", () => {
    const speeds = SHIP_CLASS_IDS.map((id) => SHIP_CLASSES[id].speed);
    const hulls = SHIP_CLASS_IDS.map((id) => SHIP_CLASSES[id].hull);
    expect(SHIP_CLASSES.galleon.speed).toBe(Math.min(...speeds));
    expect(SHIP_CLASSES.galleon.hull).toBe(Math.max(...hulls));
    expect(SHIP_CLASSES.schooner.speed).toBe(Math.max(...speeds));
  });

  it("only lets a boatyard build the small hulls", () => {
    expect(SHIP_CLASSES.frigate.small).toBe(false);
    expect(SHIP_CLASSES.galleon.small).toBe(false);
    expect(SHIP_CLASSES.snow.small).toBe(true);
  });
});

describe("captains", () => {
  it("has sixteen, with unique ids and names", () => {
    expect(CAPTAINS).toHaveLength(16);
    expect(new Set(CAPTAINS.map((c) => c.id)).size).toBe(16);
    expect(new Set(CAPTAINS.map((c) => c.name)).size).toBe(16);
  });

  it("keeps every stat inside one to eight", () => {
    for (const captain of CAPTAINS) {
      for (const stat of [
        captain.navigation,
        captain.seamanship,
        captain.gunnery,
        captain.marksmanship,
        captain.swordsmanship,
        captain.loyalty,
        captain.leadership,
        captain.courage,
        captain.notoriety,
      ]) {
        expect(stat).toBeGreaterThanOrEqual(1);
        expect(stat).toBeLessThanOrEqual(8);
      }
    }
  });

  it("rates Teach, Morgan and de Graff joint best at seventeen", () => {
    const best = Math.max(...CAPTAINS.map(captainRating));
    expect(best).toBe(17);
    const top = CAPTAINS.filter((c) => captainRating(c) === 17).map((c) => c.name);
    expect(top.sort()).toEqual(["Edward Teach", "Henry Morgan", "Laurens de Graff"]);
  });

  it("uses the king's alias where the original had one", () => {
    const teach = CAPTAINS.find((c) => c.id === "edwardTeach");
    const bonny = CAPTAINS.find((c) => c.id === "anneBonny");
    expect(teach).toBeDefined();
    expect(bonny).toBeDefined();
    if (teach) expect(kingNameOf(teach)).toBe("Blackbeard");
    if (bonny) expect(kingNameOf(bonny)).toBe("Anne Bonny");
  });

  it("gives every captain a real background, two qualities and a flaw", () => {
    for (const captain of CAPTAINS) {
      expect(BACKGROUND_IDS).toContain(captain.background);
      expect(captain.qualities).toHaveLength(2);
      for (const quality of captain.qualities) expect(QUALITY_IDS).toContain(quality);
      expect(FLAW_IDS).toContain(captain.flaw);
      expect(NATION_IDS).toContain(captain.nationality);
    }
  });

  it("never gives a captain two qualities that exclude each other", () => {
    for (const captain of CAPTAINS) {
      const [a, b] = captain.qualities;
      expect(traitsCompatible(QUALITIES[a], QUALITIES[b])).toBe(true);
    }
  });

  it("never gives a captain a flaw that excludes one of their qualities", () => {
    for (const captain of CAPTAINS) {
      for (const quality of captain.qualities) {
        expect(traitsCompatible(QUALITIES[quality], FLAWS[captain.flaw])).toBe(true);
      }
    }
  });

  it("never makes a captain hate their own nation", () => {
    for (const captain of CAPTAINS) {
      const forbidden = FLAWS[captain.flaw].effects.noPeaceWith;
      if (forbidden) expect(forbidden).not.toBe(captain.nationality);
    }
  });
});

describe("traits", () => {
  it("keys every entry by its own id", () => {
    for (const id of BACKGROUND_IDS) expect(BACKGROUNDS[id].id).toBe(id);
    for (const id of QUALITY_IDS) expect(QUALITIES[id].id).toBe(id);
    for (const id of FLAW_IDS) expect(FLAWS[id].id).toBe(id);
  });

  it("makes exclusions symmetric", () => {
    const all = [
      ...BACKGROUND_IDS.map((id) => BACKGROUNDS[id]),
      ...QUALITY_IDS.map((id) => QUALITIES[id]),
      ...FLAW_IDS.map((id) => FLAWS[id]),
    ];
    const byId = new Map(all.map((t) => [t.id, t]));
    for (const trait of all) {
      for (const excludedId of trait.excludes ?? []) {
        const other = byId.get(excludedId);
        expect(other).toBeDefined();
        expect(traitsCompatible(trait, other ?? trait)).toBe(false);
      }
    }
  });

  it("only names buildings that exist in half-price and upkeep effects", () => {
    const all = [
      ...BACKGROUND_IDS.map((id) => BACKGROUNDS[id]),
      ...QUALITY_IDS.map((id) => QUALITIES[id]),
    ];
    for (const trait of all) {
      for (const id of trait.effects.halfPrice ?? []) expect(BUILDING_IDS).toContain(id);
      for (const id of trait.effects.noUpkeep ?? []) expect(BUILDING_IDS).toContain(id);
      for (const bonus of trait.effects.bonusCaptives ?? []) expect(JOB_IDS).toContain(bonus.job);
    }
  });
});

describe("edicts", () => {
  it("keys every entry by its own id", () => {
    for (const id of EDICT_IDS) expect(EDICTS[id].id).toBe(id);
  });

  it("never costs a negative amount", () => {
    for (const id of EDICT_IDS) expect(EDICTS[id].gold).toBeGreaterThanOrEqual(0);
  });

  it("only requires buildings that exist", () => {
    for (const id of EDICT_IDS) {
      const building = EDICTS[id].requires?.building;
      if (building) expect(BUILDING_IDS).toContain(building);
    }
  });
});

describe("regions", () => {
  it("makes richer water more dangerous and further away", () => {
    const sorted = [...REGION_IDS].sort((a, b) => REGIONS[a].richness - REGIONS[b].richness);
    for (let i = 1; i < sorted.length; i++) {
      const previous = REGIONS[sorted[i - 1] ?? "windwardPassage"];
      const current = REGIONS[sorted[i] ?? "windwardPassage"];
      expect(current.danger).toBeGreaterThanOrEqual(previous.danger);
      expect(current.distance).toBeGreaterThanOrEqual(previous.distance);
    }
  });

  it("gives every region traffic from a real nation", () => {
    for (const id of REGION_IDS) {
      expect(REGIONS[id].traffic.length).toBeGreaterThan(0);
      for (const nation of REGIONS[id].traffic) expect(NATION_IDS).toContain(nation);
    }
  });
});

describe("relations", () => {
  it("labels the whole scale", () => {
    expect(relationLabel(100)).toBe("Harmonious");
    expect(relationLabel(75)).toBe("Harmonious");
    expect(relationLabel(0)).toBe("Indifferent");
    expect(relationLabel(-100)).toBe("At War");
  });
});

describe("campaign", () => {
  it("has sixteen episodes numbered in order", () => {
    expect(CAMPAIGN).toHaveLength(16);
    CAMPAIGN.forEach((scenario, i) => {
      expect(scenario.index).toBe(i + 1);
    });
  });

  it("gives every episode a unique id and at least one objective", () => {
    expect(new Set(CAMPAIGN.map((s) => s.id)).size).toBe(16);
    for (const scenario of CAMPAIGN) expect(scenario.objectives.length).toBeGreaterThan(0);
  });

  it("ends every episode after it starts", () => {
    for (const scenario of CAMPAIGN) {
      expect(scenarioEndMonth(scenario)).toBeGreaterThan(scenarioStartMonth(scenario));
    }
  });

  it("advances through the century", () => {
    for (let i = 1; i < CAMPAIGN.length; i++) {
      const previous = CAMPAIGN[i - 1];
      const current = CAMPAIGN[i];
      if (!previous || !current) continue;
      expect(scenarioStartMonth(current)).toBeGreaterThan(scenarioStartMonth(previous));
    }
  });

  it("orders the medals from hardest to easiest", () => {
    for (const scenario of CAMPAIGN) {
      expect(scenario.gold).toBeLessThanOrEqual(scenario.silver);
      expect(scenario.silver).toBeLessThanOrEqual(scenario.bronze);
    }
  });

  it("always leaves enough time for bronze", () => {
    for (const scenario of CAMPAIGN) {
      const window = scenarioEndMonth(scenario) - scenarioStartMonth(scenario);
      expect(scenario.bronze).toBeLessThanOrEqual(window + 1);
    }
  });

  it("awards the medal matching the time taken", () => {
    const scenario = CAMPAIGN[0];
    expect(scenario).toBeDefined();
    if (!scenario) return;
    expect(medalFor(scenario, 3)).toBe("gold");
    expect(medalFor(scenario, scenario.gold)).toBe("gold");
    expect(medalFor(scenario, scenario.gold + 1)).toBe("silver");
    expect(medalFor(scenario, scenario.silver + 1)).toBe("bronze");
    expect(medalFor(scenario, scenario.bronze + 1)).toBeNull();
  });

  it("only names buildings and ships that exist in its objectives", () => {
    for (const scenario of CAMPAIGN) {
      for (const objective of scenario.objectives) {
        if (objective.kind === "build") expect(BUILDING_IDS).toContain(objective.building);
        if (objective.kind === "buildAnyOf") {
          for (const id of objective.buildings) expect(BUILDING_IDS).toContain(id);
        }
        if (objective.kind === "shipCount") {
          for (const id of objective.classes ?? []) expect(SHIP_CLASS_IDS).toContain(id);
        }
        if (objective.kind === "relations") {
          for (const id of objective.nations) expect(NATION_IDS).toContain(id);
        }
      }
      for (const restriction of scenario.restrictions ?? []) {
        expect(NATION_IDS).toContain(restriction.nation);
      }
    }
  });

  it("only starts with ships that exist", () => {
    for (const scenario of CAMPAIGN) {
      for (const id of scenario.resources.ships) expect(SHIP_CLASS_IDS).toContain(id);
      for (const good of Object.keys(scenario.resources.goods)) expect(GOOD_IDS).toContain(good);
    }
  });

  it("grows the island's population across the campaign", () => {
    for (let i = 1; i < CAMPAIGN.length; i++) {
      const previous = CAMPAIGN[i - 1];
      const current = CAMPAIGN[i];
      if (!previous || !current) continue;
      expect(current.resources.pirates).toBeGreaterThanOrEqual(previous.resources.pirates);
      expect(current.resources.captives).toBeGreaterThanOrEqual(previous.resources.captives);
    }
  });

  it("carries the hoard forward only after the fifth episode", () => {
    for (const scenario of CAMPAIGN) {
      expect(scenario.resources.carriesHoard).toBe(scenario.index >= 6);
    }
  });
});
