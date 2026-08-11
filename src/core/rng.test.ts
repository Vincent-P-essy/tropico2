import { describe, expect, it } from "vitest";
import { hashSeed, Rng } from "./rng.ts";

describe("Rng", () => {
  it("produces the same stream for the same seed", () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    const left = Array.from({ length: 50 }, () => a.u32());
    const right = Array.from({ length: 50 }, () => b.u32());
    expect(left).toEqual(right);
  });

  it("produces different streams for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.u32()).not.toBe(b.u32());
  });

  it("resumes from a restored state", () => {
    const original = new Rng(99);
    for (let i = 0; i < 10; i++) original.u32();
    const restored = new Rng(original.s);
    expect(restored.u32()).toBe(new Rng(original.s).u32());
  });

  it("keeps float() inside [0, 1)", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("keeps int() inside the inclusive range and reaches both ends", () => {
    const rng = new Rng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6, 7]));
  });

  it("collapses int() to the single value when min equals max", () => {
    const rng = new Rng(5);
    expect(rng.int(4, 4)).toBe(4);
    expect(rng.int(9, 2)).toBe(9);
  });

  it("distributes float() roughly uniformly", () => {
    const rng = new Rng(2024);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const bucket = Math.min(9, Math.floor(rng.float() * 10));
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 - n / 100);
      expect(count).toBeLessThan(n / 10 + n / 100);
    }
  });

  it("returns undefined when picking from nothing", () => {
    expect(new Rng(1).pick<string>([])).toBeUndefined();
    expect(new Rng(1).weighted<string>([], () => 1)).toBeUndefined();
  });

  it("never picks a zero-weight entry", () => {
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      expect(rng.weighted(["never", "always"], (v) => (v === "never" ? 0 : 5))).toBe("always");
    }
  });

  it("returns undefined when every weight is zero", () => {
    expect(new Rng(3).weighted(["a", "b"], () => 0)).toBeUndefined();
  });

  it("respects weights in proportion", () => {
    const rng = new Rng(42);
    let heavy = 0;
    for (let i = 0; i < 10_000; i++) {
      if (rng.weighted(["light", "heavy"], (v) => (v === "heavy" ? 3 : 1)) === "heavy") heavy++;
    }
    expect(heavy / 10_000).toBeGreaterThan(0.72);
    expect(heavy / 10_000).toBeLessThan(0.78);
  });

  it("shuffles without losing or duplicating elements", () => {
    const items = Array.from({ length: 40 }, (_, i) => i);
    const shuffled = new Rng(8).shuffle([...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });

  it("keeps normal() bounded and centred", () => {
    const rng = new Rng(17);
    let sum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const v = rng.normal();
      expect(Math.abs(v)).toBeLessThanOrEqual(3);
      sum += v;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
  });

  it("forks into an independent but reproducible stream", () => {
    const parent = new Rng(500);
    const childA = parent.fork();
    const parentAgain = new Rng(500);
    const childB = parentAgain.fork();
    expect(childA.u32()).toBe(childB.u32());
  });
});

describe("hashSeed", () => {
  it("is stable and distinguishes similar strings", () => {
    expect(hashSeed("tortuga")).toBe(hashSeed("tortuga"));
    expect(hashSeed("tortuga")).not.toBe(hashSeed("tortugb"));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const text of ["", "a", "Beer for Buccaneers", "🏴‍☠️"]) {
      const h = hashSeed(text);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});
