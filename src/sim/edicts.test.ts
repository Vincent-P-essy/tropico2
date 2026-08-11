import { describe, expect, it } from "vitest";
import { BUILDINGS } from "../data/buildings.ts";
import { TICKS_PER_DAY, TICKS_PER_MONTH } from "../data/balance.ts";
import { EDICT_IDS } from "../data/edicts.ts";
import { auraModifiers } from "./auras.ts";
import { addStock, stockOf } from "./economy.ts";
import {
  availableGifts,
  cancel,
  canIssue,
  edictCost,
  gamblingRig,
  isStanding,
  issue,
  palaceGuards,
  teachableSkills,
} from "./edicts.ts";
import { tickMany } from "./game.ts";
import { spawnCaptive, spawnPirate } from "./people.ts";
import { newGame } from "./setup.ts";
import { addBuilding, finishedBuildings } from "./state.ts";
import { buy, buyPrice, sell, sellable } from "./trade.ts";
import type { GameState } from "./types.ts";

function island(seed = 4242, treasury = 50_000): GameState {
  const state = newGame({ seed, islandSize: 48, treasury });
  // The default king is a Decayed Gentleman, who starts on excellent terms with
  // all three powers — which leaves no headroom to test an improvement.
  for (const nation of Object.values(state.nations)) nation.relations = 0;
  return state;
}

/**
 * Puts a finished building on the map wherever there is room for it.
 *
 * Room means the building's own footprint and a tile of margin — not a clear
 * ten-by-ten square, which the opening settlement now fills up completely.
 */
function plant(state: GameState, def: Parameters<typeof addBuilding>[1]): number {
  const { w, h } = BUILDINGS[def];
  for (let y = 2; y < state.island.height - h - 2; y++) {
    for (let x = 2; x < state.island.width - w - 2; x++) {
      let clear = true;
      for (let dy = -1; dy < h + 1 && clear; dy++) {
        for (let dx = -1; dx < w + 1 && clear; dx++) {
          if (state.occupancy.get(x + dx, y + dy) >= 0) clear = false;
          if (state.island.terrain.get(x + dx, y + dy) < 2) clear = false;
        }
      }
      if (clear) return addBuilding(state, def, x, y, { instant: true }).id;
    }
  }
  throw new Error("nowhere to plant");
}

describe("issuing edicts", () => {
  it("refuses everything the treasury cannot pay for", () => {
    const state = island(4242, 0);
    for (const id of EDICT_IDS) {
      if (edictCost(state, id) <= 0) continue;
      expect(canIssue(state, id).reason, id).toContain("gold");
    }
  });

  it("names the building an edict is waiting on", () => {
    const state = island();
    expect(canIssue(state, "freeBeer").reason).toContain("brewery");
    expect(canIssue(state, "raiseDead").reason).toContain("graveyard");
    expect(canIssue(state, "raiseJollyRoger").reason).toContain("fort");
  });

  it("refuses an assassination with nobody at the palace to do it", () => {
    const state = island();
    const victim = spawnPirate(state, { x: 10, y: 10 });
    expect(canIssue(state, "assassinate", { person: victim.id }).reason).toContain("guard");
  });

  it("allows one once a guard is standing at the palace", () => {
    const state = island();
    const palace = state.buildings.get(plant(state, "piratePalace"));
    expect(palace).toBeDefined();
    if (!palace) return;
    const guard = spawnPirate(state, { x: palace.x, y: palace.y });
    guard.job = { building: palace.id, job: "guard" };
    palace.workers.push(guard.id);
    expect(palaceGuards(state)).toHaveLength(1);

    const victim = spawnPirate(state, { x: 10, y: 10 });
    expect(canIssue(state, "assassinate", { person: victim.id }).ok).toBe(true);
    expect(issue(state, "assassinate", { person: victim.id }).ok).toBe(true);
    expect(victim.activity).toBe("dead");
  });

  it("will not have a captain killed", () => {
    const state = island();
    const palace = state.buildings.get(plant(state, "piratePalace"));
    if (!palace) return;
    const guard = spawnPirate(state, { x: palace.x, y: palace.y });
    guard.job = { building: palace.id, job: "guard" };
    palace.workers.push(guard.id);

    const captain = spawnPirate(state, { x: 10, y: 10, captainId: "henryMorgan" });
    expect(canIssue(state, "assassinate", { person: captain.id }).reason).toContain("captain");
  });
});

