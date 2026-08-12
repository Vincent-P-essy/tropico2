import { describe, expect, it } from "vitest";
import { TICKS_PER_MONTH } from "../data/balance.ts";
import { CAMPAIGN } from "../data/scenarios.ts";
import { evaluateScenario } from "./objectives.ts";
import { tickMany } from "./game.ts";
import { startScenario } from "./setup.ts";
import { finishedBuildings } from "./state.ts";

describe("the campaign", () => {
  it("starts every episode with none of its objectives already met", () => {
    // Otherwise an episode hands the player half its goals before the clock
    // starts: the standard opening settlement includes a smuggler's dive, and
    // the first episode asks you to build one.
    for (const scenario of CAMPAIGN) {
      const state = startScenario(scenario, 1650);
      const progress = evaluateScenario(state, scenario);
      expect(
        progress.every((p) => p.done),
        `${scenario.name} begins already complete`,
      ).toBe(false);

      for (const objective of scenario.objectives) {
        if (objective.kind !== "build") continue;
        expect(
          finishedBuildings(state, objective.building).length,
          `${scenario.name} starts with the ${objective.building} it asks for`,
        ).toBe(0);
      }
    }
  });

  it("gives each episode the ships it says it starts with", () => {
    for (const scenario of CAMPAIGN) {
      const state = startScenario(scenario, 1650);
      expect(state.ships.size, `${scenario.name} fleet`).toBe(scenario.resources.ships.length);
    }
  });

  it("starts on the right date with the right purse", () => {
    for (const scenario of CAMPAIGN) {
      const state = startScenario(scenario, 1650);
      expect(state.startMonth).toBe(scenario.start[0] * 12 + (scenario.start[1] - 1));
      expect(state.treasury).toBe(scenario.resources.treasury);
      expect(state.hoard).toBe(scenario.resources.hoard);
      expect(state.scenario?.id).toBe(scenario.id);
    }
  });

  it("ends an episode when its clock runs out", () => {
    const scenario = CAMPAIGN[0];
    expect(scenario).toBeDefined();
    if (!scenario) return;
    const state = startScenario(scenario, 1650);
    // The clock is what is under test, so nothing else may end the run first:
    // an episode this long can lose its captives to a rebellion on the way and
    // then the assertion is about the wrong ending entirely.
    for (const person of state.people.values()) person.mood = 90;
    for (let month = 0; month < 14; month++) {
      tickMany(state, TICKS_PER_MONTH);
      for (const person of state.people.values()) {
        if (person.activity !== "dead") person.mood = 90;
      }
    }
    expect(state.status).toBe("lost");
    expect(state.ending).toContain("time ran out");
  });

  it("wins and awards a medal when the objectives are met", () => {
    const scenario = CAMPAIGN[4];
    expect(scenario).toBeDefined();
    if (!scenario) return;
    const state = startScenario(scenario, 1650);
    // Jamaican Rum asks only for a hoard, so it can be satisfied directly.
    state.hoard = 99_999;
    tickMany(state, TICKS_PER_MONTH + 1);
    expect(state.status).toBe("won");
    expect(state.medal).toBe("gold");
  });
});
