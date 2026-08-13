import type { NationId } from "../data/nations.ts";
import type { Person } from "../sim/types.ts";

/**
 * What people say, and when.
 *
 * An island where nobody speaks is a diorama. The figures walked, worked and
 * starved in total silence, and the only way to know what any of them thought
 * was to click on them and read a panel.
 *
 * Everybody talks in the language they were born to — English, French or
 * Spanish, which are the three nations the original deals in — and about
 * whatever is happening to them. A hungry man says he is hungry, in Spanish, if
 * he is Spanish. A pirate at a tavern says something a pirate would say. It is
 * the cheapest possible characterisation and it does more for the place than
 * another building would.
 *
 * None of this is simulation state: a line is a pure function of who is
 * speaking and what the clock says, so it costs nothing to store, nothing to
 * save, and it cannot drift out of step with the island it describes.
 */

/** What a person is currently preoccupied by, which decides what they say. */
export type Topic =
  | "greeting"
  | "hungry"
  | "thirsty"
  | "working"
  | "hauling"
  | "brawling"
  | "fleeing"
  | "miserable"
  | "content";

type Lines = Record<NationId, readonly string[]>;

/**
 * The phrasebook.
 *
 * Short, because a bubble over a sixteen-pixel figure has room for about four
 * words, and idiomatic, because "I am hungry" translated word for word is how
 * you make three nations sound like one.
 */
const PIRATE_LINES: Record<Topic, Lines> = {
  greeting: {
    england: ["Ahoy!", "Well met.", "What cheer?", "Ho there!"],
    france: ["Ohé !", "Salut, frère.", "Alors ?", "Bien le bonjour."],
    spain: ["¡Ahoy!", "¿Qué tal?", "¡Hermano!", "Buenas."],
  },
  hungry: {
    england: ["My belly's empty.", "Not a crumb.", "I could eat a rope."],
    france: ["J'ai le ventre vide.", "Rien à manger.", "Je meurs de faim."],
    spain: ["Tengo hambre.", "Ni una miga.", "Me muero de hambre."],
  },
  thirsty: {
    england: ["Where's the rum?", "A drink, damn it.", "Dry as a bone."],
    france: ["Où est le rhum ?", "À boire !", "J'ai la gorge sèche."],
    spain: ["¿Dónde está el ron?", "¡Una copa!", "Seco como el polvo."],
  },
  working: {
    england: ["Back to it.", "Heave!", "Long day."],
    france: ["Au travail.", "Ho ! Hisse !", "Longue journée."],
    spain: ["A trabajar.", "¡Vamos!", "Qué día tan largo."],
  },
  hauling: {
    england: ["Mind your backs!", "Heavy, this.", "Coming through."],
    france: ["Attention !", "C'est lourd.", "Laissez passer."],
    spain: ["¡Cuidado!", "Pesa mucho.", "¡Paso!"],
  },
  brawling: {
    england: ["Say that again!", "Come on then!", "I'll have you!"],
    france: ["Répète un peu !", "Viens donc !", "Je vais te crever !"],
    spain: ["¡Repítelo!", "¡Ven aquí!", "¡Te mato!"],
  },
  fleeing: {
    england: ["Run for it!", "To the water!", "I'm away!"],
    france: ["Fuyons !", "À l'eau !", "Je m'en vais !"],
    spain: ["¡Corre!", "¡Al agua!", "¡Me largo!"],
  },
  miserable: {
    england: ["This is no life.", "Cursed island.", "I've had enough."],
    france: ["Ce n'est pas une vie.", "Île maudite.", "J'en ai assez."],
    spain: ["Esto no es vida.", "Isla maldita.", "Ya basta."],
  },
  content: {
    england: ["Fine day for it.", "Not so bad.", "A good haul."],
    france: ["Belle journée.", "Ça peut aller.", "Belle prise."],
    spain: ["Buen día.", "No está mal.", "Buen botín."],
  },
};

/** The captives' side of it, which is a different tone entirely. */
const CAPTIVE_LINES: Partial<Record<Topic, Lines>> = {
  greeting: {
    england: ["Keep your head down.", "Say nothing.", "Careful."],
    france: ["Baisse la tête.", "Ne dis rien.", "Fais attention."],
    spain: ["Agacha la cabeza.", "No digas nada.", "Ten cuidado."],
  },
  miserable: {
    england: ["When do we eat?", "How long?", "I want to go home."],
    france: ["On mange quand ?", "Combien de temps ?", "Je veux rentrer."],
    spain: ["¿Cuándo comemos?", "¿Cuánto más?", "Quiero volver a casa."],
  },
  working: {
    england: ["Keep working.", "Don't stop.", "He's watching."],
    france: ["Continue.", "Ne t'arrête pas.", "Il nous regarde."],
    spain: ["Sigue.", "No pares.", "Nos vigila."],
  },
};

/** How long a line stays up, in seconds of wall clock. */
export const LINE_SECONDS = 3.2;

/** How often somebody might say something, in seconds. */
const SLOT_SECONDS = 7;

/** What this person would be talking about, given their state. */
export function topicFor(person: Person, hasCompany: boolean): Topic {
  if (person.activity === "rioting") return "brawling";
  if (person.activity === "fleeing") return "fleeing";
  if (person.carrying) return "hauling";
  if (person.starving > 1) return "hungry";

  if (person.kind === "pirate") {
    if (person.needs.drinking < 25) return "thirsty";
    if (person.needs.feasting < 25) return "hungry";
    if (person.mood < 25) return "miserable";
    if (person.activity === "working") return "working";
    return hasCompany ? "greeting" : "content";
  }

  if (person.mood < 40) return "miserable";
  if (person.activity === "working") return "working";
  return "greeting";
}

/**
 * The line this person is saying at this moment, or null for silence.
 *
 * Silence is the common case on purpose. Everybody talking at once is a market,
 * not an island, and a screen of bubbles hides the game underneath them.
 */
export function chatterFor(
  person: Person,
  time: number,
  company: boolean | (() => boolean),
): string | null {
  const slot = Math.floor(time / SLOT_SECONDS);

  // The cheap tests first, and the expensive one last.
  //
  // Whether anybody is standing near enough to talk to costs a sweep of the
  // island, and doing it for everybody every frame is a square in the number of
  // people for an answer almost all of them do not need. The clock and the dice
  // rule out about nine in ten before it is asked.
  if (time - slot * SLOT_SECONDS > LINE_SECONDS) return null;

  // A different person gets their turn in each slot, so the talking moves
  // around the island rather than always coming from the same mouths.
  const roll = hash(person.id, slot) % 1000;
  const loud = person.activity === "rioting" || person.activity === "fleeing";
  if (!loud && roll >= 300) return null;

  const hasCompany = typeof company === "function" ? company() : company;
  const chance = loud ? 0.55 : hasCompany ? 0.3 : 0.08;
  if (roll >= chance * 1000) return null;

  const topic = topicFor(person, hasCompany);
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
