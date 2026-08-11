import { ByteField, ScalarField } from "../core/field.ts";
import { inBounds, SURROUNDING, type GridSize } from "../core/grid.ts";
import { Noise2D, radialFalloff } from "../core/noise.ts";
import { Rng } from "../core/rng.ts";

/**
 * The island itself: one seed in, a whole world out.
 *
 * Generation is four passes. A radial mask crossed with fractal noise makes a
 * landmass that does not run off the map. A ridged layer raises a spine of hills
 * through the middle. Moisture decides where the jungle grows and where the soil
 * is worth farming. Ore is scattered through the high ground.
 *
 * The result is deterministic: the same seed always produces the same island,
 * down to the last tree, which is what makes a save file a seed plus a list of
 * what you built.
 */

export type Terrain = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DEEP_WATER = 0;
export const SHALLOW_WATER = 1;
export const BEACH = 2;
export const GRASS = 3;
export const JUNGLE = 4;
export const HILLS = 5;
export const ROCK = 6;

export const TERRAIN_NAMES: readonly string[] = [
  "Open sea",
  "Shallows",
  "Beach",
  "Grassland",
  "Jungle",
  "Hills",
  "Rock",
];

export interface Island {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Terrain type per tile. */
  readonly terrain: ByteField;
  /** Elevation in render units, 0 at sea level. */
  readonly elevation: ScalarField;
  /** Standing timber, 0-1. Timber camps consume it and it does not grow back quickly. */
  readonly forest: ScalarField;
  /** Farmland quality, 0-1. Farms need at least `MIN_FERTILITY`. */
  readonly fertility: ScalarField;
  /** Iron in the ground, 0-1. Mines need at least `MIN_ORE`. */
  readonly ore: ScalarField;
}

export const MIN_FERTILITY = 0.45;
export const MIN_ORE = 0.5;
export const MIN_FOREST = 0.3;

export interface IslandOptions {
  readonly seed: number;
  readonly size?: number;
  /** How much of the map is land, roughly 0.2 (atoll) to 0.5 (big island). */
  readonly landmass?: number;
  /** How rugged the interior is. */
  readonly relief?: number;
}

export function generateIsland(options: IslandOptions): Island {
  const size = options.size ?? 64;
  const landmass = options.landmass ?? 0.34;
  const relief = options.relief ?? 0.5;
  const dims: GridSize = { width: size, height: size };

  const rng = new Rng(options.seed);
  const shape = new Noise2D(rng.u32());
  const ridges = new Noise2D(rng.u32());
  const moisture = new Noise2D(rng.u32());
  const minerals = new Noise2D(rng.u32());

  const terrain = new ByteField(dims);
  const elevation = new ScalarField(dims);
  const forest = new ScalarField(dims);
  const fertility = new ScalarField(dims);
  const ore = new ScalarField(dims);

  // Pass one: a height field shaped into an island.
  const heights = new ScalarField(dims);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = shape.fractal(x, y, 5, 0.5, 0.045);
      const mask = radialFalloff(x, y, size, size, 1.8);
      // The mask multiplies rather than subtracts, so coastlines stay ragged
      // instead of turning into a circle.
      const ridge = ridges.ridged(x, y, 3, 0.05) * relief * 0.45;
      heights.set(x, y, (base * 0.75 + ridge) * mask * 2.4);
    }
  }

  // Sea level is chosen so that the requested fraction of the map is land,
  // which keeps every seed playable instead of occasionally producing a puddle.
  const seaLevel = quantile(heights, 1 - landmass);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = heights.get(x, y);
      const above = h - seaLevel;
      const wet = moisture.fractal(x, y, 4, 0.55, 0.06);

      let type: Terrain;
      if (above < -0.12) type = DEEP_WATER;
      else if (above < 0) type = SHALLOW_WATER;
      else if (above < 0.035) type = BEACH;
      else if (above < 0.42) type = wet > 0.52 ? JUNGLE : GRASS;
      else if (above < 0.66) type = HILLS;
      else type = ROCK;

      terrain.set(x, y, type);
      // Deliberately gentle. Taller relief looks dramatic in a heightmap and
      // reads as a staircase of dark wedges once every raised tile draws its
      // own cliff face.
      elevation.set(x, y, Math.max(0, above) * 1.7);

      if (type === JUNGLE) {
        forest.set(x, y, 0.55 + wet * 0.45);
      } else if (type === GRASS) {
        forest.set(x, y, Math.max(0, (wet - 0.4) * 0.9));
      } else if (type === HILLS) {
        forest.set(x, y, Math.max(0, (wet - 0.55) * 0.6));
      }

      if (type === GRASS || type === JUNGLE) {
        // Flat, wet, low ground farms best; the jungle canopy costs a little.
        const flatness = 1 - Math.min(1, above / 0.42);
        const canopy = type === JUNGLE ? 0.85 : 1;
        fertility.set(x, y, Math.min(1, (0.35 + wet * 0.55) * (0.55 + flatness * 0.55) * canopy));
      } else if (type === BEACH) {
        fertility.set(x, y, 0.2);
      }

      if (type === HILLS || type === ROCK) {
        const vein = minerals.fractal(x, y, 3, 0.6, 0.11);
        ore.set(x, y, vein > 0.45 ? Math.min(1, (vein - 0.45) * 3.2) : 0);
      }
    }
  }

  const island: Island = {
    width: size,
    height: size,
    seed: options.seed,
    terrain,
    elevation,
    forest,
    fertility,
    ore,
  };

  guaranteeResources(island);
  return island;
}

