import { everyTile, idx, rectPerimeter, someTile, sumTiles, type Rect } from "../core/grid.ts";
import { floodFill } from "../core/path.ts";
import { BUILDINGS, type BuildingId } from "../data/buildings.ts";
import type { GoodId } from "../data/goods.ts";
import { SKILLED_JOBS } from "../data/jobs.ts";
import { NATION_IDS } from "../data/nations.ts";
import type { Scenario } from "../data/scenarios.ts";
import { monthIndex } from "../data/scenarios.ts";
import { kingEffects } from "./auras.ts";
import { addStock } from "./economy.ts";
import { autoAssign } from "./employment.ts";
import { allocateHousing } from "./game.ts";
import { findStartSite, isBuildable, isCoast } from "./island.ts";
import { spawnCaptive, spawnPirate } from "./people.ts";
import { addBuilding, createState, notify, removeBuilding, type NewGameOptions } from "./state.ts";
import { buildShip, freeDocks } from "./fleet.ts";
import type { GameState, King } from "./types.ts";

/**
 * Starting a game.
 *
 * A pirate haven does not begin from nothing: the original always dropped you
 * onto an island that already had a stockade full of captives, a sawmill and a
 * few roads, because the first thing you need is lumber and the first thing
 * lumber needs is somebody to cut it.
 */

export interface StartOptions extends NewGameOptions {
  pirates?: number;
  captives?: number;
  goods?: Partial<Record<GoodId, number>>;
  /** Skilled captives to begin with, beyond whatever the king's traits grant. */
  professions?: readonly string[];
}

/** Lays the opening settlement and populates it. */
export function newGame(options: StartOptions): GameState {
  const state = createState(options);
  const site = findStartSite(state.island, 9);

  for (const [good, amount] of Object.entries(options.goods ?? {})) {
    if (good === "lumber") {
      state.lumber += amount;
      continue;
    }
    // Everything else lands in the first building that will take it.
    depositAnywhere(state, good as GoodId, amount);
  }

  const pirateCount = options.pirates ?? 12;
  layOpeningSettlement(state, site.x, site.y, pirateCount);
  // The opening settlement asks for roughly this many hands. Start with fewer
  // and the taverns never open, which reads as a broken game rather than a
  // choice the player made.
  const captiveCount = options.captives ?? 34;

  for (let i = 0; i < pirateCount; i++) {
    const spot = scatter(state, site.x, site.y);
    spawnPirate(state, { x: spot.x, y: spot.y });
  }

  // Skilled captives the king's background hands you, then the plain workforce.
  // A priest is always among them: the island starts with a church, and a
  // church with nobody to run it is a shed.
  const granted: string[] = ["priest", ...(options.professions ?? [])];
  for (const effect of kingEffects(state.king)) {
    for (const bonus of effect.bonusCaptives ?? []) {
      for (let i = 0; i < bonus.count; i++) granted.push(bonus.job);
    }
  }

  for (const profession of granted) {
    const spot = scatter(state, site.x, site.y);
    const skilled = SKILLED_JOBS.find((job) => job === profession);
    spawnCaptive(state, {
      x: spot.x,
      y: spot.y,
      ...(skilled ? { profession: skilled } : {}),
    });
  }

  for (let i = 0; i < captiveCount; i++) {
    const spot = scatter(state, site.x, site.y);
    spawnCaptive(state, {
      x: spot.x,
      y: spot.y,
      nationality: state.rng.pick(NATION_IDS) ?? "spain",
    });
  }

  autoAssign(state);
  allocateHousing(state);
  return state;
}

