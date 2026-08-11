import { describe, expect, it } from "vitest";
import {
  BEACH,
  DEEP_WATER,
  findStartSite,
  generateIsland,
  GRASS,
  HILLS,
  MIN_FOREST,
  isBuildable,
  isCoast,
  isLand,
  isWater,
  JUNGLE,
  landTiles,
  MIN_FERTILITY,
  MIN_ORE,
  ROCK,
  SHALLOW_WATER,
  TERRAIN_NAMES,
  totalForest,
  type Island,
} from "./island.ts";

const island = generateIsland({ seed: 1650, size: 48 });

const everyTile = (fn: (x: number, y: number) => void): void => {
  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) fn(x, y);
  }
};

describe("generateIsland", () => {
  it("is deterministic for a seed", () => {
    const a = generateIsland({ seed: 99, size: 32 });
    const b = generateIsland({ seed: 99, size: 32 });
    expect(Array.from(a.terrain.data)).toEqual(Array.from(b.terrain.data));
    expect(Array.from(a.forest.data)).toEqual(Array.from(b.forest.data));
    expect(Array.from(a.ore.data)).toEqual(Array.from(b.ore.data));
  });

  it("makes different islands for different seeds", () => {
    const a = generateIsland({ seed: 1, size: 32 });
    const b = generateIsland({ seed: 2, size: 32 });
    expect(Array.from(a.terrain.data)).not.toEqual(Array.from(b.terrain.data));
  });

  it("returns the requested size", () => {
    const small = generateIsland({ seed: 5, size: 24 });
    expect(small.width).toBe(24);
    expect(small.height).toBe(24);
    expect(small.terrain.data).toHaveLength(24 * 24);
  });

  it("only uses terrain types it has names for", () => {
    everyTile((x, y) => {
      const type = island.terrain.get(x, y);
      expect(type).toBeGreaterThanOrEqual(DEEP_WATER);
      expect(type).toBeLessThanOrEqual(ROCK);
      expect(TERRAIN_NAMES[type]).toBeDefined();
    });
  });

  it("surrounds the land with sea", () => {
    for (let i = 0; i < island.width; i++) {
      expect(isWater(island, i, 0)).toBe(true);
      expect(isWater(island, i, island.height - 1)).toBe(true);
      expect(isWater(island, 0, i)).toBe(true);
      expect(isWater(island, island.width - 1, i)).toBe(true);
    }
  });

  it("makes an island, not a puddle or a continent", () => {
    const land = landTiles(island);
    const total = island.width * island.height;
    expect(land / total).toBeGreaterThan(0.15);
    expect(land / total).toBeLessThan(0.55);
  });

  it("hits roughly the requested landmass fraction", () => {
    for (const landmass of [0.25, 0.35, 0.45]) {
      const generated = generateIsland({ seed: 7, size: 48, landmass });
      const fraction = landTiles(generated) / (generated.width * generated.height);
      expect(Math.abs(fraction - landmass)).toBeLessThan(0.09);
    }
  });

  it("never puts land below sea level or water above it", () => {
    everyTile((x, y) => {
      if (isWater(island, x, y)) expect(island.elevation.get(x, y)).toBe(0);
      else expect(island.elevation.get(x, y)).toBeGreaterThanOrEqual(0);
    });
  });

  it("grows forest only on land", () => {
    everyTile((x, y) => {
      if (isWater(island, x, y)) expect(island.forest.get(x, y)).toBe(0);
    });
  });

  it("puts the thickest forest in the jungle", () => {
    let jungleTotal = 0;
    let jungleCount = 0;
    everyTile((x, y) => {
      if (island.terrain.get(x, y) === JUNGLE) {
        jungleTotal += island.forest.get(x, y);
        jungleCount++;
      }
    });
    if (jungleCount > 0) expect(jungleTotal / jungleCount).toBeGreaterThan(0.5);
  });

  it("leaves standing timber to cut", () => {
    expect(totalForest(island)).toBeGreaterThan(20);
  });

  it("only makes fertile ground on land, never on rock", () => {
    everyTile((x, y) => {
      if (isWater(island, x, y) || island.terrain.get(x, y) === ROCK) {
        expect(island.fertility.get(x, y)).toBe(0);
      }
    });
  });

  it("leaves somewhere worth farming", () => {
    let farmable = 0;
    everyTile((x, y) => {
      if (island.fertility.get(x, y) >= MIN_FERTILITY) farmable++;
    });
    expect(farmable).toBeGreaterThan(20);
  });

  it("puts ore only in high ground", () => {
    everyTile((x, y) => {
      const type = island.terrain.get(x, y);
      if (island.ore.get(x, y) > 0) expect(type).toBeGreaterThanOrEqual(5);
    });
  });

  it("keeps every field inside its range", () => {
    everyTile((x, y) => {
      for (const value of [
        island.forest.get(x, y),
        island.fertility.get(x, y),
        island.ore.get(x, y),
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  it("leaves a mineable seam on every seed", () => {
    // An island with no iron can never arm a ship, so the run would be dead on
    // arrival with nothing on screen to explain why. Every seed must be playable.
    for (let seed = 1; seed <= 25; seed++) {
      const generated = generateIsland({ seed, size: 48 });
      let mineable = 0;
      for (const value of generated.ore.data) if (value >= MIN_ORE) mineable++;
      expect(mineable, `seed ${seed} has no mineable ore`).toBeGreaterThan(0);
    }
  });

  it("leaves farmland and timber on every seed", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const generated = generateIsland({ seed, size: 48 });
      let fertile = 0;
      let wooded = 0;
      for (const value of generated.fertility.data) if (value >= MIN_FERTILITY) fertile++;
      for (const value of generated.forest.data) if (value >= MIN_FOREST) wooded++;
      expect(fertile, `seed ${seed} has no farmland`).toBeGreaterThan(20);
      expect(wooded, `seed ${seed} has no timber`).toBeGreaterThan(30);
    }
  });

  it("only tops resources up where the terrain allows them", () => {
    for (let seed = 30; seed <= 36; seed++) {
      const generated = generateIsland({ seed, size: 40 });
      for (let y = 0; y < generated.height; y++) {
        for (let x = 0; x < generated.width; x++) {
          const type = generated.terrain.get(x, y);
          if (generated.ore.get(x, y) > 0) expect(type).toBeGreaterThanOrEqual(HILLS);
          if (generated.fertility.get(x, y) >= MIN_FERTILITY) {
            expect([GRASS, JUNGLE]).toContain(type);
          }
        }
      }
    }
  });
});

describe("terrain queries", () => {
  it("treats deep and shallow water as water and nothing else", () => {
    everyTile((x, y) => {
      const type = island.terrain.get(x, y);
      const water = type === DEEP_WATER || type === SHALLOW_WATER;
      expect(isWater(island, x, y)).toBe(water);
      expect(isLand(island, x, y)).toBe(!water);
    });
  });

  it("reports tiles outside the map as not land", () => {
    expect(isLand(island, -1, 5)).toBe(false);
    expect(isLand(island, 5, -1)).toBe(false);
    expect(isLand(island, island.width, 5)).toBe(false);
  });

  it("calls only land beside water a coast", () => {
    everyTile((x, y) => {
      if (isCoast(island, x, y)) {
        expect(isLand(island, x, y)).toBe(true);
        const beside: boolean[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            beside.push(isWater(island, x + dx, y + dy));
          }
        }
        expect(beside.some(Boolean)).toBe(true);
      }
    });
  });

  it("finds some coastline to dock at", () => {
    let coastal = 0;
    everyTile((x, y) => {
      if (isCoast(island, x, y)) coastal++;
    });
    expect(coastal).toBeGreaterThan(20);
  });

  it("refuses to build on water or bare rock", () => {
    everyTile((x, y) => {
      const type = island.terrain.get(x, y);
      if (type < BEACH || type === ROCK) expect(isBuildable(island, x, y)).toBe(false);
      else expect(isBuildable(island, x, y)).toBe(true);
    });
  });
});

describe("findStartSite", () => {
  const sites: { island: Island; site: { x: number; y: number } }[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const generated = generateIsland({ seed, size: 48 });
    sites.push({ island: generated, site: findStartSite(generated) });
  }

  it("lands inside the map on every seed", () => {
    for (const { island: generated, site } of sites) {
      expect(site.x).toBeGreaterThanOrEqual(0);
      expect(site.y).toBeGreaterThanOrEqual(0);
      expect(site.x).toBeLessThan(generated.width);
      expect(site.y).toBeLessThan(generated.height);
    }
  });

  it("picks buildable ground on every seed", () => {
    for (const { island: generated, site } of sites) {
      let buildable = 0;
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          if (isBuildable(generated, site.x + dx, site.y + dy)) buildable++;
        }
      }
      expect(buildable).toBeGreaterThanOrEqual(Math.floor(49 * 0.9));
    }
  });

  it("is deterministic", () => {
    const generated = generateIsland({ seed: 3, size: 48 });
    expect(findStartSite(generated)).toEqual(findStartSite(generated));
  });
});
