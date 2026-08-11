import { euclidean } from "../core/grid.ts";
import {
  BUILDING_STOCK_CAP,
  BUILD_HOURS_PER_LUMBER,
  MIN_BUILD_HOURS,
  SERVICE_STOCK_CAP,
  TICKS_PER_MONTH,
} from "../data/balance.ts";
import { BUILDINGS, type BuildingId } from "../data/buildings.ts";
import type { GoodId } from "../data/goods.ts";
import { MIN_FOREST } from "./island.ts";
import { workRate } from "./employment.ts";
import { buildingUpkeep, completeBuilding, notify } from "./state.ts";
import type { Building, GameState } from "./types.ts";

/**
 * Making things and moving them.
 *
 * Two rules carry the whole economy. **Lumber is money** — nearly every building
 * is paid for in it, so the timber camp → sawmill chain gates how fast the island
 * can grow. And **nothing moves itself** — a brewery with corn in the fields and
 * no hauler to fetch it produces nothing at all, which was the original's most
 * infuriating silent failure and is now something the building will tell you.
 */

/** How much of a good a building will hold before it stops accepting more. */
export function stockCap(defId: BuildingId): number {
  const def = BUILDINGS[defId];
  return def.serves && !def.recipe ? SERVICE_STOCK_CAP : BUILDING_STOCK_CAP;
}

export function stockOf(building: Building, good: GoodId): number {
  return building.stock[good] ?? 0;
}

export function addStock(building: Building, good: GoodId, amount: number): number {
  const cap = stockCap(building.def);
  const current = stockOf(building, good);
  const accepted = Math.max(0, Math.min(amount, cap - current));
  building.stock[good] = current + accepted;
  return accepted;
}

export function takeStock(building: Building, good: GoodId, amount: number): number {
  const current = stockOf(building, good);
  const taken = Math.min(current, amount);
  building.stock[good] = current - taken;
  return taken;
}

/** Goods this building wants delivered: recipe inputs, plus anything it serves. */
export function wantedGoods(building: Building): GoodId[] {
  const def = BUILDINGS[building.def];
  const wanted = new Set<GoodId>();
  for (const input of def.recipe?.inputs ?? []) wanted.add(input.good);
  for (const provision of def.provides ?? []) {
    for (const good of provision.boostedBy ?? []) wanted.add(good);
  }
  // A dock is loaded with everything a ship takes to sea.
  if (building.def === "dock") {
    wanted.add("seaRations");
    wanted.add("cutlasses");
    wanted.add("cannon");
    wanted.add("muskets");
  }
  return [...wanted];
}

/**
 * Runs one building's recipe for the elapsed time.
 *
 * Extractors (farms, mines, timber camps) have no inputs and simply produce.
 * A timber camp additionally eats the forest around it, so the woods really do
 * run out and the camp has to be moved — as in the original.
 */
export function produce(state: GameState, building: Building, hours: number): void {
  const def = BUILDINGS[building.def];
  const recipe = def.recipe;
  if (!recipe) return;

  const rate = workRate(state, building);
  if (rate <= 0) return;

  // A full output store stops the line; there is nowhere to put the next batch.
  if (stockOf(building, recipe.output) >= stockCap(building.def)) return;

  if (building.def === "timberCamp" && harvestableForest(state, building) <= 0) return;

  building.progress += hours * rate;
  while (building.progress >= recipe.hours) {
    const hasInputs = recipe.inputs.every((input) => stockOf(building, input.good) >= input.amount);
    if (!hasInputs) {
      // Hold the accumulated work rather than discarding it; the moment the
      // hauler arrives, the batch completes.
      building.progress = Math.min(building.progress, recipe.hours);
      return;
    }

    building.progress -= recipe.hours;
    for (const input of recipe.inputs) takeStock(building, input.good, input.amount);

    if (building.def === "timberCamp") consumeForest(state, building, recipe.amount);

    if (recipe.output === "lumber") {
      // Lumber is the one good pooled island-wide, exactly as the original's
      // HUD counter implied.
      state.lumber += recipe.amount;
    } else {
      addStock(building, recipe.output, recipe.amount);
    }

    if (stockOf(building, recipe.output) >= stockCap(building.def)) break;
  }
}

/** Standing timber within reach of a camp. */
export function harvestableForest(state: GameState, building: Building): number {
  let total = 0;
  const radius = 6;
  for (let y = building.y - radius; y <= building.y + building.h + radius; y++) {
    for (let x = building.x - radius; x <= building.x + building.w + radius; x++) {
      total += state.island.forest.get(x, y);
    }
  }
  return total;
}

