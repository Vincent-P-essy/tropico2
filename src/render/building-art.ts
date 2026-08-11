import { BUILDINGS, type BuildingId } from "../data/buildings.ts";
import { CATEGORY_STYLE, shade } from "./palette.ts";
import {
  banner,
  box,
  cone,
  cylinder,
  furrows,
  gableRoof,
  ground,
  hipRoof,
  palisade,
  post,
  project,
  tent,
  tree,
  type Brush,
} from "./shapes.ts";

/**
 * What each of the sixty-five buildings looks like.
 *
 * Rather than sixty-five bespoke drawings, buildings are assembled from a dozen
 * archetypes — hut, hall, tent, tower, compound, field, mine, pier, yard,
 * decor — each parameterised by the building's own footprint and its category
 * colours, then given a couple of accents that make it recognisable: a still on
 * the distillery, a wheel on the sawmill, a noose on the gallows.
 *
 * The result is that a glance at the island tells you what kind of place each
 * district is, which is the whole point of an isometric city builder.
 */

export type Archetype =
  | "hut"
  | "hall"
  | "tent"
  | "tower"
  | "compound"
  | "field"
  | "mine"
  | "pier"
  | "yard"
  | "decor"
  | "plot";

export interface ArtSpec {
  readonly archetype: Archetype;
  /** Overrides the category roof colour. */
  readonly roof?: string;
  readonly wall?: string;
  /** Extra flourishes, drawn after the body. */
  readonly accents?: readonly Accent[];
  /** Storeys tall; scales the body height. */
  readonly storeys?: number;
}

export type Accent =
  | "chimney"
  | "smoke"
  | "barrels"
  | "still"
  | "wheel"
  | "anvil"
  | "sign"
  | "flag"
  | "jollyRoger"
  | "noose"
  | "graves"
  | "skull"
  | "lantern"
  | "cannon"
  | "anchor"
  | "mast"
  | "crates"
  | "cross"
  | "bell"
  | "pit"
  | "cauldron"
  | "hedge"
  | "stakes"
  | "birdcage"
  | "hat"
  | "telescope"
  | "target"
  | "cane"
  | "leaf"
  | "fruit";

const A = (
  archetype: Archetype,
  accents: readonly Accent[] = [],
  extra: Partial<ArtSpec> = {},
): ArtSpec => ({ archetype, accents, ...extra });

