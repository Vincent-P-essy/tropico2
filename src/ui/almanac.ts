import { BUILDINGS, RANKS, type BuildingId } from "../data/buildings.ts";
import { GOODS, type GoodId } from "../data/goods.ts";
import { JOBS, type JobId } from "../data/jobs.ts";
import { NATIONS, NATION_IDS, REGIONS, REGION_IDS } from "../data/nations.ts";
import { NEEDS, type NeedId } from "../data/needs.ts";
import { buildingUpkeep, finishedBuildings } from "../sim/state.ts";
import { describeShip } from "../sim/fleet.ts";
import { captiveResignation, pirateHappiness, population } from "../sim/game.ts";
import { moodTarget } from "../sim/people.ts";
import { stockOf } from "../sim/economy.ts";
import { islandDefense } from "../sim/unrest.ts";
import type { GameState } from "../sim/types.ts";

/**
 * The almanac.
 *
 * The panel that answers "why", when the top bar has only told you "what". A
 * happiness of fourteen per cent is a number; the almanac says which of the six
 * needs is dragging it down and how many people are short of a bed, which is
 * something you can act on.
 */

export class Almanac {
  private readonly root: HTMLElement;
  private readonly onFocus: (x: number, y: number) => void;
  private open = false;
  private page: "people" | "economy" | "sea" = "people";

  constructor(root: HTMLElement, onFocus: (x: number, y: number) => void) {
    this.root = root;
    this.onFocus = onFocus;
    this.root.id = "almanac";
    this.root.className = "panel";
    this.root.style.display = "none";
  }

  toggle(): void {
    this.open = !this.open;
    this.root.style.display = this.open ? "flex" : "none";
  }

  update(state: GameState): void {
    if (!this.open) return;
    this.root.innerHTML = "";

    const title = el("h2");
    title.textContent = "Almanac";
    this.root.append(title, this.tabs(state));

    if (this.page === "people") this.peoplePage(state);
    else if (this.page === "economy") this.economyPage(state);
    else this.seaPage(state);
  }

  private tabs(state: GameState): HTMLElement {
    const bar = el("div", "chip-row");
    const pages: [typeof this.page, string][] = [
      ["people", "People"],
      ["economy", "Economy"],
      ["sea", "The Sea"],
    ];
    for (const [id, label] of pages) {
      const button = el("button");
      button.textContent = label;
      button.classList.toggle("active", this.page === id);
      button.addEventListener("click", () => {
        this.page = id;
        this.update(state);
      });
      bar.append(button);
    }
    return bar;
  }

