import type { Person } from "../sim/types.ts";
import { CAPTIVE_LINES, PIRATE_LINES, type Topic } from "./phrasebook.ts";

export type { Topic };

/**
 * Who speaks, when, and about what.
 *
 * An island where nobody talks is a diorama. The words themselves live next
 * door in the phrasebook; this decides which of them anybody is saying at a
 * given moment.
 *
 * None of it is simulation state: a line is a pure function of who is speaking
 * and what the clock says, so it costs nothing to store, nothing to save, and it
 * cannot drift out of step with the island it describes.
 */

/** How long a line stays up, in seconds of wall clock. */
export const LINE_SECONDS = 3.2;

/** How often somebody might say something, in seconds. */
const SLOT_SECONDS = 7;

/**
 * What this person is talking about.
 *
 * The first version answered only from what was wrong with them, and a playtest
 * heard five complaints for every other kind of sentence — a haven whose people
 * only ever say they are hungry is a workhouse with a flag over it. A starving
 * man does say so, but not every time he opens his mouth: grievances speak
 * first and often, and the rest of the time he talks about the sea, the last
 * prize, whose round it is, and what he saw on a Friday that he did not like.
 */
export function topicFor(person: Person, hasCompany: boolean, salt = 0): Topic {
  if (person.activity === "rioting") return "brawling";
  if (person.activity === "fleeing") return "fleeing";
  if (person.carrying) return "hauling";
  if (person.activity === "working" && salt % 3 === 0) return "working";

  // What is wrong with them, if anything is wrong enough to mention.
  const urgent: Topic[] = [];
  if (person.starving > 1) urgent.push("hungry");
  if (person.kind === "pirate") {
    if (person.needs.feasting < 22) urgent.push("hungry");
    if (person.needs.drinking < 22) urgent.push("thirsty");
    if (person.mood < 22) urgent.push("miserable");
  } else if (person.mood < 35) {
    urgent.push("miserable");
  }

  // Grievances win about half the time when there are any. The rest of the
  // time even a hungry man has something else to say.
  if (urgent.length > 0 && salt % 3 === 0) {
    return urgent[salt % urgent.length] ?? "miserable";
  }

  if (person.kind === "captive") {
    // Spread across the whole of what a captive has to say. Reaching for one
    // topic a third of the time is how "God has forgotten this island" came
    // round eighty-eight times in a single afternoon.
    const talk: Topic[] = [
      "greeting",
      "working",
      "superstition",
      "content",
      "miserable",
      hasCompany ? "greeting" : "content",
    ];
    return talk[salt % talk.length] ?? "greeting";
  }

  // And a pirate at his ease talks like a pirate.
  const idle: Topic[] = [
    "boasting",
    "sea",
    "gold",
    "song",
    "superstition",
    "gambling",
    "wenching",
    "content",
    hasCompany ? "greeting" : "sea",
  ];
  return idle[salt % idle.length] ?? "content";
}

/**
 * The line this person is saying at this moment, or null for silence.
 *
 * Silence is the common case on purpose. Everybody talking at once is a market,
 * not an island, and a screen of bubbles hides the game underneath them.
 *
 * `company` may be a function, and usually should be: whether anybody is near
 * enough to talk to costs a sweep of the island, and the clock and the dice rule
 * out about nine people in ten before the answer is needed.
 */
export function chatterFor(
  person: Person,
  time: number,
  company: boolean | (() => boolean),
): string | null {
  const slot = Math.floor(time / SLOT_SECONDS);

  // The cheap tests first, and the expensive one last.
  if (time - slot * SLOT_SECONDS > LINE_SECONDS) return null;

  // A different person gets their turn in each slot, so the talking moves
  // around the island rather than always coming from the same mouths.
  const roll = hash(person.id, slot) % 1000;
  const loud = person.activity === "rioting" || person.activity === "fleeing";
  if (!loud && roll >= 480) return null;

  const hasCompany = typeof company === "function" ? company() : company;
  // Pirates are the loud ones, and there are three captives to every pirate on
  // a working island — left even, the band is drowned out by its own prisoners
  // and the place sounds like a workhouse rather than a haven.
  const voice = person.kind === "pirate" ? 1.6 : 0.7;
  const chance = (loud ? 0.55 : hasCompany ? 0.3 : 0.08) * voice;
  if (roll >= chance * 1000) return null;

  // A second, independent roll picks the subject, so the same person does not
  // circle the same three sentences all afternoon.
  const salt = hash(person.id, slot + 977) % 997;
  const topic = topicFor(person, hasCompany, salt);
  const book =
    person.kind === "captive" ? (CAPTIVE_LINES[topic] ?? PIRATE_LINES[topic]) : PIRATE_LINES[topic];
  const lines = book[person.nationality];
  return lines[hash(person.id, slot + 7) % lines.length] ?? null;
}

function hash(id: number, slot: number): number {
  let value = (id * 2654435761 + slot * 40503) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 2246822507) >>> 0;
  value ^= value >>> 13;
  return value >>> 0;
}
