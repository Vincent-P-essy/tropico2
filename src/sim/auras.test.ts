import { beforeEach, describe, expect, it } from "vitest";
import { HOUSING_LEVELS, PALACE_LEVELS } from "../data/buildings.ts";
import {
  anarchyAt,
  auraAt,
  auraModifiers,
  auraReadout,
  emissionAt,
  emissionsOf,
  orderAt,
  rawAura,
  rebuildAuras,
} from "./auras.ts";
import { addBuilding, createState, removeBuilding } from "./state.ts";
import type { Building, GameState } from "./types.ts";

/**
 * A flat island under a king whose traits move no aura, so these tests measure
 * the field mechanics rather than the sovereign. The king's multipliers get
 * their own tests further down.
 */
function flatState(): GameState {
  const state = createState({
    seed: 4,
    islandSize: 48,
    king: {
      background: "shipwrightBg",
      qualities: ["charismatic", "expertSeafarer"],
      flaw: "illiterate",
    },
  });
  state.island.terrain.fill(3);
  state.island.elevation.fill(0);
  return state;
}

let state: GameState;
beforeEach(() => {
  state = flatState();
});

describe("emissionAt", () => {
  const building: Building = {
    id: 1,
    def: "tavern",
    x: 10,
    y: 10,
    w: 3,
    h: 3,
    construction: 0,
    constructionTotal: 0,
    workers: [],
    visitors: [],
    stock: {},
    progress: 0,
    priority: "normal",
    level: 0,
    owner: -1,
    openTo: null,
    enabled: true,
  };
  const emission = { aura: "anarchy", strength: 34, radius: 3 } as const;

  it("is at full strength anywhere on the footprint", () => {
    for (let y = 10; y < 13; y++) {
      for (let x = 10; x < 13; x++) expect(emissionAt(building, emission, x, y)).toBe(34);
    }
  });

  it("falls off linearly with distance from the edge", () => {
    expect(emissionAt(building, emission, 13, 11)).toBeCloseTo(34 * (2 / 3));
    expect(emissionAt(building, emission, 14, 11)).toBeCloseTo(34 * (1 / 3));
  });

  it("is zero at and beyond the radius", () => {
    expect(emissionAt(building, emission, 15, 11)).toBe(0);
    expect(emissionAt(building, emission, 30, 11)).toBe(0);
  });

  it("radiates from the whole footprint, not just the centre", () => {
    // A tile one step off the west edge and one off the east edge feel the same.
    expect(emissionAt(building, emission, 9, 11)).toBeCloseTo(
      emissionAt(building, emission, 13, 11),
    );
  });

  it("measures diagonals euclidean", () => {
    expect(emissionAt(building, emission, 13, 13)).toBeCloseTo(34 * (1 - Math.SQRT2 / 3));
  });
});

describe("field accumulation", () => {
  it("starts empty", () => {
    for (const aura of ["anarchy", "order", "fear", "defense", "awe"] as const) {
      expect(state.auras[aura].max()).toBe(0);
    }
  });

  it("writes a building's aura into the field when it is placed", () => {
    addBuilding(state, "tavern", 10, 10, { instant: true });
    expect(rawAura(state, "anarchy", 11, 11)).toBeCloseTo(34);
    expect(rawAura(state, "anarchy", 20, 20)).toBe(0);
  });

  it("removes it again cleanly, leaving no residue", () => {
    const tavern = addBuilding(state, "tavern", 10, 10, { instant: true });
    removeBuilding(state, tavern.id);
    expect(state.auras.anarchy.max()).toBeCloseTo(0);
  });

  it("sums overlapping buildings", () => {
    addBuilding(state, "scaryDecor", 10, 10, { instant: true });
    const single = rawAura(state, "fear", 10, 10);
    addBuilding(state, "scaryDecor", 11, 10, { instant: true });
    expect(rawAura(state, "fear", 10, 10)).toBeGreaterThan(single);
  });

  it("emits nothing while still under construction", () => {
    addBuilding(state, "gallows", 10, 10, { constructionHours: 50 });
    expect(state.auras.fear.max()).toBe(0);
  });

  it("starts emitting once construction finishes", () => {
    const gallows = addBuilding(state, "gallows", 10, 10, { constructionHours: 50 });
    expect(state.auras.fear.max()).toBe(0);
    gallows.construction = 0;
    rebuildAuras(state);
    expect(state.auras.fear.max()).toBeCloseTo(47);
  });

  it("rebuilds to exactly what incremental updates produced", () => {
    addBuilding(state, "tavern", 8, 8, { instant: true });
    addBuilding(state, "stockade", 20, 20, { instant: true });
    addBuilding(state, "gallows", 14, 14, { instant: true });
    const incremental = Array.from(state.auras.fear.data);
    rebuildAuras(state);
    const rebuilt = Array.from(state.auras.fear.data);
    for (let i = 0; i < incremental.length; i++) {
      expect(rebuilt[i]).toBeCloseTo(incremental[i] ?? 0, 4);
    }
  });
});

