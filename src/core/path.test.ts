import { describe, expect, it } from "vitest";
import { idx, type GridSize, type Point } from "./grid.ts";
import { findPath, findPathTo, floodFill, octile } from "./path.ts";

/**
 * Builds a test grid from ASCII art. '#' is a wall, everything else is open;
 * digits set the cost of entering that tile.
 */
function parse(rows: string[]): {
  size: GridSize;
  passable: (x: number, y: number) => boolean;
  cost: (x: number, y: number) => number;
} {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const size = { width, height };
  const at = (x: number, y: number): string => rows[y]?.[x] ?? "#";
  return {
    size,
    passable: (x, y) => at(x, y) !== "#",
    cost: (x, y) => {
      const c = at(x, y);
      return c >= "1" && c <= "9" ? Number(c) : 1;
    },
  };
}

const key = (p: Point): string => `${p.x},${p.y}`;

describe("octile", () => {
  it("is zero at the same tile", () => {
    expect(octile(3, 3, 3, 3)).toBe(0);
  });

  it("counts straight moves as one", () => {
    expect(octile(0, 0, 5, 0)).toBe(5);
    expect(octile(0, 0, 0, 5)).toBe(5);
  });

  it("counts diagonal moves as root two", () => {
    expect(octile(0, 0, 3, 3)).toBeCloseTo(3 * Math.SQRT2);
  });

  it("mixes diagonals then straights", () => {
    expect(octile(0, 0, 5, 2)).toBeCloseTo(3 + 2 * Math.SQRT2);
  });

  it("never exceeds the true cost of an open walk", () => {
    const { size, passable } = parse(["......", "......", "......", "......"]);
    for (const goal of [
      { x: 5, y: 3 },
      { x: 2, y: 2 },
      { x: 0, y: 3 },
    ]) {
      const path = findPathTo(size, passable, { x: 0, y: 0 }, goal);
      expect(path).not.toBeNull();
      const actual = (path ?? []).reduce((sum, step, i) => {
        const previous = i === 0 ? { x: 0, y: 0 } : (path?.[i - 1] ?? step);
        return sum + (step.x !== previous.x && step.y !== previous.y ? Math.SQRT2 : 1);
      }, 0);
      expect(octile(0, 0, goal.x, goal.y)).toBeLessThanOrEqual(actual + 1e-9);
    }
  });
});

