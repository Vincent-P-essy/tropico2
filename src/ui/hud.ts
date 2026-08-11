import {
  BUILDINGS,
  CATEGORY_NAMES,
  CATEGORY_ORDER,
  type BuildingCategory,
  type BuildingId,
} from "../data/buildings.ts";
import { GOODS, type GoodId } from "../data/goods.ts";
import { JOBS, type JobId } from "../data/jobs.ts";
import { NEEDS } from "../data/needs.ts";
import { auraReadout } from "../sim/auras.ts";
import { stockOf } from "../sim/economy.ts";
import { canWork, openSlots } from "../sim/employment.ts";
import { captiveResignation, formatDate, pirateHappiness, population } from "../sim/game.ts";
import { describePerson, moodTarget } from "../sim/people.ts";
import { evaluateScenario } from "../sim/objectives.ts";
import { diagnose } from "../sim/services.ts";
import { buildingCost, canPlace } from "../sim/state.ts";
import type { Building, GameState, Person } from "../sim/types.ts";
import type { Overlay } from "../render/renderer.ts";

/**
 * The paperwork.
 *
 * Built as DOM rather than drawn on the canvas, so the numbers stay crisp at any
 * zoom, the text can be selected, and a screen reader can get at it. The panels
 * only ever read the simulation and emit intent; nothing here mutates state.
 */

export interface HudCallbacks {
  onSpeed: (speed: number) => void;
  onPickBuilding: (id: BuildingId | null) => void;
  onOverlay: (overlay: Overlay) => void;
  onSelect: (id: number | null) => void;
  onDemolish: (id: number) => void;
  onTogglePriority: (id: number) => void;
  onToggleEnabled: (id: number) => void;
  onFocus: (x: number, y: number) => void;
  /** Put this person to work here, taking them off whatever they were doing. */
  onAssign: (person: number, building: number) => void;
  /** Take this person off their post. */
  onRelease: (person: number) => void;
  onSelectPerson: (person: number) => void;
}

export interface Selection {
  kind: "building" | "person";
  id: number;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly topbar: HTMLElement;
  private readonly speedBar: HTMLElement;
  private readonly categoryBar: HTMLElement;
  private readonly buildList: HTMLElement;
  private readonly inspector: HTMLElement;
  private readonly overlayBar: HTMLElement;
  private readonly noticeList: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly ending: HTMLElement;

  private category: BuildingCategory = "infrastructure";
  private picked: BuildingId | null = null;
  private overlay: Overlay = "none";
  private speed = 1;
  private lastNoticeId = -1;

  private readonly callbacks: HudCallbacks;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.innerHTML = "";

    this.topbar = el("div", "panel");
    this.topbar.id = "topbar";
    this.speedBar = el("div");
    this.speedBar.id = "speed";

    const build = el("div", "panel");
    build.id = "build";
    const title = el("h2");
    title.textContent = "Build";
    this.categoryBar = el("div");
    this.categoryBar.id = "categories";
    this.buildList = el("div");
    this.buildList.id = "buildings";
    build.append(title, this.categoryBar, this.buildList);

    this.inspector = el("div", "panel");
    this.inspector.id = "inspector";

    this.overlayBar = el("div", "panel");
    this.overlayBar.id = "overlays";

    this.noticeList = el("div", "panel");
    this.noticeList.id = "notices";

    this.hint = el("div", "panel");
    this.hint.id = "hint";

    this.ending = el("div");
    this.ending.id = "ending";

    this.root.append(
      this.topbar,
      build,
      this.inspector,
      this.overlayBar,
      this.noticeList,
      this.hint,
      this.ending,
    );