describe("edicts that act on one person", () => {
  it("presses an unskilled captive into a pirate", () => {
    const state = island();
    const captive = spawnCaptive(state, { x: 12, y: 12 });
    const before = [...state.people.values()].filter(
      (p) => p.kind === "pirate" && p.activity !== "dead",
    ).length;

    expect(issue(state, "pressGang", { person: captive.id }).ok).toBe(true);
    const after = [...state.people.values()].filter(
      (p) => p.kind === "pirate" && p.activity !== "dead",
    ).length;
    expect(after).toBe(before + 1);
    expect(state.people.get(captive.id)).toBeUndefined();
  });

  it("refuses to press a craftsman, who is worth more at his trade", () => {
    const state = island();
    const smith = spawnCaptive(state, { x: 12, y: 12, profession: "gunsmith" });
    expect(canIssue(state, "pressGang", { person: smith.id }).reason).toContain("trade");
  });

  it("ransoms a craftsman for his published price", () => {
    const state = island(4242, 0);
    const smith = spawnCaptive(state, { x: 12, y: 12, profession: "gunsmith" });
    expect(issue(state, "ransomCaptive", { person: smith.id }).ok).toBe(true);
    // A gunsmith's ransom is 550 in the catalogue.
    expect(state.treasury).toBe(550);
    expect(state.people.get(smith.id)).toBeUndefined();
  });

  it("ransoms a wealthy captive for what their stay has made them worth", () => {
    const state = island(4242, 0);
    const guest = spawnCaptive(state, { x: 12, y: 12, wealthy: true });
    guest.ransom = 1234;
    expect(issue(state, "ransomCaptive", { person: guest.id }).ok).toBe(true);
    expect(state.treasury).toBe(1234);
  });

  it("refuses to ransom a captive nobody would pay for", () => {
    const state = island();
    const nobody = spawnCaptive(state, { x: 12, y: 12 });
    expect(canIssue(state, "ransomCaptive", { person: nobody.id }).reason).toContain("worth");
  });

  it("improves relations when a captive is freed", () => {
    const state = island();
    const captive = spawnCaptive(state, { x: 12, y: 12, nationality: "spain" });
    const before = state.nations.spain.relations;
    expect(issue(state, "freeCaptive", { person: captive.id }).ok).toBe(true);
    expect(state.nations.spain.relations).toBeGreaterThan(before);
  });

  it("gives a pirate spending money", () => {
    const state = island();
    const pirate = spawnPirate(state, { x: 12, y: 12 });
    pirate.gold = 0;
    expect(issue(state, "donateMoney", { person: pirate.id }).ok).toBe(true);
    expect(pirate.gold).toBe(100);
  });

  it("teaches a skill, but only where the school stands", () => {
    const state = island();
    const pirate = spawnPirate(state, { x: 12, y: 12 });
    pirate.skills.gunnery = 3;

    expect(teachableSkills(state)).toHaveLength(0);
    expect(canIssue(state, "educatePirate", { person: pirate.id, skill: "gunnery" }).ok).toBe(
      false,
    );

    plant(state, "gunnerySchool");
    expect(teachableSkills(state)).toContain("gunnery");
    expect(issue(state, "educatePirate", { person: pirate.id, skill: "gunnery" }).ok).toBe(true);
    expect(pirate.skills.gunnery).toBe(4);
  });

  it("fits a pirate out with what has actually been made", () => {
    const state = island();
    const pirate = spawnPirate(state, { x: 12, y: 12 });
    const before = pirate.notoriety;

    expect(availableGifts(state)).toHaveLength(0);
    expect(canIssue(state, "outfitPirate", { person: pirate.id, gift: "pegLegs" }).ok).toBe(false);

    const shop = state.buildings.get(plant(state, "carpenterShop"));
    if (!shop) return;
    addStock(shop, "pegLegs", 2);
    expect(availableGifts(state)).toContain("pegLegs");

    expect(issue(state, "outfitPirate", { person: pirate.id, gift: "pegLegs" }).ok).toBe(true);
    expect(pirate.notoriety).toBe(before + 1);
    expect(stockOf(shop, "pegLegs")).toBe(1);
  });
});

