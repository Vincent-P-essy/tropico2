import { describe, expect, it } from "vitest";
import { TICKS_PER_DAY, TICKS_PER_MONTH } from "../data/balance.ts";
import { BUILDINGS } from "../data/buildings.ts";
import {
  assignToBuilding,
  autoAssign,
  canWork,
  openSlots,
  release,
  workRate,
} from "./employment.ts";
import { addStock, payUpkeep, produce, stockOf, totalStock } from "./economy.ts";
import {
  captiveResignation,
  elapsedMonths,
  formatDate,
  pirateHappiness,
  population,
  receiveGold,
  tickMany,
} from "./game.ts";
import {
  decayNeeds,
  killPerson,
  moodTarget,
  satisfyNeed,
  spawnCaptive,
  spawnPirate,
} from "./people.ts";
import { diagnose, findService, serviceQuality } from "./services.ts";
import { mainComponent, newGame } from "./setup.ts";
import { addBuilding, canPlace, createState, finishedBuildings, removeBuilding } from "./state.ts";
import { passable } from "./behaviour.ts";
import { checkInvasion } from "./unrest.ts";
import { idx, rectPerimeter } from "../core/grid.ts";
import type { Building, GameState } from "./types.ts";

function flatGame(overrides: Parameters<typeof newGame>[0] = { seed: 11 }): GameState {
  return newGame({ islandSize: 48, ...overrides });
}

/** Finds the first building of a type, for assertions. */
function find(state: GameState, def: Building["def"]): Building | undefined {
  return finishedBuildings(state, def)[0];
}

describe("a new game", () => {
  const state = flatGame({ seed: 1650 });

  it("puts an opening settlement on the map", () => {
    expect(state.buildings.size).toBeGreaterThan(10);
    expect(find(state, "stockade")).toBeDefined();
    expect(find(state, "sawmill")).toBeDefined();
    expect(find(state, "chuckTent")).toBeDefined();
    expect(find(state, "constructionTent")).toBeDefined();
  });

  it("populates it with both kinds of people", () => {
    const counts = population(state);
    expect(counts.pirates).toBeGreaterThan(0);
    expect(counts.captives).toBeGreaterThan(0);
  });

  it("puts everybody on dry land", () => {
    for (const person of state.people.values()) {
      expect(state.island.terrain.get(Math.floor(person.x), Math.floor(person.y))).toBeGreaterThan(
        1,
      );
    }
  });

  it("employs most of the captives straight away", () => {
    const captives = [...state.people.values()].filter((p) => p.kind === "captive");
    const employed = captives.filter((p) => p.job !== null);
    expect(employed.length).toBeGreaterThan(captives.length * 0.4);
  });

  it("never puts two buildings on the same tile", () => {
    const seen = new Map<string, number>();
    for (const building of state.buildings.values()) {
      for (let y = building.y; y < building.y + building.h; y++) {
        for (let x = building.x; x < building.x + building.w; x++) {
          const key = `${x},${y}`;
          expect(seen.has(key)).toBe(false);
          seen.set(key, building.id);
        }
      }
    }
  });

  it("is reproducible from its seed", () => {
    const a = flatGame({ seed: 777 });
    const b = flatGame({ seed: 777 });
    expect(a.buildings.size).toBe(b.buildings.size);
    expect(a.people.size).toBe(b.people.size);
    expect([...a.people.values()].map((p) => p.name)).toEqual(
      [...b.people.values()].map((p) => p.name),
    );
  });
});

describe("the clock", () => {
  it("advances and formats a date", () => {
    const state = createState({ seed: 3, islandSize: 24, startMonth: 1650 * 12 });
    expect(formatDate(state)).toContain("1650");
    tickMany(state, TICKS_PER_MONTH * 13);
    expect(elapsedMonths(state)).toBe(13);
    expect(formatDate(state)).toContain("1651");
  });

  it("does nothing once the game is over", () => {
    const state = flatGame({ seed: 3 });
    state.status = "lost";
    const before = state.tick;
    tickMany(state, 50);
    expect(state.tick).toBe(before);
  });
});

