import { everyTile, idx, rectPerimeter, someTile, sumTiles, type Rect } from "../core/grid.ts";
import { findPath, floodFill, octile } from "../core/path.ts";
import { BUILDINGS, type BuildingId } from "../data/buildings.ts";
import type { GoodId } from "../data/goods.ts";
import { SKILLED_JOBS } from "../data/jobs.ts";
import { NATION_IDS } from "../data/nations.ts";
import type { Scenario } from "../data/scenarios.ts";
import { monthIndex } from "../data/scenarios.ts";
import { kingEffects, rawAura } from "./auras.ts";
import { passable } from "./behaviour.ts";
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
  layRoadGrid(state, ox, oy);
  const origin = { x: ox, y: oy };

  // Order matters: the things that keep people alive claim the best blocks.
  placeOnGrid(state, "stockade", origin, ox + 2, oy + 2);
  placeOnGrid(state, "chuckTent", origin, ox - 4, oy + 2);
  placeOnGrid(state, "chuckTent", origin, ox + 10, oy + 3);
  placeOnGrid(state, "bunkhouse", origin, ox - 4, oy + 6);
  placeOnGrid(state, "bunkhouse", origin, ox + 10, oy + 7);
  placeOnGrid(state, "constructionTent", origin, ox + 2, oy - 3);

  // Corn, or the chuck tents are sheds. Farms need fertile ground, so they get
  // a road spur run out to them before they are placed.
  placeOnResource(state, "cornFarm", ox, oy, 20, (x, y) => state.island.fertility.get(x, y));
  placeOnResource(state, "cornFarm", ox, oy, 20, (x, y) => state.island.fertility.get(x, y));

  // The timber chain: the camp goes where the trees are, the mill on the grid.
  placeOnResource(state, "timberCamp", ox, oy, 22, (x, y) => state.island.forest.get(x, y));
  placeOnGrid(state, "sawmill", origin, ox - 6, oy + 6);

  // Somewhere for the pirates to eat, drink, gamble and find company. A Wench &
  // Masseuse serves exactly one pirate at a time, which is why the original's
  // advice was several of them per dive.
  placeOnGrid(state, "smugglersDive", origin, ox + 4, oy - 4);
  placeOnGrid(state, "smugglersDive", origin, ox - 6, oy - 4);
  placeOnGrid(state, "animalPit", origin, ox + 9, oy - 4);
  for (let i = 0; i < 4; i++) placeOnGrid(state, "wenchMasseuse", origin, ox - 2 + i * 3, oy - 8);

  // A plot each. A pirate with nowhere to live has two of his six needs at zero
  // from the first hour and is on his way to deserting before the player has
  // done anything wrong.
  layQuarter(state, "pirateHousing", ox, oy, pirateCount);

  // Order and fear where the captives work; defense and anarchy where the
  // pirates are. This is the zoning lesson the whole game is about, laid out
  // once so the player can see the shape of it.
  placeDecor(state, "orderlyShrubs", origin, ox - 1, oy + 4);
  placeDecor(state, "scaryDecor", origin, ox + 6, oy + 4);
  placeDecor(state, "veryScaryDecor", origin, ox + 1, oy + 7);
  placeDecor(state, "safeHarborAnchor", origin, ox - 2, oy + 5);
  placeDecor(state, "protectiveCannon", origin, ox + 4, oy + 7);
  placeDecor(state, "anarchyDecor", origin, ox - 4, oy - 6);
  placeDecor(state, "anarchyDecor", origin, ox + 6, oy - 6);

  // A little order among the works, so the captives do not start at zero.
  placeDecor(state, "veryOrderlyDecor", origin, ox + 3, oy + 3, 10);

  // And a gun within earshot of every tavern, pit and bed.
  guardWherePiratesGo(state, origin);

  // A watch tower over the works: defense for the pirate standing in it, fear
  // for the captives below, and the only guards the island starts with.
  placeOnGrid(state, "watchTower", origin, ox + 2, oy + 5);
  placeOnGrid(state, "watchTower", origin, ox - 5, oy + 2);

  // And a church, because two years in they will ask for one.
  placeOnGrid(state, "church", origin, ox - 7, oy + 3);

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
 * How far the settlement can spread before it runs into the sea.
 *
 * Sized to the land rather than to a fixed rectangle. A settlement laid out on
 * a fixed box puts most of itself in the water on a small or lopsided island —
 * on one seed the pirate quarter had sixty-two buildable tiles out of six
 * hundred, so eleven of twelve housing plots simply had nowhere to go and
 * eleven pirates spent the game with nowhere to sleep or stash their share.
 */
