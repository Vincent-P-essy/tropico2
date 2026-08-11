import { describe, expect, it } from "vitest";
import { TICKS_PER_MONTH } from "../data/balance.ts";
import { CAMPAIGN } from "../data/scenarios.ts";
import { auraReadout } from "./auras.ts";
import { buildShip } from "./fleet.ts";
import { population, tickMany } from "./game.ts";
import { generateIsland } from "./island.ts";
import {
  deleteSlot,
  describeSlot,
  deserialize,
  listSlots,
  loadFromSlot,
  saveToSlot,
  serialize,
} from "./save.ts";
import { newGame, startScenario } from "./setup.ts";
import { addBuilding, createState, finishedBuildings, notify } from "./state.ts";
import type { GameState } from "./types.ts";

function played(seed = 4242, months = 4): GameState {
  const state = newGame({ seed, islandSize: 48 });
  tickMany(state, TICKS_PER_MONTH * months);
  return state;
}

describe("save and load", () => {
  it("round-trips a played island", () => {
    const before = played();
    const after = deserialize(serialize(before));

    expect(after.tick).toBe(before.tick);
    expect(after.treasury).toBeCloseTo(before.treasury, 3);
    expect(after.hoard).toBeCloseTo(before.hoard, 3);
    expect(after.lumber).toBeCloseTo(before.lumber, 3);
    expect(after.buildings.size).toBe(before.buildings.size);
    expect(after.people.size).toBe(before.people.size);
    expect(population(after)).toEqual(population(before));
  });

  it("restores the island from its seed, not from the file", () => {
    const before = played();
    const after = deserialize(serialize(before));
    expect(after.island.seed).toBe(before.island.seed);
    expect(after.island.width).toBe(before.island.width);
    expect(Array.from(after.island.ore.data)).toEqual(Array.from(before.island.ore.data));
  });

  it("keeps the forest that was cut down", () => {
    const before = played(4242, 8);
    const after = deserialize(serialize(before));
    // Field values are rounded to three decimals to keep saves small, so this
    // compares within that tolerance rather than bit for bit.
    const cutBack = Array.from(before.island.forest.data);
    const restored = Array.from(after.island.forest.data);
    expect(restored).toHaveLength(cutBack.length);
    for (let i = 0; i < cutBack.length; i++) {
      expect(restored[i]).toBeCloseTo(cutBack[i] ?? 0, 2);
    }
    // And it really is a cut-down forest, not the pristine one.
    const pristine = generateIsland({ seed: 4242, size: 48 });
    expect(restored.reduce((a, b) => a + b, 0)).toBeLessThan(
      Array.from(pristine.forest.data).reduce((a, b) => a + b, 0),
    );
  });

  it("rebuilds the aura fields rather than trusting the file", () => {
    const before = played();
    const stockade = finishedBuildings(before, "stockade")[0];
    expect(stockade).toBeDefined();
    if (!stockade) return;

    const after = deserialize(serialize(before));
    const one = auraReadout(before, stockade.x + 1, stockade.y + 1);
    const two = auraReadout(after, stockade.x + 1, stockade.y + 1);
    expect(two.fear).toBeCloseTo(one.fear, 3);
    expect(two.effectiveOrder).toBeCloseTo(one.effectiveOrder, 3);
  });

  it("restores which tile each building occupies", () => {
    const before = played();
    const after = deserialize(serialize(before));
    for (const building of before.buildings.values()) {
      expect(after.occupancy.get(building.x, building.y)).toBe(building.id);
    }
  });

  it("restores the roads", () => {
    const before = played();
    const after = deserialize(serialize(before));
    expect(Array.from(after.roads.data)).toEqual(Array.from(before.roads.data));
  });

  it("continues identically after loading", () => {
    const before = played();
    const after = deserialize(serialize(before));

    tickMany(before, TICKS_PER_MONTH * 3);
    tickMany(after, TICKS_PER_MONTH * 3);

    expect(after.lumber).toBeCloseTo(before.lumber, 4);
    expect(after.treasury).toBeCloseTo(before.treasury, 4);
    expect(population(after)).toEqual(population(before));
    const positions = (state: GameState): string[] =>
      [...state.people.values()].map((p) => `${p.id}:${p.x.toFixed(4)}:${p.y.toFixed(4)}`);
    expect(positions(after)).toEqual(positions(before));
  });

  it("carries a voyage across a save, prisoners and all", () => {
    const state = newGame({ seed: 33, islandSize: 48 });
    const dock =
      finishedBuildings(state, "dock")[0] ?? addBuilding(state, "dock", 5, 5, { instant: true });
    const yard = addBuilding(state, "boatyard", dock.x, dock.y + 6, { instant: true });
    const ship = buildShip(state, "snow", yard.id);
    expect(ship).not.toBeNull();
    if (!ship) return;

    ship.status = "onStation";
    ship.plunder = 420;
    ship.hold.unskilled = 3;
    ship.hold.skilled = ["distiller"];
    ship.hold.wealthy = ["spain"];

    const after = deserialize(serialize(state));
    const restored = after.ships.get(ship.id);
    expect(restored?.status).toBe("onStation");
    expect(restored?.plunder).toBe(420);
    expect(restored?.hold.unskilled).toBe(3);
    expect(restored?.hold.skilled).toEqual(["distiller"]);
    expect(restored?.hold.wealthy).toEqual(["spain"]);
  });

  it("keeps the standing edicts and the state of diplomacy", () => {
    const state = played();
    state.standing.push({ edict: "pirateCurfew", nation: null });
    state.nations.spain.relations = -42;
    state.nations.england.isPatron = true;
    state.nations.france.knowsLocation = true;

    const after = deserialize(serialize(state));
    expect(after.standing).toEqual([{ edict: "pirateCurfew", nation: null }]);
    expect(after.nations.spain.relations).toBe(-42);
    expect(after.nations.england.isPatron).toBe(true);
    expect(after.nations.france.knowsLocation).toBe(true);
  });

  it("restores the campaign episode by id", () => {
    const scenario = CAMPAIGN[0];
    expect(scenario).toBeDefined();
    if (!scenario) return;
    const state = startScenario(scenario, 7);
    const after = deserialize(serialize(state));
    expect(after.scenario?.id).toBe(scenario.id);
    expect(after.startMonth).toBe(state.startMonth);
  });

  it("refuses a save from another version", () => {
    const text = serialize(played());
    const bumped = text.replace(/"version":\d+/, '"version":99');
    expect(() => deserialize(bumped)).toThrow(/version/);
  });
});