describe("the timber chain", () => {
  it("cuts wood, mills it, and fills the lumber pool", () => {
    const state = flatGame({ seed: 21, lumber: 0 });
    expect(state.lumber).toBe(0);
    tickMany(state, TICKS_PER_DAY * 40);
    expect(state.lumber).toBeGreaterThan(0);
  });

  it("thins the forest around a working camp", () => {
    const state = flatGame({ seed: 21 });
    const camp = find(state, "timberCamp");
    expect(camp).toBeDefined();
    if (!camp) return;
    let before = 0;
    for (let y = camp.y - 3; y < camp.y + 7; y++) {
      for (let x = camp.x - 3; x < camp.x + 7; x++) before += state.island.forest.get(x, y);
    }
    tickMany(state, TICKS_PER_DAY * 60);
    let after = 0;
    for (let y = camp.y - 3; y < camp.y + 7; y++) {
      for (let x = camp.x - 3; x < camp.x + 7; x++) after += state.island.forest.get(x, y);
    }
    expect(after).toBeLessThan(before);
  });

  it("stops a sawmill that has no wood delivered", () => {
    const state = createState({ seed: 5, islandSize: 32 });
    state.island.terrain.fill(3);
    const mill = addBuilding(state, "sawmill", 10, 10, { instant: true });
    const before = state.lumber;
    produce(state, mill, 500);
    expect(state.lumber).toBe(before);
    expect(diagnose(state, mill)).toContain("Short of staff");
  });
});

describe("production", () => {
  function workshop(): { state: GameState; brewery: Building } {
    const state = createState({ seed: 9, islandSize: 32 });
    state.island.terrain.fill(3);
    const brewery = addBuilding(state, "brewery", 10, 10, { instant: true });
    // Staff it by hand so the test controls exactly who is present.
    for (let i = 0; i < 2; i++) {
      const cook = spawnCaptive(state, { x: 10, y: 10 });
      assignToBuilding(state, cook, brewery);
      cook.activity = "working";
      cook.target = brewery.id;
      cook.inside = brewery.id;
    }
    const hauler = spawnCaptive(state, { x: 10, y: 10 });
    assignToBuilding(state, hauler, brewery);
    hauler.activity = "working";
    hauler.target = brewery.id;
    hauler.inside = brewery.id;
    return { state, brewery };
  }

  it("turns inputs into outputs", () => {
    const { state, brewery } = workshop();
    addStock(brewery, "corn", 10);
    produce(state, brewery, 100);
    expect(stockOf(brewery, "beer")).toBeGreaterThan(0);
    expect(stockOf(brewery, "corn")).toBeLessThan(10);
  });

  it("produces nothing without its inputs", () => {
    const { state, brewery } = workshop();
    produce(state, brewery, 200);
    expect(stockOf(brewery, "beer")).toBe(0);
  });

  it("says why it is idle", () => {
    const { state, brewery } = workshop();
    expect(diagnose(state, brewery)).toContain("corn");
  });

  it("stops when its output store is full", () => {
    const { state, brewery } = workshop();
    addStock(brewery, "corn", 999);
    produce(state, brewery, 5000);
    const full = stockOf(brewery, "beer");
    produce(state, brewery, 5000);
    expect(stockOf(brewery, "beer")).toBe(full);
  });

  it("runs faster with an overseer than without", () => {
    // A brewery has no overseer slot; a sawmill does, which is the point of
    // spending a pirate on one.
    const state = createState({ seed: 9, islandSize: 32 });
    state.island.terrain.fill(3);
    const mill = addBuilding(state, "sawmill", 10, 10, { instant: true });
    for (let i = 0; i < 3; i++) {
      const hand = spawnCaptive(state, { x: 10, y: 10 });
      assignToBuilding(state, hand, mill);
      hand.activity = "working";
      hand.target = mill.id;
      hand.inside = mill.id;
    }
    const plain = workRate(state, mill);
    expect(plain).toBeGreaterThan(0);

    const overseer = spawnPirate(state, { x: 10, y: 10 });
    expect(assignToBuilding(state, overseer, mill)).toBe(true);
    overseer.activity = "working";
    overseer.target = mill.id;
    overseer.inside = mill.id;
    expect(workRate(state, mill)).toBeGreaterThan(plain);
  });

  it("runs at zero with nobody present", () => {
    const state = createState({ seed: 9, islandSize: 32 });
    state.island.terrain.fill(3);
    const brewery = addBuilding(state, "brewery", 10, 10, { instant: true });
    expect(workRate(state, brewery)).toBe(0);
  });
});

