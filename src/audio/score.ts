/**
 * The music, as notes rather than as sound.
 *
 * Everything here is arithmetic: which drum on which sixteenth, which note of
 * which mode, how the whole thing leans when the island is in trouble. No Web
 * Audio, no browser, so it can be reasoned about and tested like the rest of
 * the simulation — the synthesiser next door only has to play what this decides.
 *
 * The style is the original's, which is not the sea-shanty pastiche you would
 * guess from the subject: Afro-Caribbean percussion under Irish flute and
 * fiddle, with a Spanish cadence underneath. That combination is why a pirate
 * island in the Caribbean sounds like neither Ireland nor Cuba and unmistakably
 * like both.
 */

/** Semitone offsets of the Dorian mode, which is what jigs are usually in. */
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/** Semitone offsets of the Phrygian mode — the Spanish colour. */
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

export type Mode = "dorian" | "phrygian";

export type Voice = "flute" | "fiddle" | "guitar" | "bass" | "conga" | "clave" | "shaker";

export interface Note {
  /** Which instrument plays it. */
  voice: Voice;
  /** Sixteenths from the start of the bar. */
  at: number;
  /** Sixteenths it lasts. */
  length: number;
  /** MIDI note number, or 0 for the unpitched percussion. */
  pitch: number;
  /** 0 to 1. */
  level: number;
}

/**
 * How the island is doing, in the two numbers the music cares about.
 *
 * Both run 0 to 1. Contentment leans the harmony major-ish and keeps the
 * tempo easy; danger brings the drums up and the melody down.
 */
export interface Mood {
  contentment: number;
  danger: number;
}

/** The Andalusian cadence: the four chords that make it sound Spanish. */
const CADENCE = [0, -2, -4, -5];

/**
 * The clave, which everything else hangs off.
 *
 * Son clave, 3-2: three strokes in the first bar, two in the second. Every
 * Afro-Caribbean rhythm in the soundtrack is built over one of these.
 */
const CLAVE_3 = [0, 3, 6];
const CLAVE_2 = [4, 10];

/** Conga tumbao: the open tones that answer the clave. */
const TUMBAO = [2, 6, 10, 11, 14];

export interface Bar {
  /** Which bar of the four-bar cadence this is. */
  index: number;
  notes: Note[];
  /** Beats per minute this bar should be played at. */
  tempo: number;
}

/**
 * Writes one bar.
 *
 * Deterministic in the seed and the bar number, so the same island always
 * sounds the same — the rest of the game is built that way and there is no
 * reason for the music to be the exception.
 */
export function writeBar(seed: number, index: number, mood: Mood): Bar {
  const rng = barRng(seed, index);
  const mode: Mode = mood.danger > 0.55 ? "phrygian" : "dorian";
  const scale = mode === "phrygian" ? PHRYGIAN : DORIAN;
  const root = 57 + (CADENCE[index % CADENCE.length] ?? 0);
  const notes: Note[] = [];

  // Percussion first, because it is the floor everything else stands on.
  const drive = 0.55 + mood.danger * 0.45;
  for (const at of index % 2 === 0 ? CLAVE_3 : CLAVE_2) {
    notes.push({ voice: "clave", at, length: 1, pitch: 0, level: 0.5 * drive });
  }
  for (const at of TUMBAO) {
    notes.push({ voice: "conga", at, length: 1, pitch: at % 4 === 2 ? 1 : 0, level: 0.45 * drive });
  }
  // The shaker only comes in when there is something to be tense about.
  if (mood.danger > 0.3) {
    for (let at = 0; at < 16; at += 2) {
      notes.push({ voice: "shaker", at, length: 1, pitch: 0, level: 0.18 * mood.danger });
    }
  }

  // The guitar plays the chord of the bar, plucked rather than strummed.
  for (const degree of [0, 2, 4]) {
    notes.push({
      voice: "guitar",
      at: 0,
      length: 8,
      pitch: root + (scale[degree] ?? 0),
      level: 0.3,
    });
  }
  notes.push({ voice: "bass", at: 0, length: 8, pitch: root - 24, level: 0.5 });
  notes.push({ voice: "bass", at: 10, length: 4, pitch: root - 24 + 7, level: 0.35 });

  // And over the top, the tune. A jig lilts in threes, so the melody lands on
  // the sixteenths a 6/8 would: 0, 3, 6, 8, 11, 14.
  const lilt = [0, 3, 6, 8, 11, 14];
  const lead: Voice = mood.contentment > 0.45 ? "flute" : "fiddle";
  let step = 2 + Math.floor(rng() * 3);
  for (const at of lilt) {
    // Steps mostly, leaps rarely: the shape of a tune rather than a scale.
    step += rng() < 0.72 ? (rng() < 0.5 ? -1 : 1) : rng() < 0.5 ? -2 : 2;
    step = Math.max(0, Math.min(11, step));
    const octave = step >= 7 ? 12 : 0;
    notes.push({
      voice: lead,
      at,
      length: at === 14 ? 2 : 3,
      pitch: root + 12 + (scale[step % 7] ?? 0) + octave,
      level: 0.34 + mood.contentment * 0.12,
    });
  }

  return { index, notes, tempo: tempoFor(mood) };
}

/** Easy when things are well, hurried when they are not. */
export function tempoFor(mood: Mood): number {
  return Math.round(92 + mood.danger * 34 - mood.contentment * 6);
}

/**
 * A little generator, one per bar.
 *
 * Not the simulation's Rng: the music must never touch it, or turning the sound
 * on would change how the island plays.
 */
function barRng(seed: number, index: number): () => number {
  let state = (seed * 2654435761 + index * 40503) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Concert pitch of a MIDI note. */
export function frequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}
