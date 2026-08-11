import { ByteField, IdField } from "../core/field.ts";
import { everyTile, forEachTile, rectPerimeter, someTile, type Rect } from "../core/grid.ts";
import { Rng } from "../core/rng.ts";
import { BUILDINGS, type BuildingDef, type BuildingId } from "../data/buildings.ts";
import { NATION_IDS, REGION_IDS, type NationId, type RegionId } from "../data/nations.ts";
import { CAPTAINS } from "../data/captains.ts";
import { BACKGROUNDS, FLAWS, QUALITIES } from "../data/traits.ts";
import { applyBuildingAuras, createAuraFields, kingEffects } from "./auras.ts";
import {
  generateIsland,
  isBuildable,
  isCoast,
  MIN_FERTILITY,
  MIN_FOREST,
  MIN_ORE,
  type Island,
} from "./island.ts";
import type {
  Building,
  BuildingPriority,
  GameState,
  King,
  NationState,
  Notice,
  NoticeKind,
  Person,
  RegionState,
} from "./types.ts";

/**
 * Building the world and putting things in it.
 *
 * Placement validation lives here rather than in the command handler because
 * the build menu needs to ask the same questions before the player clicks —
 * "can this go here, and if not, why not" is one function used by both.
 */

export interface NewGameOptions {
  seed: number;
  king?: Partial<King>;
  islandSize?: number;
  treasury?: number;
  lumber?: number;
  startMonth?: number;
}

const DEFAULT_KING: King = {
  name: "Henry Morgan",
  captainId: "henryMorgan",
  sex: "male",
  nationality: "england",
  background: "decayedGentleman",
  qualities: ["dreadfulNotoriety", "ironHanded"],
  flaw: "greedy",
};

export function createState(options: NewGameOptions): GameState {
  const size = options.islandSize ?? 64;
  const island = generateIsland({ seed: options.seed, size });
  const king: King = { ...DEFAULT_KING, ...options.king };

  const nations = {} as Record<NationId, NationState>;
  for (const id of NATION_IDS) {
    nations[id] = {
      relations: 0,
      knowsLocation: false,
      atPeace: false,
      isPatron: false,
      prohibited: false,
      lettersOfMarque: false,
      monthsSinceRaid: 0,
    };
  }

  const regions = {} as Record<RegionId, RegionState>;
  for (const id of REGION_IDS) {
    regions[id] = { knowledge: 0, shipping: 1, settlements: 0 };
  }

  const state: GameState = {
    tick: 0,
    startMonth: options.startMonth ?? 1650 * 12,
    rng: new Rng(options.seed ^ 0x5eed),
    island,
    king,
    treasury: options.treasury ?? 1000,
    hoard: 0,
    stashRate: 0.25,
    lumber: options.lumber ?? 20,
    buildings: new Map(),
    people: new Map(),
    ships: new Map(),
    nextId: 1,
    auras: createAuraFields(island),
    occupancy: new IdField(island),
    roads: new ByteField(island),
    nations,
    regions,
    standing: [],
    marketMarkup: {},
    raisings: 0,
    notices: [],
    scenario: null,
    status: "playing",
    medal: null,
    ending: null,
    stats: {
      prizesTaken: 0,
      captivesTaken: 0,
      escapes: 0,
      piratesLost: 0,
      shipsLost: 0,
      goldPlundered: 0,
    },
  };

  applyKingStartingRelations(state);
  return state;
}

/** Backgrounds, qualities and flaws move where you stand with the great powers. */
function applyKingStartingRelations(state: GameState): void {
  for (const effect of kingEffects(state.king)) {
    if (effect.relations) {
      for (const nation of NATION_IDS) {
        const delta = effect.relations[nation];
        if (delta !== undefined) {
          state.nations[nation].relations = clampRelations(state.nations[nation].relations + delta);
        }
      }
    }
    if (effect.foreignRelations !== undefined) {
      for (const nation of NATION_IDS) {
        if (nation === state.king.nationality) continue;
        state.nations[nation].relations = clampRelations(
          state.nations[nation].relations + effect.foreignRelations,
        );
      }
    }
    if (effect.noPeaceWith) {
      state.nations[effect.noPeaceWith].atPeace = false;
    }
  }
}