describe("employment", () => {
  it("refuses a captive a pirate's job and the other way round", () => {
    const state = createState({ seed: 2, islandSize: 24 });
    const captive = spawnCaptive(state, { x: 5, y: 5 });
    const pirate = spawnPirate(state, { x: 5, y: 5 });
    expect(canWork(captive, "overseer")).toBe(false);
    expect(canWork(pirate, "hauler")).toBe(false);
    expect(canWork(pirate, "overseer")).toBe(true);
    expect(canWork(captive, "hauler")).toBe(true);
  });

  it("refuses a skilled job to a captive without the trade", () => {
    const state = createState({ seed: 2, islandSize: 24 });
    const plain = spawnCaptive(state, { x: 5, y: 5 });
    const distiller = spawnCaptive(state, { x: 5, y: 5, profession: "distiller" });
    expect(canWork(plain, "distiller")).toBe(false);
    expect(canWork(distiller, "distiller")).toBe(true);
  });

  it("respects the sex a job requires", () => {
    const state = createState({ seed: 2, islandSize: 24 });
    const man = spawnCaptive(state, { x: 5, y: 5, sex: "male" });
    const woman = spawnCaptive(state, { x: 5, y: 5, sex: "female" });
    expect(canWork(man, "wench")).toBe(false);
    expect(canWork(woman, "wench")).toBe(true);
    expect(canWork(woman, "priest")).toBe(false);
    expect(canWork(man, "priest")).toBe(true);
  });

  it("never employs a wealthy captive", () => {
    const state = createState({ seed: 2, islandSize: 24 });
    const wealthy = spawnCaptive(state, { x: 5, y: 5, wealthy: true });
    expect(canWork(wealthy, "hauler")).toBe(false);
  });

  it("lets a skeleton haul and nothing else", () => {
    const state = createState({ seed: 2, islandSize: 24 });
    const person = spawnCaptive(state, { x: 5, y: 5 });
    person.skeleton = true;
    expect(canWork(person, "hauler")).toBe(true);
    expect(canWork(person, "cook")).toBe(false);
  });

  it("fills high-priority buildings before low ones", () => {
    const state = createState({ seed: 6, islandSize: 32 });
    state.island.terrain.fill(3);
    const low = addBuilding(state, "cornFarm", 4, 4, { instant: true });
    const high = addBuilding(state, "cornFarm", 12, 12, { instant: true });
    low.priority = "low";
    high.priority = "high";
    for (let i = 0; i < 4; i++) spawnCaptive(state, { x: 8, y: 8 });

    autoAssign(state);
    expect(high.workers.length).toBeGreaterThan(low.workers.length);
  });

  it("keeps a manual assignment and reports the slot as filled", () => {
    const state = createState({ seed: 6, islandSize: 32 });
    state.island.terrain.fill(3);
    const farm = addBuilding(state, "cornFarm", 4, 4, { instant: true });
    const captive = spawnCaptive(state, { x: 5, y: 5 });

    expect(assignToBuilding(state, captive, farm)).toBe(true);
    expect(captive.job?.building).toBe(farm.id);
    expect(farm.workers).toContain(captive.id);

    const before = openSlots(state, farm).reduce((n, slot) => n + slot.count, 0);
    autoAssign(state);
    expect(captive.job?.building).toBe(farm.id);
    expect(openSlots(state, farm).reduce((n, slot) => n + slot.count, 0)).toBeLessThanOrEqual(
      before,
    );
  });

  it("releases cleanly, leaving no dangling worker", () => {
    const state = createState({ seed: 6, islandSize: 32 });
    state.island.terrain.fill(3);
    const farm = addBuilding(state, "cornFarm", 4, 4, { instant: true });
    const captive = spawnCaptive(state, { x: 5, y: 5 });
    assignToBuilding(state, captive, farm);
    release(state, captive);
    expect(captive.job).toBeNull();
    expect(farm.workers).not.toContain(captive.id);
  });

  it("never staffs a building still under construction", () => {
    const state = createState({ seed: 6, islandSize: 32 });
    state.island.terrain.fill(3);
    const farm = addBuilding(state, "cornFarm", 4, 4, { constructionHours: 100 });
    spawnCaptive(state, { x: 5, y: 5 });
    autoAssign(state);
    expect(farm.workers).toHaveLength(0);
  });
});

