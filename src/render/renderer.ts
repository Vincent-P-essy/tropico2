import { HALF_H, HALF_W, tileToScreen } from "../core/iso.ts";
import { BUILDINGS, type BuildingId } from "../data/buildings.ts";
import { anarchyAt, auraAt, auraModifiers, orderAt } from "../sim/auras.ts";
import type { AuraId } from "../data/needs.ts";
import { BEACH, DEEP_WATER, SHALLOW_WATER } from "../sim/island.ts";
import type { Building, GameState, Person, Ship } from "../sim/types.ts";
import type { Camera } from "./camera.ts";
import {
  alpha,
  AURA_COLOR,
  CAPTIVE_COLORS,
  PIRATE_COLORS,
  SEA_DEEP,
  SEA_FOAM,
  SEA_SHALLOW,
  shade,
  UI,
} from "./palette.ts";
import { buildingSprite, terrainSprite, type SpriteAtlas } from "./sprites.ts";

/**
 * Drawing the island.
 *
 * One pass over the visible tiles lays down sea, ground and roads; a second
 * collects everything that stands up — buildings, people, ships — sorts them
 * back to front, and blits them. Depth is `x + y` with a small layer offset, so
 * a captive standing in front of a warehouse draws over it and one standing
 * behind is hidden by it.
 */

export type Overlay = "none" | "anarchy" | "order" | "fear" | "defense" | "awe" | "mood";

export interface RenderOptions {
  /** Building being placed, drawn as a translucent ghost under the cursor. */
  ghost?: { def: BuildingId; x: number; y: number; valid: boolean } | undefined;
  overlay?: Overlay;
  selected?: number | undefined;
  hovered?: { x: number; y: number } | undefined;
  /** Real seconds since the game began, for animation. */
  time?: number;
}

interface Drawable {
  depth: number;
  draw: () => void;
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  atlas: SpriteAtlas,
  options: RenderOptions = {},
): void {
  const time = options.time ?? 0;
  const { island } = state;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  drawSea(ctx, camera, time);

  ctx.translate(camera.viewWidth / 2, camera.viewHeight / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const bounds = camera.visibleTiles(island.width, island.height);

  drawGround(ctx, state, atlas, bounds, time);
  if (options.overlay && options.overlay !== "none") {
    drawOverlay(ctx, state, bounds, options.overlay);
  }

  const drawables = collectDrawables(ctx, state, atlas, bounds, options, time);
  drawables.sort((a, b) => a.depth - b.depth);
  for (const item of drawables) item.draw();

  if (options.ghost) drawGhost(ctx, atlas, options.ghost);
  if (options.hovered) drawTileHighlight(ctx, options.hovered.x, options.hovered.y, UI.gold);

  ctx.restore();
}

/** The open sea, with slow bands of swell so the water is never static. */
function drawSea(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, camera.viewHeight);
  gradient.addColorStop(0, shade(SEA_DEEP, -0.25));
  gradient.addColorStop(1, SEA_DEEP);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = SEA_FOAM;
  ctx.lineWidth = 2;
  const spacing = 46;
  const drift = (time * 9) % spacing;
  for (let y = -spacing + drift; y < camera.viewHeight + spacing; y += spacing) {
    ctx.beginPath();
    for (let x = 0; x <= camera.viewWidth; x += 24) {
      const wobble = Math.sin((x + time * 26) * 0.012) * 5;
      if (x === 0) ctx.moveTo(x, y + wobble);
      else ctx.lineTo(x, y + wobble);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  atlas: SpriteAtlas,
  bounds: { x0: number; y0: number; x1: number; y1: number },
  time: number,
): void {
  const { island } = state;
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      const type = island.terrain.get(x, y);
      if (type === DEEP_WATER) continue;

      const elevation = island.elevation.get(x, y);
      const screen = tileToScreen(x, y, elevation);

      if (type === SHALLOW_WATER) {
        drawShallows(ctx, screen.x, screen.y, x, y, time);
        continue;
      }

      const sprite = terrainSprite(atlas, type, x, y);
      ctx.drawImage(sprite.canvas, screen.x - sprite.anchorX, screen.y - sprite.anchorY);

      // Raised ground gets a skirt so cliffs read as solid rather than floating.
      if (elevation > 0.35) drawCliff(ctx, state, x, y, elevation, type);

      if (state.roads.get(x, y) === 1) {
        const road = atlas.road;
        ctx.drawImage(road.canvas, screen.x - road.anchorX, screen.y - road.anchorY);
      }
    }
  }
}

