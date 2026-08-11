import { ByteField, IdField, ScalarField } from "../core/field.ts";
import { Rng } from "../core/rng.ts";
import { scenarioById } from "../data/scenarios.ts";
import { rebuildAuras, createAuraFields } from "./auras.ts";
import { formatDate, population } from "./game.ts";
import { generateIsland, type Island } from "./island.ts";
import type { Building, GameState, Person, Ship } from "./types.ts";

/**
 * Saving and loading.
 *
 * The island is not stored — it is regenerated from its seed, which is exact
 * because generation is deterministic. What *is* stored is everything the seed
 * cannot reproduce: what was built, who is alive, where the forest has been cut
 * back, and the state of the world's politics. The aura fields are not stored
 * either; they are a pure function of the buildings and are rebuilt on load.
 */

// 2: notices carry how many times the same thing just happened. A version 1
// save has no such field, and rather than guess one, the game says plainly that
// it cannot read it - which loadFromSlot turns into "there is no save".
const VERSION = 2;

interface SavedState {
  version: number;
  seed: number;
  islandSize: number;
  tick: number;
  startMonth: number;
  rng: number;
  king: GameState["king"];
  treasury: number;
  hoard: number;
  stashRate: number;
  lumber: number;
  nextId: number;
  buildings: Building[];
  people: Person[];
  ships: Ship[];
  /** Only the fields generation cannot reproduce, because play changed them. */
  forest: number[];
  terrain: number[];
  roads: number[];
  nations: GameState["nations"];
  regions: GameState["regions"];
  standing: GameState["standing"];
  /** Absent in saves written before timed effects existed. */
  effects?: GameState["effects"];
  marketMarkup: GameState["marketMarkup"];
  raisings: number;
  notices: GameState["notices"];
  scenarioId: string | null;
  status: GameState["status"];
  medal: GameState["medal"];
  ending: string | null;
  stats: GameState["stats"];
}

export function serialize(state: GameState): string {
  const saved: SavedState = {
    version: VERSION,
    seed: state.island.seed,
    islandSize: state.island.width,
    tick: state.tick,
    startMonth: state.startMonth,
    rng: state.rng.s,
    king: state.king,
    treasury: state.treasury,
    hoard: state.hoard,
    stashRate: state.stashRate,
    lumber: state.lumber,
    nextId: state.nextId,
    buildings: [...state.buildings.values()],
    people: [...state.people.values()],
    ships: [...state.ships.values()],
    forest: state.island.forest.toJSON(),
    terrain: state.island.terrain.toJSON(),
    roads: state.roads.toJSON(),
    nations: state.nations,
    regions: state.regions,
    standing: state.standing,
    effects: state.effects,
    marketMarkup: state.marketMarkup,
    raisings: state.raisings,
    notices: state.notices,
    scenarioId: state.scenario?.id ?? null,
    status: state.status,
    medal: state.medal,
    ending: state.ending,
    stats: state.stats,
  };
  return JSON.stringify(saved);
}

export function deserialize(text: string): GameState {
  const saved = JSON.parse(text) as SavedState;
  if (saved.version !== VERSION) {
    throw new Error(`save is version ${saved.version}, this build reads ${VERSION}`);
  }

  // The island comes back from its seed, then the parts play changed are
  // painted over the top: felled forest and any terrain the layout raised.
  const generated = generateIsland({ seed: saved.seed, size: saved.islandSize });
  const island: Island = {
    ...generated,
    forest: ScalarField.fromJSON(generated, saved.forest),
    terrain: ByteField.fromJSON(generated, saved.terrain),
  };

  const occupancy = new IdField(island);
  const roads = ByteField.fromJSON(island, saved.roads);

  const state: GameState = {
    tick: saved.tick,
    startMonth: saved.startMonth,
    rng: new Rng(saved.rng),
    island,
    king: saved.king,
    treasury: saved.treasury,
    hoard: saved.hoard,
    stashRate: saved.stashRate,
    lumber: saved.lumber,
    buildings: new Map(saved.buildings.map((b) => [b.id, b])),
    people: new Map(saved.people.map((p) => [p.id, p])),
    ships: new Map(saved.ships.map((s) => [s.id, s])),
    nextId: saved.nextId,
    auras: createAuraFields(island),
    occupancy,
    roads,
    nations: saved.nations,
    regions: saved.regions,
    standing: saved.standing,
    // Saves written before timed effects existed simply have none in flight.
    effects: saved.effects ?? [],
    marketMarkup: saved.marketMarkup,
    raisings: saved.raisings,
    notices: saved.notices,
    scenario: saved.scenarioId ? (scenarioById(saved.scenarioId) ?? null) : null,
    status: saved.status,
    medal: saved.medal,
    ending: saved.ending,
    stats: saved.stats,
  };

  // Rebuild everything derived rather than trusting it to a file.
  for (const building of state.buildings.values()) {
    for (let y = building.y; y < building.y + building.h; y++) {
      for (let x = building.x; x < building.x + building.w; x++) occupancy.set(x, y, building.id);
    }
  }
  rebuildAuras(state);

  return state;
}

const SLOT_PREFIX = "tropico2.save.";

export function saveToSlot(state: GameState, slot: string): boolean {
  try {
    localStorage.setItem(SLOT_PREFIX + slot, serialize(state));
    return true;
  } catch {
    // Quota, private browsing, or a disabled store: the game carries on.
    return false;
  }
}

export function loadFromSlot(slot: string): GameState | null {
  try {
    const text = localStorage.getItem(SLOT_PREFIX + slot);
    return text ? deserialize(text) : null;
  } catch {
    return null;
  }
}

/**
 * A saved game in one line, for the button that goes back to it.
 *
 * Deserialising a whole island to label a button is more work than a label
 * deserves, but there is only ever one of them and it happens once, before the
 * game starts, on a screen that is waiting for a click anyway.
 */
export function describeSlot(slot: string): string | null {
  const state = loadFromSlot(slot);
  if (!state) return null;
  const counts = population(state);
  return `${formatDate(state)} · ${counts.pirates} pirates · ${counts.captives} captives`;
}

export function listSlots(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SLOT_PREFIX)) out.push(key.slice(SLOT_PREFIX.length));
    }
  } catch {
    return [];
  }
  return out.sort();
}

export function deleteSlot(slot: string): void {
  try {
    localStorage.removeItem(SLOT_PREFIX + slot);
  } catch {
    // Nothing to do; the slot simply stays.
  }
}
