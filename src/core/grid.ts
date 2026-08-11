/**
 * Tile-grid geometry shared by the island, the aura fields and pathfinding.
 *
 * Everything on the island lives on one square grid addressed by integer tile
 * coordinates, stored row-major so a tile's index is `y * width + x`.
 */

export interface GridSize {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned tile rectangle: the footprint of a building. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Row-major index of a tile. Callers must have checked bounds. */
export function idx(size: GridSize, x: number, y: number): number {
  return y * size.width + x;
}

export function inBounds(size: GridSize, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size.width && y < size.height;
}

/** The four orthogonal neighbours, in a fixed order for determinism. */
export const ORTHOGONAL: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/** The eight surrounding offsets, orthogonals first. */
export const SURROUNDING: readonly Point[] = [
  ...ORTHOGONAL,
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
];

export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function euclidean(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** True when the point lies inside the rectangle. */
export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Calls `visit` for every tile of the rectangle, row by row. */
export function forEachTile(rect: Rect, visit: (x: number, y: number) => void): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) visit(x, y);
  }
}

/** True when the predicate holds for every tile of the rectangle. */
export function everyTile(rect: Rect, test: (x: number, y: number) => boolean): boolean {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (!test(x, y)) return false;
    }
  }
  return true;
}

/** True when the predicate holds for at least one tile of the rectangle. */
export function someTile(rect: Rect, test: (x: number, y: number) => boolean): boolean {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (test(x, y)) return true;
    }
  }
  return false;
}

/** Sums a value over every tile of the rectangle. */
export function sumTiles(rect: Rect, value: (x: number, y: number) => number): number {
  let total = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) total += value(x, y);
  }
  return total;
}

/** Every tile immediately outside the rectangle's edges, excluding diagonals. */
export function rectPerimeter(rect: Rect): Point[] {
  const out: Point[] = [];
  for (let x = rect.x; x < rect.x + rect.w; x++) {
    out.push({ x, y: rect.y - 1 });
    out.push({ x, y: rect.y + rect.h });
  }
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    out.push({ x: rect.x - 1, y });
    out.push({ x: rect.x + rect.w, y });
  }
  return out;
}

/** Centre of a rectangle in continuous tile space. */
export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Shortest distance from a point to a rectangle, zero when inside. Used for
 * aura falloff, where a large building should radiate from its whole footprint
 * rather than from a single centre tile.
 */
export function distanceToRect(rect: Rect, x: number, y: number): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w - 1));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h - 1));
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation, `t` unclamped. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