function buildableExtent(
  state: GameState,
  ox: number,
  oy: number,
  reach = 16,
): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = ox;
  let x1 = ox;
  let y0 = oy;
  let y1 = oy;

  for (let y = oy - reach; y <= oy + reach; y++) {
    for (let x = ox - reach; x <= ox + reach; x++) {
      if (!isBuildable(state.island, x, y)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }

  /*
   * Bounded at both ends. Too large and the settlement sprawls, which costs the
   * population directly: every need is met by somebody walking, so a town twice
   * as wide is a town where half as many people get fed. Too small and there is
   * nowhere to put the housing. Sixteen tiles of reach, trimmed to the land and
   * held to a margin off the waterline, is the compromise.
   */
  return {
    x0: Math.max(x0 + 1, ox - reach),
    x1: Math.min(x1 - 1, ox + reach),
    y0: Math.max(y0 + 1, oy - reach),
    y1: Math.min(y1 - 1, oy + reach),
  };
}

/**
 * A connected lattice of roads over the settlement area: streets every five
 * rows and every six columns. Tiles that fall on water or rock are simply
 * skipped, so a ragged coastline costs the grid a few tiles rather than its
 * connectedness — the rows and columns still meet wherever the ground allows.
 */
function layRoadGrid(state: GameState, ox: number, oy: number): RoadGrid {
  const grid: RoadGrid = new Set();
  const { x0, x1, y0, y1 } = buildableExtent(state, ox, oy);

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

  joinLatticeFragments(state, ox, oy);

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

/**
 * Links every stranded piece of the lattice back to the centre.
 *
 * The streets are single-tile lines, and a bay cutting across one breaks it
 * into pieces that never meet. On one seed only forty-five of a hundred and
 * twenty-four road tiles were reachable from the settlement, which left almost
 * no frontage and so almost no housing. Each orphaned piece is routed back with
 * A* over open ground and the route paved, which connects anything the island
 * connects at all.
 */
function joinLatticeFragments(state: GameState, ox: number, oy: number): void {
  const walkable = (x: number, y: number): boolean =>
    isBuildable(state.island, x, y) &&
    (state.occupancy.get(x, y) < 0 || state.roads.get(x, y) === 1);

  for (let attempt = 0; attempt < 6; attempt++) {
    const connected = connectedRoads(state, ox, oy);

    let orphan: { x: number; y: number } | null = null;
    for (let y = 0; y < state.island.height && !orphan; y++) {
      for (let x = 0; x < state.island.width; x++) {
        if (state.roads.get(x, y) === 1 && !connected.has(`${x},${y}`)) {
          orphan = { x, y };
          break;
        }
      }
    }
    if (!orphan) return;

    const target = orphan;
    const route = findPath({
      size: state.island,
      passable: walkable,
      start: { x: ox, y: oy },
      isGoal: (x, y) => x === target.x && y === target.y,
      heuristic: (x, y) => octile(x, y, target.x, target.y),
    });

    // Nothing reachable by land: the piece is on the far side of water, and
    // paving cannot help it.
    if (!route) {
      state.roads.set(target.x, target.y, 0);
      const here = state.buildings.get(state.occupancy.get(target.x, target.y));
      if (here?.def === "road") removeBuilding(state, here.id);
      continue;
    }
    for (const step of route) tryRoad(state, step.x, step.y);
  }
}

/**
 * Every road tile that can be walked to from the settlement centre.
 *
 * Recomputed rather than snapshotted, because roads keep being added while the
 * layout runs — the spurs run out to a farm or a timber camp are frontage too.
 * An earlier version tested a snapshot of the lattice taken before any spur
 * existed, and on seeds where water split the lattice it went nearly empty, so
 * a settlement with fifty-eight free building sites placed no housing at all.
 */
function connectedRoads(state: GameState, ox: number, oy: number): Set<string> {
  const sources: { x: number; y: number }[] = [];
  for (let radius = 0; radius < 12 && sources.length === 0; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (state.roads.get(ox + dx, oy + dy) === 1) sources.push({ x: ox + dx, y: oy + dy });
      }
    }
  }

  const reached = floodFill(state.island, (x, y) => state.roads.get(x, y) === 1, sources);
  const out = new Set<string>();
  for (let y = 0; y < state.island.height; y++) {
    for (let x = 0; x < state.island.width; x++) {
      if (reached[idx(state.island, x, y)] !== -1) out.add(`${x},${y}`);
    }
  }
  return out;
}

