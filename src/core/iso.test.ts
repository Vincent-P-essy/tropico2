import { describe, expect, it } from "vitest";
import {
  depthOf,
  footprintBounds,
  HALF_H,
  HALF_W,
  HEIGHT_UNIT,
  screenToTile,
  tileDiamond,
  tileToScreen,
  TILE_H,
  TILE_W,
} from "./iso.ts";

describe("tileToScreen", () => {
  it("puts the origin tile at the origin", () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("sends +x down-right and +y down-left", () => {
    expect(tileToScreen(1, 0)).toEqual({ x: HALF_W, y: HALF_H });
    expect(tileToScreen(0, 1)).toEqual({ x: -HALF_W, y: HALF_H });
  });

  it("keeps the diagonal on the vertical axis", () => {
    expect(tileToScreen(3, 3).x).toBe(0);
    expect(tileToScreen(3, 3).y).toBe(6 * HALF_H);
  });

  it("raises tiles by height", () => {
    expect(tileToScreen(2, 2, 1).y).toBe(tileToScreen(2, 2, 0).y - HEIGHT_UNIT);
  });

  it("uses 2:1 tiles", () => {
    expect(TILE_W).toBe(2 * TILE_H);
  });
});

describe("screenToTile", () => {
  it("inverts tileToScreen at height zero", () => {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [7, 3],
      [12, 19],
      [40, 40],
    ]) {
      const screen = tileToScreen(x ?? 0, y ?? 0);
      const back = screenToTile(screen.x, screen.y);
      expect(back.x).toBeCloseTo(x ?? 0);
      expect(back.y).toBeCloseTo(y ?? 0);
    }
  });

  it("returns continuous coordinates inside a tile", () => {
    const centre = tileToScreen(5, 5);
    const back = screenToTile(centre.x, centre.y + HALF_H / 2);
    expect(Math.floor(back.x)).toBe(5);
    expect(Math.floor(back.y)).toBe(5);
    expect(back.x).toBeGreaterThan(5);
    expect(back.y).toBeGreaterThan(5);
  });
});

describe("depthOf", () => {
  it("orders tiles from back to front", () => {
    expect(depthOf(0, 0)).toBeLessThan(depthOf(1, 0));
    expect(depthOf(1, 0)).toBeLessThan(depthOf(1, 1));
    expect(depthOf(4, 2)).toBe(depthOf(2, 4));
  });

  it("keeps higher layers above the tile they stand on", () => {
    expect(depthOf(3, 3, 1)).toBeGreaterThan(depthOf(3, 3, 0));
  });

  it("never lets a layer bump a tile past the next row", () => {
    expect(depthOf(3, 3, 7)).toBeLessThan(depthOf(4, 3, 0));
  });
});

describe("tileDiamond", () => {
  it("returns four corners spanning one tile", () => {
    const corners = tileDiamond(0, 0);
    expect(corners).toHaveLength(4);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(TILE_W);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(TILE_H);
  });
});

describe("footprintBounds", () => {
  it("spans exactly one tile for a 1x1 footprint", () => {
    const b = footprintBounds(0, 0, 1, 1);
    expect(b.right - b.left).toBe(TILE_W);
    expect(b.bottom - b.top).toBe(TILE_H);
  });

  it("grows with the footprint", () => {
    const small = footprintBounds(0, 0, 1, 1);
    const large = footprintBounds(0, 0, 3, 3);
    expect(large.right - large.left).toBeGreaterThan(small.right - small.left);
    expect(large.bottom - large.top).toBeGreaterThan(small.bottom - small.top);
  });

  it("contains every tile of the footprint", () => {
    const w = 4;
    const h = 3;
    const b = footprintBounds(10, 10, w, h);
    for (let y = 10; y < 10 + h; y++) {
      for (let x = 10; x < 10 + w; x++) {
        const c = tileToScreen(x, y);
        expect(c.x).toBeGreaterThanOrEqual(b.left);
        expect(c.x).toBeLessThanOrEqual(b.right);
        expect(c.y).toBeGreaterThanOrEqual(b.top);
        expect(c.y).toBeLessThanOrEqual(b.bottom);
      }
    }
  });
});
