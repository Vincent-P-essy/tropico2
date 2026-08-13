import { describe, expect, it } from "vitest";
import { chatterFor, topicFor } from "./chatter.ts";
import { newGame } from "../sim/setup.ts";
import type { NationId } from "../data/nations.ts";
import type { Person } from "../sim/types.ts";

/**
 * What people say is a pure function of who they are and what the clock says,
 * which is the whole reason it can be tested at all.
 */

// One island, made once. Building a fresh one per person turned a unit test
// into a two-minute one.
const island = newGame({ seed: 7, islandSize: 32 });
const template = [...island.people.values()][0];
if (!template) throw new Error("nobody on the island");

function someone(over: Partial<Person> = {}): Person {
  return { ...template, ...over } as Person;
}

/**
 * Marks that belong to Spanish and to no other language here.
 *
 * "me" and "no" were on this list once, and both are perfectly good English
 * words — the test failed on "You owe me a drink." and the phrasebook was
 * innocent. Only punctuation, accents and words with no English twin count.
 */
const SPANISH = /[¿¡ñáíóú]|\bque\b|\bcomo\b|\bpara\b|\bmuy\b/i;

describe("what people say", () => {
  it("says it in the language they were born to", () => {
    const lines: Record<NationId, string[]> = { england: [], france: [], spain: [] };

    for (const nationality of ["england", "france", "spain"] as const) {
      for (let id = 1; id < 200; id++) {
        for (let slot = 0; slot < 6; slot++) {
          const line = chatterFor(someone({ id, nationality }), slot * 7 + 1, true);
          if (line) lines[nationality].push(line);
        }
      }
    }

    expect(lines.england.length).toBeGreaterThan(20);
    expect(lines.france.length).toBeGreaterThan(20);
    expect(lines.spain.length).toBeGreaterThan(20);

    // Nothing foreign in an Englishman's mouth. Exact, and it catches a line
    // filed under the wrong flag.
    for (const line of lines.england) {
      expect(line, `English said: ${line}`).not.toMatch(SPANISH);
      expect(line, `English said: ${line}`).not.toMatch(/[éèêàçûôîñáíóú¿¡]/);
    }

    /*
     * And no two nations share a sentence.
     *
     * This is the property that actually matters, and counting how many lines
     * carry an accent is not: "Alors ?" and "Au travail." are unmistakably
     * French and contain nothing a regular expression can see, so a threshold
     * on diacritics measures how short the phrasebook's sentences are rather
     * than what language they are in.
     */
    const english = new Set(lines.england);
    for (const line of [...lines.france, ...lines.spain]) {
      expect(english.has(line), `both English and foreign: ${line}`).toBe(false);
    }
    const french = new Set(lines.france);
    for (const line of lines.spain) {
      expect(french.has(line), `both French and Spanish: ${line}`).toBe(false);
    }

    // The two that have accents at all do use them.
    expect(lines.france.some((l) => /[éèêàçûôî]/.test(l))).toBe(true);
    expect(lines.spain.some((l) => /[¿¡ñáíóú]/.test(l))).toBe(true);
  });

  it("says the same thing at the same moment, every time", () => {
    const person = someone({ id: 42, nationality: "france" });
    for (const time of [1, 8.5, 22, 51.25]) {
      expect(chatterFor(person, time, true)).toBe(chatterFor(person, time, true));
    }
  });

  it("mostly says nothing, because a screen of bubbles hides the game", () => {
    let spoken = 0;
    let asked = 0;
    for (let id = 1; id < 120; id++) {
      for (let step = 0; step < 40; step++) {
        asked++;
        if (chatterFor(someone({ id }), step * 0.9, true)) spoken++;
      }
    }
    const share = spoken / asked;
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.25);
  });

  it("talks about whatever is happening to them", () => {
    expect(topicFor(someone({ activity: "rioting" }), true)).toBe("brawling");
    expect(topicFor(someone({ activity: "fleeing" }), true)).toBe("fleeing");
    expect(topicFor(someone({ starving: 3 }), true)).toBe("hungry");
    expect(topicFor(someone({ carrying: { good: "corn", amount: 4 }, starving: 0 }), true)).toBe(
      "hauling",
    );

    const thirsty = someone({ kind: "pirate", starving: 0, carrying: null });
    thirsty.needs = { ...thirsty.needs, drinking: 5 };
    expect(topicFor(thirsty, true)).toBe("thirsty");
  });

  it("speaks up when there is somebody to speak to", () => {
    let alone = 0;
    let together = 0;
    for (let id = 1; id < 200; id++) {
      for (let slot = 0; slot < 4; slot++) {
        const person = someone({ id, activity: "idle" });
        if (chatterFor(person, slot * 7 + 1, false)) alone++;
        if (chatterFor(person, slot * 7 + 1, true)) together++;
      }
    }
    expect(together).toBeGreaterThan(alone * 2);
  });
});