/** True when the footprint touches a road you can actually get to. */
function touchesGrid(grid: RoadGrid, rect: Rect): boolean {
  return rectPerimeter(rect).some((p) => grid.has(`${p.x},${p.y}`));
}

/**
 * Puts a building on the nearest site that both fits and fronts the grid.
 * Returns null rather than stranding it somewhere nobody can walk.
 */
/**
 * A decorative piece, laid only where it blocks nobody.
 *
 * Decor is the one thing on the island with no door of its own, which makes it
 * the one thing that can quietly wall a neighbour in: a cannon lands on the
 * last free tile beside the stockade and everybody inside is sealed there for
 * good, with nothing on screen to say why they starved. So each piece is laid,
 * the settlement is walked, and the piece comes straight back up if anyone lost
 * their way out.
 */
/**
 * Defense decor spread over everywhere a pirate actually stands.
 *
 * Two mistakes to avoid here, and the second is the expensive one. A cannon
 * reaches three tiles while the settlement spreads twenty, so a single gun by
 * the harbour covers almost nobody. But covering the beds is not enough either:
 * a pirate is at his tavern, his pit or his post nearly all day and only sleeps
 * at home, and the aura is read where he is standing. Guard the taverns and the
 * whole band feels it; guard the bedrooms alone and the field reads zero all
 * game, one of his two environmental needs gone with nothing on screen to say
 * why he is miserable in a town full of rum.
 */
function guardWherePiratesGo(state: GameState, origin: { x: number; y: number }): void {
  const haunts: BuildingId[] = ["smugglersDive", "animalPit", "wenchMasseuse", "pirateHousing"];
  const sites = [...state.buildings.values()]
    .filter((b) => haunts.includes(b.def))
    // Taverns first: that is where they are when it counts.
    .sort((a, b) => haunts.indexOf(a.def) - haunts.indexOf(b.def));

  let guns = 0;
  for (const site of sites) {
    if (guns >= QUARTER_GUNS) break;
    if (rawAura(state, "defense", site.x, site.y) >= WELL_GUARDED) continue;
    // A cannon first — it reaches furthest — and an anchor if there is no room.
    if (placeDecor(state, "protectiveCannon", origin, site.x - 1, site.y, 3)) guns++;
    else if (placeDecor(state, "safeHarborAnchor", origin, site.x - 1, site.y, 3)) guns++;
  }
}

/** Enough defense underfoot that another gun beside it would be waste. */
const WELL_GUARDED = 20;

/** As many guns as the opening settlement will pay for. */
const QUARTER_GUNS = 10;

function placeDecor(
  state: GameState,
  defId: BuildingId,
  origin: { x: number; y: number },
  wantX: number,
  wantY: number,
  radius = 14,
): boolean {
  const at = placeOnGrid(state, defId, origin, wantX, wantY, radius);
  if (!at) return false;
  if (settlementIsConnected(state)) return true;
  undo(state, defId, at.x, at.y);
  return false;
}

/** Puts a building down, and takes it back up if it walled a neighbour in. */
function placeIfNobodyIsStranded(
  state: GameState,
  defId: BuildingId,
  x: number,
  y: number,
): boolean {
  addBuilding(state, defId, x, y, { instant: true });
  if (settlementIsConnected(state)) return true;
  undo(state, defId, x, y);
  return false;
}

function undo(state: GameState, defId: BuildingId, x: number, y: number): void {
  for (const building of state.buildings.values()) {
    if (building.def === defId && building.x === x && building.y === y) {
      removeBuilding(state, building.id);
      return;
    }
  }
}

/**
 * True while every building opens onto the same stretch of ground.
 *
 * Not "reachable from the centre": a five-by-five stockade leaves single-tile
 * nooks along its wall, and a check that starts in one of those measures a
 * world one tile wide and calls the whole island stranded. What matters is that
 * there is one place everybody shares, so the check finds the largest walkable
 * area and asks whether anybody has been left off it.
 */
function settlementIsConnected(state: GameState): boolean {
  const main = mainComponent(state);
  if (!main) return true;
  for (const building of state.buildings.values()) {
    if (building.def === "road") continue;
    const open = rectPerimeter(building).some(
      (p) => passable(state, p.x, p.y) && main[idx(state.island, p.x, p.y)] !== -1,
    );
    if (!open) return false;
  }
  return true;
}

