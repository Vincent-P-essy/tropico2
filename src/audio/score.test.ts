import { describe, expect, it } from "vitest";
import { Rng } from "../core/rng.ts";
import { frequency, tempoFor, writeBar, type Note } from "./score.ts";

/**
 * The music is arithmetic, so it is tested like arithmetic.
 *
 * Nothing here makes a sound. What is checked is that the notes are the notes
 * they should be: in the mode, in the bar, on the beat, and the same every time
 * for the same island.
 */

const CALM = { contentment: 0.8, danger: 0 };
const DIRE = { contentment: 0.05, danger: 0.9 };

function voices(notes: Note[], voice: Note["voice"]): Note[] {
  return notes.filter((note) => note.voice === voice);
}

describe("writing a bar", () => {
  it("gives the same island the same music every time", () => {
    const once = writeBar(1650, 7, CALM);
    const again = writeBar(1650, 7, CALM);
    expect(again).toEqual(once);

    const elsewhere = writeBar(4242, 7, CALM);
    expect(elsewhere.notes).not.toEqual(once.notes);
  });

  it("keeps every note inside its bar", () => {
    for (let index = 0; index < 16; index++) {
      for (const mood of [CALM, DIRE]) {
        for (const note of writeBar(99, index, mood).notes) {
          expect(note.at, `bar ${index}`).toBeGreaterThanOrEqual(0);
          expect(note.at, `bar ${index}`).toBeLessThan(16);
          expect(note.level).toBeGreaterThan(0);
          expect(note.level).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("plays the clave three strokes then two, which is what makes it a clave", () => {
    expect(voices(writeBar(5, 0, CALM).notes, "clave")).toHaveLength(3);
    expect(voices(writeBar(5, 1, CALM).notes, "clave")).toHaveLength(2);
    expect(voices(writeBar(5, 2, CALM).notes, "clave")).toHaveLength(3);
  });

  it("hands the tune to the flute when things are well and the fiddle when they are not", () => {
    expect(voices(writeBar(5, 0, CALM).notes, "flute").length).toBeGreaterThan(0);
    expect(voices(writeBar(5, 0, CALM).notes, "fiddle")).toHaveLength(0);

    expect(voices(writeBar(5, 0, DIRE).notes, "fiddle").length).toBeGreaterThan(0);
    expect(voices(writeBar(5, 0, DIRE).notes, "flute")).toHaveLength(0);
  });

  it("brings the shaker in only when there is something to be tense about", () => {
    expect(voices(writeBar(5, 0, CALM).notes, "shaker")).toHaveLength(0);
    expect(voices(writeBar(5, 0, DIRE).notes, "shaker").length).toBeGreaterThan(0);
  });

  it("moves the harmony through four chords and back", () => {
    const roots = [0, 1, 2, 3, 4].map(
      (index) => voices(writeBar(5, index, CALM).notes, "bass")[0]?.pitch ?? 0,
    );
    // Down the Andalusian cadence, then round again.
    expect(roots[1]).toBeLessThan(roots[0] ?? 0);
    expect(roots[2]).toBeLessThan(roots[1] ?? 0);
    expect(roots[3]).toBeLessThan(roots[2] ?? 0);
    expect(roots[4]).toBe(roots[0]);
  });

  it("keeps the tune in the mode it is written in", () => {
    // Dorian when calm: the sixth is major, so a minor sixth never appears.
    const calm = voices(writeBar(11, 0, CALM).notes, "flute");
    for (const note of calm) expect([0, 2, 3, 5, 7, 9, 10]).toContain(mod12(note.pitch, 57));

    // Phrygian when things are dire: the flattened second is the point of it.
    const dire = voices(writeBar(11, 0, DIRE).notes, "fiddle");
    for (const note of dire) expect([0, 1, 3, 5, 7, 8, 10]).toContain(mod12(note.pitch, 57));
  });

  it("hurries when there is danger and takes its time when there is not", () => {
    expect(tempoFor(DIRE)).toBeGreaterThan(tempoFor(CALM));
    expect(tempoFor(CALM)).toBeGreaterThan(60);
    expect(tempoFor(DIRE)).toBeLessThan(180);
  });

  it("never touches the simulation's own generator", () => {
    // If it did, turning the sound on would change how the island plays - the
    // same seed would give a different world depending on whether the player
    // had the volume up, which is the kind of bug that is never found.
    const rng = new Rng(1650);
    const expected = [rng.float(), rng.float(), rng.float()];

    const again = new Rng(1650);
    again.float();
    writeBar(1650, 0, CALM);
    writeBar(4242, 3, DIRE);
    again.float();
    writeBar(7, 9, CALM);

    expect([expected[0], again.float()]).toEqual([expected[0], expected[2]]);
  });
});

describe("pitch", () => {
  it("puts concert A where it belongs", () => {
    expect(frequency(69)).toBeCloseTo(440, 6);
    expect(frequency(81)).toBeCloseTo(880, 6);
    expect(frequency(57)).toBeCloseTo(220, 6);
  });
});

/** Where a pitch falls in the octave, relative to the tonic. */
function mod12(pitch: number, tonic: number): number {
  return (((pitch - tonic) % 12) + 12) % 12;
}