describe("needs and mood", () => {
  it("drains needs over time", () => {
    const state = createState({ seed: 4, islandSize: 24 });
    const person = spawnCaptive(state, { x: 5, y: 5 });
    const before = person.needs.feasting;
    decayNeeds(person, 48);
    expect(person.needs.feasting).toBeLessThan(before);
  });

  it("never drains a need below zero", () => {
    const state = createState({ seed: 4, islandSize: 24 });
    const person = spawnCaptive(state, { x: 5, y: 5 });
    decayNeeds(person, 10_000);
    expect(person.needs.feasting).toBe(0);
  });

  it("leaves a skeleton entirely alone", () => {
    const state = createState({ seed: 4, islandSize: 24 });
    const person = spawnCaptive(state, { x: 5, y: 5 });
    person.skeleton = true;
    const before = { ...person.needs };
    decayNeeds(person, 1000);
    expect(person.needs).toEqual(before);
    expect(moodTarget(state, person).total).toBe(100);
  });

  it("never fills a need past what the building offers", () => {
    const state = createState({ seed: 4, islandSize: 24 });
    const person = spawnCaptive(state, { x: 5, y: 5 });
    person.needs.feasting = 10;
    satisfyNeed(person, "feasting", 50, 1);
    expect(person.needs.feasting).toBe(50);
    satisfyNeed(person, "feasting", 40, 1);
    expect(person.needs.feasting).toBe(50);
  });

  it("scores pirates on anarchy and captives on order", () => {
    const state = createState({ seed: 4, islandSize: 32 });
    state.island.terrain.fill(3);
    const pirate = spawnPirate(state, { x: 10, y: 10 });
    const captive = spawnCaptive(state, { x: 10, y: 10 });
    expect(moodTarget(state, pirate).auras.map((a) => a.aura)).toEqual(["anarchy", "defense"]);
    expect(moodTarget(state, captive).auras.map((a) => a.aura)).toEqual(["order", "fear", "awe"]);
  });

  it("raises a pirate's mood target when a tavern goes up beside him", () => {
    const state = createState({ seed: 4, islandSize: 32 });
    state.island.terrain.fill(3);
    const pirate = spawnPirate(state, { x: 10, y: 10 });
    const before = moodTarget(state, pirate).total;
    addBuilding(state, "anarchyDecor", 10, 11, { instant: true });
    expect(moodTarget(state, pirate).total).toBeGreaterThan(before);
  });

  it("lowers a captive's mood target for the very same building", () => {
    const state = createState({ seed: 4, islandSize: 32 });
    state.island.terrain.fill(3);
    const captive = spawnCaptive(state, { x: 10, y: 10 });
    addBuilding(state, "veryOrderlyDecor", 10, 11, { instant: true });
    const orderly = moodTarget(state, captive).total;
    addBuilding(state, "anarchyDecor", 11, 10, { instant: true });
    expect(moodTarget(state, captive).total).toBeLessThan(orderly);
  });

  it("starves a captive who can never reach food", () => {
    const state = createState({ seed: 4, islandSize: 24 });
    state.island.terrain.fill(3);
    const person = spawnCaptive(state, { x: 5, y: 5 });
    // Hunger drains at nine a day from seventy, then twelve days of starving.
    tickMany(state, TICKS_PER_DAY * 30);
    expect(person.starving).toBeGreaterThan(0);
    tickMany(state, TICKS_PER_DAY * 20);
    expect(person.activity).toBe("dead");
  });
});