export const BUILDING_ART: Readonly<Record<BuildingId, ArtSpec>> = {
  road: A("decor"),
  constructionTent: A("tent", ["crates"]),
  chuckTent: A("tent", ["cauldron", "smoke"]),
  bunkhouse: A("hut"),
  pirateHousing: A("plot"),
  pirateCave: A("yard", ["crates", "lantern"], { roof: "#6b5a45" }),
  piratePalace: A("compound", ["flag", "lantern", "cannon"], { storeys: 2 }),
  blackMarket: A("hut", ["crates", "lantern"], { roof: "#4a4038" }),
  smugglersCove: A("pier", ["crates", "barrels"]),

  timberCamp: A("yard", ["stakes", "crates"]),
  cornFarm: A("field", ["leaf"]),
  sugarcaneFarm: A("field", ["cane"]),
  tobaccoFarm: A("field", ["leaf"]),
  bananaFarm: A("field", ["fruit"]),
  papayaFarm: A("field", ["fruit"]),
  ironMine: A("mine", ["crates"]),

  sawmill: A("hall", ["wheel", "crates"]),
  brewery: A("hall", ["barrels", "smoke"]),
  rumDistillery: A("hall", ["still", "barrels", "smoke"]),
  cigarFactory: A("hall", ["smoke", "crates"]),
  bakery: A("hut", ["chimney", "smoke"]),
  blastFurnace: A("hall", ["chimney", "smoke"], { roof: "#5a4a44" }),
  blacksmithy: A("hut", ["anvil", "smoke"]),
  cannonFoundry: A("hall", ["cannon", "smoke"]),
  gunsmithy: A("hut", ["anvil", "crates"]),

  smugglersDive: A("hut", ["sign", "barrels"]),
  cheapEatery: A("hut", ["sign", "smoke"]),
  tavern: A("hut", ["sign", "barrels", "lantern"]),
  inn: A("hall", ["sign", "lantern", "flag"], { storeys: 2 }),
  animalPit: A("yard", ["pit", "stakes"]),
  gamblingDen: A("hut", ["sign", "lantern"]),
  casino: A("hall", ["sign", "lantern", "flag"], { storeys: 2 }),
  wenchMasseuse: A("hut", ["lantern"]),
  brothelSalon: A("hall", ["sign", "lantern"], { storeys: 2 }),
  courtesanSpa: A("hut", ["lantern", "sign"]),

  dock: A("pier", ["crates", "barrels"]),
  boatyard: A("pier", ["mast", "crates"]),
  shipyard: A("pier", ["mast", "crates", "flag"]),
  seaRationFactory: A("hall", ["barrels", "smoke"]),

  church: A("hall", ["cross", "bell"], { roof: "#8d8577" }),
  stockade: A("compound", ["stakes", "lantern"]),
  gallows: A("yard", ["noose"]),
  interrogationChamber: A("hut", ["skull", "lantern"], { roof: "#4a423c" }),
  apothecary: A("hut", ["sign"]),
  hotel: A("compound", ["flag", "lantern"], { storeys: 2 }),
  orderlyShrubs: A("decor", ["hedge"]),
  veryOrderlyDecor: A("decor", ["hedge"]),
  scaryDecor: A("decor", ["skull"]),
  veryScaryDecor: A("decor", ["skull"]),

  gunnerySchool: A("hall", ["cannon", "target"]),
  marksmanshipSchool: A("hall", ["target"]),
  navigationSchool: A("hall", ["telescope"]),
  seamanshipSchool: A("hall", ["mast"]),
  swordsmanshipSchool: A("hall", ["target"]),

  watchTower: A("tower", ["lantern"]),
  protectiveCannon: A("decor", ["cannon"]),
  safeHarborAnchor: A("decor", ["anchor"]),
  anarchyShrubs: A("decor", ["hedge"]),
  anarchyDecor: A("decor", ["jollyRoger"]),
  fort: A("compound", ["cannon", "flag", "stakes"], { storeys: 2 }),
  observatory: A("tower", ["telescope"]),
  surgery: A("hut", ["sign", "lantern"]),

  carpenterShop: A("hut", ["crates", "anvil"]),
  hatShop: A("hut", ["hat", "sign"]),
  parrotAviary: A("yard", ["birdcage", "stakes"]),
  graveyard: A("yard", ["graves", "cross"]),
};

/** Draws a building of the given type at the brush's origin. */
export function drawBuilding(brush: Brush, id: BuildingId, level = 0): void {
  const def = BUILDINGS[id];
  const spec = BUILDING_ART[id];
  const style = CATEGORY_STYLE[def.category];
  const roof = spec.roof ?? style.roof;
  const wall = spec.wall ?? style.wall;
  const w = def.w;
  const h = def.h;

  switch (spec.archetype) {
    case "hut":
      drawHut(brush, w, h, roof, wall, spec.storeys ?? 1);
      break;
    case "hall":
      drawHall(brush, w, h, roof, wall, spec.storeys ?? 1);
      break;
    case "tent":
      drawTent(brush, w, h, roof);
      break;
    case "tower":
      drawTower(brush, w, h, roof, wall);
      break;
    case "compound":
      drawCompound(brush, w, h, roof, wall, style.trim, spec.storeys ?? 1);
      break;
    case "field":
      drawField(brush, w, h, style.trim);
      break;
    case "mine":
      drawMine(brush, w, h, wall);
      break;
    case "pier":
      drawPier(brush, w, h, roof, wall);
      break;
    case "yard":
      drawYard(brush, w, h, style.trim);
      break;
    case "plot":
      drawPlot(brush, w, h, level);
      break;
    case "decor":
      break;
  }

  for (const accent of spec.accents ?? []) drawAccent(brush, accent, w, h, style.trim);
}

// ── Archetypes ──────────────────────────────────────────────────────────────

function drawHut(
  brush: Brush,
  w: number,
  h: number,
  roof: string,
  wall: string,
  storeys: number,
): void {
  const inset = 0.14;
  const height = 0.55 + storeys * 0.35;
  box(brush, inset, inset, w - inset * 2, h - inset * 2, 0, height, wall);
  gableRoof(brush, -0.05, -0.05, w + 0.1, h + 0.1, height, 0.45, roof);
  drawDoor(brush, w, h, shade(wall, -0.45));
}