/** Cuts the nearest trees first, so a camp visibly clears its surroundings. */
function consumeForest(state: GameState, building: Building, amount: number): void {
  let remaining = amount * 0.06;
  const radius = 6;
  const tiles: { x: number; y: number; d: number }[] = [];
  for (let y = building.y - radius; y <= building.y + building.h + radius; y++) {
    for (let x = building.x - radius; x <= building.x + building.w + radius; x++) {
      if (state.island.forest.get(x, y) <= 0) continue;
      tiles.push({ x, y, d: euclidean(x, y, building.x, building.y) });
    }
  }
  tiles.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  for (const tile of tiles) {
    if (remaining <= 0) break;
    const available = state.island.forest.get(tile.x, tile.y);
    const cut = Math.min(available, remaining);
    state.island.forest.set(tile.x, tile.y, available - cut);
    remaining -= cut;
  }
}

/** Buildings holding a good that could be fetched, nearest first. */
export function sourcesFor(state: GameState, seeker: Building, good: GoodId): Building[] {
  const out: Building[] = [];
  for (const building of state.buildings.values()) {
    if (building.id === seeker.id) continue;
    if (building.construction > 0) continue;
    if (stockOf(building, good) <= 0) continue;
    out.push(building);
  }
  out.sort(
    (a, b) =>
      euclidean(seeker.x, seeker.y, a.x, a.y) - euclidean(seeker.x, seeker.y, b.x, b.y) ||
      a.id - b.id,
  );
  return out;
}

/**
 * Advances every construction site that has builders available.
 *
 * Builders are pooled: every construction tent on the island contributes its
 * staff to whatever is being built, nearest site first. That matches the
 * original's advice to drop a tent next to whatever you are about to raise.
 */
export function runConstruction(state: GameState, hours: number): void {
  const sites: Building[] = [];
  for (const building of state.buildings.values()) {
    if (building.construction > 0) sites.push(building);
  }
  if (sites.length === 0) return;

  let builderHours = 0;
  for (const building of state.buildings.values()) {
    if (building.def !== "constructionTent") continue;
    for (const id of building.workers) {
      const worker = state.people.get(id);
      if (worker?.job?.job === "builder" && worker.activity === "working") {
        builderHours += hours * (0.6 + worker.skill * 0.14);
      }
    }
  }
  if (builderHours <= 0) return;

  // High priority first, then whatever is closest to finished, so sites
  // complete rather than all crawling together.
  sites.sort((a, b) => {
    const priority = (b.priority === "high" ? 1 : 0) - (a.priority === "high" ? 1 : 0);
    if (priority !== 0) return priority;
    return a.construction - b.construction || a.id - b.id;
  });

  for (const site of sites) {
    if (builderHours <= 0) break;
    const spent = Math.min(builderHours, site.construction);
    site.construction -= spent;
    builderHours -= spent;
    if (site.construction <= 0) {
      completeBuilding(state, site);
      notify(state, "good", `${BUILDINGS[site.def].name} finished`, { x: site.x, y: site.y });
    }
  }
}

/** Builder-hours a building needs, from its lumber cost. */
export function constructionHours(defId: BuildingId): number {
  const def = BUILDINGS[defId];
  if (defId === "constructionTent") return 0;
  return Math.max(MIN_BUILD_HOURS, def.lumber * BUILD_HOURS_PER_LUMBER + def.gold * 0.02);
}

/** Monthly bills: building upkeep and pirate wages. */
export function payUpkeep(state: GameState): number {
  let total = 0;
  for (const building of state.buildings.values()) {
    if (building.construction > 0) continue;
    total += buildingUpkeep(state, building.def);
  }
  for (const person of state.people.values()) {
    if (person.kind !== "pirate" || person.activity === "dead") continue;
    if (!person.job) continue;
    total += 6;
  }

  state.treasury -= total;
  if (state.treasury < 0) {
    // Debt is allowed, but it is felt: the island cannot buy or build while red.
    notify(state, "warning", "The treasury is empty — bills are going unpaid");
  }
  return total;
}

/** True when a whole game-month has just elapsed. */
export function isMonthBoundary(tick: number, hours: number): boolean {
  const before = Math.floor((tick - hours) / TICKS_PER_MONTH);
  const after = Math.floor(tick / TICKS_PER_MONTH);
  return after > before;
}

/** Forest left on the island, so the UI can warn before the timber runs out. */
export function forestRemaining(state: GameState): number {
  let total = 0;
  for (const value of state.island.forest.data) if (value >= MIN_FOREST) total += value;
  return total;
}

/** Everything the island holds of one good, across every building. */
export function totalStock(state: GameState, good: GoodId): number {
  if (good === "lumber") return state.lumber;
  let total = 0;
  for (const building of state.buildings.values()) total += stockOf(building, good);
  return total;
}