describe("edicts that act on the whole island", () => {
  it("pours rum for everybody, and rum beats beer", () => {
    const state = island();
    plant(state, "brewery");
    plant(state, "rumDistillery");
    for (const person of state.people.values()) {
      if (person.kind === "pirate") person.needs.drinking = 5;
    }

    expect(issue(state, "freeBeer").ok).toBe(true);
    const afterBeer = [...state.people.values()]
      .filter((p) => p.kind === "pirate")
      .map((p) => p.needs.drinking);
    for (const value of afterBeer) expect(value).toBeGreaterThan(50);

    for (const person of state.people.values()) {
      if (person.kind === "pirate") person.needs.drinking = 5;
    }
    expect(issue(state, "freeRum").ok).toBe(true);
    const afterRum = [...state.people.values()]
      .filter((p) => p.kind === "pirate")
      .map((p) => p.needs.drinking);
    expect(Math.max(...afterRum)).toBeGreaterThan(Math.max(...afterBeer));
  });

  it("throws a festival that lifts anarchy and then wears off", () => {
    const state = island();
    const before = auraModifiers(state).add.anarchy;
    expect(issue(state, "pirateFestival").ok).toBe(true);

    expect(auraModifiers(state).add.anarchy).toBeGreaterThan(before);
    expect(auraModifiers(state).add.order).toBeLessThan(0);

    tickMany(state, TICKS_PER_DAY * 12);
    expect(state.effects).toHaveLength(0);
    expect(auraModifiers(state).add.anarchy).toBe(before);
  });

  it("hands a nation's pirates over to hang, and they are grateful", () => {
    const state = island();
    for (let i = 0; i < 5; i++) spawnPirate(state, { x: 12, y: 12, nationality: "england" });
    const before = state.nations.england.relations;
    const english = [...state.people.values()].filter(
      (p) => p.kind === "pirate" && p.nationality === "england" && p.activity !== "dead",
    ).length;
    expect(english).toBeGreaterThan(0);

    expect(issue(state, "betrayPirates", { nation: "england" }).ok).toBe(true);
    expect(
      [...state.people.values()].filter(
        (p) => p.kind === "pirate" && p.nationality === "england" && p.activity !== "dead",
      ),
    ).toHaveLength(0);
    expect(state.nations.england.relations).toBeGreaterThan(before);
  });

  it("frees a whole nationality at the cost of the workforce", () => {
    const state = island();
    for (let i = 0; i < 6; i++) spawnCaptive(state, { x: 12, y: 12, nationality: "france" });
    const before = state.nations.france.relations;

    expect(issue(state, "freeAllOfNationality", { nation: "france" }).ok).toBe(true);
    expect(
      [...state.people.values()].filter(
        (p) => p.kind === "captive" && p.nationality === "france" && p.activity !== "dead",
      ),
    ).toHaveLength(0);
    expect(state.nations.france.relations).toBeGreaterThan(before);
  });

  it("raises the dead at a price that climbs each time", () => {
    const state = island();
    plant(state, "graveyard");
    const first = edictCost(state, "raiseDead");
    expect(issue(state, "raiseDead").ok).toBe(true);
    expect(edictCost(state, "raiseDead")).toBe(first + 20);

    const skeletons = [...state.people.values()].filter((p) => p.skeleton);
    expect(skeletons).toHaveLength(1);
    // A skeleton wants nothing at all, which is rather the point of it.
    expect(skeletons[0]?.mood).toBe(100);
  });
});

describe("standing edicts", () => {
  it("comes into force, shows in the aura layer, and lifts again", () => {
    const state = island();
    const before = auraModifiers(state).add.order;

    expect(issue(state, "pirateCurfew").ok).toBe(true);
    expect(isStanding(state, "pirateCurfew")).toBe(true);
    expect(auraModifiers(state).add.order).toBeGreaterThan(before);
    expect(auraModifiers(state).add.fear).toBeLessThan(0);

    expect(cancel(state, "pirateCurfew").ok).toBe(true);
    expect(isStanding(state, "pirateCurfew")).toBe(false);
    expect(auraModifiers(state).add.order).toBe(before);
  });

  it("refuses to issue the same standing edict twice", () => {
    const state = island();
    expect(issue(state, "guardPatrols").ok).toBe(true);
    expect(canIssue(state, "guardPatrols").reason).toContain("Already");
  });

  it("rigs the tables one way or the other", () => {
    const state = island();
    expect(gamblingRig(state)).toEqual({ profit: 1, satisfaction: 1 });

    issue(state, "rigGamblingAgainst");
    expect(gamblingRig(state).profit).toBeGreaterThan(1);
    expect(gamblingRig(state).satisfaction).toBeLessThan(1);

    cancel(state, "rigGamblingAgainst");
    issue(state, "rigGamblingInFavor");
    expect(gamblingRig(state).profit).toBeLessThan(1);
    expect(gamblingRig(state).satisfaction).toBeGreaterThan(1);
  });

  it("spares a nation's shipping when their victims are prohibited", () => {
    const state = island();
    expect(issue(state, "prohibitVictims", { nation: "spain" }).ok).toBe(true);
    expect(isStanding(state, "prohibitVictims", "spain")).toBe(true);
    expect(isStanding(state, "prohibitVictims", "france")).toBe(false);
  });
});