export function clampRelations(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

export function nextId(state: GameState): number {
  return state.nextId++;
}

export function footprintOf(def: BuildingDef, x: number, y: number): Rect {
  return { x, y, w: def.w, h: def.h };
}

export function buildingAt(state: GameState, x: number, y: number): Building | undefined {
  const id = state.occupancy.get(x, y);
  return id < 0 ? undefined : state.buildings.get(id);
}

export function isRoad(state: GameState, x: number, y: number): boolean {
  return state.roads.get(x, y) === 1;
}

/** True when any tile just outside the footprint carries a road. */
export function touchesRoad(state: GameState, rect: Rect): boolean {
  return rectPerimeter(rect).some((p) => isRoad(state, p.x, p.y));
}

/** Skilled captives currently on the island, by profession. */
export function skilledProfessions(state: GameState): Set<string> {
  const professions = new Set<string>();
  for (const person of state.people.values()) {
    if (person.kind === "captive" && person.profession && person.activity !== "dead") {
      professions.add(person.profession);
    }
  }
  return professions;
}

export function countBuildings(state: GameState, def: BuildingId): number {
  let total = 0;
  for (const building of state.buildings.values()) if (building.def === def) total++;
  return total;
}

/** True when at least one finished building of this type stands. */
export function hasBuilding(state: GameState, def: BuildingId): boolean {
  for (const building of state.buildings.values()) {
    if (building.def === def && building.construction <= 0) return true;
  }
  return false;
}

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Whether a building may be put here, and if not, the specific reason.
 *
 * The reason string is shown live under the cursor while placing — the original
 * simply refused, leaving the player to guess whether it was the terrain, the
 * road, the lumber or a missing craftsman.
 */
export function canPlace(
  state: GameState,
  defId: BuildingId,
  x: number,
  y: number,
): PlacementCheck {
  const def = BUILDINGS[defId];
  const rect = footprintOf(def, x, y);

  if (def.unique && countBuildings(state, defId) > 0) {
    return { ok: false, reason: `Only one ${def.name} may stand on the island` };
  }

  if (!everyTile(rect, (tx, ty) => isBuildable(state.island, tx, ty))) {
    return { ok: false, reason: "The ground will not take it" };
  }
  const blockedBy = (tx: number, ty: number): boolean =>
    state.occupancy.get(tx, ty) >= 0 || (defId !== "road" && isRoad(state, tx, ty));
  if (someTile(rect, blockedBy)) {
    return { ok: false, reason: "Something already stands here" };
  }

  if (def.site) {
    const check = siteSatisfied(state.island, rect, def.site);
    if (!check.ok) return check;
  }

  if (def.needsRoad && !touchesRoad(state, rect)) {
    return { ok: false, reason: "It must touch a road" };
  }

  if (def.requires && !skilledProfessions(state).has(def.requires)) {
    return { ok: false, reason: `You have no skilled ${def.requires} on the island` };
  }

  const cost = buildingCost(state, defId);
  if (state.lumber < cost.lumber) {
    return {
      ok: false,
      reason: `Needs ${cost.lumber} lumber; you have ${Math.floor(state.lumber)}`,
    };
  }
  if (state.treasury < cost.gold) {
    return { ok: false, reason: `Needs ${cost.gold} gold; you have ${Math.floor(state.treasury)}` };
  }

  return { ok: true };
}

function siteSatisfied(
  island: Island,
  rect: Rect,
  requirement: NonNullable<BuildingDef["site"]>,
): PlacementCheck {
  const meets = (tx: number, ty: number): boolean => {
    switch (requirement) {
      case "coast":
        return isCoast(island, tx, ty);
      case "forest":
        return island.forest.get(tx, ty) >= MIN_FOREST;
      case "ore":
        return island.ore.get(tx, ty) >= MIN_ORE;
      case "fertile":
        return island.fertility.get(tx, ty) >= MIN_FERTILITY;
    }
  };

  if (someTile(rect, meets)) return { ok: true };
  const reasons: Record<NonNullable<BuildingDef["site"]>, string> = {
    coast: "It must reach the water",
    forest: "There is no timber worth cutting here",
    ore: "There is no iron in this ground",
    fertile: "Nothing will grow in this soil",
  };
  return { ok: false, reason: reasons[requirement] };
}

/** Cost after the king's half-price traits. */
export function buildingCost(
  state: GameState,
  defId: BuildingId,
): { gold: number; lumber: number } {
  const def = BUILDINGS[defId];
  let discount = 1;
  for (const effect of kingEffects(state.king)) {
    if (effect.halfPrice?.includes(defId)) discount = 0.5;
  }
  return {
    gold: Math.round(def.gold * discount),
    lumber: Math.round(def.lumber * discount),
  };
}

/** Monthly upkeep after the king's maintenance-free traits. */
export function buildingUpkeep(state: GameState, defId: BuildingId): number {
  for (const effect of kingEffects(state.king)) {
    if (effect.noUpkeep?.includes(defId)) return 0;
  }
  return BUILDINGS[defId].upkeep;
}

/**
 * Puts a building on the map. Callers are expected to have run `canPlace`;
 * this does the bookkeeping, not the validation.
 */
export function addBuilding(
  state: GameState,
  defId: BuildingId,
  x: number,
  y: number,
  options: { instant?: boolean; constructionHours?: number } = {},
): Building {
  const def = BUILDINGS[defId];
  const id = nextId(state);
  const hours = options.instant ? 0 : (options.constructionHours ?? 0);

  const building: Building = {
    id,
    def: defId,
    x,
    y,
    w: def.w,
    h: def.h,
    construction: hours,
    constructionTotal: hours,
    workers: [],
    visitors: [],
    stock: {},
    progress: 0,
    priority: "normal",
    level: 0,
    owner: -1,
    openTo: null,
    enabled: true,
  };

  state.buildings.set(id, building);
  forEachTile(building, (tx, ty) => {
    state.occupancy.set(tx, ty, id);
  });
  if (defId === "road") state.roads.set(x, y, 1);

  applyBuildingAuras(state.auras, building, 1);
  return building;
}

export function removeBuilding(state: GameState, id: number): boolean {
  const building = state.buildings.get(id);
  if (!building) return false;

  applyBuildingAuras(state.auras, building, -1);
  forEachTile(building, (tx, ty) => {
    if (state.occupancy.get(tx, ty) === id) state.occupancy.set(tx, ty, -1);
  });
  if (building.def === "road") state.roads.set(building.x, building.y, 0);

  for (const workerId of building.workers) {
    const worker = state.people.get(workerId);
    if (worker) worker.job = null;
  }
  for (const person of state.people.values()) {
    if (person.home === id) person.home = -1;
    if (person.target === id) {
      person.target = -1;
      person.path = [];
      person.activity = "idle";
    }
  }

  state.buildings.delete(id);
  return true;
}

/**
 * Marks a building finished, taking effect on the aura fields. Construction
 * emits nothing until it is done, so this is where a gallows starts frightening
 * people.
 */
export function completeBuilding(state: GameState, building: Building): void {
  if (building.construction <= 0) return;
  building.construction = 0;
  applyBuildingAuras(state.auras, building, 1);
}

export function setPriority(building: Building, priority: BuildingPriority): void {
  building.priority = priority;
}

/** Finished buildings of a type, which is what most queries actually want. */
export function finishedBuildings(state: GameState, def?: BuildingId): Building[] {
  const out: Building[] = [];
  for (const building of state.buildings.values()) {
    if (building.construction > 0) continue;
    if (def !== undefined && building.def !== def) continue;
    out.push(building);
  }
  return out;
}

export function livingPeople(state: GameState): Person[] {
  const out: Person[] = [];
  for (const person of state.people.values()) {
    if (person.activity !== "dead") out.push(person);
  }
  return out;
}

export function pirates(state: GameState): Person[] {
  return livingPeople(state).filter((p) => p.kind === "pirate");
}

export function captives(state: GameState): Person[] {
  return livingPeople(state).filter((p) => p.kind === "captive");
}

export function notify(
  state: GameState,
  kind: NoticeKind,
  text: string,
  at: { x: number; y: number } | null = null,
): void {
  const notice: Notice = { id: nextId(state), tick: state.tick, kind, text, at };
  state.notices.push(notice);
  // The log is a feed, not an archive; keeping the last 200 is plenty for the UI.
  if (state.notices.length > 200) state.notices.splice(0, state.notices.length - 200);
}

/** Turns a captain definition into a playable Pirate King. */
export function kingFromCaptain(captainId: string): King {
  const captain = CAPTAINS.find((c) => c.id === captainId) ?? CAPTAINS[0];
  if (!captain) throw new Error("no captains defined");
  return {
    name: captain.kingName ?? captain.name,
    captainId: captain.id,
    sex: captain.sex,
    nationality: captain.nationality,
    background: captain.background,
    qualities: [...captain.qualities],
    flaw: captain.flaw,
  };
}

/** Human-readable summary of what the king's traits do, for the setup screen. */
export function describeKing(king: King): string[] {
  return [
    BACKGROUNDS[king.background].name,
    ...king.qualities.map((q) => QUALITIES[q].name),
    FLAWS[king.flaw].name,
  ];
}