function drawHall(
  brush: Brush,
  w: number,
  h: number,
  roof: string,
  wall: string,
  storeys: number,
): void {
  const inset = 0.1;
  const height = 0.7 + storeys * 0.45;
  box(brush, inset, inset, w - inset * 2, h - inset * 2, 0, height, wall);
  gableRoof(brush, -0.08, -0.08, w + 0.16, h + 0.16, height, 0.6, roof);
  // A lean-to along the long side breaks the silhouette up.
  if (w >= h) box(brush, 0.2, h - 0.55, w - 0.4, 0.5, 0, height * 0.55, shade(wall, -0.1));
  else box(brush, w - 0.55, 0.2, 0.5, h - 0.4, 0, height * 0.55, shade(wall, -0.1));
  drawDoor(brush, w, h, shade(wall, -0.45));
}

function drawTent(brush: Brush, w: number, h: number, roof: string): void {
  ground(brush, 0.05, 0.05, w - 0.1, h - 0.1, "#8d7a5a");
  tent(brush, 0.1, 0.1, w - 0.2, h - 0.2, 0.75, shade(roof, 0.22));
  post(brush, 0.1, h / 2, 0, 0.95, "#6b5334", 0.09);
  post(brush, w - 0.1, h / 2, 0, 0.95, "#6b5334", 0.09);
}

function drawTower(brush: Brush, w: number, h: number, roof: string, wall: string): void {
  const inset = 0.2;
  box(brush, inset, inset, w - inset * 2, h - inset * 2, 0, 1.9, wall);
  box(brush, 0.05, 0.05, w - 0.1, h - 0.1, 1.9, 0.22, shade(wall, -0.2));
  hipRoof(brush, 0.02, 0.02, w - 0.04, h - 0.04, 2.12, 0.7, roof);
}

function drawCompound(
  brush: Brush,
  w: number,
  h: number,
  roof: string,
  wall: string,
  trim: string,
  storeys: number,
): void {
  ground(brush, 0, 0, w, h, shade(trim, 0.35));
  // Curtain wall.
  const t = 0.32;
  const wallHeight = 0.65;
  box(brush, 0, 0, w, t, 0, wallHeight, shade(wall, -0.06));
  box(brush, 0, h - t, w, t, 0, wallHeight, shade(wall, -0.06));
  box(brush, 0, 0, t, h, 0, wallHeight, shade(wall, -0.06));
  box(brush, w - t, 0, t, h, 0, wallHeight, shade(wall, -0.06));
  // Corner turrets.
  for (const [cx, cy] of [
    [0, 0],
    [w - 0.55, 0],
    [0, h - 0.55],
    [w - 0.55, h - 0.55],
  ] as const) {
    box(brush, cx, cy, 0.55, 0.55, 0, wallHeight + 0.35, shade(wall, 0.05));
  }
  // Keep.
  const kw = Math.max(1.2, w * 0.42);
  const kh = Math.max(1.2, h * 0.42);
  const kx = (w - kw) / 2;
  const ky = (h - kh) / 2;
  const keepHeight = 0.8 + storeys * 0.55;
  box(brush, kx, ky, kw, kh, 0, keepHeight, wall);
  hipRoof(brush, kx - 0.1, ky - 0.1, kw + 0.2, kh + 0.2, keepHeight, 0.65, roof);
}

function drawField(brush: Brush, w: number, h: number, trim: string): void {
  ground(brush, 0, 0, w, h, "#8a7b4e");
  furrows(brush, 0.1, 0.1, w - 0.2, h - 0.2, shade(trim, 0.25), Math.max(3, Math.round(h * 3)));
  // A small shed on one corner so the field is clearly a farm.
  box(brush, w - 0.95, 0.1, 0.85, 0.7, 0, 0.55, "#b9a37f");
  gableRoof(brush, w - 1.02, 0.03, 0.99, 0.84, 0.55, 0.3, "#8a5f45");
}