/** Fewest tiles of each resource an island must offer to be worth landing on. */
const MIN_ORE_TILES = 9;
const MIN_FERTILE_TILES = 40;
const MIN_FOREST_TILES = 60;

/**
 * Makes every seed playable.
 *
 * Fractal noise is under no obligation to put iron on your island, and an island
 * with no seam has no cutlasses, no cannon and therefore no cruises — the run is
 * dead before it starts and the player cannot see why. Rather than leave that to
 * chance, any resource that came up short is topped up on the tiles that were
 * closest to qualifying, so the deposit still lands where the terrain implies it
 * should.
 */
function guaranteeResources(island: Island): void {
  guaranteeHighGround(island);

  topUp(island, island.ore, MIN_ORE, MIN_ORE_TILES, (x, y) => {
    const type = island.terrain.get(x, y);
    return type === HILLS || type === ROCK;
  });

  topUp(island, island.fertility, MIN_FERTILITY, MIN_FERTILE_TILES, (x, y) => {
    const type = island.terrain.get(x, y);
    return type === GRASS || type === JUNGLE;
  });

  topUp(island, island.forest, MIN_FOREST, MIN_FOREST_TILES, (x, y) => {
    const type = island.terrain.get(x, y);
    return type === GRASS || type === JUNGLE || type === HILLS;
  });
}

/**
 * Some seeds come out entirely flat, with no hills anywhere — and ore only
 * exists in high ground, so on those islands there is nothing to top up. Raise
 * the highest inland ground into hills first, which both fixes the mining
 * problem and gives an otherwise featureless island a skyline.
 */
function guaranteeHighGround(island: Island): void {
  let hills = 0;
  const candidates: { x: number; y: number; elevation: number }[] = [];

  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) {
      const type = island.terrain.get(x, y);
      if (type === HILLS || type === ROCK) hills++;
      else if (type === GRASS || type === JUNGLE) {
        candidates.push({ x, y, elevation: island.elevation.get(x, y) });
      }
    }
  }

  if (hills >= MIN_ORE_TILES) return;

  candidates.sort((a, b) => b.elevation - a.elevation || a.y - b.y || a.x - b.x);
  const needed = Math.min(MIN_ORE_TILES - hills, candidates.length);
  for (let i = 0; i < needed; i++) {
    const tile = candidates[i];
    if (!tile) break;
    island.terrain.set(tile.x, tile.y, HILLS);
    // Hills carry no farmland and only sparse trees.
    island.fertility.set(tile.x, tile.y, 0);
    island.forest.set(tile.x, tile.y, island.forest.get(tile.x, tile.y) * 0.5);
    island.elevation.set(tile.x, tile.y, Math.max(island.elevation.get(tile.x, tile.y), 1.4));
  }
}

