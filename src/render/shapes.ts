import { HALF_H, HALF_W } from "../core/iso.ts";
import { shade } from "./palette.ts";

/**
 * Isometric drawing primitives.
 *
 * Every building in the game is assembled from these: a box with a top and two
 * lit sides, a roof, a post, a tent. Nothing is loaded from disk — the whole
 * island is drawn with paths and fills, so the game is one bundle with no
 * assets to ship, wait for, or 404.
 *
 * All primitives work in *tile space*: (0,0) is the anchor tile of a footprint
 * and one unit is one tile, which keeps the building recipes readable.
 */

export interface Brush {
  ctx: CanvasRenderingContext2D;
  /** Screen position of the footprint's anchor tile centre. */
  originX: number;
  originY: number;
}

/** Tile-space point to screen point. */
export function project(brush: Brush, x: number, y: number, z = 0): { sx: number; sy: number } {
  return {
    sx: brush.originX + (x - y) * HALF_W,
    sy: brush.originY + (x + y) * HALF_H - z * HALF_H * 1.35,
  };
}

function polygon(
  brush: Brush,
  points: readonly [number, number, number][],
  fill: string,
  stroke?: string,
): void {
  const { ctx } = brush;
  ctx.beginPath();
  points.forEach(([x, y, z], i) => {
    const p = project(brush, x, y, z);
    if (i === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** A flat diamond lying on the ground, e.g. a yard or a field. */
export function ground(
  brush: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  polygon(
    brush,
    [
      [x, y, 0],
      [x + w, y, 0],
      [x + w, y + h, 0],
      [x, y + h, 0],
    ],
    fill,
  );
}

/**
 * A rectangular block: the workhorse. Draws the two visible walls then the top,
 * shading each face so the light reads consistently across the island.
 */
export function box(
  brush: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  height: number,
  colour: string,
): void {
  const top = z + height;
  // South-east wall (facing the camera's right).
  polygon(
    brush,
    [
      [x + w, y, z],
      [x + w, y + h, z],
      [x + w, y + h, top],
      [x + w, y, top],
    ],
    shade(colour, -0.28),
  );
  // South-west wall (facing the camera's left).
  polygon(
    brush,
    [
      [x, y + h, z],
      [x + w, y + h, z],
      [x + w, y + h, top],
      [x, y + h, top],
    ],
    shade(colour, -0.14),
  );
  // Roof plane.
  polygon(
    brush,
    [
      [x, y, top],
      [x + w, y, top],
      [x + w, y + h, top],
      [x, y + h, top],
    ],
    colour,
  );
}

/** A ridged roof running along the longer axis, for houses and workshops. */
export function gableRoof(
  brush: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  rise: number,
  colour: string,
): void {
  const alongX = w >= h;
  const midY = y + h / 2;
  const midX = x + w / 2;

  if (alongX) {
    polygon(
      brush,
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, midY, z + rise],
        [x, midY, z + rise],
      ],
      shade(colour, 0.1),
    );
    polygon(
      brush,
      [
        [x, y + h, z],
        [x + w, y + h, z],
        [x + w, midY, z + rise],
        [x, midY, z + rise],
      ],
      shade(colour, -0.2),
    );
  } else {
    polygon(
      brush,
      [
        [x, y, z],
        [x, y + h, z],
        [midX, y + h, z + rise],
        [midX, y, z + rise],
      ],
      shade(colour, 0.08),
    );
    polygon(
      brush,
      [
        [x + w, y, z],
        [x + w, y + h, z],
        [midX, y + h, z + rise],
        [midX, y, z + rise],
      ],
      shade(colour, -0.24),
    );
  }
}

/** A four-sided pyramid roof, for towers and grander buildings. */
export function hipRoof(
  brush: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  rise: number,
  colour: string,
): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const faces: [readonly [number, number, number][], number][] = [
    [
      [
        [x, y, z],
        [x + w, y, z],
        [cx, cy, z + rise],
      ],
      0.14,
    ],
    [
      [
        [x + w, y, z],
        [x + w, y + h, z],
        [cx, cy, z + rise],
      ],
      -0.3,
    ],
    [
      [
        [x + w, y + h, z],
        [x, y + h, z],
        [cx, cy, z + rise],
      ],
      -0.16,
    ],
    [
      [
        [x, y + h, z],
        [x, y, z],
        [cx, cy, z + rise],
      ],
      0.02,
    ],
  ];
  for (const [points, light] of faces) polygon(brush, points, shade(colour, light));
}

/** A conical roof for round buildings, drawn as a fan of triangles. */
export function cone(
  brush: Brush,
  cx: number,
  cy: number,
  radius: number,
  z: number,
  rise: number,
  colour: string,
): void {
  const segments = 10;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    polygon(
      brush,
      [
        [cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, z],
        [cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, z],
        [cx, cy, z + rise],
      ],
      shade(colour, Math.sin(a0 + 0.6) * 0.22 - 0.08),
    );
  }
}

