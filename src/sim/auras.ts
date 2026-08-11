import { ScalarField } from "../core/field.ts";
import { distanceToRect, type GridSize } from "../core/grid.ts";
import { BUILDINGS, HOUSING_LEVELS, PALACE_LEVELS, type AuraEmission } from "../data/buildings.ts";
import { AURA_IDS, type AuraId } from "../data/needs.ts";
import { BACKGROUNDS, FLAWS, QUALITIES, type TraitEffects } from "../data/traits.ts";
import type { Building, GameState, King } from "./types.ts";

/**
 * The aura fields.
 *
 * This is the system the whole game turns on. Buildings radiate five different
 * feelings over the tiles around them, pirates read two of them and captives
 * read three, and **anarchy and order are the same axis pointing opposite ways**.
 * A tavern makes its neighbourhood free and lawless, which is exactly what a
 * pirate wants and exactly what makes the captives working next door start
 * thinking about the water. You cannot satisfy both in the same place, so you
 * zone — and zoning is the game.
 *
 * Fields are summed once when a building appears or disappears, never per tick.
 * Island-wide modifiers from the king's traits and standing edicts are applied
 * at read time, so a festival changes the whole island without touching memory.
 */

/** Falloff is linear from the edge of the footprint out to `radius`. */
export function emissionAt(
  building: Building,
  emission: AuraEmission,
  x: number,
  y: number,
): number {
  const distance = distanceToRect(building, x, y);
  if (distance >= emission.radius) return 0;
  return emission.strength * (1 - distance / emission.radius);
}

/**
 * What a building actually radiates right now.
 *
 * Pirate housing and the palace both grow, and their auras grow with them: a
 * rank-9 mansion throws off more than twelve times the anarchy of the bare plot
 * it started as, which is why a successful pirate quarter slowly poisons any
 * captive workplace that was fine next to it a decade earlier.
 */
export function emissionsOf(building: Building): readonly AuraEmission[] {
  if (building.construction > 0) return [];

  if (building.def === "pirateHousing") {
    const level = HOUSING_LEVELS[Math.min(building.level, HOUSING_LEVELS.length - 1)];
    if (!level) return [];
    const out: AuraEmission[] = [{ aura: "awe", strength: level.awe, radius: level.aweRadius }];
    if (level.anarchy > 0) {
      out.push({ aura: "anarchy", strength: level.anarchy, radius: level.anarchyRadius });
    }
    return out;
  }

  if (building.def === "piratePalace") {
    const level = PALACE_LEVELS[Math.min(building.level, PALACE_LEVELS.length - 1)];
    if (!level) return [];
    return [
      { aura: "order", strength: level.order, radius: 3 },
      { aura: "defense", strength: level.defense, radius: 3 },
    ];
  }

  return BUILDINGS[building.def].auras ?? [];
}

export function createAuraFields(size: GridSize): Record<AuraId, ScalarField> {
  return {
    anarchy: new ScalarField(size),
    order: new ScalarField(size),
    fear: new ScalarField(size),
    defense: new ScalarField(size),
    awe: new ScalarField(size),
  };
}

/** Adds or removes one building's contribution. Cheaper than a full rebuild. */
export function applyBuildingAuras(
  fields: Record<AuraId, ScalarField>,
  building: Building,
  sign: 1 | -1,
): void {
  for (const emission of emissionsOf(building)) {
    const field = fields[emission.aura];
    const radius = Math.ceil(emission.radius);
    const x0 = building.x - radius;
    const y0 = building.y - radius;
    const x1 = building.x + building.w + radius;
    const y1 = building.y + building.h + radius;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const value = emissionAt(building, emission, x, y);
        if (value > 0) field.add(x, y, value * sign);
      }
    }
  }
}

/** Recomputes every field from scratch. Used on load and after bulk changes. */
export function rebuildAuras(state: GameState): void {
  for (const id of AURA_IDS) state.auras[id].fill(0);
  for (const building of state.buildings.values()) {
    applyBuildingAuras(state.auras, building, 1);
  }
}

/** Island-wide multipliers and offsets, from the king's traits and standing edicts. */
export interface AuraModifiers {
  multiply: Record<AuraId, number>;
  add: Record<AuraId, number>;
}

const NEUTRAL_MULTIPLIERS = (): Record<AuraId, number> => ({
  anarchy: 1,
  order: 1,
  fear: 1,
  defense: 1,
  awe: 1,
});

const NO_OFFSETS = (): Record<AuraId, number> => ({
  anarchy: 0,
  order: 0,
  fear: 0,
  defense: 0,
  awe: 0,
});