/** Builds a scenario's opening position, including the ships it hands you. */
export function startScenario(scenario: Scenario, seed: number, king?: King): GameState {
  const carried = 0;
  const state = newGame({
    seed,
    ...(king ? { king } : {}),
    treasury: scenario.resources.treasury,
    lumber: 0,
    startMonth: monthIndex(scenario.start[0], scenario.start[1]),
    pirates: scenario.resources.pirates,
    captives: scenario.resources.captives,
    goods: scenario.resources.goods,
  });

  state.scenario = scenario;
  state.hoard = scenario.resources.hoard + carried;

  // Whatever the episode asks you to build, you do not already have. The
  // standard opening settlement includes a smuggler's dive, which would hand
  // the player half of Beer for Buccaneers before the clock started.
  const asked = new Set<BuildingId>();
  for (const objective of scenario.objectives) {
    if (objective.kind === "build") asked.add(objective.building);
    if (objective.kind === "buildAnyOf") for (const id of objective.buildings) asked.add(id);
  }
  for (const building of [...state.buildings.values()]) {
    if (asked.has(building.def)) removeBuilding(state, building.id);
  }

  // And the ships it starts you with are already in the water.
  for (const cls of scenario.resources.ships) {
    const berth = freeDocks(state)[0];
    const ship = buildShip(state, cls, -1);
    if (!ship) continue;
    ship.buildProgress = 0;
    ship.status = berth === undefined ? "building" : "inPort";
    if (berth !== undefined) ship.dock = berth;
  }

  notify(state, "info", `${scenario.name}: ${scenario.briefing}`);
  return state;
}

/** A free tile near the settlement, for dropping a person onto. */
function scatter(state: GameState, cx: number, cy: number): { x: number; y: number } {
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = cx + state.rng.int(-7, 9);
    const y = cy + state.rng.int(-7, 9);
    if (!isBuildable(state.island, x, y)) continue;
    if (state.occupancy.get(x, y) >= 0 && state.roads.get(x, y) === 0) continue;
    return { x, y };
  }
  return { x: cx, y: cy };
}

function depositAnywhere(state: GameState, good: GoodId, amount: number): void {
  let remaining = amount;
  for (const building of state.buildings.values()) {
    if (remaining <= 0) break;
    remaining -= addStock(building, good, remaining);
  }
}

/**
 * The opening settlement.
 *
 * Laid out grid-first, and deliberately so. An earlier version searched outward
 * for somewhere each building would fit, which quietly produced buildings that
 * nothing could reach — wedged between their neighbours with no free tile on any
 * side. That failure is invisible and merciless: whoever lives or works there
 * has those needs pinned at zero for the whole game, and the island slowly
 * empties for no reason the player can see.
 *
 * So the roads go down first, in a connected grid, and a building may only take
 * a site that touches one. Nothing can be stranded, because there is nowhere
 * stranded to put it.
 */