describe("services", () => {
  it("rates a stocked tavern above an empty one", () => {
    const state = createState({ seed: 8, islandSize: 32 });
    state.island.terrain.fill(3);
    const tavern = addBuilding(state, "tavern", 10, 10, { instant: true });
    for (let i = 0; i < 3; i++) {
      const server = spawnCaptive(state, { x: 10, y: 10 });
      server.skill = 5;
      assignToBuilding(state, server, tavern);
      server.activity = "working";
      server.target = tavern.id;
      server.inside = tavern.id;
    }
    const provision = { need: "drinking", min: 31, max: 94, boostedBy: ["rum", "beer"] } as const;
    const dry = serviceQuality(state, tavern, provision);
    addStock(tavern, "rum", 5);
    expect(serviceQuality(state, tavern, provision)).toBeGreaterThan(dry);
  });

  it("rates rum above beer", () => {
    const state = createState({ seed: 8, islandSize: 32 });
    state.island.terrain.fill(3);
    const tavern = addBuilding(state, "tavern", 10, 10, { instant: true });
    const server = spawnCaptive(state, { x: 10, y: 10 });
    assignToBuilding(state, server, tavern);
    server.activity = "working";
    server.target = tavern.id;
    const provision = { need: "drinking", min: 31, max: 94, boostedBy: ["rum", "beer"] } as const;

    addStock(tavern, "beer", 5);
    const withBeer = serviceQuality(state, tavern, provision);
    tavern.stock.beer = 0;
    addStock(tavern, "rum", 5);
    expect(serviceQuality(state, tavern, provision)).toBeGreaterThan(withBeer);
  });

  it("sends a thirsty pirate to the tavern and not the chuck tent", () => {
    const state = createState({ seed: 8, islandSize: 32 });
    state.island.terrain.fill(3);
    const tavern = addBuilding(state, "tavern", 12, 10, { instant: true });
    addBuilding(state, "chuckTent", 8, 10, { instant: true });
    const server = spawnCaptive(state, { x: 12, y: 10 });
    assignToBuilding(state, server, tavern);
    server.activity = "working";
    server.target = tavern.id;

    const pirate = spawnPirate(state, { x: 10, y: 10 });
    pirate.needs.drinking = 5;
    expect(findService(state, pirate, "drinking")?.building.id).toBe(tavern.id);
  });

  it("turns a plain captive away from a hotel and lets a wealthy one in", () => {
    const state = createState({ seed: 8, islandSize: 32 });
    state.island.terrain.fill(3);
    addBuilding(state, "hotel", 10, 10, { instant: true });
    const plain = spawnCaptive(state, { x: 8, y: 8 });
    const rich = spawnCaptive(state, { x: 8, y: 8, wealthy: true });
    plain.needs.resting = 5;
    rich.needs.resting = 5;
    expect(findService(state, plain, "resting")).toBeNull();
    expect(findService(state, rich, "resting")?.building.def).toBe("hotel");
  });

  it("refuses a pirate with no house anywhere to stash", () => {
    const state = createState({ seed: 8, islandSize: 32 });
    state.island.terrain.fill(3);
    const pirate = spawnPirate(state, { x: 10, y: 10 });
    pirate.needs.stashing = 0;
    expect(findService(state, pirate, "stashing")).toBeNull();
  });
});

describe("gold", () => {
  it("puts everything in the treasury when there is no cave", () => {
    const state = createState({ seed: 12, islandSize: 24 });
    const before = state.treasury;
    receiveGold(state, 1000);
    expect(state.treasury).toBe(before + 1000);
    expect(state.hoard).toBe(0);
  });

  it("skims a quarter into the hoard once a cave stands", () => {
    const state = createState({ seed: 12, islandSize: 24 });
    state.island.terrain.fill(3);
    addBuilding(state, "pirateCave", 10, 10, { instant: true });
    receiveGold(state, 1000);
    expect(state.hoard).toBeCloseTo(250);
  });

  it("never skims more than a quarter, whatever the rate is set to", () => {
    const state = createState({ seed: 12, islandSize: 24 });
    state.island.terrain.fill(3);
    addBuilding(state, "pirateCave", 10, 10, { instant: true });
    state.stashRate = 0.9;
    receiveGold(state, 1000);
    expect(state.hoard).toBeCloseTo(250);
  });

  it("skims nothing while the cave is still being built", () => {
    const state = createState({ seed: 12, islandSize: 24 });
    state.island.terrain.fill(3);
    addBuilding(state, "pirateCave", 10, 10, { constructionHours: 100 });
    receiveGold(state, 1000);
    expect(state.hoard).toBe(0);
  });
});

