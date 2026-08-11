/**
 * Deterministic pseudo-random source.
 *
 * The whole simulation draws from one of these and nothing below `app/` ever
 * calls `Math.random`. That is what makes a save file replayable and what lets
 * the determinism test assert that the same seed and the same commands produce
 * a bit-identical world.
 *
 * mulberry32: one 32-bit word of state, so serialising an Rng is serialising a
 * single number.
 */
export class Rng {
  /** The entire state of the generator. */
  s: number;

  constructor(seed: number) {
    // Force to uint32 so a fractional or negative seed still behaves.
    this.s = seed >>> 0;
  }

  /** Next raw 32-bit word. */
  u32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.u32() / 4294967296;
  }

  /** Uniform integer in [min, max], inclusive both ends. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** Uniform real in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** A uniformly chosen element, or undefined for an empty array. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(0, items.length - 1)];
  }

  /**
   * A weighted choice. `weight` must return a non-negative number; entries
   * weighing zero are never chosen. Undefined only if every weight is zero.
   */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    if (total <= 0) return undefined;
    let roll = this.float() * total;
    for (const item of items) {
      roll -= Math.max(0, weight(item));
      if (roll < 0) return item;
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates, in place. Returns the same array for chaining. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = items[i];
      const b = items[j];
      if (a === undefined || b === undefined) continue;
      items[i] = b;
      items[j] = a;
    }
    return items;
  }

  /**
   * Approximately normal, mean 0, standard deviation 1, clamped to ±3σ.
   * Sum-of-four-uniforms rather than Box-Muller: cheaper, bounded, and the tails
   * are not interesting for stat rolls.
   */
  normal(): number {
    const sum = this.float() + this.float() + this.float() + this.float();
    return Math.max(-3, Math.min(3, (sum - 2) * 1.732));
  }

  /** An independent generator, derived deterministically from this one. */
  fork(): Rng {
    return new Rng(this.u32());
  }
}

/** Mixes a string into a numeric seed, so scenarios can be seeded by name. */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
