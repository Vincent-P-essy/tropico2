import { medalFor, scenarioEndMonth, type Objective, type Scenario } from "../data/scenarios.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { currentMonth, elapsedMonths, endGame, pirateHappiness, population } from "./game.ts";
import { islandDefense } from "./unrest.ts";
import { countBuildings, finishedBuildings } from "./state.ts";
import type { GameState } from "./types.ts";

/**
 * Scoring a campaign episode.
 *
 * Objectives are evaluated continuously rather than at the deadline, so the
 * panel can show progress and the episode ends the moment the last one is met —
 * which is what the medal thresholds are measuring.
 */

export interface ObjectiveProgress {
  readonly label: string;
  readonly done: boolean;
  /** 0-1, for a progress bar. */
  readonly progress: number;
  readonly detail: string;
}

export function evaluateObjective(state: GameState, objective: Objective): ObjectiveProgress {
  switch (objective.kind) {
    case "build": {
      const have = finishedBuildings(state, objective.building).length;
      return bar(
        `Build ${objective.count} × ${objective.building}`,
        have,
        objective.count,
        `${have} of ${objective.count}`,
      );
    }
    case "buildAnyOf": {
      let have = 0;
      for (const id of objective.buildings) have += finishedBuildings(state, id).length;
      return bar(objective.label, have, objective.count, `${have} of ${objective.count}`);
    }
    case "treasury":
      return bar(
        `Treasury of ${objective.amount.toLocaleString()}`,
        state.treasury,
        objective.amount,
        `${Math.floor(state.treasury).toLocaleString()} gold`,
      );
    case "hoard":
      return bar(
        `Hoard of ${objective.amount.toLocaleString()}`,
        state.hoard,
        objective.amount,
        `${Math.floor(state.hoard).toLocaleString()} gold`,
      );
    case "pirateHappiness": {
      const value = pirateHappiness(state);
      return bar(
        `Pirate happiness above ${objective.percent}%`,
        value,
        objective.percent,
        `${value.toFixed(0)}%`,
      );
    }
    case "pirateCount": {
      const value = population(state).pirates;
      return bar(`${objective.count} pirates on the island`, value, objective.count, `${value}`);
    }
    case "captainCount": {
      let value = 0;
      for (const person of state.people.values()) {
        if (person.captainId !== null && person.activity !== "dead") value++;
      }
      return bar(`${objective.count} captains`, value, objective.count, `${value}`);
    }
    case "shipCount": {
      let value = 0;
      for (const ship of state.ships.values()) {
        if (ship.status === "building" || ship.status === "lost") continue;
        if (objective.classes && !objective.classes.includes(ship.cls)) continue;
        value++;
      }
      const label =
        objective.label ??
        `${objective.count} ${objective.classes ? objective.classes.map((c) => SHIP_CLASSES[c].name).join(" or ") : "ships"}`;
      return bar(label, value, objective.count, `${value}`);
    }
    case "relations": {
      let best = -100;
      for (const id of objective.nations) best = Math.max(best, state.nations[id].relations);
      return bar(objective.label, best, objective.value, `best standing ${best.toFixed(0)}`);
    }
    case "patronOrDefense": {
      const patron = Object.values(state.nations).some((n) => n.isPatron);
      const defense = islandDefense(state);
      if (patron)
        return {
          label: "A patron, or a defended island",
          done: true,
          progress: 1,
          detail: "under a patron's protection",
        };
      return bar(
        "A patron, or a defended island",
        defense,
        objective.defense,
        `defense ${defense.toFixed(0)} of ${objective.defense}`,
      );
    }
    case "openCove": {
      const open = finishedBuildings(state, "smugglersCove").some((b) => b.openTo !== null);
      return {
        label: "Open the cove to a nation",
        done: open,
        progress: open ? 1 : 0,
        detail: open ? "trading" : "not yet opened",
      };
    }
  }
}

function bar(label: string, have: number, wanted: number, detail: string): ObjectiveProgress {
  return {
    label,
    done: have >= wanted,
    progress: wanted <= 0 ? 1 : Math.max(0, Math.min(1, have / wanted)),
    detail,
  };
}

export function evaluateScenario(state: GameState, scenario: Scenario): ObjectiveProgress[] {
  return scenario.objectives.map((objective) => evaluateObjective(state, objective));
}

/** True when a standing restriction has been broken. */
export function brokenRestriction(state: GameState, scenario: Scenario): string | null {
  for (const restriction of scenario.restrictions ?? []) {
    const nation = state.nations[restriction.nation];
    // Taking one of their ships resets this counter to zero.
    if (nation.monthsSinceRaid === 0 && state.tick > 0) {
      return `You were told not to plunder ${restriction.nation}`;
    }
  }
  return null;
}

/**
 * Checked every month: has the episode been won, lost, or run out of clock?
 */
export function checkScenario(state: GameState): void {
  const scenario = state.scenario;
  if (!scenario || state.status !== "playing") return;

  const broken = brokenRestriction(state, scenario);
  if (broken) {
    endGame(state, "lost", broken);
    return;
  }

  const progress = evaluateScenario(state, scenario);
  if (progress.every((p) => p.done)) {
    const elapsed = elapsedMonths(state);
    state.medal = medalFor(scenario, elapsed);
    endGame(
      state,
      "won",
      `Every objective met in ${elapsed} months${state.medal ? ` — ${state.medal} medal` : ""}.`,
    );
    return;
  }

  if (currentMonth(state) >= scenarioEndMonth(scenario)) {
    const missed = progress.filter((p) => !p.done).map((p) => p.label);
    endGame(state, "lost", `The time ran out with ${missed.length} objective(s) unmet.`);
  }
}

/** Used by the sandbox almanac: a quick read of how the island is doing. */
export function islandSummary(state: GameState): Record<string, number> {
  const counts = population(state);
  return {
    pirates: counts.pirates,
    captives: counts.captives,
    happiness: pirateHappiness(state),
    treasury: state.treasury,
    hoard: state.hoard,
    lumber: state.lumber,
    ships: [...state.ships.values()].filter((s) => s.status !== "lost").length,
    defense: islandDefense(state),
    docks: countBuildings(state, "dock"),
  };
}