describe("slots", () => {
  /**
   * A localStorage that lives in memory.
   *
   * The simulation tests run in node with no DOM, which is why the slot side of
   * saving went untested for so long — and why nothing noticed that the game
   * could save and never load.
   */
  function withStorage<T>(body: () => T): T {
    const store = new Map<string, string>();
    const shim = {
      get length(): number {
        return store.size;
      },
      key: (i: number): string | null => [...store.keys()][i] ?? null,
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => {
        store.set(k, v);
      },
      removeItem: (k: string): void => {
        store.delete(k);
      },
      clear: (): void => {
        store.clear();
      },
    };
    const global = globalThis as { localStorage?: unknown };
    const had = "localStorage" in global;
    const previous = global.localStorage;
    global.localStorage = shim;
    try {
      return body();
    } finally {
      if (had) global.localStorage = previous;
      else delete global.localStorage;
    }
  }

  it("takes a haven out of a slot and puts it back the same", () => {
    withStorage(() => {
      const state = played();
      expect(saveToSlot(state, "quick")).toBe(true);
      const back = loadFromSlot("quick");
      expect(back).not.toBeNull();
      expect(back?.tick).toBe(state.tick);
      expect(listSlots()).toContain("quick");
      deleteSlot("quick");
      expect(loadFromSlot("quick")).toBeNull();
    });
  });

  it("says what is in a slot without being asked to open it", () => {
    withStorage(() => {
      const state = played();
      saveToSlot(state, "quick");
      const line = describeSlot("quick");
      expect(line).toMatch(/pirates/);
      expect(line).toMatch(/captives/);
      expect(describeSlot("nothing-here")).toBeNull();
    });
  });
});

describe("the log", () => {
  it("folds a thing that keeps happening into one line with a number", () => {
    const state = createState({ seed: 3, islandSize: 24 });
    notify(state, "warning", "Kit is brawling", null, "brawl");
    notify(state, "warning", "Anne is brawling", null, "brawl");
    notify(state, "warning", "Kit is brawling", null, "brawl");

    expect(state.notices).toHaveLength(1);
    expect(state.notices[0]?.count).toBe(3);
    // The line shows whoever swung last, not whoever swung first.
    expect(state.notices[0]?.text).toBe("Kit is brawling");

    // Something else breaks the run, and the brawls do not swallow it.
    notify(state, "bad", "A Spanish squadron is standing in");
    notify(state, "warning", "Kit is brawling", null, "brawl");
    expect(state.notices).toHaveLength(3);
    expect(state.notices[2]?.count).toBe(1);
  });

  it("folds exact repeats even without a topic", () => {
    const state = createState({ seed: 3, islandSize: 24 });
    notify(state, "info", "The sawmill has no lumberjack");
    notify(state, "info", "The sawmill has no lumberjack");
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0]?.count).toBe(2);
  });
});