describe("placement rules", () => {
  const state = createState({ seed: 15, islandSize: 40 });
  state.island.terrain.fill(3);
  state.island.fertility.fill(0);
  state.lumber = 500;
  state.treasury = 5000;
  addBuilding(state, "road", 10, 9, { instant: true });

  it("allows a legal placement", () => {
    expect(canPlace(state, "bunkhouse", 10, 10).ok).toBe(true);
  });

  it("refuses to overlap an existing building", () => {
    addBuilding(state, "bunkhouse", 10, 10, { instant: true });
    const check = canPlace(state, "bunkhouse", 10, 10);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("already stands");
  });

  it("refuses a building with no road frontage", () => {
    const check = canPlace(state, "bunkhouse", 30, 30);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("road");
  });

  it("refuses a farm on barren ground and names the reason", () => {
    addBuilding(state, "road", 20, 19, { instant: true });
    const check = canPlace(state, "cornFarm", 20, 20);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("soil");
  });

  it("refuses a second unique building", () => {
    addBuilding(state, "road", 15, 14, { instant: true });
    addBuilding(state, "gallows", 15, 15, { instant: true });
    const check = canPlace(state, "gallows", 25, 25);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("Only one");
  });

  it("refuses a building whose craftsman you have not stolen yet", () => {
    const fresh = createState({ seed: 16, islandSize: 40 });
    fresh.island.terrain.fill(3);
    fresh.lumber = 500;
    addBuilding(fresh, "road", 10, 9, { instant: true });
    const check = canPlace(fresh, "cigarFactory", 10, 10);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("tobacconist");
  });

  it("allows it once the craftsman is on the island", () => {
    const fresh = createState({ seed: 16, islandSize: 40 });
    fresh.island.terrain.fill(3);
    fresh.lumber = 500;
    addBuilding(fresh, "road", 10, 9, { instant: true });
    spawnCaptive(fresh, { x: 5, y: 5, profession: "tobacconist" });
    expect(canPlace(fresh, "cigarFactory", 10, 10).ok).toBe(true);
  });

  it("swaps the footprint when a building is turned", () => {
    const fresh = createState({ seed: 18, islandSize: 40 });
    fresh.island.terrain.fill(3);
    fresh.lumber = 500;
    addBuilding(fresh, "road", 10, 9, { instant: true });

    // A sawmill is six by four; turned, it is four by six.
    const upright = addBuilding(fresh, "sawmill", 10, 10, { instant: true });
    expect([upright.w, upright.h]).toEqual([6, 4]);
    const turned = addBuilding(fresh, "sawmill", 20, 20, { instant: true, rotation: 1 });
    expect([turned.w, turned.h]).toEqual([4, 6]);
  });

  it("occupies the turned tiles, not the original ones", () => {
    const fresh = createState({ seed: 18, islandSize: 40 });
    fresh.island.terrain.fill(3);
    const turned = addBuilding(fresh, "sawmill", 10, 10, { instant: true, rotation: 1 });
    // Four wide and six deep: the far corner of the upright footprint is free.
    expect(fresh.occupancy.get(13, 15)).toBe(turned.id);
    expect(fresh.occupancy.get(15, 11)).toBe(-1);
  });

  it("lets a turned building fit a gap the upright one cannot", () => {
    const fresh = createState({ seed: 19, islandSize: 40 });
    fresh.island.terrain.fill(3);
    fresh.lumber = 500;
    addBuilding(fresh, "road", 10, 9, { instant: true });
    // Wall off the ground a six-wide building would need.
    for (let y = 10; y < 18; y++) addBuilding(fresh, "scaryDecor", 15, y, { instant: true });

    expect(canPlace(fresh, "sawmill", 10, 10, 0).ok).toBe(false);
    expect(canPlace(fresh, "sawmill", 10, 10, 1).ok).toBe(true);
  });

  it("refuses what you cannot afford, and says how short you are", () => {
    const fresh = createState({ seed: 17, islandSize: 40 });
    fresh.island.terrain.fill(3);
    fresh.lumber = 1;
    fresh.treasury = 0;
    addBuilding(fresh, "road", 10, 9, { instant: true });
    const check = canPlace(fresh, "stockade", 10, 10);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/lumber|gold/);
  });
});