function drawMine(brush: Brush, w: number, h: number, wall: string): void {
  ground(brush, 0, 0, w, h, "#6f6650");
  // Spoil heap.
  const c = project(brush, w * 0.7, h * 0.7, 0);
  const { ctx } = brush;
  ctx.fillStyle = "#5d5546";
  ctx.beginPath();
  ctx.ellipse(c.sx, c.sy - 4, 20, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Headframe over the shaft.
  const hx = w * 0.32;
  const hy = h * 0.35;
  for (const [dx, dy] of [
    [-0.35, -0.35],
    [0.35, -0.35],
    [-0.35, 0.35],
    [0.35, 0.35],
  ] as const) {
    post(brush, hx + dx, hy + dy, 0, 1.3, "#6b5334", 0.12);
  }
  box(brush, hx - 0.4, hy - 0.4, 0.8, 0.8, 1.3, 0.18, shade(wall, -0.3));
  // The shaft mouth.
  const mouth = project(brush, hx, hy, 0);
  ctx.fillStyle = "#241f18";
  ctx.beginPath();
  ctx.ellipse(mouth.sx, mouth.sy, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPier(brush: Brush, w: number, h: number, roof: string, wall: string): void {
  // Decking on piles.
  ground(brush, 0, 0, w, h, "#9c8055");
  const { ctx } = brush;
  ctx.strokeStyle = "#7d663f";
  ctx.lineWidth = 1.5;
  for (let i = 0.5; i < w; i += 0.5) {
    const a = project(brush, i, 0, 0);
    const b = project(brush, i, h, 0);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  // Warehouse at the landward end.
  const bw = Math.min(w - 0.6, 2.4);
  const bh = Math.min(h - 0.6, 2);
  box(brush, 0.3, 0.3, bw, bh, 0, 0.95, wall);
  gableRoof(brush, 0.22, 0.22, bw + 0.16, bh + 0.16, 0.95, 0.5, roof);
  for (const [px, py] of [
    [w - 0.2, 0.2],
    [w - 0.2, h - 0.2],
    [0.2, h - 0.2],
  ] as const) {
    post(brush, px, py, 0, 0.35, "#6b5334", 0.14);
  }
}

function drawYard(brush: Brush, w: number, h: number, trim: string): void {
  ground(brush, 0, 0, w, h, shade(trim, 0.3));
  const { ctx } = brush;
  ctx.strokeStyle = shade(trim, -0.1);
  ctx.lineWidth = 1;
  const a = project(brush, 0.2, 0.2, 0);
  const b = project(brush, w - 0.2, h - 0.2, 0);
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.stroke();
}

/** A pirate's plot, which grows from bare ground to a mansion with his rank. */
function drawPlot(brush: Brush, w: number, h: number, level: number): void {
  ground(brush, 0, 0, w, h, "#9b8a63");
  if (level <= 0) {
    // Bare staked plot.
    for (const [px, py] of [
      [0.3, 0.3],
      [w - 0.3, 0.3],
      [0.3, h - 0.3],
      [w - 0.3, h - 0.3],
    ] as const) {
      post(brush, px, py, 0, 0.3, "#6b5334", 0.1);
    }
    return;
  }

  const grade = Math.min(level, 8) / 8;
  const size = 0.9 + grade * (w - 1.6);
  const x = (w - size) / 2;
  const y = (h - size) / 2;
  const height = 0.5 + grade * 1.5;
  const wallColour = level >= 6 ? "#e2d3b4" : level >= 3 ? "#c9b58e" : "#a8926c";
  box(brush, x, y, size, size, 0, height, wallColour);
  if (level >= 7) {
    hipRoof(brush, x - 0.1, y - 0.1, size + 0.2, size + 0.2, height, 0.55, "#7a3f36");
    post(brush, x + size / 2, y + size / 2, height + 0.55, 0.5, "#4a3a2a", 0.07);
  } else if (level >= 2) {
    gableRoof(brush, x - 0.08, y - 0.08, size + 0.16, size + 0.16, height, 0.42, "#8b5a3c");
  } else {
    tent(brush, x, y, size, size, 0.5, "#c7b183");
  }
}

// ── Accents ─────────────────────────────────────────────────────────────────

function drawDoor(brush: Brush, w: number, h: number, colour: string): void {
  banner(brush, w / 2 - 0.18, h - 0.14, 0, 0.36, 0.42, colour);
}

function drawAccent(brush: Brush, accent: Accent, w: number, h: number, trim: string): void {
  const { ctx } = brush;
  switch (accent) {
    case "chimney":
      box(brush, w - 0.75, 0.28, 0.34, 0.34, 0.9, 0.95, "#7a6a5a");
      break;
    case "smoke": {
      const s = project(brush, w - 0.6, 0.4, 2.1);
      ctx.fillStyle = "rgba(220, 220, 215, 0.42)";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(s.sx + i * 3, s.sy - i * 9, 7 + i * 2.5, 5 + i * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "barrels":
      cylinder(brush, 0.42, h - 0.4, 0.2, 0, 0.34, "#8a6236");
      cylinder(brush, 0.82, h - 0.36, 0.2, 0, 0.34, "#966c3d");
      cylinder(brush, 0.62, h - 0.42, 0.2, 0.34, 0.34, "#8a6236");
      break;
    case "still":
      cylinder(brush, w - 0.8, h - 0.75, 0.34, 0.9, 0.5, "#b5793a");
      post(brush, w - 0.8, h - 0.75, 1.4, 0.4, "#8a5c2c", 0.08);
      break;
    case "wheel": {
      const c = project(brush, 0.25, h - 0.5, 0.55);
      ctx.strokeStyle = "#6b5334";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c.sx, c.sy);
        ctx.lineTo(c.sx + Math.cos(a) * 15, c.sy + Math.sin(a) * 15);
        ctx.stroke();
      }
      break;
    }
    case "anvil":
      box(brush, 0.4, h - 0.55, 0.42, 0.28, 0, 0.2, "#54504a");
      box(brush, 0.46, h - 0.5, 0.3, 0.18, 0.2, 0.14, "#3f3c38");
      break;
    case "sign": {
      post(brush, w - 0.35, h - 0.2, 0, 1.05, "#5b452c", 0.09);
      banner(brush, w - 0.75, h - 0.2, 0.75, 0.72, 0.36, "#c9a24a");
      break;
    }
    case "flag":
      post(brush, w / 2, h / 2, 1.6, 1.1, "#4a3a2a", 0.07);
      banner(brush, w / 2, h / 2, 2.3, 0.7, 0.34, "#b7423a");
      break;
    case "jollyRoger":
      post(brush, w / 2, h / 2, 0, 1.2, "#3a3128", 0.08);
      banner(brush, w / 2, h / 2, 0.85, 0.62, 0.34, "#1c1a18");
      break;
    case "noose": {
      post(brush, w * 0.5, h * 0.35, 0, 1.6, "#6b5334", 0.13);
      post(brush, w * 0.5, h * 0.35, 1.6, 0, "#6b5334", 0.1);
      const beam = project(brush, w * 0.5, h * 0.35, 1.6);
      const arm = project(brush, w * 0.5 + 0.9, h * 0.35, 1.6);
      ctx.strokeStyle = "#6b5334";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(beam.sx, beam.sy);
      ctx.lineTo(arm.sx, arm.sy);
      ctx.stroke();
      ctx.strokeStyle = "#d8c9a4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arm.sx, arm.sy);
      ctx.lineTo(arm.sx, arm.sy + 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(arm.sx, arm.sy + 21, 5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "graves":
      for (const [gx, gy] of [
        [0.5, 0.5],
        [1.3, 0.7],
        [0.8, 1.3],
        [2.0, 1.1],
      ] as const) {
        if (gx > w - 0.2 || gy > h - 0.2) continue;
        banner(brush, gx, gy, 0, 0.3, 0.4, "#9a958c");
      }
      break;
    case "skull": {
      post(brush, w / 2, h / 2, 0, 0.65, "#5b452c", 0.08);
      const s = project(brush, w / 2, h / 2, 0.65);
      ctx.fillStyle = "#e6e0d0";
      ctx.beginPath();
      ctx.arc(s.sx, s.sy - 3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#241f18";
      ctx.beginPath();
      ctx.arc(s.sx - 2.2, s.sy - 4, 1.6, 0, Math.PI * 2);
      ctx.arc(s.sx + 2.2, s.sy - 4, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "lantern": {
      const l = project(brush, 0.25, 0.25, 1.0);
      ctx.fillStyle = "#f0c35c";
      ctx.beginPath();
      ctx.arc(l.sx, l.sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(240, 195, 92, 0.22)";
      ctx.beginPath();
      ctx.arc(l.sx, l.sy, 11, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "cannon": {
      const c = project(brush, w - 0.6, h - 0.6, 0.16);
      ctx.fillStyle = "#3c3a37";
      ctx.beginPath();
      ctx.ellipse(c.sx, c.sy, 13, 5, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5b4a33";
      ctx.fillRect(c.sx - 8, c.sy + 2, 16, 5);
      break;
    }
    case "anchor": {
      const c = project(brush, w / 2, h / 2, 0.1);
      ctx.strokeStyle = "#6d7378";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.sx, c.sy - 16);
      ctx.lineTo(c.sx, c.sy + 4);
      ctx.moveTo(c.sx - 7, c.sy - 11);
      ctx.lineTo(c.sx + 7, c.sy - 11);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.sx, c.sy + 2, 7, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      break;
    }
    case "mast": {
      post(brush, w - 1.0, h / 2, 0, 2.6, "#6b5334", 0.12);
      const top = project(brush, w - 1.0, h / 2, 2.6);
      ctx.strokeStyle = "#6b5334";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(top.sx - 16, top.sy + 12);
      ctx.lineTo(top.sx + 16, top.sy + 12);
      ctx.stroke();
      break;
    }
    case "crates":
      box(brush, w - 0.85, h - 0.85, 0.42, 0.42, 0, 0.34, "#a07c47");
      box(brush, w - 0.5, h - 0.5, 0.34, 0.34, 0, 0.28, "#8d6b3c");
      box(brush, w - 0.8, h - 0.8, 0.34, 0.34, 0.34, 0.26, "#96733f");
      break;
    case "cross":
      post(brush, w / 2, 0.35, 1.35, 0.55, "#e8dfc6", 0.09);
      banner(brush, w / 2 - 0.2, 0.35, 1.68, 0.4, 0.09, "#e8dfc6");
      break;
    case "bell":
      cone(brush, w - 0.6, 0.4, 0.18, 1.35, -0.28, "#b0913f");
      break;
    case "pit": {
      const c = project(brush, w / 2, h / 2, 0);
      ctx.fillStyle = "#3a2f22";
      ctx.beginPath();
      ctx.ellipse(c.sx, c.sy, 22, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6b5334";
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "cauldron":
      cylinder(brush, w / 2, h / 2, 0.28, 0.1, 0.3, "#40403c");
      break;
    case "hedge": {
      const c = project(brush, w / 2, h / 2, 0);
      ctx.fillStyle = "#4f7a3a";
      ctx.beginPath();
      ctx.ellipse(c.sx, c.sy - 6, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5f8f45";
      ctx.beginPath();
      ctx.ellipse(c.sx - 3, c.sy - 10, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "stakes":
      palisade(brush, 0.1, 0.1, w - 0.2, h - 0.2, 0.5, "#6b5334");
      break;
    case "birdcage":
      cylinder(brush, w / 2, h / 2, 0.35, 0, 0.9, "#b9a37f");
      cone(brush, w / 2, h / 2, 0.4, 0.9, 0.35, "#7a5a86");
      break;
    case "hat": {
      const c = project(brush, w - 0.5, 0.5, 0.95);
      ctx.fillStyle = "#2b2b30";
      ctx.beginPath();
      ctx.ellipse(c.sx, c.sy, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.sx, c.sy - 5, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "telescope": {
      const c = project(brush, w / 2, h / 2, 2.3);
      ctx.strokeStyle = "#5d6166";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(c.sx - 8, c.sy + 6);
      ctx.lineTo(c.sx + 10, c.sy - 8);
      ctx.stroke();
      ctx.lineCap = "butt";
      break;
    }
    case "target": {
      const c = project(brush, w - 0.5, h - 0.5, 0.7);
      for (const [r, colour] of [
        [9, "#e8dfc6"],
        [6, "#b7423a"],
        [3, "#e8dfc6"],
      ] as const) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(c.sx, c.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "cane":
      for (let i = 0.4; i < w - 0.2; i += 0.55) {
        post(brush, i, h * 0.5, 0, 0.7, "#8fae52", 0.08);
      }
      break;
    case "leaf":
      for (let i = 0.4; i < w - 0.2; i += 0.5) {
        tree(brush, i, h * 0.6, 0.32, "#6b5334", "#6f9a45");
      }
      break;
    case "fruit":
      for (let i = 0.5; i < w - 0.3; i += 0.9) {
        tree(brush, i, h * 0.55, 0.45, "#7d6440", "#5f8f45");
      }
      break;
  }
  void trim;
}
