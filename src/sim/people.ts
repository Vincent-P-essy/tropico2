import { clamp } from "../core/grid.ts";
import {
  AURA_FULL,
  MOOD_SMOOTHING,
  STARVATION_DAYS,
  STARVATION_THRESHOLD,
  TICKS_PER_DAY,
} from "../data/balance.ts";
import { HOUSING_LEVELS, rankForEarnings } from "../data/buildings.ts";
import { NATION_IDS, type NationId } from "../data/nations.ts";
import { AURA_WEIGHTS, CAPTIVE_NEEDS, NEEDS, PIRATE_NEEDS, type NeedId } from "../data/needs.ts";
import { PIRATE_SKILLS, type JobId, type PirateSkill } from "../data/jobs.ts";
import { anarchyAt, auraAt, auraModifiers, kingEffects, orderAt } from "./auras.ts";
import { captiveName, pirateName } from "./names.ts";
import { nextId, notify } from "./state.ts";
import type { GameState, Person } from "./types.ts";

/**
 * The two populations.
 *
 * A pirate and a captive are the same data structure reading a different half of
 * the world. Both get hungry and both get tired; beyond that a pirate wants
 * drink, company, a game of dice, somewhere to hide his share, and the feeling
 * that nobody is in charge — while a captive wants a church, and to be
 * frightened enough and impressed enough to stop considering the water.
 *
 * The aggregate is called happiness for pirates and resignation for captives,
 * as in the original, and it is the same computation over different inputs.
 */

function emptyNeeds(): Record<NeedId, number> {
  return {
    feasting: 70,
    drinking: 70,
    gambling: 70,
    companionship: 70,
    resting: 70,
    stashing: 60,
    religion: 100,
  };
}

function emptySkills(): Record<PirateSkill, number> {
  return { navigation: 1, seamanship: 1, gunnery: 1, marksmanship: 1, swordsmanship: 1 };
}

export interface SpawnOptions {
  x: number;
  y: number;
  nationality?: NationId;
  sex?: "male" | "female";
  /** Skilled captives arrive with a trade; unskilled do not. */
  profession?: JobId | null;
  wealthy?: boolean;
  captainId?: string | null;
}

export function spawnPirate(state: GameState, options: SpawnOptions): Person {
  const rng = state.rng;
  const sex = options.sex ?? (rng.chance(0.25) ? "female" : "male");
  const nationality = options.nationality ?? rng.pick(NATION_IDS) ?? "england";

  const skills = emptySkills();
  for (const skill of PIRATE_SKILLS) skills[skill] = rng.int(1, 4);

  const person: Person = {
    id: nextId(state),
    kind: "pirate",
    name: pirateName(rng, sex),
    sex,
    nationality,
    x: options.x,
    y: options.y,
    path: [],
    activity: "idle",
    target: -1,
    inside: -1,
    intent: "work",
    timer: 0,
    needs: emptyNeeds(),
    mood: 60,
    job: null,
    home: -1,
    skills,
    courage: rng.int(2, 6),
    leadership: rng.int(1, 5),
    notoriety: rng.int(1, 4),
    loyalty: rng.int(2, 6),
    gold: rng.int(5, 40),
    earnings: 0,
    rank: 0,
    captainId: options.captainId ?? null,
    ship: -1,
    profession: null,
    wealthy: false,
    ransom: 0,
    skill: 1,
    starving: 0,
    skeleton: false,
    carrying: null,
    errand: -1,
  };

  applyKingBonuses(state, person);
  state.people.set(person.id, person);
  return person;
}

export function spawnCaptive(state: GameState, options: SpawnOptions): Person {
  const rng = state.rng;
  const sex = options.sex ?? (rng.chance(0.4) ? "female" : "male");
  const nationality = options.nationality ?? rng.pick(NATION_IDS) ?? "spain";
  const profession = options.profession ?? null;
  const wealthy = options.wealthy ?? false;

  const person: Person = {
    id: nextId(state),
    kind: "captive",
    name: captiveName(rng, nationality, sex),
    sex,
    nationality,
    x: options.x,
    y: options.y,
    path: [],
    activity: "idle",
    target: -1,
    inside: -1,
    intent: "work",
    timer: 0,
    needs: emptyNeeds(),
    mood: 55,
    job: null,
    home: -1,
    skills: emptySkills(),
    courage: rng.int(1, 7),
    leadership: rng.int(1, 7),
    notoriety: 0,
    loyalty: 0,
    gold: wealthy ? rng.int(200, 600) : 0,
    earnings: 0,
    rank: 0,
    captainId: null,
    ship: -1,
    profession,
    wealthy,
    ransom: 0,
    skill: rng.int(2, 4),
    starving: 0,
    skeleton: false,
    carrying: null,
    errand: -1,
  };

  applyKingBonuses(state, person);
  state.people.set(person.id, person);
  return person;
}