describe("emissionsOf", () => {
  it("scales pirate housing with its level", () => {
    const plot = addBuilding(state, "pirateHousing", 10, 10, { instant: true });
    const atPlot = emissionsOf(plot);
    plot.level = 8;
    const atMansion = emissionsOf(plot);

    const anarchyOf = (list: readonly { aura: string; strength: number }[]): number =>
      list.find((e) => e.aura === "anarchy")?.strength ?? 0;
    const aweOf = (list: readonly { aura: string; strength: number }[]): number =>
      list.find((e) => e.aura === "awe")?.strength ?? 0;

    expect(anarchyOf(atPlot)).toBe(0);
    expect(anarchyOf(atMansion)).toBe(HOUSING_LEVELS[8]?.anarchy ?? 0);
    expect(aweOf(atMansion)).toBeGreaterThan(aweOf(atPlot));
  });

  it("scales the palace with its level", () => {
    const palace = addBuilding(state, "piratePalace", 10, 10, { instant: true });
    const first = emissionsOf(palace);
    palace.level = 3;
    const last = emissionsOf(palace);
    const orderOf = (list: readonly { aura: string; strength: number }[]): number =>
      list.find((e) => e.aura === "order")?.strength ?? 0;
    expect(orderOf(first)).toBe(PALACE_LEVELS[0]?.order ?? 0);
    expect(orderOf(last)).toBe(PALACE_LEVELS[3]?.order ?? 0);
  });

  it("returns the catalogue entry for everything else", () => {
    const tower = addBuilding(state, "watchTower", 10, 10, { instant: true });
    const auras = emissionsOf(tower).map((e) => e.aura);
    expect(auras).toContain("defense");
    expect(auras).toContain("fear");
  });
});

describe("order against anarchy", () => {
  it("cancels a stockade's order with a nearby tavern", () => {
    // Stockade covers 10..14, tavern 16..18, so the tile between them is one
    // step from each and feels both.
    addBuilding(state, "stockade", 10, 10, { instant: true });
    const alone = orderAt(state, 15, 12);
    expect(alone).toBeGreaterThan(0);

    addBuilding(state, "tavern", 16, 11, { instant: true });
    const contested = orderAt(state, 15, 12);
    expect(contested).toBeLessThan(alone);
    expect(contested).toBeCloseTo(alone - auraAt(state, "anarchy", 15, 12));
  });

  it("wipes out order entirely when the anarchy nearby is stronger", () => {
    addBuilding(state, "orderlyShrubs", 20, 20, { instant: true });
    expect(orderAt(state, 20, 20)).toBeGreaterThan(0);
    addBuilding(state, "anarchyDecor", 21, 20, { instant: true });
    expect(orderAt(state, 20, 20)).toBe(0);
  });

  it("never reports a negative reading", () => {
    addBuilding(state, "tavern", 10, 10, { instant: true });
    expect(orderAt(state, 11, 11)).toBe(0);
    expect(anarchyAt(state, 40, 40)).toBe(0);
  });

  it("reads the same tile oppositely for the two populations", () => {
    addBuilding(state, "tavern", 10, 10, { instant: true });
    expect(anarchyAt(state, 11, 11)).toBeGreaterThan(0);
    expect(orderAt(state, 11, 11)).toBe(0);

    addBuilding(state, "veryOrderlyDecor", 30, 30, { instant: true });
    expect(orderAt(state, 30, 30)).toBeGreaterThan(0);
    expect(anarchyAt(state, 30, 30)).toBe(0);
  });

  it("lets fear work next to a tavern where order cannot", () => {
    // The zoning trick the original rewarded: pirates cannot see fear, so a
    // scary decor holds captives in a district that anarchy has flooded.
    addBuilding(state, "tavern", 10, 10, { instant: true });
    addBuilding(state, "veryScaryDecor", 12, 12, { instant: true });
    expect(orderAt(state, 12, 12)).toBe(0);
    expect(auraAt(state, "fear", 12, 12)).toBeGreaterThan(0);
    expect(anarchyAt(state, 12, 12)).toBeGreaterThan(0);
  });
});