describe("the powers coming for you", () => {
  // The whole point of relations, forts and the patron edict. Every piece of
  // this existed and nothing ever called it, so three nations could spend a
  // decade at war with the haven without one sail appearing on the horizon.

  /** A haven that England knows the way to and has every reason to burn. */
  function hunted(seed = 5): GameState {
    const state = newGame({ seed, islandSize: 40 });
    state.nations.england.knowsLocation = true;
    state.nations.england.relations = -95;
    return state;
  }

  it("sends a squadron against a haven it can find and hates", () => {
    const state = hunted();
    let seen = false;
    for (let month = 0; month < 60 && !seen; month++) {
      checkInvasion(state);
      seen = state.notices.some((n) => n.text.includes("squadron"));
    }
    expect(seen, "sixty months of open war and nobody sailed").toBe(true);
  });

  it("leaves alone a haven that nobody can find", () => {
    const state = hunted();
    state.nations.england.knowsLocation = false;
    for (let month = 0; month < 60; month++) checkInvasion(state);
    expect(state.notices.some((n) => n.text.includes("squadron"))).toBe(false);
  });

  it("leaves alone a haven under somebody's protection", () => {
    const state = hunted();
    state.nations.france.isPatron = true;
    for (let month = 0; month < 60; month++) checkInvasion(state);
    expect(state.notices.some((n) => n.text.includes("squadron"))).toBe(false);
  });

  it("does not come for a haven that has kept its head down", () => {
    // An ordinary game, played badly but quietly, must never see a sail: the
    // powers only learn the way here through the player's own edicts.
    const state = newGame({ seed: 1650, islandSize: 48 });
    tickMany(state, TICKS_PER_MONTH * 18);
    expect(state.notices.some((n) => n.text.includes("squadron"))).toBe(false);
  });

  it("burns down a haven with nothing at all to defend it", () => {
    const state = hunted(9);
    for (const building of [...state.buildings.values()]) {
      if (BUILDINGS[building.def].auras?.some((a) => a.aura === "defense")) {
        removeBuilding(state, building.id);
      }
    }
    for (const person of [...state.people.values()]) {
      if (person.kind === "pirate") killPerson(state, person, "gone");
    }
    for (let month = 0; month < 200 && state.status === "playing"; month++) checkInvasion(state);
    expect(state.status).toBe("lost");
  });
});