function layOpeningSettlement(state: GameState, ox: number, oy: number, pirateCount: number): void {
  const grid = layRoadGrid(state, ox, oy);

  // Order matters: the things that keep people alive claim the best blocks.
  placeOnGrid(state, "stockade", grid, ox + 2, oy + 2);
  placeOnGrid(state, "chuckTent", grid, ox - 4, oy + 2);
  placeOnGrid(state, "chuckTent", grid, ox + 10, oy + 3);
  placeOnGrid(state, "bunkhouse", grid, ox - 4, oy + 6);
  placeOnGrid(state, "bunkhouse", grid, ox + 10, oy + 7);
  placeOnGrid(state, "constructionTent", grid, ox + 2, oy - 3);

  // Corn, or the chuck tents are sheds. Farms need fertile ground, so they get
  // a road spur run out to them before they are placed.
  placeOnResource(state, "cornFarm", grid, ox, oy, 20, (x, y) => state.island.fertility.get(x, y));
  placeOnResource(state, "cornFarm", grid, ox, oy, 20, (x, y) => state.island.fertility.get(x, y));

  // The timber chain: the camp goes where the trees are, the mill on the grid.
  placeOnResource(state, "timberCamp", grid, ox, oy, 22, (x, y) => state.island.forest.get(x, y));
  placeOnGrid(state, "sawmill", grid, ox - 6, oy + 6);

  // Somewhere for the pirates to eat, drink, gamble and find company. A Wench &
  // Masseuse serves exactly one pirate at a time, which is why the original's
  // advice was several of them per dive.
  placeOnGrid(state, "smugglersDive", grid, ox + 4, oy - 4);
  placeOnGrid(state, "smugglersDive", grid, ox - 6, oy - 4);
  placeOnGrid(state, "animalPit", grid, ox + 9, oy - 4);
  for (let i = 0; i < 4; i++) placeOnGrid(state, "wenchMasseuse", grid, ox - 2 + i * 3, oy - 8);

  // A plot each. A pirate with nowhere to live has two of his six needs at zero
  // from the first hour and is on his way to deserting before the player has
  // done anything wrong.
  for (let i = 0; i < pirateCount; i++) {
    placeOnGrid(
      state,
      "pirateHousing",
      grid,
      ox - 14 + (i % 6) * 5,
      oy - 11 - Math.floor(i / 6) * 5,
      18,
    );
  }

  // Order and fear where the captives work; defense and anarchy where the
  // pirates are. This is the zoning lesson the whole game is about, laid out
  // once so the player can see the shape of it.
  placeOnGrid(state, "orderlyShrubs", grid, ox - 1, oy + 4);
  placeOnGrid(state, "scaryDecor", grid, ox + 6, oy + 4);
  placeOnGrid(state, "veryScaryDecor", grid, ox + 1, oy + 7);
  placeOnGrid(state, "safeHarborAnchor", grid, ox - 2, oy + 5);
  placeOnGrid(state, "protectiveCannon", grid, ox + 4, oy + 7);
  placeOnGrid(state, "anarchyDecor", grid, ox - 4, oy - 6);
  placeOnGrid(state, "anarchyDecor", grid, ox + 6, oy - 6);

  // A watch tower over the works: defense for the pirate standing in it, fear
  // for the captives below, and the only guards the island starts with.
  placeOnGrid(state, "watchTower", grid, ox + 2, oy + 5);
  placeOnGrid(state, "watchTower", grid, ox - 5, oy + 2);

  // And a church, because two years in they will ask for one.
  placeOnGrid(state, "church", grid, ox - 7, oy + 3);

  // Lumber gates everything the player can build, so the timber chain outbids
  // the rest of the island for the captives it needs.
  for (const building of state.buildings.values()) {
    if (building.def === "timberCamp" || building.def === "sawmill") building.priority = "high";
  }

  const shore = findCoastSite(state, ox, oy);
  if (shore) {
    runSpur(state, ox, oy, shore.x + 2, shore.y - 1);
    placeAt(state, "dock", shore.x, shore.y);
  }
}

/** Every road tile of the opening grid, which is connected by construction. */
type RoadGrid = Set<string>;

/**
 * A connected lattice of roads over the settlement area: streets every five
 * rows and every six columns. Tiles that fall on water or rock are simply
 * skipped, so a ragged coastline costs the grid a few tiles rather than its
 * connectedness — the rows and columns still meet wherever the ground allows.
 */
function layRoadGrid(state: GameState, ox: number, oy: number): RoadGrid {
  const grid: RoadGrid = new Set();
  const x0 = ox - 17;
  const x1 = ox + 17;
  const y0 = oy - 24;
  const y1 = oy + 11;

  const lay = (x: number, y: number): void => {
    if (!isBuildable(state.island, x, y)) return;
    if (state.occupancy.get(x, y) >= 0) return;
    addBuilding(state, "road", x, y, { instant: true });
    grid.add(`${x},${y}`);
  };

  // Blocks of nine by seven. Tighter streets look neater and cannot hold the
  // buildings the island actually needs: a sawmill is six by four and a
  // stockade five by five, so a five-by-four block silently means no lumber.
  for (let y = y0; y <= y1; y += 8) {
    for (let x = x0; x <= x1; x++) lay(x, y);
  }
  for (let x = x0; x <= x1; x += 10) {
    for (let y = y0; y <= y1; y++) lay(x, y);
  }

  // Keep only the part of the lattice actually connected to the centre, so a
  // stretch cut off by a bay is not mistaken for frontage.
  const reachable = floodFill(
    state.island,
    (x, y) => state.roads.get(x, y) === 1,
    [...grid]
      .map((key) => {
        const [gx, gy] = key.split(",");
        return { x: Number(gx), y: Number(gy) };
      })
      .filter((p) => Math.abs(p.x - ox) <= 6 && Math.abs(p.y - oy) <= 6),
  );

  const connected: RoadGrid = new Set();
  for (const key of grid) {
    const [gx, gy] = key.split(",");
    const x = Number(gx);
    const y = Number(gy);
    if (reachable[idx(state.island, x, y)] !== -1) connected.add(key);
  }
  return connected.size > 0 ? connected : grid;
}

