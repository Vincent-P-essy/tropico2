import { describe, expect, it } from "vitest";
import { Noise2D, radialFalloff, smoothstep } from "./noise.ts";

describe("smoothstep", () => {
  it("pins the ends and eases the middle", () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
  });

  it("has zero slope at both ends", () => {
    expect(smoothstep(0.01)).toBeLessThan(0.01);
    expect(smoothstep(0.99)).toBeGreaterThan(0.99);
  });

  it("increases monotonically", () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = smoothstep(t);
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
  });
});

describe("Noise2D", () => {
  it("is deterministic for a seed", () => {
    const a = new Noise2D(42);
    const b = new Noise2D(42);
    for (let i = 0; i < 40; i++) {
      expect(a.at(i * 0.3, i * 0.7)).toBe(b.at(i * 0.3, i * 0.7));
    }
  });

  it("differs between seeds", () => {
    const a = new Noise2D(1);
    const b = new Noise2D(2);
    let differences = 0;
    for (let i = 0; i < 50; i++) {
      if (a.at(i * 0.4, i * 0.9) !== b.at(i * 0.4, i * 0.9)) differences++;
    }
    expect(differences).toBeGreaterThan(40);
  });

  it("stays within [0, 1]", () => {
    const noise = new Noise2D(7);
    for (let y = 0; y < 30; y += 0.37) {
      for (let x = 0; x < 30; x += 0.41) {
        const v = noise.at(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns lattice values exactly at integer points", () => {
    const noise = new Noise2D(3);
    expect(noise.at(4, 9)).toBeCloseTo(noise.at(4.0000001, 9.0000001), 5);
  });

  it("is continuous — small steps make small changes", () => {
    const noise = new Noise2D(11);
    for (let i = 0; i < 100; i++) {
      const x = i * 0.13;
      const y = i * 0.29;
      expect(Math.abs(noise.at(x, y) - noise.at(x + 0.01, y))).toBeLessThan(0.1);
    }
  });

  it("keeps fractal sums within [0, 1]", () => {
    const noise = new Noise2D(5);
    for (let i = 0; i < 200; i++) {
      const v = noise.fractal(i * 0.11, i * 0.23, 5, 0.5, 0.08);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("keeps ridged sums within [0, 1]", () => {
    const noise = new Noise2D(9);
    for (let i = 0; i < 200; i++) {
      const v = noise.ridged(i * 0.17, i * 0.31, 4, 0.06);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("varies more at higher octave counts", () => {
    const noise = new Noise2D(13);
    const sample = (octaves: number): number[] =>
      Array.from({ length: 60 }, (_, i) => noise.fractal(i * 0.5, 3, octaves, 0.5, 0.1));
    const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
    expect(spread(sample(1))).toBeGreaterThan(0);
    expect(spread(sample(6))).toBeGreaterThan(0);
  });
});

describe("radialFalloff", () => {
  it("is highest at the centre", () => {
    const centre = radialFalloff(32, 32, 64, 64);
    expect(centre).toBeGreaterThan(radialFalloff(10, 32, 64, 64));
    expect(centre).toBeGreaterThan(radialFalloff(32, 10, 64, 64));
  });

  it("falls to zero at the corners", () => {
    expect(radialFalloff(0, 0, 64, 64)).toBeCloseTo(0);
    expect(radialFalloff(63, 63, 64, 64)).toBeCloseTo(0);
  });

  it("never leaves [0, 1]", () => {
    for (let y = 0; y < 64; y += 3) {
      for (let x = 0; x < 64; x += 3) {
        const v = radialFalloff(x, y, 64, 64);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is symmetric about the centre", () => {
    expect(radialFalloff(20, 32, 64, 64)).toBeCloseTo(radialFalloff(43, 32, 64, 64));
  });

  it("makes a sharper edge at higher powers", () => {
    const gentle = radialFalloff(20, 32, 64, 64, 1);
    const sharp = radialFalloff(20, 32, 64, 64, 4);
    expect(sharp).toBeLessThan(gentle);
  });
});
