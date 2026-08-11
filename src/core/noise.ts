import { Rng } from "./rng.ts";

/**
 * Seeded value noise, and fractal sums of it.
 *
 * Used to shape the island: one noise field pushes the coastline in and out, a
 * second decides where the rain falls and therefore where the jungle is, and a
 * third scatters the ore. All three come from the same seed, so an island is
 * entirely described by one number.
 */

const GRID = 256;
const MASK = GRID - 1;

export class Noise2D {
  private readonly permutation: Uint8Array;

  constructor(seed: number) {
    const rng = new Rng(seed);
    const table = new Uint8Array(GRID);
    for (let i = 0; i < GRID; i++) table[i] = i;
    for (let i = GRID - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const a = table[i] ?? 0;
      table[i] = table[j] ?? 0;
      table[j] = a;
    }
    // Doubled so lookups never need a modulo.
    this.permutation = new Uint8Array(GRID * 2);
    for (let i = 0; i < GRID * 2; i++) this.permutation[i] = table[i & MASK] ?? 0;
  }

  private hash(x: number, y: number): number {
    const a = this.permutation[(x & MASK) + (this.permutation[y & MASK] ?? 0)] ?? 0;
    return a / 255;
  }

  /** Smooth noise in [0, 1] at a continuous point. */
  at(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(x - x0);
    const fy = smoothstep(y - y0);
    const a = this.hash(x0, y0);
    const b = this.hash(x0 + 1, y0);
    const c = this.hash(x0, y0 + 1);
    const d = this.hash(x0 + 1, y0 + 1);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  }

  /**
   * Sum of `octaves` noise layers, each at twice the frequency and roughly half
   * the amplitude of the last. Returns [0, 1].
   */
  fractal(x: number, y: number, octaves = 4, persistence = 0.5, scale = 1): number {
    let total = 0;
    let amplitude = 1;
    let frequency = scale;
    let normalisation = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.at(x * frequency, y * frequency) * amplitude;
      normalisation += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return normalisation === 0 ? 0 : total / normalisation;
  }

  /**
   * Ridged noise: sharp crests instead of rolling hills. Good for a spine of
   * mountains down the middle of an island.
   */
  ridged(x: number, y: number, octaves = 4, scale = 1): number {
    let total = 0;
    let amplitude = 1;
    let frequency = scale;
    let normalisation = 0;
    for (let i = 0; i < octaves; i++) {
      const value = 1 - Math.abs(this.at(x * frequency, y * frequency) * 2 - 1);
      total += value * value * amplitude;
      normalisation += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return normalisation === 0 ? 0 : total / normalisation;
  }
}

/** Hermite smoothing, the classic 3t² − 2t³. */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * A radial mask that falls to zero at the edges of a square. Multiplying a
 * height field by this is what turns noise into an island rather than a
 * continent that runs off the map.
 *
 * `power` controls the profile: 1 is a gentle dome, higher values give a
 * broader plateau with a sharper drop into the sea.
 */
export function radialFalloff(
  x: number,
  y: number,
  width: number,
  height: number,
  power = 2,
): number {
  const nx = (x / (width - 1)) * 2 - 1;
  const ny = (y / (height - 1)) * 2 - 1;
  const distance = Math.min(1, Math.sqrt(nx * nx + ny * ny));
  return Math.pow(1 - distance, power);
}