/** The flood of the largest single stretch of walkable ground on the island. */
export function mainComponent(state: GameState): Int32Array | null {
  const { width, height } = state.island;
  const seen = new Uint8Array(width * height);
  let best: Int32Array | null = null;
  let bestSize = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(state.island, x, y);
      if (seen[start] === 1 || !passable(state, x, y)) continue;
      const reached = floodFill(state.island, (a, b) => passable(state, a, b), [{ x, y }]);
      let size = 0;
      for (let i = 0; i < reached.length; i++) {
        if (reached[i] !== -1) {
          seen[i] = 1;
          size++;
        }
      }
      if (size > bestSize) {
        bestSize = size;
        best = reached;
      }
    }
  }
  return best;
}

function placeOnGrid(
  state: GameState,
  defId: BuildingId,
  origin: { x: number; y: number },
  wantX: number,
  wantY: number,
  radius = 14,
): { x: number; y: number } | null {
  const def = BUILDINGS[defId];
  const grid = connectedRoads(state, origin.x, origin.y);
  for (let ring = 0; ring <= radius; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = wantX + dx;
        const y = wantY + dy;
        if (!fits(state, defId, x, y)) continue;
        if (!touchesGrid(grid, { x, y, w: def.w, h: def.h })) continue;
        // Touching a road is not the same as leaving everybody a way out: a
        // building can close the last gap in a wall of its neighbours. If this
        // site does that, put it back and keep looking.
        if (placeIfNobodyIsStranded(state, defId, x, y)) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Fills the settlement with as many of one building as will fit.
 *
 * Used for the pirate quarter, where the number wanted is the number of pirates
 * and the answer to "where" is "anywhere there is room". Every legal site in the
 * settlement is collected and taken nearest-first, rather than aiming at fixed
 * offsets — offsets land in the sea on a lopsided island, and a pirate with no
 * plot has two of his six needs pinned at zero for the whole game.
 */
function layQuarter(
  state: GameState,
  defId: BuildingId,
  ox: number,
  oy: number,
  wanted: number,
): number {
  const def = BUILDINGS[defId];
  // The quarter is allowed to spread further than the working town. Somebody
  // walks to the kitchen every day and to his own bed rather less often, so a
  // house on the edge costs far less than a chuck tent on the edge would.
  const { x0, x1, y0, y1 } = buildableExtent(state, ox, oy, 24);
  let placed = 0;

  /*
   * Frontage is made, not found.
   *
   * Requiring a site to already touch a road put the whole thing at the mercy
   * of how the lattice happened to fall, and on a lopsided island that meant no
   * housing at all — silently, with eleven pirates left with nowhere to sleep.
   * Now a site only has to be reachable: the road is paved out to it first, and
   * only then does the building go down.
   */
  const rejected = new Set<string>();
  while (placed < wanted) {
    let best: { x: number; y: number; distance: number } | null = null;
    for (let y = y0; y <= y1 - def.h; y++) {
      for (let x = x0; x <= x1 - def.w; x++) {
        if (rejected.has(`${x},${y}`)) continue;
        if (!fits(state, defId, x, y)) continue;
        const distance = Math.hypot(x - ox, y - oy);
        if (!best || distance < best.distance) best = { x, y, distance };
      }
    }
    if (!best) break;

    if (!paveTo(state, ox, oy, best.x - 1, best.y)) {
      // Unreachable by land; do not try this site again.
      rejected.add(`${best.x},${best.y}`);
      continue;
    }
    if (!fits(state, defId, best.x, best.y)) {
      rejected.add(`${best.x},${best.y}`);
      continue;
    }
    if (!placeIfNobodyIsStranded(state, defId, best.x, best.y)) {
      rejected.add(`${best.x},${best.y}`);
      continue;
    }
    placed++;
  }
  return placed;
}

/**
 * Paves a route from the settlement out to a tile, and says whether it managed.
 *
 * Routes over open ground and existing roads, so it threads between buildings
 * rather than trying to run straight through them the way an L-shaped spur does.
 */
function paveTo(state: GameState, ox: number, oy: number, x: number, y: number): boolean {
  if (!isBuildable(state.island, x, y)) return false;
  if (state.roads.get(x, y) === 1) return true;
  if (state.occupancy.get(x, y) >= 0) return false;

  const route = findPath({
    size: state.island,
    passable: (px, py) =>
      isBuildable(state.island, px, py) &&
      (state.occupancy.get(px, py) < 0 || state.roads.get(px, py) === 1),
    start: { x: ox, y: oy },
    isGoal: (px, py) => px === x && py === y,
    heuristic: (px, py) => octile(px, py, x, y),
  });
  if (!route) return false;

  for (const step of route) tryRoad(state, step.x, step.y);
  return true;
}

/**
 * Puts a resource building on the richest ground within reach, running a road
 * spur out to it first so it is connected before it exists.
 */
function placeOnResource(
  state: GameState,
  defId: BuildingId,
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