/** A cylinder: barrels, silos, chimneys. */
export function cylinder(
  brush: Brush,
  cx: number,
  cy: number,
  radius: number,
  z: number,
  height: number,
  colour: string,
): void {
  const segments = 10;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    // Only the near half of the wall is visible.
    if (Math.sin(a0) < -0.05 && Math.sin(a1) < -0.05) continue;
    polygon(
      brush,
      [
        [cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, z],
        [cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, z],
        [cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, z + height],
        [cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, z + height],
      ],
      shade(colour, Math.cos(a0) * 0.2 - 0.12),
    );
  }
  const cap: [number, number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    cap.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, z + height]);
  }
  polygon(brush, cap, colour);
}

/** A slim upright: posts, masts, palisade stakes, gallows uprights. */
export function post(
  brush: Brush,
  x: number,
  y: number,
  z: number,
  height: number,
  colour: string,
  thickness = 0.12,
): void {
  box(brush, x - thickness / 2, y - thickness / 2, thickness, thickness, z, height, colour);
}

/** A canvas tent: two sloping faces meeting at a ridge. */
export function tent(
  brush: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  rise: number,
  colour: string,
): void {
  gableRoof(brush, x, y, w, h, 0, rise, colour);
}

/** A flat quad standing upright, for signs, sails and flags. */
export function banner(
  brush: Brush,
  x: number,
  y: number,
  z: number,
  w: number,
  height: number,
  colour: string,
): void {
  polygon(
    brush,
    [
      [x, y, z],
      [x + w, y, z],
      [x + w, y, z + height],
      [x, y, z + height],
    ],
    colour,
  );
}

/** Rows of crops or furrows across a field. */
export function furrows(
  brush: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  rows = 5,
): void {
  const { ctx } = brush;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  for (let i = 1; i < rows; i++) {
    const t = (i / rows) * h;
    const a = project(brush, x, y + t, 0);
    const b = project(brush, x + w, y + t, 0);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
}

/** A ring of stakes around a footprint. */
export function palisade(
  brush: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  height: number,
  colour: string,
): void {
  const step = 0.5;
  for (let i = 0; i <= w; i += step) {
    post(brush, x + i, y, 0, height, colour, 0.14);
    post(brush, x + i, y + h, 0, height, colour, 0.14);
  }
  for (let i = step; i < h; i += step) {
    post(brush, x, y + i, 0, height, colour, 0.14);
    post(brush, x + w, y + i, 0, height, colour, 0.14);
  }
}

/** A tree, drawn as a trunk and two canopy blobs. */
export function tree(
  brush: Brush,
  x: number,
  y: number,
  scale: number,
  trunk: string,
  leaves: string,
): void {
  post(brush, x, y, 0, 0.5 * scale, trunk, 0.16 * scale);
  const top = project(brush, x, y, 0.5 * scale);
  const { ctx } = brush;
  ctx.fillStyle = leaves;
  ctx.beginPath();
  ctx.ellipse(top.sx, top.sy - 5 * scale, 11 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(leaves, 0.16);
  ctx.beginPath();
  ctx.ellipse(top.sx - 3 * scale, top.sy - 9 * scale, 7 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A palm, for the beaches. */
export function palm(brush: Brush, x: number, y: number, scale: number): void {
  post(brush, x, y, 0, 0.9 * scale, "#8a6c46", 0.1 * scale);
  const top = project(brush, x, y, 0.9 * scale);
  const { ctx } = brush;
  ctx.strokeStyle = "#4f8a45";
  ctx.lineWidth = 2.4 * scale;
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(top.sx, top.sy);
    ctx.quadraticCurveTo(
      top.sx + Math.cos(a) * 8 * scale,
      top.sy + Math.sin(a) * 4 * scale - 6 * scale,
      top.sx + Math.cos(a) * 15 * scale,
      top.sy + Math.sin(a) * 7 * scale,
    );
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}