  /**
   * What is actually dragging each population down.
   *
   * Averaged over everyone alive, so the worst line is the thing to build next.
   */
  private peoplePage(state: GameState): void {
    const counts = population(state);

    const summary = el("div", "section");
    summary.append(
      row("Pirates", `${counts.pirates}`),
      row("Happiness", `${pirateHappiness(state).toFixed(0)}%`),
      row("Captives", `${counts.captives}`),
      row("Resignation", `${captiveResignation(state).toFixed(0)}%`),
    );
    this.root.append(summary);

    for (const kind of ["pirate", "captive"] as const) {
      const people = [...state.people.values()].filter(
        (p) => p.kind === kind && p.activity !== "dead" && !p.skeleton,
      );
      if (people.length === 0) continue;

      const section = el("div", "section");
      const heading = el("h4");
      heading.textContent = kind === "pirate" ? "What the pirates want" : "What the captives want";
      section.append(heading);

      const needTotals = new Map<NeedId, number>();
      const auraTotals = new Map<string, number>();
      for (const person of people) {
        const mood = moodTarget(state, person);
        for (const entry of mood.needs) {
          needTotals.set(entry.need, (needTotals.get(entry.need) ?? 0) + entry.value);
        }
        for (const entry of mood.auras) {
          auraTotals.set(entry.aura, (auraTotals.get(entry.aura) ?? 0) + entry.value);
        }
      }

      const lines: { label: string; value: number }[] = [];
      for (const [need, total] of needTotals) {
        lines.push({ label: NEEDS[need].name, value: total / people.length });
      }
      for (const [aura, total] of auraTotals) {
        lines.push({ label: `${aura} where they stand`, value: total / people.length });
      }
      // Worst first: the top line is what to build next.
      lines.sort((a, b) => a.value - b.value);
      for (const line of lines) section.append(bar(line.label, line.value));
      this.root.append(section);
    }

    // Homelessness and unemployment, both of which are fixable by building.
    const homeless = [...state.people.values()].filter(
      (p) => p.activity !== "dead" && p.home < 0,
    ).length;
    const idle = [...state.people.values()].filter(
      (p) => p.kind === "captive" && p.activity !== "dead" && !p.wealthy && p.job === null,
    ).length;
    const starving = [...state.people.values()].filter((p) => p.starving > 1).length;

    const problems = el("div", "section");
    const heading = el("h4");
    heading.textContent = "Trouble";
    problems.append(
      heading,
      row("Without a bed or a plot", `${homeless}`),
      row("Captives with no work", `${idle}`),
      row("Going hungry", `${starving}`),
    );
    this.root.append(problems);

    // Rank spread: how rich the band has become, which is what improves houses.
    const ranks = new Array<number>(RANKS.length).fill(0);
    for (const person of state.people.values()) {
      if (person.kind !== "pirate" || person.activity === "dead") continue;
      ranks[person.rank] = (ranks[person.rank] ?? 0) + 1;
    }
    const rankSection = el("div", "section");
    const rankHeading = el("h4");
    rankHeading.textContent = "Ranks";
    rankSection.append(rankHeading);
    ranks.forEach((count, index) => {
      if (count === 0) return;
      rankSection.append(row(RANKS[index]?.title ?? `Rank ${index + 1}`, `${count}`));
    });
    this.root.append(rankSection);
  }

  private economyPage(state: GameState): void {
    const upkeep = finishedBuildings(state).reduce(
      (total, building) => total + buildingUpkeep(state, building.def),
      0,
    );
    const wages =
      [...state.people.values()].filter(
        (p) => p.kind === "pirate" && p.activity !== "dead" && p.job !== null,
      ).length * 6;

    const money = el("div", "section");
    money.append(
      row("Treasury", `${Math.floor(state.treasury).toLocaleString()}g`),
      row("Hoard", `${Math.floor(state.hoard).toLocaleString()}g`),
      row("Lumber", Math.floor(state.lumber).toLocaleString()),
      row("Monthly upkeep", `−${Math.round(upkeep + wages)}g`),
      row("Plundered all told", `${Math.round(state.stats.goldPlundered).toLocaleString()}g`),
    );
    this.root.append(money);

    // Everything the island is holding, so a shortage is visible before it bites.
    const stores = new Map<GoodId, number>();
    for (const building of state.buildings.values()) {
      for (const good of Object.keys(building.stock) as GoodId[]) {
        const amount = stockOf(building, good);
        if (amount > 0.01) stores.set(good, (stores.get(good) ?? 0) + amount);
      }
    }
    const goods = el("div", "section");
    const goodsHeading = el("h4");
    goodsHeading.textContent = "In store";
    goods.append(goodsHeading);
    if (stores.size === 0) {
      const none = el("div", "desc");
      none.textContent = "Nothing anywhere.";
      goods.append(none);
    }
    for (const [good, amount] of [...stores].sort((a, b) => b[1] - a[1])) {
      goods.append(row(GOODS[good].name, amount.toFixed(0)));
    }
    this.root.append(goods);

    // Which buildings are standing idle, and why — the single most useful list
    // on a large island, because it is where the lost output is.
    const idle: { name: string; why: string; x: number; y: number }[] = [];
    for (const building of state.buildings.values()) {
      if (building.def === "road" || building.construction > 0) continue;
      const def = BUILDINGS[building.def];
      if (!def.recipe && !def.provides) continue;
      const missing = missingStaff(state, building.workers, def.staff);
      if (missing) idle.push({ name: def.name, why: missing, x: building.x, y: building.y });
    }
    const idleSection = el("div", "section");
    const idleHeading = el("h4");
    idleHeading.textContent = `Short-handed (${idle.length})`;
    idleSection.append(idleHeading);
    for (const entry of idle.slice(0, 12)) {
      const line = el("div", "row clickable");
      const k = el("span", "k");
      k.textContent = entry.name;
      const v = el("span", "v");
      v.textContent = entry.why;
      line.append(k, v);
      line.addEventListener("click", () => {
        this.onFocus(entry.x, entry.y);
      });
      idleSection.append(line);
    }
    if (idle.length === 0) {
      const none = el("div", "desc");
      none.textContent = "Every building is fully staffed.";
      idleSection.append(none);
    }
    this.root.append(idleSection);
  }

