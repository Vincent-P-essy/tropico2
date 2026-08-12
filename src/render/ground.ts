import { HALF_H, HALF_W, HEIGHT_UNIT } from "../core/iso.ts";
import type { GameState } from "../sim/types.ts";
import { SHALLOW_WATER } from "../sim/island.ts";
import type { SpriteAtlas } from "./sprites.ts";

/**
 * The ground, painted once instead of every frame.
 *
 * Terrain never moves. Roads move rarely — only when the player lays one. Yet
 * the renderer was redrawing every visible tile, its cliff skirt and its road
 * sixty times a second: on a 1080p screen that is around two thousand drawImage
 * calls per frame, and on a laptop it was most of a twenty-millisecond frame.
 *
 * So the whole island is painted once into an offscreen canvas and the visible
 * rectangle of it is blitted. Two thousand calls become one. What genuinely
 * animates — the sea, the shallows, people, ships — is still drawn every frame,
 * because that is what animation means.
 */

/** One tile of margin all round, so cliffs and sprite anchors are not clipped. */
const PAD = 96;

export class Ground {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private originX = 0;
  private originY = 0;
  private island: GameState["island"] | null = null;
  private version = -1;
  private shallowList: { x: number; y: number }[] = [];
  private shallowIsland: GameState["island"] | null = null;

  /** Where the cached image sits in world-screen coordinates. */
  get offsetX(): number {
    return this.originX;
  }

  get offsetY(): number {
    return this.originY;
  }

  /**
   * Copies just the piece of the island the camera can see.
   *
   * Handing the whole cached canvas to drawImage and letting the clip sort it
   * out looks like it should be free and is not: it is four thousand pixels
   * wide, and a transformed blit that size costs more than the two thousand
   * small ones it replaced. Worse, it costs it unevenly — the median improved
   * and the worst frame got half as fast again, which is the opposite of what a
   * cache is for. Nine arguments instead of three, and only the visible
   * rectangle moves.
   */
  blit(ctx: CanvasRenderingContext2D, view: ViewRect): boolean {
    const canvas = this.canvas;
    if (!canvas) return false;

    const sx = Math.max(0, Math.floor(view.left - this.originX));
    const sy = Math.max(0, Math.floor(view.top - this.originY));
    const sw = Math.min(canvas.width - sx, Math.ceil(view.right - view.left) + 2);
    const sh = Math.min(canvas.height - sy, Math.ceil(view.bottom - view.top) + 2);
    if (sw <= 0 || sh <= 0) return true;

    ctx.drawImage(canvas, sx, sy, sw, sh, this.originX + sx, this.originY + sy, sw, sh);
    return true;
  }

  /**
   * Repaints if anything it depends on has changed.
   *
   * Cheap to call every frame: it compares an island identity and a counter the
   * simulation bumps whenever a road is laid or lifted.
   */
  refresh(state: GameState, atlas: SpriteAtlas, paint: GroundPainter): void {
    if (this.island === state.island && this.version === state.groundVersion) return;
    this.island = state.island;
    this.version = state.groundVersion;
    this.paint(state, atlas, paint);
  }

  private paint(state: GameState, atlas: SpriteAtlas, paint: GroundPainter): void {
    const { width, height } = state.island;

    // The island's isometric bounding box. The leftmost point is tile (0, h),
    // the rightmost (w, 0), the topmost (0, 0) raised by its own elevation.
    const left = (0 - height) * HALF_W - PAD;
    const right = (width - 0) * HALF_W + PAD;
    const top = -HEIGHT_UNIT * 4 - PAD;
    const bottom = (width + height) * HALF_H + PAD;

    const canvasWidth = Math.ceil(right - left);
    const canvasHeight = Math.ceil(bottom - top);

    const canvas = makeCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.translate(-left, -top);
    paint(ctx, state, atlas, { x0: 0, y0: 0, x1: width - 1, y1: height - 1 });

    this.canvas = canvas;
    this.originX = left;
    this.originY = top;
  }

  /** Every shallow-water tile on the island, found once per island. */
  shallows(state: GameState): readonly { x: number; y: number }[] {
    if (this.shallowIsland !== state.island) {
      this.shallowIsland = state.island;
      this.shallowList = [];
      for (let y = 0; y < state.island.height; y++) {
        for (let x = 0; x < state.island.width; x++) {
          if (state.island.terrain.get(x, y) === SHALLOW_WATER) this.shallowList.push({ x, y });
        }
      }
    }
    return this.shallowList;
  }
}

/** The world-screen rectangle the camera can see. */
export interface ViewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type GroundPainter = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  atlas: SpriteAtlas,
  bounds: { x0: number; y0: number; x1: number; y1: number },
) => void;

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  // OffscreenCanvas where it exists: it does not touch the DOM, which keeps a
  // canvas of this size out of the compositor's way.
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
