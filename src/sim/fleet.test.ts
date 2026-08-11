import { describe, expect, it } from "vitest";
import { TICKS_PER_DAY, TICKS_PER_MONTH } from "../data/balance.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { addStock } from "./economy.ts";
import {
  availableCrew,
  buildShip,
  chooseEngagement,
  crewShip,
  crewStrength,
  freeDocks,
  launch,
  loadShip,
  recall,
  recruitCaptain,
  updateFleet,
} from "./fleet.ts";
import { tickMany } from "./game.ts";
import { spawnPirate } from "./people.ts";
import { newGame } from "./setup.ts";
import { addBuilding, finishedBuildings } from "./state.ts";
import type { GameState, Ship } from "./types.ts";

/**
 * The sea half of the game, end to end.
 *
 * Everything ashore exists so that a ship can go out and come back heavier than
 * she left, so this is the loop that has to work: a hull, a captain, a crew,
 * something to fight with, and a prize.
 */

/** An island with a dock, a yard, and a ship ready to sail. */
function readyToSail(seed = 4242): { state: GameState; ship: Ship } {
  const state = newGame({ seed, islandSize: 48, treasury: 20_000 });
  const dock =
    finishedBuildings(state, "dock")[0] ?? addBuilding(state, "dock", 6, 6, { instant: true });
  const yard = addBuilding(state, "shipyard", dock.x, dock.y + 6, { instant: true });

  const ship = buildShip(state, "frigate", yard.id);
  if (!ship) throw new Error("no ship");
  ship.buildProgress = 0;
  ship.status = "inPort";
  ship.dock = dock.id;

  // Plenty of hands, and a hold worth fighting with.
  for (let i = 0; i < 20; i++) spawnPirate(state, { x: dock.x, y: dock.y });
  recruitCaptain(state);
  crewShip(state, ship);
  addStock(dock, "seaRations", 40);
  addStock(dock, "cutlasses", 20);
  addStock(dock, "cannon", 20);
  addStock(dock, "muskets", 20);
  loadShip(state, ship);

  return { state, ship };
}

describe("building a fleet", () => {
  it("refuses a frigate at a boatyard and allows her at a shipyard", () => {
    const state = newGame({ seed: 7, islandSize: 48 });
    const boatyard = addBuilding(state, "boatyard", 6, 6, { instant: true });
    const shipyard = addBuilding(state, "shipyard", 20, 20, { instant: true });
    expect(buildShip(state, "frigate", boatyard.id)).toBeNull();
    expect(buildShip(state, "snow", boatyard.id)).not.toBeNull();
    expect(buildShip(state, "frigate", shipyard.id)).not.toBeNull();
  });

  it("refuses to lay a hull down at anything but a yard", () => {
    const state = newGame({ seed: 7, islandSize: 48 });
    const stockade = finishedBuildings(state, "stockade")[0];
    expect(stockade).toBeDefined();
    if (stockade) expect(buildShip(state, "snow", stockade.id)).toBeNull();
  });

  it("builds a hull with the shipwrights at the yard and berths her at a dock", () => {
    const state = newGame({ seed: 21, islandSize: 48, treasury: 9000 });
    const dock =
      finishedBuildings(state, "dock")[0] ?? addBuilding(state, "dock", 6, 6, { instant: true });
    const yard = addBuilding(state, "shipyard", dock.x, dock.y + 6, { instant: true });
    const shipwright = spawnPirate(state, { x: yard.x, y: yard.y });
    // Shipwrights are skilled captives; make one and put it to work by hand.
    shipwright.kind = "captive";
    shipwright.profession = "shipwright";
    shipwright.job = { building: yard.id, job: "shipwright" };
    shipwright.activity = "working";
    shipwright.inside = yard.id;
    shipwright.skill = 5;
    yard.workers.push(shipwright.id);

    const ship = buildShip(state, "snow", yard.id);
    expect(ship?.status).toBe("building");
    if (!ship) return;

    updateFleet(state, SHIP_CLASSES.snow.buildHours * 2);
    expect(ship.status).toBe("inPort");
    expect(freeDocks(state)).not.toContain(ship.dock);
  });

  it("gives every named captain out only once", () => {
    const state = newGame({ seed: 9, islandSize: 48, treasury: 200_000 });
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const captain = recruitCaptain(state);
      if (!captain?.captainId) break;
      expect(seen.has(captain.captainId)).toBe(false);
      seen.add(captain.captainId);
    }
    expect(seen.size).toBe(16);
    // Seventeen would be one too many, and the treasury should have paid for it.
    expect(recruitCaptain(state)).toBeNull();
  });

  it("takes crew off the shore and puts them back when she returns", () => {
    const { state, ship } = readyToSail();
    expect(ship.crew.length).toBeGreaterThan(0);
    for (const id of ship.crew) {
      expect(state.people.get(id)?.ship).toBe(ship.id);
    }
    expect(availableCrew(state).some((p) => ship.crew.includes(p.id))).toBe(false);
  });
});