    this.buildSpeedControls();
    this.buildCategoryBar();
    this.buildOverlayBar();
  }

  private buildSpeedControls(): void {
    const labels = ["‖", "1×", "2×", "4×", "8×"];
    labels.forEach((label, index) => {
      const button = el("button");
      button.textContent = label;
      button.title = index === 0 ? "Pause" : `Speed ${label}`;
      button.addEventListener("click", () => {
        this.speed = index;
        this.callbacks.onSpeed(index);
        this.refreshSpeed();
      });
      this.speedBar.append(button);
    });
  }

  private refreshSpeed(): void {
    [...this.speedBar.children].forEach((child, index) => {
      child.classList.toggle("active", index === this.speed);
    });
  }

  private buildCategoryBar(): void {
    for (const category of CATEGORY_ORDER) {
      const button = el("button");
      button.textContent = CATEGORY_NAMES[category];
      button.addEventListener("click", () => {
        this.category = category;
        this.picked = null;
        this.callbacks.onPickBuilding(null);
        this.refreshCategories();
      });
      this.categoryBar.append(button);
    }
    this.refreshCategories();
  }

  private refreshCategories(): void {
    [...this.categoryBar.children].forEach((child, index) => {
      child.classList.toggle("active", CATEGORY_ORDER[index] === this.category);
    });
  }

  private buildOverlayBar(): void {
    const options: [Overlay, string][] = [
      ["none", "Island"],
      ["anarchy", "Anarchy"],
      ["order", "Order"],
      ["fear", "Fear"],
      ["defense", "Defense"],
      ["awe", "Awe"],
    ];
    for (const [id, label] of options) {
      const button = el("button");
      button.textContent = label;
      button.title =
        id === "none" ? "Show the island" : `Show where ${label.toLowerCase()} is felt`;
      button.addEventListener("click", () => {
        this.overlay = id;
        this.callbacks.onOverlay(id);
        this.refreshOverlays();
      });
      this.overlayBar.append(button);
    }
    this.refreshOverlays();
  }

  private refreshOverlays(): void {
    [...this.overlayBar.children].forEach((child, index) => {
      const ids: Overlay[] = ["none", "anarchy", "order", "fear", "defense", "awe"];
      child.classList.toggle("active", ids[index] === this.overlay);
    });
  }

  setPicked(id: BuildingId | null): void {
    this.picked = id;
  }

  /** Redraws everything that changes as the game runs. */
  update(state: GameState, selection: Selection | null): void {
    this.renderTopbar(state);
    this.renderBuildList(state);
    this.renderInspector(state, selection);
    this.renderNotices(state);
    this.renderEnding(state);
  }

  private renderTopbar(state: GameState): void {
    const counts = population(state);
    const happiness = pirateHappiness(state);
    const resignation = captiveResignation(state);

    this.topbar.innerHTML = "";
    this.topbar.append(
      stat("Date", formatDate(state)),
      stat("Treasury", Math.floor(state.treasury).toLocaleString(), "gold"),
      stat("Hoard", Math.floor(state.hoard).toLocaleString(), "hoard"),
      stat("Lumber", Math.floor(state.lumber).toLocaleString(), "lumber"),
      stat("Pirates", `${counts.pirates}`),
      stat("Happiness", `${happiness.toFixed(0)}%`),
      stat("Captives", `${counts.captives}`),
      stat("Resignation", `${resignation.toFixed(0)}%`),
    );

    const spacer = el("div", "spacer");
    this.topbar.append(spacer, this.speedBar);
    this.refreshSpeed();
  }

  private renderBuildList(state: GameState): void {
    this.buildList.innerHTML = "";
    const ids = (Object.keys(BUILDINGS) as BuildingId[]).filter(
      (id) => BUILDINGS[id].category === this.category,
    );

    for (const id of ids) {
      const def = BUILDINGS[id];
      const cost = buildingCost(state, id);
      const affordable = state.lumber >= cost.lumber && state.treasury >= cost.gold;

      const button = el("button", "build-item");
      button.classList.toggle("unaffordable", !affordable);
      button.classList.toggle("active", this.picked === id);

      const name = el("span");
      name.textContent = def.name;
      const price = el("span", "cost");
      price.textContent =
        [cost.lumber > 0 ? `${cost.lumber} lum` : "", cost.gold > 0 ? `${cost.gold}g` : ""]
          .filter(Boolean)
          .join(" · ") || "free";

      button.append(name, price);
      button.title = def.description;

      // Prerequisites the player cannot see from the price alone.
      if (def.requires) {
        const why = el("span", "why");
        why.textContent = `Needs a skilled ${JOBS[def.requires].name.toLowerCase()}`;
        button.append(why);
      }

      button.addEventListener("click", () => {
        this.picked = this.picked === id ? null : id;
        this.callbacks.onPickBuilding(this.picked);
        this.renderBuildList(state);
      });
      this.buildList.append(button);
    }
  }

  /** Live feedback under the cursor while placing. */
  showPlacement(
    state: GameState,
    id: BuildingId | null,
    x: number,
    y: number,
    rotation: 0 | 1 = 0,
  ): boolean {
    if (!id) {
      this.hint.classList.remove("show");
      return false;
    }
    const def = BUILDINGS[id];
    const check = canPlace(state, id, x, y, rotation);
    const turnable = def.w !== def.h;
    this.hint.classList.add("show");
    this.hint.classList.toggle("bad", !check.ok);
    this.hint.textContent = check.ok
      ? `${def.name} — click to build${turnable ? ", R to turn" : ""}, right-click to cancel`
      : (check.reason ?? "Cannot build here");
    return check.ok;
  }

  private renderInspector(state: GameState, selection: Selection | null): void {
    this.inspector.innerHTML = "";
    if (!selection) {
      // With nothing selected, the panel shows the episode's objectives, which
      // is what the player wants to see most of the time anyway.
      if (!state.scenario) {
        this.inspector.style.display = "none";
        return;
      }
      this.inspector.style.display = "block";
      this.renderObjectives(state);
      return;
    }
    this.inspector.style.display = "block";

    if (selection.kind === "building") {
      const building = state.buildings.get(selection.id);
      if (!building) return;
      this.renderBuildingPanel(state, building);
    } else {
      const person = state.people.get(selection.id);
      if (!person) return;
      this.renderPersonPanel(state, person);
    }
  }

  private renderObjectives(state: GameState): void {
    const scenario = state.scenario;
    if (!scenario) return;

    const title = el("h3");
    title.textContent = scenario.name;
    const sub = el("div", "sub");
    sub.textContent = `Episode ${scenario.index} · gold in ${scenario.gold} months`;
    const brief = el("div", "desc");
    brief.textContent = scenario.briefing;
    this.inspector.append(title, sub, brief);

    const section = el("div", "section");
    const heading = el("h4");
    heading.textContent = "Objectives";
    section.append(heading);
    for (const objective of evaluateScenario(state, scenario)) {
      const wrap = el("div");
      wrap.append(row(`${objective.done ? "✓" : "·"} ${objective.label}`, objective.detail));
      const bar = el("div", `bar ${objective.done ? "" : "mid"}`.trim());
      const fill = el("span");
      fill.style.width = `${(objective.progress * 100).toFixed(0)}%`;
      bar.append(fill);
      wrap.append(bar);
      section.append(wrap);
    }
    this.inspector.append(section);

    const hint = el("div", "desc");
    hint.textContent = scenario.hint;
    this.inspector.append(hint);
  }

  private renderBuildingPanel(state: GameState, building: Building): void {
    const def = BUILDINGS[building.def];
    const title = el("h3");
    title.textContent = def.name;
    const sub = el("div", "sub");
    sub.textContent = `${CATEGORY_NAMES[def.category]} · ${def.w}×${def.h}`;
    this.inspector.append(title, sub);

    // The single most useful line in the game: why is this not working?
    const problem = diagnose(state, building);
    if (problem) {
      const box = el("div", "problem");
      box.textContent = problem;
      this.inspector.append(box);
    }

    if (building.construction > 0) {
      const progress = 1 - building.construction / Math.max(1, building.constructionTotal);
      this.inspector.append(labelledBar("Construction", progress * 100));
    }

    const desc = el("div", "desc");
    desc.textContent = def.description;
    this.inspector.append(desc);

    if (def.staff && def.staff.length > 0) {
      const section = el("div", "section");
      const heading = el("h4");
      heading.textContent = "Staff";
      section.append(heading);

      // Named people, not just counts. The original gave the player no say in
      // who worked where, which is how a tavern could sit dry for a year.
      const byJob = new Map<JobId, Person[]>();
      for (const id of building.workers) {
        const worker = state.people.get(id);
        if (!worker?.job) continue;
        const list = byJob.get(worker.job.job) ?? [];
        list.push(worker);
        byJob.set(worker.job.job, list);
      }

      for (const slot of def.staff) {
        const held = byJob.get(slot.job) ?? [];
        section.append(row(JOBS[slot.job].name, `${held.length} / ${slot.count}`));

        const line = el("div", "chip-row");
        for (const worker of held) {
          const chip = el("button", "worker");
          chip.textContent = `${worker.name} ✕`;
          chip.title = `Take ${worker.name} off this post`;
          chip.addEventListener("click", () => {
            this.callbacks.onRelease(worker.id);
          });
          line.append(chip);
        }
        if (held.length > 0) section.append(line);
      }

      const missing = openSlots(state, building).reduce((n, slot) => n + slot.count, 0);
      if (missing > 0) {
        const note = el("div", "desc");
        note.textContent = `${missing} post${missing === 1 ? "" : "s"} unfilled.`;
        section.append(note);
        section.append(this.hiringList(state, building));
      }
      this.inspector.append(section);
    }

    const stocked = Object.entries(building.stock).filter(([, amount]) => amount > 0.01);
    if (stocked.length > 0) {
      const section = el("div", "section");
      const heading = el("h4");
      heading.textContent = "Stores";
      section.append(heading);
      for (const [good, amount] of stocked) {
        section.append(row(GOODS[good as GoodId].name, amount.toFixed(0)));
      }
      this.inspector.append(section);
    }

    if (def.recipe) {
      const section = el("div", "section");
      const heading = el("h4");
      heading.textContent = "Makes";
      const inputs = def.recipe.inputs.map((i) => `${i.amount} ${GOODS[i.good].name}`).join(" + ");
      section.append(
        heading,
        row(
          GOODS[def.recipe.output].name,
          inputs ? `${inputs} → ${def.recipe.amount}` : `${def.recipe.amount} per batch`,
        ),
      );
      this.inspector.append(section);
    }

    const auras = auraReadout(state, building.x + building.w / 2, building.y + building.h / 2);
    const section = el("div", "section");
    const heading = el("h4");
    heading.textContent = "Felt here";
    section.append(heading);
    section.append(row("Anarchy (pirates)", auras.effectiveAnarchy.toFixed(0)));
    section.append(row("Order (captives)", auras.effectiveOrder.toFixed(0)));
    section.append(row("Fear", auras.fear.toFixed(0)));
    section.append(row("Defense", auras.defense.toFixed(0)));
    section.append(row("Awe", auras.awe.toFixed(0)));
    this.inspector.append(section);

    const actions = el("div", "section");
    const priority = el("button");
    priority.textContent = `Priority: ${building.priority}`;
    priority.addEventListener("click", () => {
      this.callbacks.onTogglePriority(building.id);
    });
    const enabled = el("button");
    enabled.textContent = building.enabled ? "Shut down" : "Reopen";
    enabled.addEventListener("click", () => {
      this.callbacks.onToggleEnabled(building.id);
    });
    const demolish = el("button");
    demolish.textContent = "Demolish";
    demolish.addEventListener("click", () => {
      this.callbacks.onDemolish(building.id);
      this.callbacks.onSelect(null);
    });
    actions.append(priority, enabled, demolish);
    this.inspector.append(actions);
  }

  /**
   * Who could be put on the open posts here, nearest first.
   *
   * Shows a handful rather than the whole island: the point is to fix a
   * particular building that is standing idle, not to run a labour exchange.
   */
  private hiringList(state: GameState, building: Building): HTMLElement {
    const wrap = el("div", "chip-row");
    const slots = openSlots(state, building);

    const candidates: { person: Person; job: JobId; distance: number }[] = [];
    for (const person of state.people.values()) {
      if (person.activity === "dead" || person.activity === "atSea") continue;
      const slot = slots.find((s) => canWork(person, s.job));
      if (!slot) continue;
      // Somebody already doing this exact job here is not a candidate.
      if (person.job?.building === building.id) continue;
      candidates.push({
        person,
        job: slot.job,
        distance: Math.hypot(person.x - building.x, person.y - building.y),
      });
    }

    if (candidates.length === 0) {
      const none = el("div", "desc");
      none.textContent = "Nobody on the island can fill these posts.";
      return none;
    }

    // Idle people first, then the nearest — taking somebody off another job is
    // a real cost, so it should not be the default suggestion.
    candidates.sort(
      (a, b) =>
        Number(a.person.job !== null) - Number(b.person.job !== null) || a.distance - b.distance,
    );

    for (const candidate of candidates.slice(0, 6)) {
      const chip = el("button", "worker");
      const busy = candidate.person.job !== null;
      chip.textContent = `+ ${candidate.person.name}`;
      chip.classList.toggle("busy", busy);
      chip.title = busy
        ? `${candidate.person.name} is working elsewhere — hiring them here takes them off it`
        : `Put ${candidate.person.name} on as ${JOBS[candidate.job].name.toLowerCase()}`;
      chip.addEventListener("click", () => {
        this.callbacks.onAssign(candidate.person.id, building.id);
      });
      wrap.append(chip);
    }
    return wrap;
  }

  private renderPersonPanel(state: GameState, person: Person): void {
    const title = el("h3");
    title.textContent = person.name;
    const sub = el("div", "sub");
    const job = person.job ? JOBS[person.job.job].name : "unemployed";
    sub.textContent = `${describePerson(person)} · ${job} · ${person.activity}`;
    this.inspector.append(title, sub);

    if (person.job) {
      const workplace = state.buildings.get(person.job.building);
      if (workplace) {
        const actions = el("div", "chip-row");
        const goto = el("button");
        goto.textContent = `Go to ${BUILDINGS[workplace.def].name}`;
        goto.addEventListener("click", () => {
          this.callbacks.onFocus(workplace.x, workplace.y);
        });
        const quit = el("button");
        quit.textContent = "Take off the job";
        quit.addEventListener("click", () => {
          this.callbacks.onRelease(person.id);
        });
        actions.append(goto, quit);
        this.inspector.append(actions);
      }
    }

    const mood = moodTarget(state, person);
    this.inspector.append(
      labelledBar(person.kind === "pirate" ? "Happiness" : "Resignation", person.mood),
    );

    const needs = el("div", "section");
    const heading = el("h4");
    heading.textContent = "Needs";
    needs.append(heading);
    for (const entry of mood.needs) {
      needs.append(labelledBar(NEEDS[entry.need].name, entry.value));
    }
    for (const entry of mood.auras) {
      needs.append(labelledBar(`${entry.aura} (where they stand)`, entry.value));
    }
    this.inspector.append(needs);

    if (person.kind === "pirate") {
      const stats = el("div", "section");
      const h = el("h4");
      h.textContent = "Pirate";
      stats.append(h);
      stats.append(row("Rank", `${person.rank + 1}`));
      stats.append(row("Earnings", `${Math.floor(person.earnings)}g`));
      stats.append(row("Purse", `${Math.floor(person.gold)}g`));
      stats.append(row("Courage", `${person.courage}`));
      stats.append(row("Leadership", `${person.leadership}`));
      stats.append(row("Notoriety", `${person.notoriety}`));
      this.inspector.append(stats);
    } else {
      const stats = el("div", "section");
      const h = el("h4");
      h.textContent = "Captive";
      stats.append(h);
      stats.append(row("Skill", `${person.skill}`));
      stats.append(row("Courage", `${person.courage}`));
      stats.append(row("Leadership", `${person.leadership}`));
      if (person.profession) stats.append(row("Trade", JOBS[person.profession].name));
      if (person.wealthy) stats.append(row("Ransom", `${Math.floor(person.ransom)}g`));
      if (person.starving > 0) stats.append(row("Starving", `${person.starving.toFixed(1)} days`));
      this.inspector.append(stats);
    }
  }

  private renderNotices(state: GameState): void {
    const latest = state.notices.at(-1);
    if (!latest || latest.id === this.lastNoticeId) return;
    this.lastNoticeId = latest.id;

    this.noticeList.innerHTML = "";
    for (const notice of state.notices.slice(-8)) {
      const line = el("div", `notice ${notice.kind}`);
      const when = el("span", "when");
      when.textContent = `${Math.floor(notice.tick / 720) + 1}m`;
      const what = el("span", "what");
      what.textContent = notice.text;
      line.append(when, what);
      if (notice.at) {
        const target = notice.at;
        line.style.cursor = "pointer";
        line.addEventListener("click", () => {
          this.callbacks.onFocus(target.x, target.y);
        });
      }
      this.noticeList.append(line);
    }
    this.noticeList.scrollTop = this.noticeList.scrollHeight;
  }

  private renderEnding(state: GameState): void {
    if (state.status === "playing") {
      this.ending.classList.remove("show");
      return;
    }
    if (this.ending.classList.contains("show")) return;

    this.ending.classList.add("show");
    this.ending.innerHTML = "";
    const panel = el("div");
    const title = el("h1");
    title.textContent = state.status === "won" ? "The haven prospers" : "The haven falls";
    const reason = el("p");
    reason.textContent = state.ending ?? "";
    panel.append(title, reason);
    if (state.medal) {
      const medal = el("p");
      medal.textContent = `${state.medal.toUpperCase()} medal`;
      panel.append(medal);
    }
    this.ending.append(panel);
  }
}

// ── Small DOM helpers ───────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function stat(label: string, value: string, className = ""): HTMLElement {
  const wrap = el("div", `stat ${className}`.trim());
  const l = el("span", "label");
  l.textContent = label;
  const v = el("span", "value");
  v.textContent = value;
  wrap.append(l, v);
  return wrap;
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

function labelledBar(label: string, value: number): HTMLElement {
  const wrap = el("div");
  wrap.append(row(label, `${value.toFixed(0)}%`));
  const bar = el("div", `bar ${value < 30 ? "low" : value < 60 ? "mid" : ""}`.trim());
  const fill = el("span");
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  bar.append(fill);
  wrap.append(bar);
  return wrap;
}

export function goodName(id: GoodId): string {
  return GOODS[id].name;
}

export function buildingStock(building: Building, good: GoodId): number {
  return stockOf(building, good);
}
