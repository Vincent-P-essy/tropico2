import type { Point } from "./grid.ts";

/**
 * Isometric projection.
 *
 * Tiles are 2:1 diamonds, the classic look of the original. Tile (0,0) projects
 * to the origin; +x runs down-right on screen and +y runs down-left, so the
 * tile's screen depth is simply x + y.
 */

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** Vertical screen pixels per unit of terrain height. */
export const HEIGHT_UNIT = 12;

/** Centre of tile (x, y) in world-screen pixels, before the camera is applied. */
export function tileToScreen(x: number, y: number, height = 0): Point {
  return {
    x: (x - y) * HALF_W,
    y: (x + y) * HALF_H - height * HEIGHT_UNIT,
  };
}

/**
 * The tile under a world-screen point, as continuous coordinates: 3.5 means
 * halfway across tile 3. Callers wanting a tile index should floor the result.
 *
 * This inverts `tileToScreen` at height 0; picking on raised terrain is handled
 * by the renderer, which searches downward from the topmost candidate.
 */
export function screenToTile(sx: number, sy: number): Point {
  return {
    x: (sx / HALF_W + sy / HALF_H) / 2,
    y: (sy / HALF_H - sx / HALF_W) / 2,
  };
}

/**
 * Painter's-algorithm depth. Larger draws later, i.e. in front. Ties are broken
 * by layer so a person standing on a tile draws over the tile itself.
 */
export function depthOf(x: number, y: number, layer = 0): number {
  return (x + y) * 8 + layer;
}

/** The four screen-space corners of a tile's diamond, clockwise from the top. */
export function tileDiamond(x: number, y: number, height = 0): Point[] {
  const c = tileToScreen(x, y, height);
  return [
    { x: c.x, y: c.y - HALF_H },
    { x: c.x + HALF_W, y: c.y },
    { x: c.x, y: c.y + HALF_H },
    { x: c.x - HALF_W, y: c.y },
  ];
}

/**
 * Screen bounds of a w×h building footprint anchored at (x, y), used to size the
 * offscreen canvas each building sprite is drawn into.
 */
export function footprintBounds(
  x: number,
  y: number,
  w: number,
  h: number,
): { left: number; right: number; top: number; bottom: number } {
  const north = tileToScreen(x, y);
  const east = tileToScreen(x + w - 1, y);
  const south = tileToScreen(x + w - 1, y + h - 1);
  const west = tileToScreen(x, y + h - 1);
  return {
    left: west.x - HALF_W,
    right: east.x + HALF_W,
    top: north.y - HALF_H,
    bottom: south.y + HALF_H,
  };
}