/** True when the footprint touches a tile of the connected road grid. */
function touchesGrid(grid: RoadGrid, rect: Rect): boolean {
  return rectPerimeter(rect).some((p) => grid.has(`${p.x},${p.y}`));
}

/**
 * Puts a building on the nearest site that both fits and fronts the grid.
 * Returns null rather than stranding it somewhere nobody can walk.
 */
function placeOnGrid(
  state: GameState,
  defId: BuildingId,
  grid: RoadGrid,
  wantX: number,
  wantY: number,
  radius = 14,
): { x: number; y: number } | null {
  const def = BUILDINGS[defId];
  for (let ring = 0; ring <= radius; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = wantX + dx;
        const y = wantY + dy;
        if (!fits(state, defId, x, y)) continue;
        if (!touchesGrid(grid, { x, y, w: def.w, h: def.h })) continue;
        addBuilding(state, defId, x, y, { instant: true });
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Puts a resource building on the richest ground within reach, running a road
 * spur out to it first so it is connected before it exists.
 */
function placeOnResource(
  state: GameState,
  defId: BuildingId,
  grid: RoadGrid,
  cx: number,
  cy: number,
  radius: number,
  value: (x: number, y: number) => number,
): { x: number; y: number } | null {
  const def = BUILDINGS[defId];
  let best: { x: number; y: number; score: number } | null = null;

  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!fits(state, defId, x, y)) continue;
      const rect = { x, y, w: def.w, h: def.h };
      const richness = sumTiles(rect, value);
      if (richness <= 0) continue;
      const score = richness - Math.hypot(x - cx, y - cy) * 0.06;
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  if (!best) return null;

  // The spur goes down first: a road cannot be laid through the building, so
  // laying it afterwards is how a farm ends up unreachable.
  runSpur(state, cx, cy, best.x - 1, best.y - 1);
  if (!touchesGrid(grid, { x: best.x, y: best.y, w: def.w, h: def.h })) {
    for (const tile of rectPerimeter({ x: best.x, y: best.y, w: def.w, h: def.h })) {
      if (state.roads.get(tile.x, tile.y) === 1) grid.add(`${tile.x},${tile.y}`);
    }
  }
  if (!fits(state, defId, best.x, best.y)) return null;
  addBuilding(state, defId, best.x, best.y, { instant: true });
  return { x: best.x, y: best.y };
}

/** An L-shaped road from the settlement out to a point, skipping blocked tiles. */
function runSpur(state: GameState, ax: number, ay: number, bx: number, by: number): void {
  const stepX = ax <= bx ? 1 : -1;
  const stepY = ay <= by ? 1 : -1;
  for (let x = ax; x !== bx + stepX; x += stepX) tryRoad(state, x, ay);
  for (let y = ay; y !== by + stepY; y += stepY) tryRoad(state, bx, y);
}

function tryRoad(state: GameState, x: number, y: number): void {
  if (!isBuildable(state.island, x, y)) return;
  if (state.occupancy.get(x, y) >= 0) return;
  addBuilding(state, "road", x, y, { instant: true });
}

function placeAt(state: GameState, defId: BuildingId, x: number, y: number): boolean {
  if (!fits(state, defId, x, y)) return false;
  addBuilding(state, defId, x, y, { instant: true });
  return true;
}

/** Whether the footprint is clear buildable ground. */
function fits(state: GameState, defId: BuildingId, x: number, y: number): boolean {
  const def = BUILDINGS[defId];
  return everyTile(
    { x, y, w: def.w, h: def.h },
    (tx, ty) => isBuildable(state.island, tx, ty) && state.occupancy.get(tx, ty) < 0,
  );
}

function findCoastSite(state: GameState, cx: number, cy: number): { x: number; y: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  for (let y = cy - 20; y <= cy + 20; y++) {
    for (let x = cx - 20; x <= cx + 20; x++) {
      const rect = { x, y, w: 5, h: 4 };
      const coastal = someTile(rect, (tx, ty) => isCoast(state.island, tx, ty));
      const clear = everyTile(
        rect,
        (tx, ty) => isBuildable(state.island, tx, ty) && state.occupancy.get(tx, ty) < 0,
      );
      if (!coastal || !clear) continue;
      const distance = Math.hypot(x - cx, y - cy);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}