/** Translucent water over sand, with a bright edge where it meets the beach. */
function drawShallows(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  x: number,
  y: number,
  time: number,
): void {
  const shimmer = Math.sin((x * 0.7 + y * 0.5 + time * 1.4) * 1.1) * 0.06;
  ctx.beginPath();
  ctx.moveTo(sx, sy - HALF_H - 1);
  ctx.lineTo(sx + HALF_W + 1, sy);
  ctx.lineTo(sx, sy + HALF_H + 1);
  ctx.lineTo(sx - HALF_W - 1, sy);
  ctx.closePath();
  ctx.fillStyle = shade(SEA_SHALLOW, shimmer);
  ctx.fill();
}

/** The vertical face below a raised tile. */
function drawCliff(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  x: number,
  y: number,
  elevation: number,
  type: number,
): void {
  const south = state.island.elevation.get(x, y + 1);
  const east = state.island.elevation.get(x + 1, y);
  const drop = Math.max(elevation - south, elevation - east, 0);
  // Only real steps get a face; a hair of difference between neighbours is
  // terrain noise, not a cliff.
  if (drop < 0.32) return;

  const top = tileToScreen(x, y, elevation);
  const bottom = tileToScreen(x, y, elevation - drop);
  const colours = type === BEACH ? "#b6a677" : "#6f6650";

  ctx.beginPath();
  ctx.moveTo(top.x - HALF_W, top.y);
  ctx.lineTo(top.x, top.y + HALF_H);
  ctx.lineTo(bottom.x, bottom.y + HALF_H);
  ctx.lineTo(bottom.x - HALF_W, bottom.y);
  ctx.closePath();
  ctx.fillStyle = shade(colours, -0.24);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(top.x, top.y + HALF_H);
  ctx.lineTo(top.x + HALF_W, top.y);
  ctx.lineTo(bottom.x + HALF_W, bottom.y);
  ctx.lineTo(bottom.x, bottom.y + HALF_H);
  ctx.closePath();
  ctx.fillStyle = shade(colours, -0.38);
  ctx.fill();
}

/** Tints tiles by an aura reading, which is how zoning becomes visible. */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  bounds: { x0: number; y0: number; x1: number; y1: number },
  overlay: Overlay,
): void {
  if (overlay === "mood" || overlay === "none") return;
  const aura: AuraId = overlay;
  const mods = auraModifiers(state);
  const colour = AURA_COLOR[aura];

  ctx.save();
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (state.island.terrain.get(x, y) <= SHALLOW_WATER) continue;
      const value =
        overlay === "anarchy"
          ? anarchyAt(state, x, y, mods)
          : overlay === "order"
            ? orderAt(state, x, y, mods)
            : auraAt(state, aura, x, y, mods);
      if (value <= 1) continue;

      const strength = Math.min(1, value / 70);
      const screen = tileToScreen(x, y, state.island.elevation.get(x, y));
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y - HALF_H);
      ctx.lineTo(screen.x + HALF_W, screen.y);
      ctx.lineTo(screen.x, screen.y + HALF_H);
      ctx.lineTo(screen.x - HALF_W, screen.y);
      ctx.closePath();
      ctx.fillStyle = alpha(colour, 0.14 + strength * 0.55);
      ctx.fill();
    }
  }
  ctx.restore();
}

