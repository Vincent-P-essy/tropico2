import { clamp, type Point } from "../core/grid.ts";
import { screenToTile, tileToScreen } from "../core/iso.ts";

/**
 * The camera: pan, zoom, and the two conversions everything else needs.
 *
 * Kept deliberately small. It owns a world-space centre and a zoom, and it can
 * turn a tile into a pixel and a pixel back into a tile — which is all the
 * renderer and the mouse handling between them require.
 */

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.4;

export class Camera {
  /** World-space point at the centre of the viewport. */
  x = 0;
  y = 0;
  // Opens far enough out to see a district rather than four roofs.
  zoom = 0.72;
  viewWidth = 800;
  viewHeight = 600;

  /** Centres the view on a tile. */
  lookAt(tileX: number, tileY: number): void {
    const p = tileToScreen(tileX, tileY);
    this.x = p.x;
    this.y = p.y;
  }

  panBy(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
  }

  /** Zooms about a screen point, so the tile under the cursor stays put. */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  worldToScreen(worldX: number, worldY: number): Point {
    return {
      x: (worldX - this.x) * this.zoom + this.viewWidth / 2,
      y: (worldY - this.y) * this.zoom + this.viewHeight / 2,
    };
  }

  screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.viewWidth / 2) / this.zoom + this.x,
      y: (screenY - this.viewHeight / 2) / this.zoom + this.y,
    };
  }

  /** The tile under a screen point, as continuous coordinates. */
  screenToTile(screenX: number, screenY: number): Point {
    const world = this.screenToWorld(screenX, screenY);
    return screenToTile(world.x, world.y);
  }

  /**
   * Tile bounds worth drawing, with a generous margin so tall buildings whose
   * anchor is off-screen still appear.
   */
  visibleTiles(
    mapWidth: number,
    mapHeight: number,
  ): { x0: number; y0: number; x1: number; y1: number } {
    const corners = [
      this.screenToTile(0, 0),
      this.screenToTile(this.viewWidth, 0),
      this.screenToTile(0, this.viewHeight),
      this.screenToTile(this.viewWidth, this.viewHeight),
    ];
    const margin = 8;
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    return {
      x0: Math.max(0, Math.floor(Math.min(...xs)) - margin),
      y0: Math.max(0, Math.floor(Math.min(...ys)) - margin),
      x1: Math.min(mapWidth - 1, Math.ceil(Math.max(...xs)) + margin),
      y1: Math.min(mapHeight - 1, Math.ceil(Math.max(...ys)) + margin),
    };
  }

  /** Keeps the view somewhere over the island rather than lost at sea. */
  clampToIsland(mapWidth: number, mapHeight: number): void {
    const nw = tileToScreen(0, 0);
    const se = tileToScreen(mapWidth, mapHeight);
    const west = tileToScreen(0, mapHeight);
    const east = tileToScreen(mapWidth, 0);
    this.x = clamp(this.x, west.x, east.x);
    this.y = clamp(this.y, nw.y, se.y);
  }
}
