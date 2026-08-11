import { describe, expect, it } from "vitest";
import {
  chebyshev,
  clamp,
  distanceToRect,
  euclidean,
  forEachTile,
  idx,
  inBounds,
  lerp,
  manhattan,
  ORTHOGONAL,
  rectCenter,
  rectContains,
  rectPerimeter,
  rectsOverlap,
  SURROUNDING,
} from "./grid.ts";

const size = { width: 10, height: 8 };

describe("indexing", () => {
  it("maps tiles to row-major indices", () => {
    expect(idx(size, 0, 0)).toBe(0);
    expect(idx(size, 9, 0)).toBe(9);
    expect(idx(size, 0, 1)).toBe(10);
    expect(idx(size, 9, 7)).toBe(79);
  });

  it("gives every tile a distinct index", () => {
    const seen = new Set<number>();
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) seen.add(idx(size, x, y));
    }
    expect(seen.size).toBe(size.width * size.height);
  });

  it("rejects out-of-bounds tiles", () => {
    expect(inBounds(size, 0, 0)).toBe(true);
    expect(inBounds(size, 9, 7)).toBe(true);
    expect(inBounds(size, -1, 0)).toBe(false);
    expect(inBounds(size, 0, -1)).toBe(false);
    expect(inBounds(size, 10, 0)).toBe(false);
    expect(inBounds(size, 0, 8)).toBe(false);
  });
});

describe("neighbour tables", () => {
  it("lists four orthogonals and eight surrounding offsets", () => {
    expect(ORTHOGONAL).toHaveLength(4);
    expect(SURROUNDING).toHaveLength(8);
  });

  it("never includes the origin and never repeats", () => {
    const keys = SURROUNDING.map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(8);
    expect(keys).not.toContain("0,0");
  });

  it("starts the surrounding table with the orthogonals", () => {
    expect(SURROUNDING.slice(0, 4)).toEqual(ORTHOGONAL);
  });
});

describe("distances", () => {
  it("computes manhattan, chebyshev and euclidean", () => {
    expect(manhattan(0, 0, 3, 4)).toBe(7);
    expect(chebyshev(0, 0, 3, 4)).toBe(4);
    expect(euclidean(0, 0, 3, 4)).toBe(5);
  });

  it("is symmetric and zero at the same tile", () => {
    expect(manhattan(2, 5, 2, 5)).toBe(0);
    expect(euclidean(7, 1, 2, 3)).toBeCloseTo(euclidean(2, 3, 7, 1));
  });
});

describe("rectangles", () => {
  const rect = { x: 2, y: 3, w: 3, h: 2 };

  it("tests containment on a half-open range", () => {
    expect(rectContains(rect, 2, 3)).toBe(true);
    expect(rectContains(rect, 4, 4)).toBe(true);
    expect(rectContains(rect, 5, 4)).toBe(false);
    expect(rectContains(rect, 4, 5)).toBe(false);
    expect(rectContains(rect, 1, 3)).toBe(false);
  });

  it("detects overlap but not mere adjacency", () => {
    expect(rectsOverlap(rect, { x: 4, y: 4, w: 2, h: 2 })).toBe(true);
    expect(rectsOverlap(rect, { x: 5, y: 3, w: 2, h: 2 })).toBe(false);
    expect(rectsOverlap(rect, { x: 2, y: 5, w: 3, h: 1 })).toBe(false);
  });

  it("visits every tile once", () => {
    const visited: string[] = [];
    forEachTile(rect, (x, y) => visited.push(`${x},${y}`));
    expect(visited).toEqual(["2,3", "3,3", "4,3", "2,4", "3,4", "4,4"]);
  });

  it("walks the perimeter without touching the interior", () => {
    const perimeter = rectPerimeter(rect);
    expect(perimeter).toHaveLength(2 * rect.w + 2 * rect.h);
    for (const p of perimeter) expect(rectContains(rect, p.x, p.y)).toBe(false);
  });

  it("finds the continuous centre", () => {
    expect(rectCenter(rect)).toEqual({ x: 3.5, y: 4 });
  });
});

describe("distanceToRect", () => {
  const rect = { x: 4, y: 4, w: 3, h: 3 };

  it("is zero anywhere inside the footprint", () => {
    forEachTile(rect, (x, y) => {
      expect(distanceToRect(rect, x, y)).toBe(0);
    });
  });

  it("measures from the nearest edge, not the centre", () => {
    expect(distanceToRect(rect, 3, 5)).toBe(1);
    expect(distanceToRect(rect, 7, 5)).toBe(1);
    expect(distanceToRect(rect, 4, 1)).toBe(3);
  });

  it("measures diagonals euclidean", () => {
    expect(distanceToRect(rect, 3, 3)).toBeCloseTo(Math.SQRT2);
  });

  it("grows with distance away from the footprint", () => {
    let previous = -1;
    for (let x = 6; x < 14; x++) {
      const d = distanceToRect(rect, x, 5);
      expect(d).toBeGreaterThan(previous);
      previous = d;
    }
  });
});

describe("scalar helpers", () => {
  it("clamps to the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it("interpolates and extrapolates", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(0, 10, 2)).toBe(20);
  });
});