describe("findPath", () => {
  it("returns an empty path when already at the goal", () => {
    const { size, passable } = parse(["...", "...", "..."]);
    expect(findPathTo(size, passable, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });

  it("excludes the start and ends on the goal", () => {
    const { size, passable } = parse(["....", "....", "...."]);
    const path = findPathTo(size, passable, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("walks a straight line in the open", () => {
    const { size, passable } = parse([".........", ".........", "........."]);
    const path = findPathTo(size, passable, { x: 0, y: 1 }, { x: 8, y: 1 });
    expect(path).toHaveLength(8);
  });

  it("prefers diagonals in the open", () => {
    const { size, passable } = parse([".....", ".....", ".....", ".....", "....."]);
    const path = findPathTo(size, passable, { x: 0, y: 0 }, { x: 4, y: 4 });
    expect(path).toHaveLength(4);
  });

  it("routes around a wall", () => {
    const { size, passable } = parse([".....", ".###.", ".#...", ".#...", "....."]);
    const path = findPathTo(size, passable, { x: 2, y: 0 }, { x: 2, y: 2 });
    expect(path).not.toBeNull();
    for (const step of path ?? []) expect(passable(step.x, step.y)).toBe(true);
    expect(path?.at(-1)).toEqual({ x: 2, y: 2 });
  });

  it("returns null when the goal is walled off", () => {
    const { size, passable } = parse([".....", ".###.", ".#.#.", ".###.", "....."]);
    expect(findPathTo(size, passable, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it("returns null when the goal is off the grid", () => {
    const { size, passable } = parse(["..", ".."]);
    expect(findPathTo(size, passable, { x: 0, y: 0 }, { x: 9, y: 9 })).toBeNull();
  });

  it("returns null when the start is off the grid", () => {
    const { size, passable } = parse(["..", ".."]);
    expect(findPathTo(size, passable, { x: -1, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it("never cuts the corner between two walls", () => {
    const { size, passable } = parse(["..#..", "..#..", "##...", ".....", "....."]);
    const path = findPathTo(size, passable, { x: 1, y: 1 }, { x: 3, y: 3 });
    const visited = [{ x: 1, y: 1 }, ...(path ?? [])];
    for (let i = 1; i < visited.length; i++) {
      const from = visited[i - 1];
      const to = visited[i];
      if (!from || !to) continue;
      if (from.x !== to.x && from.y !== to.y) {
        expect(passable(to.x, from.y) && passable(from.x, to.y)).toBe(true);
      }
    }
  });

  it("takes a longer route to avoid expensive tiles", () => {
    // A wall of cost-9 tiles down the middle, with a cheap gap at the bottom.
    const { size, passable, cost } = parse([".9...", ".9...", ".9...", "....."]);
    const path = findPathTo(size, passable, { x: 0, y: 0 }, { x: 4, y: 0 }, cost);
    const steps = new Set((path ?? []).map(key));
    expect(steps.has("1,0")).toBe(false);
    expect(path?.at(-1)).toEqual({ x: 4, y: 0 });
  });

  it("takes the cheap route when one exists", () => {
    const { size, passable, cost } = parse(["9999999", "1111111", "9999999"]);
    const path = findPathTo(size, passable, { x: 0, y: 1 }, { x: 6, y: 1 }, cost);
    for (const step of path ?? []) expect(step.y).toBe(1);
  });

  it("finds the nearest of several goals", () => {
    const { size, passable } = parse(["..........", "..........", ".........."]);
    const goals = new Set(["9,0", "3,1"]);
    const path = findPath({
      size,
      passable,
      start: { x: 0, y: 1 },
      isGoal: (x, y) => goals.has(`${x},${y}`),
    });
    expect(path?.at(-1)).toEqual({ x: 3, y: 1 });
  });

  it("gives up within the node budget", () => {
    const rows = Array.from({ length: 40 }, () => ".".repeat(40));
    const { size, passable } = parse(rows);
    const path = findPath({
      size,
      passable,
      start: { x: 0, y: 0 },
      isGoal: (x, y) => x === 39 && y === 39,
      maxNodes: 5,
    });
    expect(path).toBeNull();
  });

  it("is deterministic across repeated searches", () => {
    const { size, passable } = parse([
      "..........",
      ".##..##...",
      "..#...#...",
      "..#####...",
      "..........",
    ]);
    const first = findPathTo(size, passable, { x: 0, y: 0 }, { x: 9, y: 4 });
    for (let i = 0; i < 5; i++) {
      expect(findPathTo(size, passable, { x: 0, y: 0 }, { x: 9, y: 4 })).toEqual(first);
    }
  });

  it("produces a contiguous path with no jumps", () => {
    const { size, passable } = parse([
      "..........",
      ".####.###.",
      "....#...#.",
      ".##.#.#.#.",
      "..........",
    ]);
    const path = findPathTo(size, passable, { x: 0, y: 0 }, { x: 8, y: 3 }) ?? [];
    const visited = [{ x: 0, y: 0 }, ...path];
    for (let i = 1; i < visited.length; i++) {
      const from = visited[i - 1];
      const to = visited[i];
      if (!from || !to) continue;
      expect(Math.abs(to.x - from.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(to.y - from.y)).toBeLessThanOrEqual(1);
    }
  });
});

describe("floodFill", () => {
  it("measures step counts from one source", () => {
    const { size, passable } = parse(["....", "....", "...."]);
    const d = floodFill(size, passable, [{ x: 0, y: 0 }]);
    expect(d[idx(size, 0, 0)]).toBe(0);
    expect(d[idx(size, 1, 0)]).toBe(1);
    expect(d[idx(size, 1, 1)]).toBe(1);
    expect(d[idx(size, 3, 2)]).toBe(3);
  });

  it("marks unreachable tiles as -1", () => {
    const { size, passable } = parse([".....", ".###.", ".#.#.", ".###.", "....."]);
    const d = floodFill(size, passable, [{ x: 0, y: 0 }]);
    expect(d[idx(size, 2, 2)]).toBe(-1);
    expect(d[idx(size, 4, 4)]).toBeGreaterThanOrEqual(0);
  });

  it("takes the minimum over several sources", () => {
    const { size, passable } = parse(["........."]);
    const d = floodFill(size, passable, [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ]);
    expect(d[idx(size, 7, 0)]).toBe(1);
    expect(d[idx(size, 1, 0)]).toBe(1);
  });

  it("stops at the distance limit", () => {
    const { size, passable } = parse(["........."]);
    const d = floodFill(size, passable, [{ x: 0, y: 0 }], 2);
    expect(d[idx(size, 2, 0)]).toBe(2);
    expect(d[idx(size, 3, 0)]).toBe(-1);
  });

  it("ignores sources standing on walls", () => {
    const { size, passable } = parse(["#...", "...."]);
    const d = floodFill(size, passable, [{ x: 0, y: 0 }]);
    expect(d[idx(size, 3, 1)]).toBe(-1);
  });
});