/** A skeleton hauls without eating, sleeping or praying — and hauls better. */
export function raiseSkeleton(state: GameState, x: number, y: number): Person {
  const person = spawnCaptive(state, { x, y });
  person.skeleton = true;
  person.name = `Skeleton of ${person.name}`;
  person.skill = 5;
  person.mood = 100;
  person.courage = 0;
  person.leadership = 0;
  return person;
}

/** Traits that raise or lower everyone on the island, applied at spawn. */
function applyKingBonuses(state: GameState, person: Person): void {
  for (const effect of kingEffects(state.king)) {
    if (person.kind === "pirate") {
      if (effect.pirateSkills) {
        for (const skill of PIRATE_SKILLS) {
          const delta = effect.pirateSkills[skill];
          if (delta !== undefined) person.skills[skill] = clamp(person.skills[skill] + delta, 1, 9);
        }
      }
      if (effect.pirateMarksmanship) {
        person.skills.marksmanship = clamp(
          person.skills.marksmanship + effect.pirateMarksmanship,
          1,
          9,
        );
      }
      if (effect.pirateLeadership) {
        person.leadership = clamp(person.leadership + effect.pirateLeadership, 1, 9);
      }
      if (effect.pirateCourage) person.courage = clamp(person.courage + effect.pirateCourage, 1, 9);
    } else if (effect.captiveSkill) {
      person.skill = clamp(person.skill + effect.captiveSkill, 1, 6);
    }
  }
}

/** Which needs this person actually has. Skeletons want nothing at all. */
export function needsOf(person: Person): readonly NeedId[] {
  if (person.skeleton) return [];
  if (person.kind === "pirate") return PIRATE_NEEDS;
  return CAPTIVE_NEEDS;
}

/**
 * Game-years before captives start wanting a church.
 *
 * The original was specific about this: "captives will want religion after two
 * years have passed on the isle". It matters more than it sounds — without the
 * grace period every new island opens with one of the three captive needs
 * already draining toward zero and no way to answer it, and the population
 * reaches rebellion before the player has had time to find a priest.
 */
export const RELIGION_GRACE_YEARS = 2;

/** Drains every need this person has by the time elapsed. */
export function decayNeeds(person: Person, hours: number, wantsReligion = true): void {
  if (person.skeleton) return;
  const days = hours / 24;
  for (const need of needsOf(person)) {
    if (need === "religion" && !wantsReligion) continue;
    person.needs[need] = clamp(person.needs[need] - NEEDS[need].decayPerDay * days, 0, 100);
  }
}

/** Fills one need toward `quality`, never past it. */
export function satisfyNeed(person: Person, need: NeedId, quality: number, fraction: number): void {
  const current = person.needs[need];
  if (quality <= current) return;
  person.needs[need] = clamp(current + (quality - current) * fraction, 0, 100);
}

export interface MoodBreakdown {
  total: number;
  needs: { need: NeedId; value: number; weight: number }[];
  auras: { aura: string; value: number; weight: number }[];
}

/**
 * What a person's mood would settle at, given where they are standing and how
 * their needs are doing.
 *
 * Auras count as needs too: a pirate reads anarchy and defense, a captive reads
 * order, fear and awe, and all of them are scored against `AURA_FULL` so a tile
 * at that strength counts as fully satisfying.
 */
export function moodTarget(state: GameState, person: Person): MoodBreakdown {
  if (person.skeleton) {
    return { total: 100, needs: [], auras: [] };
  }

  const mods = auraModifiers(state);
  const needs: MoodBreakdown["needs"] = [];
  const auras: MoodBreakdown["auras"] = [];

  let weighted = 0;
  let weight = 0;

  for (const need of needsOf(person)) {
    const w = NEEDS[need].weight;
    needs.push({ need, value: person.needs[need], weight: w });
    weighted += person.needs[need] * w;
    weight += w;
  }

  const readings: { aura: string; value: number; weight: number }[] =
    person.kind === "pirate"
      ? [
          {
            aura: "anarchy",
            value: anarchyAt(state, person.x, person.y, mods),
            weight: AURA_WEIGHTS.anarchy,
          },
          {
            aura: "defense",
            value: auraAt(state, "defense", person.x, person.y, mods),
            weight: AURA_WEIGHTS.defense,
          },
        ]
      : [
          {
            aura: "order",
            value: orderAt(state, person.x, person.y, mods),
            weight: AURA_WEIGHTS.order,
          },
          {
            aura: "fear",
            value: auraAt(state, "fear", person.x, person.y, mods),
            weight: AURA_WEIGHTS.fear,
          },
          {
            aura: "awe",
            value: auraAt(state, "awe", person.x, person.y, mods),
            weight: AURA_WEIGHTS.awe,
          },
        ];

  for (const reading of readings) {
    const scored = clamp((reading.value / AURA_FULL) * 100, 0, 100);
    auras.push({ aura: reading.aura, value: scored, weight: reading.weight });
    weighted += scored * reading.weight;
    weight += reading.weight;
  }

  return { total: weight === 0 ? 100 : clamp(weighted / weight, 0, 100), needs, auras };
}