describe("island-wide modifiers", () => {
  it("leaves a neutral king's fields alone", () => {
    state.king = {
      ...state.king,
      background: "shipwrightBg",
      qualities: ["charismatic", "expertSeafarer"],
      flaw: "illiterate",
    };
    const mods = auraModifiers(state);
    expect(mods.multiply.order).toBe(1);
    expect(mods.multiply.anarchy).toBe(1);
  });

  it("raises order a third for an iron-handed king", () => {
    state.king = {
      ...state.king,
      background: "shipwrightBg",
      qualities: ["ironHanded", "charismatic"],
      flaw: "greedy",
    };
    const mods = auraModifiers(state);
    expect(mods.multiply.order).toBeCloseTo(1.33);
    expect(mods.multiply.anarchy).toBeCloseTo(0.67);
  });

  it("does the opposite for a fun-loving king", () => {
    state.king = {
      ...state.king,
      background: "shipwrightBg",
      qualities: ["funLoving", "charismatic"],
      flaw: "greedy",
    };
    const mods = auraModifiers(state);
    expect(mods.multiply.anarchy).toBeCloseTo(1.33);
    expect(mods.multiply.order).toBeCloseTo(0.67);
  });

  it("compounds a background and a quality that agree", () => {
    state.king = {
      ...state.king,
      background: "decayedGentleman",
      qualities: ["ironHanded", "charismatic"],
      flaw: "greedy",
    };
    expect(auraModifiers(state).multiply.order).toBeCloseTo(1.33 * 1.33);
  });

  it("changes what a captive actually feels", () => {
    addBuilding(state, "veryOrderlyDecor", 10, 10, { instant: true });
    state.king = {
      ...state.king,
      background: "shipwrightBg",
      qualities: ["charismatic", "expertSeafarer"],
      flaw: "greedy",
    };
    const neutral = orderAt(state, 10, 10);
    state.king = { ...state.king, qualities: ["ironHanded", "charismatic"] };
    expect(orderAt(state, 10, 10)).toBeGreaterThan(neutral);
  });

  it("buys order with fear under a curfew", () => {
    state.standing.push({ edict: "pirateCurfew", nation: null });
    const mods = auraModifiers(state);
    expect(mods.add.order).toBeGreaterThan(0);
    expect(mods.add.fear).toBeLessThan(0);
  });

  it("raises anarchy and fear together under random executions", () => {
    state.standing.push({ edict: "randomExecutions", nation: null });
    const mods = auraModifiers(state);
    expect(mods.add.anarchy).toBeGreaterThan(0);
    expect(mods.add.fear).toBeGreaterThan(0);
  });

  it("stacks standing edicts", () => {
    state.standing.push({ edict: "guardPatrols", nation: null });
    const one = auraModifiers(state).add.order;
    state.standing.push({ edict: "looseLips", nation: null });
    expect(auraModifiers(state).add.order).toBeGreaterThan(one);
  });
});

describe("auraReadout", () => {
  it("reports every aura plus the two effective readings", () => {
    addBuilding(state, "stockade", 10, 10, { instant: true });
    const readout = auraReadout(state, 11, 11);
    expect(readout.order).toBeGreaterThan(0);
    expect(readout.fear).toBeGreaterThan(0);
    expect(readout.effectiveOrder).toBeGreaterThan(0);
    expect(readout.effectiveAnarchy).toBe(0);
    expect(readout.awe).toBe(0);
  });

  it("agrees with the individual readings", () => {
    addBuilding(state, "fort", 10, 10, { instant: true });
    const readout = auraReadout(state, 12, 12);
    expect(readout.defense).toBeCloseTo(auraAt(state, "defense", 12, 12));
    expect(readout.effectiveOrder).toBeCloseTo(orderAt(state, 12, 12));
  });
});