function collectDrawables(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  atlas: SpriteAtlas,
  bounds: { x0: number; y0: number; x1: number; y1: number },
  options: RenderOptions,
  time: number,
): Drawable[] {
  const out: Drawable[] = [];

  for (const building of state.buildings.values()) {
    if (building.def === "road") continue;
    if (building.x > bounds.x1 || building.y > bounds.y1) continue;
    if (building.x + building.w < bounds.x0 || building.y + building.h < bounds.y0) continue;

    const depth = (building.x + building.w - 1 + building.y + building.h - 1) * 8 + 1;
    out.push({
      depth,
      draw: () => {
        drawOneBuilding(ctx, state, atlas, building, options.selected === building.id, time);
      },
    });
  }

  for (const person of state.people.values()) {
    if (person.activity === "dead" || person.activity === "atSea") continue;
    if (person.x < bounds.x0 || person.x > bounds.x1) continue;
    if (person.y < bounds.y0 || person.y > bounds.y1) continue;
    // Somebody inside a building is not drawn; the building is what you see.
    if (person.inside >= 0) continue;

    const depth = (person.x + person.y) * 8 + 4;
    out.push({
      depth,
      draw: () => {
        drawPerson(ctx, state, person, time);
      },
    });
  }

  for (const ship of state.ships.values()) {
    if (ship.status !== "inPort" && ship.status !== "building") continue;
    const dock = ship.dock >= 0 ? state.buildings.get(ship.dock) : undefined;
    if (!dock) continue;
    const depth = (dock.x + dock.y) * 8 + 6;
    out.push({
      depth,
      draw: () => {
        drawShip(ctx, state, ship, dock, time);
      },
    });
  }

  return out;
}

function drawOneBuilding(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  atlas: SpriteAtlas,
  building: Building,
  selected: boolean,
  time: number,
): void {
  const elevation = state.island.elevation.get(building.x, building.y);
  const screen = tileToScreen(building.x, building.y, elevation);

  if (building.construction > 0) {
    drawScaffold(ctx, building, screen.x, screen.y);
    return;
  }

  const sprite = buildingSprite(atlas, building.def, building.level);
  if (!sprite) return;
  ctx.drawImage(sprite.canvas, screen.x - sprite.anchorX, screen.y - sprite.anchorY);

  if (!building.enabled) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#000";
    ctx.fillRect(
      screen.x - sprite.anchorX,
      screen.y - sprite.anchorY,
      sprite.canvas.width,
      sprite.canvas.height,
    );
    ctx.restore();
  }

  if (selected) drawFootprintOutline(ctx, state, building, UI.gold, time);
}

/** A half-built building: a frame of posts and a sign of progress. */
function drawScaffold(
  ctx: CanvasRenderingContext2D,
  building: Building,
  sx: number,
  sy: number,
): void {
  const def = BUILDINGS[building.def];
  const progress =
    building.constructionTotal > 0 ? 1 - building.construction / building.constructionTotal : 1;

  ctx.save();
  ctx.strokeStyle = "#8a6f45";
  ctx.lineWidth = 2;
  for (let i = 0; i <= def.w; i++) {
    for (let j = 0; j <= def.h; j++) {
      if (i % 2 !== 0 && j % 2 !== 0) continue;
      const p = tileToScreen(building.x + i, building.y + j);
      const base = {
        x: sx + (p.x - tileToScreen(building.x, building.y).x),
        y: sy + (p.y - tileToScreen(building.x, building.y).y),
      };
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x, base.y - 14 - progress * 14);
      ctx.stroke();
    }
  }

  const centre = tileToScreen(building.x + def.w / 2 - 0.5, building.y + def.h / 2 - 0.5);
  const cx = sx + (centre.x - tileToScreen(building.x, building.y).x);
  const cy = sy + (centre.y - tileToScreen(building.x, building.y).y);
  ctx.fillStyle = "rgba(20,16,10,0.65)";
  ctx.fillRect(cx - 22, cy - 40, 44, 7);
  ctx.fillStyle = UI.gold;
  ctx.fillRect(cx - 21, cy - 39, 42 * progress, 5);
  ctx.restore();
}