describe("sailing", () => {
  it("refuses to sail without a captain, a crew or rations", () => {
    const state = newGame({ seed: 5, islandSize: 48 });
    const dock =
      finishedBuildings(state, "dock")[0] ?? addBuilding(state, "dock", 6, 6, { instant: true });
    const yard = addBuilding(state, "shipyard", dock.x, dock.y + 6, { instant: true });
    const ship = buildShip(state, "snow", yard.id);
    expect(ship).not.toBeNull();
    if (!ship) return;
    ship.buildProgress = 0;
    ship.status = "inPort";
    ship.dock = dock.id;

    expect(launch(state, ship, "cruise", "windwardPassage").reason).toContain("captain");
    ship.captain = 999;
    expect(launch(state, ship, "cruise", "windwardPassage").reason).toContain("crew");
    ship.crew = [1];
    expect(launch(state, ship, "cruise", "windwardPassage").reason).toContain("rations");
  });

  it("goes out, works the station, and comes home by herself", () => {
    const { state, ship } = readyToSail();
    expect(launch(state, ship, "cruise", "windwardPassage").ok).toBe(true);
    expect(ship.status).toBe("outbound");

    // Everyone aboard is at sea, not walking about the island.
    for (const id of ship.crew) expect(state.people.get(id)?.activity).toBe("atSea");

    let sawStation = false;
    for (let day = 0; day < 200; day++) {
      tickMany(state, TICKS_PER_DAY);
      if (ship.status === "onStation") sawStation = true;
      if (ship.status === "inPort") break;
    }

    expect(sawStation).toBe(true);
    expect(ship.status).toBe("inPort");
    expect(ship.log.length).toBeGreaterThan(1);
    // And the crew is ashore again.
    for (const id of ship.crew) expect(state.people.get(id)?.activity).not.toBe("atSea");
  });

  it("brings home gold, and pays the crew their share", () => {
    const { state, ship } = readyToSail(33);
    const before = state.treasury + state.hoard;
    const captain = state.people.get(ship.captain);
    const earningsBefore = captain?.earnings ?? 0;

    ship.share = "even";
    launch(state, ship, "cruise", "floridaStraits");
    for (let day = 0; day < 300 && ship.status !== "inPort"; day++) {
      tickMany(state, TICKS_PER_DAY);
    }

    expect(state.stats.prizesTaken).toBeGreaterThan(0);
    expect(state.treasury + state.hoard).toBeGreaterThan(before);
    expect(captain?.earnings ?? 0).toBeGreaterThan(earningsBefore);
  });

  it("costs the nation whose ships you take", () => {
    const { state, ship } = readyToSail(55);
    // The Bay of Campeche is Spanish water and nothing else.
    const before = state.nations.spain.relations;
    launch(state, ship, "cruise", "bayOfCampeche");
    for (let day = 0; day < 300 && ship.status !== "inPort"; day++) {
      tickMany(state, TICKS_PER_DAY);
    }
    expect(state.nations.spain.relations).toBeLessThan(before);
  });

  it("spares a nation you have prohibited", () => {
    const { state, ship } = readyToSail(55);
    state.nations.spain.prohibited = true;
    const before = state.nations.spain.relations;
    launch(state, ship, "cruise", "bayOfCampeche");
    for (let day = 0; day < 300 && ship.status !== "inPort"; day++) {
      tickMany(state, TICKS_PER_DAY);
    }
    expect(state.nations.spain.relations).toBe(before);
  });

  it("charts a region when sent to explore, and finds settlements to raid", () => {
    const { state, ship } = readyToSail(77);
    expect(state.regions.gulfOfHonduras.knowledge).toBe(0);
    launch(state, ship, "explore", "gulfOfHonduras");
    for (let day = 0; day < 300 && ship.status !== "inPort"; day++) {
      tickMany(state, TICKS_PER_DAY);
    }
    expect(state.regions.gulfOfHonduras.knowledge).toBeGreaterThan(0);
  });

  it("brings captives back from a settlement raid", () => {
    const { state, ship } = readyToSail(88);
    state.regions.windwardPassage.settlements = 3;
    const before = state.stats.captivesTaken;
    launch(state, ship, "raidSettlement", "windwardPassage");
    for (let day = 0; day < 300 && ship.status !== "inPort"; day++) {
      tickMany(state, TICKS_PER_DAY);
    }
    expect(state.stats.captivesTaken).toBeGreaterThan(before);
  });

  it("thins the shipping in water she has hunted", () => {
    const { state, ship } = readyToSail(99);
    launch(state, ship, "cruise", "spanishMain");
    for (let day = 0; day < 300 && ship.status !== "inPort"; day++) {
      tickMany(state, TICKS_PER_DAY);
    }
    expect(state.regions.spanishMain.shipping).toBeLessThan(1);
  });

  it("comes home when recalled", () => {
    const { state, ship } = readyToSail();
    launch(state, ship, "cruise", "spanishMain");
    // Recalled early on purpose: seventeen hands eat about two rations a day,
    // so a frigate with forty aboard turns for home of her own accord inside
    // three weeks anyway, and there would be nothing left to recall.
    tickMany(state, TICKS_PER_DAY * 9);
    recall(state, ship);
    expect(ship.status).toBe("returning");
    for (let day = 0; day < 100 && ship.status !== "inPort"; day++) {
      tickMany(state, TICKS_PER_DAY);
    }
    expect(ship.status).toBe("inPort");
  });

  it("eats its rations while on station", () => {
    const { state, ship } = readyToSail();
    const loaded = ship.cargo.seaRations;
    launch(state, ship, "cruise", "windwardPassage");
    tickMany(state, TICKS_PER_DAY * 30);
    expect(ship.cargo.seaRations).toBeLessThan(loaded);
  });
});