describe("running a whole island", () => {
  it("never strands a building where nobody can reach it", () => {
    // The invariant that keeps an island alive. A building with no reachable
    // door is invisible and merciless: whoever lives or works there has those
    // needs pinned at zero forever, and the island empties over a few years
    // with nothing on screen to explain why.
    for (const seed of [1650, 4242, 909, 21, 55, 77, 33, 8080]) {
      const state = flatGame({ seed });
      // From the island's main walkable area, not from one chosen door: a big
      // building leaves single-tile nooks along its wall, and a flood that
      // starts in one of those measures a world one tile across.
      const reached = mainComponent(state);
      expect(reached, `seed ${seed}: nowhere to walk at all`).not.toBeNull();
      if (!reached) continue;

      for (const building of state.buildings.values()) {
        if (building.def === "road") continue;
        const doors = rectPerimeter(building).filter((p) => passable(state, p.x, p.y));
        const connected = doors.some((p) => reached[idx(state.island, p.x, p.y)] !== -1);
        expect(
          connected,
          `seed ${seed}: ${building.def} at ${building.x},${building.y} is unreachable`,
        ).toBe(true);
      }
    }
  });

  it("gives nearly every pirate a bed", () => {
    // A silent killer: a pirate with no plot has resting and stashing pinned at
    // zero from the first hour, and this once ran at eleven in twelve without a
    // single line in the log to say so. Costs nothing to check — housing is
    // handed out when the island is made, before a tick has been spent.
    for (const seed of [1650, 4242, 909, 21, 55, 77, 33, 8080]) {
      const state = flatGame({ seed });
      const band = [...state.people.values()].filter((p) => p.kind === "pirate");
      const homed = band.filter((p) => p.home >= 0).length;
      expect(homed / band.length, `seed ${seed}: pirates with a plot`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("puts somebody behind every bar", () => {
    // The other silent killer. An unstaffed tavern is a shed, and a band with
    // every tavern shut is miserable in a town that appears to have everything.
    for (const seed of [4242, 33]) {
      const state = flatGame({ seed });
      tickMany(state, TICKS_PER_DAY * 30 * 4);
      const bars = [...state.buildings.values()].filter(
        (b) => BUILDINGS[b.def].provides !== undefined && BUILDINGS[b.def].staff !== undefined,
      );
      const open = bars.filter((b) => b.workers.length > 0).length;
      expect(open / Math.max(1, bars.length), `seed ${seed}: services with staff`).toBeGreaterThan(
        0.7,
      );
    }
  });

  it("keeps both populations alive for a year and a half, unattended", () => {
    // Three seeds rather than eight, and eighteen months rather than twenty-four:
    // enough to catch a collapsing island, cheap enough to run on every commit.
    for (const seed of [4242, 33, 1650]) {
      const state = flatGame({ seed });
      const before = population(state);
      tickMany(state, TICKS_PER_MONTH * 18);
      const after = population(state);

      expect(after.captives, `seed ${seed} captives`).toBeGreaterThan(before.captives * 0.6);
      expect(after.pirates, `seed ${seed} pirates`).toBeGreaterThan(0);
      expect(state.status).toBe("playing");
    }
  });

  it("moves people around rather than leaving them standing still", () => {
    const state = flatGame({ seed: 33 });
    const before = [...state.people.values()].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    tickMany(state, TICKS_PER_DAY * 5);
    const after = [...state.people.values()].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    const moved = before.filter((pos, i) => pos !== after[i]).length;
    expect(moved).toBeGreaterThan(before.length * 0.3);
  });

  it("produces goods without the player touching anything", () => {
    const state = flatGame({ seed: 55, lumber: 0 });
    tickMany(state, TICKS_PER_MONTH * 6);
    expect(totalStock(state, "lumber")).toBeGreaterThan(0);
  });

  it("bills upkeep every month", () => {
    const state = flatGame({ seed: 66, treasury: 5000 });
    // Asserted on the charge itself rather than the balance: a settlement with
    // a busy dive can earn more in fees than it pays in upkeep, and that is a
    // feature, not a missed bill.
    expect(payUpkeep(state)).toBeGreaterThan(0);
    const before = state.treasury;
    payUpkeep(state);
    expect(state.treasury).toBeLessThan(before);
  });

  it("reports happiness and resignation inside their ranges", () => {
    const state = flatGame({ seed: 77 });
    tickMany(state, TICKS_PER_MONTH * 2);
    expect(pirateHappiness(state)).toBeGreaterThanOrEqual(0);
    expect(pirateHappiness(state)).toBeLessThanOrEqual(100);
    expect(captiveResignation(state)).toBeGreaterThanOrEqual(0);
    expect(captiveResignation(state)).toBeLessThanOrEqual(100);
  });

  it("is deterministic over a long run", () => {
    const a = flatGame({ seed: 909 });
    const b = flatGame({ seed: 909 });
    tickMany(a, TICKS_PER_MONTH * 4);
    tickMany(b, TICKS_PER_MONTH * 4);

    expect(a.lumber).toBeCloseTo(b.lumber, 6);
    expect(a.treasury).toBeCloseTo(b.treasury, 6);
    expect(population(a)).toEqual(population(b));
    const positions = (state: GameState): string[] =>
      [...state.people.values()].map(
        (p) => `${p.id}:${p.x.toFixed(4)}:${p.y.toFixed(4)}:${p.activity}`,
      );
    expect(positions(a)).toEqual(positions(b));
  });

  it("keeps every person on a real tile after a long run", () => {
    const state = flatGame({ seed: 4321 });
    tickMany(state, TICKS_PER_MONTH * 8);
    for (const person of state.people.values()) {
      expect(Number.isFinite(person.x)).toBe(true);
      expect(Number.isFinite(person.y)).toBe(true);
      expect(person.x).toBeGreaterThanOrEqual(-1);
      expect(person.y).toBeGreaterThanOrEqual(-1);
      expect(person.x).toBeLessThanOrEqual(state.island.width);
      expect(person.y).toBeLessThanOrEqual(state.island.height);
    }
  });

  it("never leaves a worker listed at a building they do not work at", () => {
    const state = flatGame({ seed: 8080 });
    tickMany(state, TICKS_PER_MONTH * 6);
    for (const building of state.buildings.values()) {
      for (const id of building.workers) {
        const worker = state.people.get(id);
        expect(worker).toBeDefined();
        expect(worker?.job?.building).toBe(building.id);
      }
    }
  });

  it("runs a month of a full island in reasonable time", () => {
    const state = flatGame({ seed: 5150 });
    const started = Date.now();
    tickMany(state, TICKS_PER_MONTH);
    // Generous: this is a correctness guard against an accidental O(n²) per tick,
    // not a benchmark.
    expect(Date.now() - started).toBeLessThan(8000);
  });
});