/** Moves mood toward its target. Feelings lag the facts, so nobody flips instantly. */
export function updateMood(state: GameState, person: Person, hours: number): void {
  const target = moodTarget(state, person).total;
  const rate = Math.min(1, MOOD_SMOOTHING * hours);
  person.mood = clamp(person.mood + (target - person.mood) * rate, 0, 100);
}

/**
 * Starvation.
 *
 * Captives starve to death, as the original was explicit about: too few chuck
 * tents and they die, which is why food is the first thing you build. Pirates
 * do not — a pirate with nothing to eat gets angry, not dead, and an angry
 * pirate deserts or leads a revolt. Each population fails in its own way, which
 * is the point of having two of them.
 */
export function updateStarvation(state: GameState, person: Person, hours: number): boolean {
  if (person.skeleton) return false;
  if (person.needs.feasting > STARVATION_THRESHOLD) {
    person.starving = Math.max(0, person.starving - hours / TICKS_PER_DAY);
    return false;
  }

  person.starving += hours / TICKS_PER_DAY;
  if (person.kind === "pirate") return false;
  if (person.starving < STARVATION_DAYS) return false;

  killPerson(state, person, `${person.name} has starved to death`);
  return true;
}

export function killPerson(state: GameState, person: Person, reason: string): void {
  if (person.activity === "dead") return;
  person.activity = "dead";
  person.path = [];

  const workplace = person.job ? state.buildings.get(person.job.building) : undefined;
  if (workplace) workplace.workers = workplace.workers.filter((id) => id !== person.id);
  person.job = null;

  const home = person.home >= 0 ? state.buildings.get(person.home) : undefined;
  if (home?.owner === person.id) home.owner = -1;
  person.home = -1;

  const occupied = person.inside >= 0 ? state.buildings.get(person.inside) : undefined;
  if (occupied) occupied.visitors = occupied.visitors.filter((id) => id !== person.id);
  person.inside = -1;

  if (person.kind === "pirate") state.stats.piratesLost++;
  notify(state, "bad", reason, { x: person.x, y: person.y });
}

/** Removes a person from the island without killing them: freed, ransomed, sold. */
export function removePerson(state: GameState, person: Person): void {
  killPerson(state, person, "");
  // The notice above is suppressed by an empty reason; drop it again.
  if (state.notices.at(-1)?.text === "") state.notices.pop();
  if (person.kind === "pirate") state.stats.piratesLost--;
  state.people.delete(person.id);
}

/**
 * Pays a pirate, which is how rank works: rank is lifetime earnings, and rank
 * decides the quality of his house, how much anarchy and awe it radiates, and
 * how demanding his tastes become.
 */
export function payPirate(state: GameState, person: Person, gold: number): void {
  if (gold <= 0) return;
  person.gold += gold;
  person.earnings += gold;
  const rank = rankForEarnings(person.earnings);
  if (rank === person.rank) return;

  person.rank = rank;
  const home = person.home >= 0 ? state.buildings.get(person.home) : undefined;
  if (home?.def === "pirateHousing") {
    // The pirate improves his own plot out of his own pocket.
    home.level = Math.min(rank, HOUSING_LEVELS.length - 1);
  }
}

/** Titles for the inspector: rank name for pirates, condition for captives. */
export function describePerson(person: Person): string {
  if (person.skeleton) return "Skeleton";
  if (person.kind === "pirate") {
    return person.captainId ? "Captain" : (HOUSING_LEVELS[person.rank]?.name ?? "Pirate");
  }
  if (person.wealthy) return "Wealthy captive";
  if (person.profession) return `Skilled ${person.profession}`;
  return "Captive";
}

/** The single worst need, which is what the mood tooltip should lead with. */
export function worstNeed(person: Person): { need: NeedId; value: number } | null {
  let worst: { need: NeedId; value: number } | null = null;
  for (const need of needsOf(person)) {
    const value = person.needs[need];
    if (!worst || value < worst.value) worst = { need, value };
  }
  return worst;
}
