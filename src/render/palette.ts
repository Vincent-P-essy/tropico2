import type { BuildingCategory } from "../data/buildings.ts";

/**
 * Every colour in the game.
 *
 * The island is meant to read at a glance: sun-bleached sand and timber for the
 * captives' side of the island, deep reds and blacks where the pirates drink.
 * Category colours are what let you see the zoning problem from the air — a
 * cluster of red roofs against a cluster of pale ones is the whole game's
 * tension in one look.
 */

export const SEA_DEEP = "#123a52";
export const SEA_SHALLOW = "#1e6b83";
export const SEA_FOAM = "#7fd3d8";

export const TERRAIN: readonly { top: string; left: string; right: string }[] = [
  { top: SEA_DEEP, left: "#0f3145", right: "#0c2838" }, // open sea
  { top: SEA_SHALLOW, left: "#1a5b70", right: "#164e60" }, // shallows
  { top: "#e6d7a6", left: "#cbbb8a", right: "#b6a677" }, // beach
  { top: "#8bab5a", left: "#749148", right: "#637d3c" }, // grassland
  { top: "#4f7f3f", left: "#416b34", right: "#37592c" }, // jungle
  { top: "#9c8f72", left: "#83785f", right: "#6f6650" }, // hills
  { top: "#8d8a86", left: "#77746f", right: "#63605c" }, // rock
];

/** Roof and wall colours per building category. */
export const CATEGORY_STYLE: Readonly<
  Record<BuildingCategory, { roof: string; wall: string; trim: string }>
> = {
  infrastructure: { roof: "#a8703c", wall: "#d9c49a", trim: "#7a4f28" },
  resource: { roof: "#7f9a4a", wall: "#cbbf95", trim: "#5d7434" },
  production: { roof: "#8a5f45", wall: "#b9a37f", trim: "#5f4030" },
  entertainment: { roof: "#a63b3b", wall: "#d3a86f", trim: "#6d2323" },
  nautical: { roof: "#3f6c8c", wall: "#c2c8cc", trim: "#28495f" },
  captiveControl: { roof: "#6e6a63", wall: "#b9b3a6", trim: "#4a4740" },
  education: { roof: "#4d6f7a", wall: "#c9cdc4", trim: "#33505a" },
  defense: { roof: "#5c5b57", wall: "#a9a49a", trim: "#3b3a37" },
  accoutrement: { roof: "#7a5a86", wall: "#cbb8d0", trim: "#513a5b" },
};

export const ROAD = { top: "#b09873", left: "#96805f", right: "#826e50" };

export const UI = {
  ink: "#f2e7d0",
  inkDim: "#b6a68a",
  panel: "#1b1712",
  panelEdge: "#3d3226",
  gold: "#e8c46a",
  blood: "#b7423a",
  sea: "#2f7f92",
  good: "#7fb069",
  warn: "#d99b3f",
  bad: "#c9483d",
};

/** Aura overlay colours, used by the map overlays. */
export const AURA_COLOR = {
  anarchy: "#d4622e",
  order: "#4a86c8",
  fear: "#8b4bb0",
  defense: "#3fa07a",
  awe: "#d8b23f",
};

export const PIRATE_COLORS = [
  "#8c2f2f",
  "#7a3b6b",
  "#2f5f8c",
  "#3d6b3a",
  "#8a6a2a",
  "#5a3a7a",
  "#7a4a2a",
];

export const CAPTIVE_COLORS = ["#9a8e76", "#8b8272", "#a39683", "#7f7767", "#93886f"];

/**
 * Parses either `#rgb`, `#rrggbb` or the `rgb(r, g, b)` this module emits.
 *
 * Accepting its own output matters: the drawing primitives shade a colour to
 * light a face, and callers routinely hand them an already-shaded colour. When
 * this only understood hex, every nested call parsed to NaN and painted pure
 * black — which is what turned every tent, curtain wall and lean-to on the
 * island into a silhouette.
 */
export function parseColor(colour: string): [number, number, number] {
  const rgb = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(colour);
  if (rgb) {
    return [Number(rgb[1]) || 0, Number(rgb[2]) || 0, Number(rgb[3]) || 0];
  }
  const value = colour.replace("#", "");
  const expanded = value.length === 3 ? value.replace(/./g, "$&$&") : value;
  const num = Number.parseInt(expanded, 16);
  if (Number.isNaN(num)) return [0, 0, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Nudges a colour lighter (positive amount) or darker (negative) by 0-1. */
export function shade(colour: string, amount: number): string {
  const [r, g, b] = parseColor(colour);
  const mix = (c: number): number =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Same colour at a given opacity. */
export function alpha(colour: string, opacity: number): string {
  const [r, g, b] = parseColor(colour);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