describe("diplomacy by edict", () => {
  it("declares a patron, who then knows where you live", () => {
    const state = island();
    state.nations.france.relations = 90;
    expect(issue(state, "declarePatron", { nation: "france" }).ok).toBe(true);
    expect(state.nations.france.isPatron).toBe(true);
    expect(state.nations.france.knowsLocation).toBe(true);
  });

  it("refuses a patron you do not stand well enough with", () => {
    const state = island();
    state.nations.france.relations = 10;
    expect(canIssue(state, "declarePatron", { nation: "france" }).reason).toContain("75");
  });

  it("refuses peace with a nation that tortured the king", () => {
    const state = newGame({
      seed: 5,
      islandSize: 48,
      treasury: 10_000,
      king: {
        background: "alwaysAPirate",
        qualities: ["battleCraftiness", "expertDuelist"],
        flaw: "torturedBySpain",
      },
    });
    expect(canIssue(state, "announcePeace", { nation: "spain" }).reason).toContain("never");
    expect(canIssue(state, "announcePeace", { nation: "france" }).ok).toBe(true);
  });

  it("opens the cove to one nation, who then know where you live", () => {
    const state = island();
    plant(state, "smugglersCove");
    expect(issue(state, "openSmugglersCove", { nation: "england" }).ok).toBe(true);
    expect(finishedBuildings(state, "smugglersCove")[0]?.openTo).toBe("england");
    expect(state.nations.england.knowsLocation).toBe(true);
    expect(canIssue(state, "openSmugglersCove", { nation: "france" }).reason).toContain("Already");
  });

  it("raises the black flag and cuts every tie at once", () => {
    const state = island();
    state.nations.france.isPatron = true;
    state.nations.england.atPeace = true;
    plant(state, "fort");

    expect(issue(state, "raiseJollyRoger").ok).toBe(true);
    for (const nation of Object.values(state.nations)) {
      expect(nation.isPatron).toBe(false);
      expect(nation.atPeace).toBe(false);
      expect(nation.knowsLocation).toBe(true);
    }
    expect(canIssue(state, "raiseJollyRoger").reason).toContain("already");
  });
});

describe("trade", () => {
  it("sells nothing until the cove is open to somebody", () => {
    const state = island();
    const cove = state.buildings.get(plant(state, "smugglersCove"));
    if (!cove) return;
    addStock(cove, "rum", 10);

    expect(sellable(state)).toHaveLength(0);
    expect(sell(state, "rum", 5).reason).toContain("not open");

    issue(state, "openSmugglersCove", { nation: "england" });
    expect(sellable(state).some((entry) => entry.good === "rum")).toBe(true);
  });

  it("pays the published price and takes the goods away", () => {
    const state = island(4242, 0);
    const cove = state.buildings.get(plant(state, "smugglersCove"));
    if (!cove) return;
    addStock(cove, "rum", 10);
    issue(state, "openSmugglersCove", { nation: "england" });

    expect(sell(state, "rum", 10).ok).toBe(true);
    // Fifteen gold a barrel, and no trader on the counter to improve on it.
    expect(state.treasury + state.hoard).toBeCloseTo(150, 0);
    expect(stockOf(cove, "rum")).toBe(0);
  });

  it("will not sell what nobody abroad wants", () => {
    const state = island();
    const cove = state.buildings.get(plant(state, "smugglersCove"));
    if (!cove) return;
    addStock(cove, "corn", 10);
    issue(state, "openSmugglersCove", { nation: "england" });
    expect(sell(state, "corn", 5).reason).toContain("wants");
  });

  it("buys supplies at the black market and lands them at a dock", () => {
    const state = island();
    plant(state, "blackMarket");
    const dock = finishedBuildings(state, "dock")[0] ?? state.buildings.get(plant(state, "dock"));
    expect(dock).toBeDefined();
    if (!dock) return;

    const before = state.treasury;
    expect(buy(state, "cutlasses", 6).ok).toBe(true);
    expect(stockOf(dock, "cutlasses")).toBeGreaterThan(0);
    expect(state.treasury).toBeLessThan(before);
  });

  it("moves the price against you as you buy, and lets it settle", () => {
    const state = island();
    plant(state, "blackMarket");
    if (finishedBuildings(state, "dock").length === 0) plant(state, "dock");

    const first = buyPrice(state, "cannon");
    buy(state, "cannon", 5);
    const second = buyPrice(state, "cannon");
    expect(second).toBeGreaterThan(first);

    tickMany(state, TICKS_PER_MONTH * 4);
    expect(buyPrice(state, "cannon")).toBeLessThan(second);
  });

  it("refuses to buy anything that is not ship supplies", () => {
    const state = island();
    plant(state, "blackMarket");
    expect(buy(state, "rum", 5).reason).toContain("ship supplies");
  });
});
