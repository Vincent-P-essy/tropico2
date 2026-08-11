import { footprintBounds, HALF_H, HALF_W, TILE_H, TILE_W } from "../core/iso.ts";
import { BUILDINGS, HOUSING_LEVELS, type BuildingId } from "../data/buildings.ts";
import { drawBuilding } from "./building-art.ts";
import { ROAD, shade, TERRAIN } from "./palette.ts";
import type { Brush } from "./shapes.ts";

/**
 * The sprite cache.
 *
 * Every building, terrain tile and road is drawn once into its own offscreen
 * canvas at boot and then blitted, which is the difference between a hundred
 * path fills per building per frame and one `drawImage`. Nothing is loaded from
 * disk: the entire look of the game is a few hundred lines of canvas calls.
 */

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Where the anchor tile's centre sits inside the canvas. */
  anchorX: number;
  anchorY: number;
}

const PADDING = 24;

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

/** Renders one building type at one level and orientation into a sprite. */
function buildBuildingSprite(id: BuildingId, level: number, rotation: 0 | 1): Sprite {
  const def = BUILDINGS[id];
  const w = rotation === 0 ? def.w : def.h;
  const h = rotation === 0 ? def.h : def.w;
  const bounds = footprintBounds(0, 0, w, h);
  // Room above for roofs, masts and flags, which reach well past the footprint.
  const headroom = 150;
  const width = bounds.right - bounds.left + PADDING * 2;
  const height = bounds.bottom - bounds.top + PADDING * 2 + headroom;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, anchorX: 0, anchorY: 0 };

  const anchorX = -bounds.left + PADDING;
  const anchorY = -bounds.top + PADDING + headroom;

  const brush: Brush = { ctx, originX: anchorX, originY: anchorY };
  ctx.save();
  drawShadow(ctx, brush, w, h);
  drawBuilding(brush, id, level, rotation);
  ctx.restore();

  return { canvas, anchorX, anchorY };
}

/** A soft blob under the footprint, which seats a building on the ground. */
function drawShadow(ctx: CanvasRenderingContext2D, brush: Brush, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(20, 16, 10, 0.16)";
  ctx.beginPath();
  const cx = brush.originX + ((w - 1) / 2 - (h - 1) / 2) * HALF_W;
  const cy = brush.originY + ((w - 1) / 2 + (h - 1) / 2) * HALF_H + 3;
  ctx.ellipse(cx, cy, (w + h) * HALF_W * 0.27, (w + h) * HALF_H * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** One terrain diamond, with a little dithered texture so it is not flat. */
function buildTerrainSprite(type: number, variant: number): Sprite {
  const canvas = createCanvas(TILE_W + 2, TILE_H + 20);
  const ctx = canvas.getContext("2d");
  const colours = TERRAIN[type] ?? TERRAIN[3];
  if (!ctx || !colours) return { canvas, anchorX: 0, anchorY: 0 };

  const anchorX = TILE_W / 2 + 1;
  const anchorY = TILE_H / 2 + 1;

  // Overdrawn by a hair. Tiles that meet exactly leave a one-pixel antialiased
  // gap along every edge, and across a whole island that reads as a dark grid
  // ruled over the landscape.
  const bleed = 1;
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY - HALF_H - bleed);
  ctx.lineTo(anchorX + HALF_W + bleed, anchorY);
  ctx.lineTo(anchorX, anchorY + HALF_H + bleed);
  ctx.lineTo(anchorX - HALF_W - bleed, anchorY);
  ctx.closePath();
  ctx.fillStyle = shade(colours.top, (variant - 1) * 0.018);
  ctx.fill();

  // A few speckles, seeded by the variant so tiles differ without noise fields.
  ctx.fillStyle = shade(colours.top, -0.06);
  let seed = variant * 2654435761;
  for (let i = 0; i < 7; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const u = ((seed >> 8) % 100) / 100;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = ((seed >> 8) % 100) / 100;
    // Keep speckles inside the diamond.
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    if (Math.abs(dx) + Math.abs(dy) > 0.9) continue;
    ctx.fillRect(anchorX + dx * HALF_W - 1, anchorY + dy * HALF_H - 1, 2, 2);
  }

  return { canvas, anchorX, anchorY };
}

function buildRoadSprite(): Sprite {
  const canvas = createCanvas(TILE_W + 2, TILE_H + 6);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, anchorX: 0, anchorY: 0 };
  const anchorX = TILE_W / 2 + 1;
  const anchorY = TILE_H / 2 + 1;

  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY - HALF_H - 1);
  ctx.lineTo(anchorX + HALF_W + 1, anchorY);
  ctx.lineTo(anchorX, anchorY + HALF_H + 1);
  ctx.lineTo(anchorX - HALF_W - 1, anchorY);
  ctx.closePath();
  ctx.fillStyle = ROAD.top;
  ctx.fill();

  // Wheel ruts down the middle.
  ctx.strokeStyle = shade(ROAD.top, -0.18);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(anchorX - HALF_W + 6, anchorY - 3);
  ctx.lineTo(anchorX + HALF_W - 6, anchorY - 3);
  ctx.moveTo(anchorX - HALF_W + 6, anchorY + 3);
  ctx.lineTo(anchorX + HALF_W - 6, anchorY + 3);
  ctx.stroke();

  return { canvas, anchorX, anchorY };
}

export interface SpriteAtlas {
  buildings: Map<string, Sprite>;
  terrain: Sprite[][];
  road: Sprite;
}

/** Builds every sprite the renderer will ever need. Called once at boot. */
export function buildAtlas(): SpriteAtlas {
  const buildings = new Map<string, Sprite>();
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (id === "road") continue;
    // Square buildings look the same either way round, so they get one sprite.
    const rotations: (0 | 1)[] = BUILDINGS[id].w === BUILDINGS[id].h ? [0] : [0, 1];
    const levels = id === "pirateHousing" ? HOUSING_LEVELS.length : id === "piratePalace" ? 4 : 1;
    for (const rotation of rotations) {
      for (let level = 0; level < levels; level++) {
        buildings.set(`${id}:${level}:${rotation}`, buildBuildingSprite(id, level, rotation));
      }
    }
  }

  const terrain: Sprite[][] = [];
  for (let type = 0; type < TERRAIN.length; type++) {
    const variants: Sprite[] = [];
    for (let variant = 0; variant < 3; variant++) variants.push(buildTerrainSprite(type, variant));
    terrain.push(variants);
  }

  return { buildings, terrain, road: buildRoadSprite() };
}

export function buildingSprite(
  atlas: SpriteAtlas,
  id: BuildingId,
  level = 0,
  rotation: 0 | 1 = 0,
): Sprite | undefined {
  return (
    atlas.buildings.get(`${id}:${level}:${rotation}`) ??
    atlas.buildings.get(`${id}:0:${rotation}`) ??
    atlas.buildings.get(`${id}:0:0`)
  );
}

export function terrainSprite(atlas: SpriteAtlas, type: number, x: number, y: number): Sprite {
  const variants = atlas.terrain[type] ?? atlas.terrain[3] ?? [];
  const pick = (x * 7 + y * 13) % variants.length;
  return variants[pick] ?? variants[0] ?? atlas.road;
}