  private seaPage(state: GameState): void {
    const fleet = el("div", "section");
    const heading = el("h4");
    heading.textContent = "The fleet";
    fleet.append(heading);
    const ships = [...state.ships.values()];
    if (ships.length === 0) {
      const none = el("div", "desc");
      none.textContent = "No ships. Nothing on this island pays for itself until one is at sea.";
      fleet.append(none);
    }
    for (const ship of ships) fleet.append(row(ship.name, describeShip(ship)));
    fleet.append(
      row("Prizes taken", `${state.stats.prizesTaken}`),
      row("Captives taken", `${state.stats.captivesTaken}`),
      row("Ships lost", `${state.stats.shipsLost}`),
      row("Pirates lost", `${state.stats.piratesLost}`),
    );
    this.root.append(fleet);

    const seas = el("div", "section");
    const seasHeading = el("h4");
    seasHeading.textContent = "The seas";
    seas.append(seasHeading);
    for (const id of REGION_IDS) {
      const region = state.regions[id];
      const wrap = el("div");
      wrap.append(
        row(
          REGIONS[id].name,
          `${(region.knowledge * 100).toFixed(0)}% charted · ${region.settlements} settlements`,
        ),
      );
      wrap.append(bar("shipping", region.shipping * 100));
      seas.append(wrap);
    }
    this.root.append(seas);

    const powers = el("div", "section");
    const powersHeading = el("h4");
    powersHeading.textContent = "The powers";
    powers.append(powersHeading, row("Island defence", islandDefense(state).toFixed(0)));
    for (const id of NATION_IDS) {
      const nation = state.nations[id];
      powers.append(
        row(
          NATIONS[id].name,
          `${nation.relations.toFixed(0)}${nation.knowsLocation ? " · knows us" : ""}`,
        ),
      );
    }
    this.root.append(powers);
  }
}

/** A one-line description of what a building is short of, or null if it is fine. */
function missingStaff(
  state: GameState,
  workers: readonly number[],
  staff: readonly { job: JobId; count: number }[] | undefined,
): string | null {
  if (!staff || staff.length === 0) return null;
  const have = new Map<JobId, number>();
  for (const id of workers) {
    const worker = state.people.get(id);
    if (worker?.job) have.set(worker.job.job, (have.get(worker.job.job) ?? 0) + 1);
  }
  const short: string[] = [];
  for (const slot of staff) {
    const missing = slot.count - (have.get(slot.job) ?? 0);
    if (missing > 0) short.push(`${missing} ${JOBS[slot.job].name.toLowerCase()}`);
  }
  return short.length > 0 ? short.join(", ") : null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function row(key: string, value: string): HTMLElement {
  const wrap = el("div", "row");
  const k = el("span", "k");
  k.textContent = key;
  const v = el("span", "v");
  v.textContent = value;
  wrap.append(k, v);
  return wrap;
}

function bar(label: string, value: number): HTMLElement {
  const wrap = el("div");
  wrap.append(row(label, `${value.toFixed(0)}%`));
  const track = el("div", `bar ${value < 30 ? "low" : value < 60 ? "mid" : ""}`.trim());
  const fill = el("span");
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  track.append(fill);
  wrap.append(track);
  return wrap;
}

export type { BuildingId };