/** The four multipliers a king's background, qualities and flaw can move. */
export function kingEffects(king: King): TraitEffects[] {
  const effects: TraitEffects[] = [BACKGROUNDS[king.background].effects];
  for (const quality of king.qualities) effects.push(QUALITIES[quality].effects);
  effects.push(FLAWS[king.flaw].effects);
  return effects;
}

/**
 * Memo for `auraModifiers`.
 *
 * Mood is read for every person every tick, and each read wanted the island's
 * modifiers — recomputing four trait lookups and a scan of the standing edicts
 * tens of thousands of times a second. They change only when the king or the
 * edicts change, both of which are visible in the signature below.
 */
let modifierCache: { signature: string; value: AuraModifiers } | null = null;

function modifierSignature(state: GameState): string {
  return `${state.king.background}|${state.king.qualities.join(",")}|${state.king.flaw}|${state.standing
    .map((e) => e.edict)
    .join(",")}`;
}

export function auraModifiers(state: GameState): AuraModifiers {
  const signature = modifierSignature(state);
  if (modifierCache?.signature === signature) return modifierCache.value;
  const computed = computeAuraModifiers(state);
  modifierCache = { signature, value: computed };
  return computed;
}

function computeAuraModifiers(state: GameState): AuraModifiers {
  const multiply = NEUTRAL_MULTIPLIERS();
  const add = NO_OFFSETS();

  for (const effect of kingEffects(state.king)) {
    if (effect.orderMultiplier) multiply.order *= effect.orderMultiplier;
    if (effect.anarchyMultiplier) multiply.anarchy *= effect.anarchyMultiplier;
    if (effect.fearMultiplier) multiply.fear *= effect.fearMultiplier;
    if (effect.defenseMultiplier) multiply.defense *= effect.defenseMultiplier;
  }

  for (const standing of state.standing) {
    switch (standing.edict) {
      case "pirateCurfew":
        // Order bought with fear, which is exactly the trade the original made.
        add.order += 14;
        add.fear -= 10;
        break;
      case "guardPatrols":
        add.order += 12;
        break;
      case "looseLips":
        add.order += 5;
        break;
      case "randomExecutions":
        add.anarchy += 10;
        add.fear += 14;
        break;
      default:
        break;
    }
  }

  return { multiply, add };
}

/** Raw field reading at a tile, before modifiers. */
export function rawAura(state: GameState, aura: AuraId, x: number, y: number): number {
  return state.auras[aura].sample(x, y);
}

/** Field reading with island-wide modifiers applied, clamped at zero. */
export function auraAt(
  state: GameState,
  aura: AuraId,
  x: number,
  y: number,
  modifiers?: AuraModifiers,
): number {
  const mods = modifiers ?? auraModifiers(state);
  const value = state.auras[aura].sample(x, y) * mods.multiply[aura] + mods.add[aura];
  return Math.max(0, value);
}

/**
 * How orderly this tile feels to a captive: order minus the anarchy fighting it.
 *
 * The subtraction is the whole point. A stockade radiating 59 order is worth
 * nothing three tiles from a tavern radiating 34 anarchy — the captives standing
 * there feel the difference, not the stockade.
 */
export function orderAt(state: GameState, x: number, y: number, modifiers?: AuraModifiers): number {
  const mods = modifiers ?? auraModifiers(state);
  return Math.max(0, auraAt(state, "order", x, y, mods) - auraAt(state, "anarchy", x, y, mods));
}

/** How lawless this tile feels to a pirate: anarchy minus the order suppressing it. */
export function anarchyAt(
  state: GameState,
  x: number,
  y: number,
  modifiers?: AuraModifiers,
): number {
  const mods = modifiers ?? auraModifiers(state);
  return Math.max(0, auraAt(state, "anarchy", x, y, mods) - auraAt(state, "order", x, y, mods));
}

/** Every aura reading at a tile, for the inspection panel. */
export function auraReadout(
  state: GameState,
  x: number,
  y: number,
): Record<AuraId, number> & { effectiveOrder: number; effectiveAnarchy: number } {
  const mods = auraModifiers(state);
  return {
    anarchy: auraAt(state, "anarchy", x, y, mods),
    order: auraAt(state, "order", x, y, mods),
    fear: auraAt(state, "fear", x, y, mods),
    defense: auraAt(state, "defense", x, y, mods),
    awe: auraAt(state, "awe", x, y, mods),
    effectiveOrder: orderAt(state, x, y, mods),
    effectiveAnarchy: anarchyAt(state, x, y, mods),
  };
}