/** Raises the best-scoring eligible tiles until `wanted` of them clear `threshold`. */
function topUp(
  island: Island,
  field: ScalarField,
  threshold: number,
  wanted: number,
  eligible: (x: number, y: number) => boolean,
): void {
  const candidates: { x: number; y: number; value: number }[] = [];
  let qualifying = 0;

  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) {
      if (!eligible(x, y)) continue;
      const value = field.get(x, y);
      if (value >= threshold) qualifying++;
      else candidates.push({ x, y, value });
    }
  }

  if (qualifying >= wanted) return;

  // Deterministic: sort by how close the tile already was, then by position.
  candidates.sort((a, b) => b.value - a.value || a.y - b.y || a.x - b.x);
  const needed = Math.min(wanted - qualifying, candidates.length);
  for (let i = 0; i < needed; i++) {
    const tile = candidates[i];
    if (!tile) break;
    field.set(tile.x, tile.y, Math.min(1, threshold + 0.12));
  }
}

/** The value below which `fraction` of the field's tiles fall. */
function quantile(field: ScalarField, fraction: number): number {
  const values = Array.from(field.data).sort((a, b) => a - b);
  const index = Math.floor(Math.min(1, Math.max(0, fraction)) * (values.length - 1));
  return values[index] ?? 0;
}

export function isWater(island: Island, x: number, y: number): boolean {
  return island.terrain.get(x, y) <= SHALLOW_WATER;
}

export function isLand(island: Island, x: number, y: number): boolean {
  return inBounds(island, x, y) && island.terrain.get(x, y) > SHALLOW_WATER;
}

/** Land with water next to it: where docks, boatyards and forts may be sited. */
export function isCoast(island: Island, x: number, y: number): boolean {
  if (!isLand(island, x, y)) return false;
  for (const step of SURROUNDING) {
    if (isWater(island, x + step.x, y + step.y) && inBounds(island, x + step.x, y + step.y)) {
      return true;
    }
  }
  return false;
}

/** Rock is too steep to build on; everything else on land is fair game. */
export function isBuildable(island: Island, x: number, y: number): boolean {
  const type = island.terrain.get(x, y);
  return inBounds(island, x, y) && type >= BEACH && type !== ROCK;
}

/** Total standing timber, for the "are we going to run out of wood" question. */
export function totalForest(island: Island): number {
  let total = 0;
  for (const value of island.forest.data) total += value;
  return total;
}

export function landTiles(island: Island): number {
  let total = 0;
  for (const value of island.terrain.data) if (value > SHALLOW_WATER) total++;
  return total;
}

/**
 * A reasonable place to put the starting settlement: the largest flat, buildable
 * area within reach of the coast. Scenarios drop the stockade and the first
 * roads here.
 */
export function findStartSite(island: Island, footprint = 7): { x: number; y: number } {
  let best = { x: Math.floor(island.width / 2), y: Math.floor(island.height / 2) };
  let bestScore = -Infinity;

  for (let y = 2; y < island.height - footprint - 2; y++) {
    for (let x = 2; x < island.width - footprint - 2; x++) {
      let buildable = 0;
      let coastal = 0;
      let minElevation = Infinity;
      let maxElevation = -Infinity;

      for (let dy = 0; dy < footprint; dy++) {
        for (let dx = 0; dx < footprint; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (isBuildable(island, tx, ty)) buildable++;
          if (isCoast(island, tx, ty)) coastal++;
          const e = island.elevation.get(tx, ty);
          minElevation = Math.min(minElevation, e);
          maxElevation = Math.max(maxElevation, e);
        }
      }
      const elevationSpread = maxElevation - minElevation;

      const area = footprint * footprint;
      if (buildable < area * 0.9) continue;

      // Flat, fully buildable, and with the sea in sight.
      const score = buildable * 2 + Math.min(coastal, 8) * 5 - elevationSpread * 14;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }

  return best;
}