function drawFootprintOutline(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  building: Building,
  colour: string,
  time: number,
): void {
  const elevation = state.island.elevation.get(building.x, building.y);
  const corners = [
    tileToScreen(building.x, building.y, elevation),
    tileToScreen(building.x + building.w, building.y, elevation),
    tileToScreen(building.x + building.w, building.y + building.h, elevation),
    tileToScreen(building.x, building.y + building.h, elevation),
  ];
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -time * 18;
  ctx.beginPath();
  corners.forEach((c, i) => {
    const x = c.x - HALF_W;
    const y = c.y - HALF_H;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** A person: a small figure whose colour says which population they belong to. */
function drawPerson(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  person: Person,
  time: number,
): void {
  const elevation = state.island.elevation.sample(person.x, person.y);
  const screen = tileToScreen(person.x, person.y, elevation);
  const pirate = person.kind === "pirate";
  const palette = pirate ? PIRATE_COLORS : CAPTIVE_COLORS;
  const colour = palette[person.id % palette.length] ?? palette[0] ?? "#888";

  // A gentle bob while walking, so movement is legible at a glance.
  const moving = person.path.length > 0;
  const bob = moving ? Math.abs(Math.sin(time * 7 + person.id)) * 2 : 0;

  ctx.save();
  ctx.fillStyle = "rgba(20, 16, 10, 0.28)";
  ctx.beginPath();
  ctx.ellipse(screen.x, screen.y + 1, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body.
  ctx.fillStyle = colour;
  ctx.fillRect(screen.x - 3, screen.y - 11 - bob, 6, 9);
  // Head.
  ctx.fillStyle = "#e0c39a";
  ctx.beginPath();
  ctx.arc(screen.x, screen.y - 13.5 - bob, 3, 0, Math.PI * 2);
  ctx.fill();
  // A pirate wears something on his head; a captive does not.
  if (pirate) {
    ctx.fillStyle = shade(colour, -0.4);
    ctx.fillRect(screen.x - 4.5, screen.y - 16 - bob, 9, 2);
  }
  // A hauler is carrying something.
  if (person.carrying) {
    ctx.fillStyle = "#a07c47";
    ctx.fillRect(screen.x - 4, screen.y - 18 - bob, 8, 4);
  }
  ctx.restore();
}

/** A ship at her berth. */
function drawShip(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ship: Ship,
  dock: Building,
  time: number,
): void {
  const screen = tileToScreen(dock.x + dock.w - 0.5, dock.y + dock.h - 0.5);
  const bob = Math.sin(time * 1.6 + ship.id) * 2;
  const building = ship.status === "building";

  ctx.save();
  ctx.translate(screen.x, screen.y + bob);

  // Hull.
  ctx.fillStyle = building ? "#8a7a5f" : "#5b4630";
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.quadraticCurveTo(0, 12, 26, 0);
  ctx.lineTo(20, -7);
  ctx.lineTo(-20, -7);
  ctx.closePath();
  ctx.fill();

  if (!building) {
    // Mast and sail.
    ctx.strokeStyle = "#3f3126";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, -40);
    ctx.stroke();
    ctx.fillStyle = "#e8e0cc";
    ctx.beginPath();
    ctx.moveTo(1, -38);
    ctx.quadraticCurveTo(20, -26, 1, -12);
    ctx.closePath();
    ctx.fill();
    // Jolly Roger.
    ctx.fillStyle = "#1c1a18";
    ctx.fillRect(0, -44, 12, 6);
  }
  ctx.restore();
  void state;
}

/** The translucent preview of a building being placed. */
function drawGhost(
  ctx: CanvasRenderingContext2D,
  atlas: SpriteAtlas,
  ghost: { def: BuildingId; x: number; y: number; valid: boolean },
): void {
  const sprite = buildingSprite(atlas, ghost.def, 0);
  const screen = tileToScreen(ghost.x, ghost.y);

  ctx.save();
  ctx.globalAlpha = 0.62;
  if (sprite) {
    ctx.drawImage(sprite.canvas, screen.x - sprite.anchorX, screen.y - sprite.anchorY);
  }
  ctx.restore();

  const def = BUILDINGS[ghost.def];
  const colour = ghost.valid ? UI.good : UI.bad;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = alpha(ghost.valid ? "#7fb069" : "#c9483d", 0.24);
  ctx.lineWidth = 2;
  ctx.beginPath();
  const corners = [
    tileToScreen(ghost.x, ghost.y),
    tileToScreen(ghost.x + def.w, ghost.y),
    tileToScreen(ghost.x + def.w, ghost.y + def.h),
    tileToScreen(ghost.x, ghost.y + def.h),
  ];
  corners.forEach((c, i) => {
    const x = c.x - HALF_W;
    const y = c.y - HALF_H;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTileHighlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colour: string,
): void {
  const screen = tileToScreen(x, y);
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(screen.x, screen.y - HALF_H);
  ctx.lineTo(screen.x + HALF_W, screen.y);
  ctx.lineTo(screen.x, screen.y + HALF_H);
  ctx.lineTo(screen.x - HALF_W, screen.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