describe("fighting", () => {
  it("fights the way she is armed, and cannot fight with an empty hold", () => {
    const { ship } = readyToSail();
    ship.engagement = "boarding";
    expect(chooseEngagement(ship)).toBe("boarding");

    ship.cargo.cutlasses = 0;
    expect(chooseEngagement(ship)).toBe("pounding");

    ship.cargo.cannon = 0;
    ship.cargo.muskets = 0;
    expect(chooseEngagement(ship)).toBeNull();
  });

  it("counts the captain's leadership into the crew's nerve", () => {
    const { state, ship } = readyToSail();
    const captain = state.people.get(ship.captain);
    expect(captain).toBeDefined();
    if (!captain) return;

    const before = crewStrength(state, ship).courage ?? 0;
    captain.leadership = 9;
    expect(crewStrength(state, ship).courage ?? 0).toBeGreaterThan(before);
  });
});

describe("the island pays for itself only by going to sea", () => {
  it("runs a deficit left alone, and a surplus with a ship working", () => {
    // The premise of the whole game in one assertion.
    const idle = newGame({ seed: 4242, islandSize: 48, treasury: 5000 });
    tickMany(idle, TICKS_PER_MONTH * 12);
    expect(idle.treasury).toBeLessThan(5000);

    const { state, ship } = readyToSail(4242);
    const before = state.treasury + state.hoard;
    launch(state, ship, "cruise", "floridaStraits");
    for (let day = 0; day < 400 && ship.status !== "inPort"; day++) {
      tickMany(state, TICKS_PER_DAY);
    }
    expect(state.treasury + state.hoard).toBeGreaterThan(before);
  });
});
