import {
  EDICTS,
  EDICT_CATEGORY_NAMES,
  edictsInCategory,
  type EdictCategory,
  type EdictId,
} from "../data/edicts.ts";
import { GOODS, type GoodId } from "../data/goods.ts";
import { NATIONS, NATION_IDS, relationLabel, type NationId } from "../data/nations.ts";
import { PIRATE_SKILL_NAMES } from "../data/jobs.ts";
import {
  availableGifts,
  canIssue,
  edictCost,
  teachableSkills,
  type EdictContext,
} from "../sim/edicts.ts";
import { buyPrice, sellable } from "../sim/trade.ts";
import { describePerson } from "../sim/people.ts";
import type { GameState } from "../sim/types.ts";

/**
 * The Pirate King's own page.
 *
 * Edicts are the only part of the game that acts directly rather than through
 * somebody walking somewhere, so the panel is built around the question "on
 * whom": whatever is selected on the map becomes the target, and the edicts
 * that cannot use it grey out and say why.
 */

export interface EdictCallbacks {
  onIssue: (id: EdictId, ctx: EdictContext) => void;
  onCancel: (id: EdictId, nation?: NationId) => void;
  onSell: (good: GoodId, amount: number) => void;
  onBuy: (good: GoodId, amount: number) => void;
}

export class EdictsPanel {
  private readonly root: HTMLElement;
  private readonly callbacks: EdictCallbacks;
  private open = false;
  private category: EdictCategory = "individual";
  /** Person or ship currently selected on the map, used as the edict's target. */
  private target: { kind: "person" | "ship"; id: number } | null = null;

  constructor(root: HTMLElement, callbacks: EdictCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.id = "edicts";
    this.root.className = "panel";
    this.root.style.display = "none";
  }

  toggle(): void {
    this.open = !this.open;
    this.root.style.display = this.open ? "flex" : "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  setTarget(target: { kind: "person" | "ship"; id: number } | null): void {
    this.target = target;
  }

  update(state: GameState): void {
    if (!this.open) return;
    this.root.innerHTML = "";

    const title = el("h2");
    title.textContent = "Edicts";
    this.root.append(title, this.targetLine(state), this.categoryBar(state));

    for (const def of edictsInCategory(this.category)) {
      this.root.append(this.edictRow(state, def.id));
    }

    this.root.append(this.standingSection(state));
    this.root.append(this.diplomacySection(state));
    if (this.category === "diplomacy") this.root.append(this.tradeSection(state));
  }

  private targetLine(state: GameState): HTMLElement {
    const line = el("div", "sub");
    if (!this.target) {
      line.textContent = "No target — click a person or open the fleet to pick a ship.";
      return line;
    }
    if (this.target.kind === "person") {
      const person = state.people.get(this.target.id);
      line.textContent = person
        ? `Target: ${person.name} (${describePerson(person)})`
        : "Target: gone";
    } else {
      const ship = state.ships.get(this.target.id);
      line.textContent = ship ? `Target: ${ship.name}` : "Target: gone";
    }
    return line;
  }

  private categoryBar(state: GameState): HTMLElement {
    const bar = el("div", "chip-row");
    for (const category of Object.keys(EDICT_CATEGORY_NAMES) as EdictCategory[]) {
      const button = el("button");
      button.textContent = EDICT_CATEGORY_NAMES[category];
      button.classList.toggle("active", this.category === category);
      button.addEventListener("click", () => {
        this.category = category;
        this.update(state);
      });
      bar.append(button);
    }
    return bar;
  }

  /** The context this edict would be issued with, from the current selection. */
  private contextFor(extra: Partial<EdictContext> = {}): EdictContext {
    const ctx: EdictContext = { ...extra };
    if (this.target?.kind === "person") ctx.person = this.target.id;
    if (this.target?.kind === "ship") ctx.ship = this.target.id;
    return ctx;
  }

  private edictRow(state: GameState, id: EdictId): HTMLElement {
    const def = EDICTS[id];
    const row = el("div", "edict");

    const head = el("div", "edict-head");
    const name = el("span", "edict-name");
    name.textContent = def.name;
    const cost = el("span", "cost");
    const price = edictCost(state, id);
    cost.textContent = price > 0 ? `${price}g` : "free";
    head.append(name, cost);
    row.append(head);

    const blurb = el("div", "desc");
    blurb.textContent = def.description;
    row.append(blurb);

    // Nation-targeted edicts get one button per power; the rest get one button,
    // or a row of choices where the edict needs something picked.
    if (def.target === "nation") {
      row.append(this.nationButtons(state, id));
    } else if (id === "educatePirate") {
      row.append(
        this.choiceButtons(
          state,
          id,
          teachableSkills(state),
          (skill) => ({ skill }),
          (skill) => PIRATE_SKILL_NAMES[skill],
        ),
      );
    } else if (id === "outfitPirate") {
      row.append(
        this.choiceButtons(
          state,
          id,
          availableGifts(state),
          (gift) => ({ gift }),
          (gift) => GOODS[gift].name,
        ),
      );
    } else {
      row.append(this.singleButton(state, id));
    }

    return row;
  }

  private singleButton(state: GameState, id: EdictId): HTMLElement {
    const wrap = el("div");
    const ctx = this.contextFor();
    const check = canIssue(state, id, ctx);

    const button = el("button");
    button.textContent = "Issue";
    button.disabled = !check.ok;
    button.addEventListener("click", () => {
      this.callbacks.onIssue(id, ctx);
    });
    wrap.append(button);

    if (!check.ok && check.reason) {
      const why = el("span", "why");
      why.textContent = check.reason;
      wrap.append(why);
    }
    return wrap;
  }

  private nationButtons(state: GameState, id: EdictId): HTMLElement {
    const wrap = el("div", "chip-row");
    for (const nation of NATION_IDS) {
      const ctx = this.contextFor({ nation });
      const check = canIssue(state, id, ctx);
      const button = el("button");
      button.textContent = NATIONS[nation].name;
      button.disabled = !check.ok;
      button.title = check.ok
        ? `${EDICTS[id].name}: ${NATIONS[nation].name}`
        : (check.reason ?? "");
      button.addEventListener("click", () => {
        this.callbacks.onIssue(id, ctx);
      });
      wrap.append(button);
    }
    return wrap;
  }

  private choiceButtons<T extends string>(
    state: GameState,
    id: EdictId,
    choices: readonly T[],
    toContext: (choice: T) => Partial<EdictContext>,
    label: (choice: T) => string,
  ): HTMLElement {
    const wrap = el("div", "chip-row");
    if (choices.length === 0) {
      const why = el("span", "why");
      why.textContent =
        id === "educatePirate" ? "No school has been built yet" : "Nothing has been made yet";
      wrap.append(why);
      return wrap;
    }
    for (const choice of choices) {
      const ctx = this.contextFor(toContext(choice));
      const check = canIssue(state, id, ctx);
      const button = el("button");
      button.textContent = label(choice);
      button.disabled = !check.ok;
      button.title = check.reason ?? "";
      button.addEventListener("click", () => {
        this.callbacks.onIssue(id, ctx);
      });
      wrap.append(button);
    }
    return wrap;
  }

  private standingSection(state: GameState): HTMLElement {
    const section = el("div", "section");
    const heading = el("h4");
    heading.textContent = "In force";
    section.append(heading);

    if (state.standing.length === 0) {
      const none = el("div", "desc");
      none.textContent = "Nothing standing.";
      section.append(none);
      return section;
    }

    const wrap = el("div", "chip-row");
    for (const standing of state.standing) {
      const button = el("button");
      const name = EDICTS[standing.edict].name;
      button.textContent = standing.nation
        ? `${name} (${NATIONS[standing.nation].adjective}) ✕`
        : `${name} ✕`;
      button.title = "Lift this edict";
      button.addEventListener("click", () => {
        this.callbacks.onCancel(standing.edict, standing.nation ?? undefined);
      });
      wrap.append(button);
    }
    section.append(wrap);
    return section;
  }

  private diplomacySection(state: GameState): HTMLElement {
    const section = el("div", "section");
    const heading = el("h4");
    heading.textContent = "Where you stand";
    section.append(heading);

    for (const id of NATION_IDS) {
      const nation = state.nations[id];
      const marks: string[] = [];
      if (nation.isPatron) marks.push("patron");
      if (nation.atPeace) marks.push("at peace");
      if (nation.lettersOfMarque) marks.push("commission");
      if (nation.prohibited) marks.push("spared");
      if (nation.knowsLocation) marks.push("knows where we are");

      const wrap = el("div");
      wrap.append(
        row(
          NATIONS[id].name,
          `${nation.relations.toFixed(0)} · ${relationLabel(nation.relations)}`,
        ),
      );
      const bar = el(
        "div",
        `bar ${nation.relations < 0 ? "low" : nation.relations < 40 ? "mid" : ""}`.trim(),
      );
      const fill = el("span");
      // Relations run from -100 to 100, so the bar shows the whole scale.
      fill.style.width = `${((nation.relations + 100) / 2).toFixed(0)}%`;
      bar.append(fill);
      wrap.append(bar);
      if (marks.length > 0) {
        const note = el("div", "desc");
        note.textContent = marks.join(" · ");
        wrap.append(note);
      }
      section.append(wrap);
    }
    return section;
  }

  private tradeSection(state: GameState): HTMLElement {
    const section = el("div", "section");
    const heading = el("h4");
    heading.textContent = "Trade";
    section.append(heading);

    const goods = sellable(state);
    if (goods.length === 0) {
      const none = el("div", "desc");
      none.textContent =
        "The cove sells nothing yet — build one, open it to a nation, and make something worth selling.";
      section.append(none);
    } else {
      for (const entry of goods) {
        const wrap = el("div", "trade-row");
        const label = el("span");
        label.textContent = `${GOODS[entry.good].name} · ${entry.amount} @ ${entry.price.toFixed(0)}g`;
        wrap.append(label);
        for (const amount of [1, 10, entry.amount]) {
          if (amount <= 0) continue;
          const button = el("button");
          button.textContent = amount === entry.amount ? "all" : `${amount}`;
          button.addEventListener("click", () => {
            this.callbacks.onSell(entry.good, amount);
          });
          wrap.append(button);
        }
        section.append(wrap);
      }
    }

    const buyHeading = el("h4");
    buyHeading.textContent = "Black market";
    section.append(buyHeading);
    for (const good of ["seaRations", "cutlasses", "cannon", "muskets"] as const) {
      const price = buyPrice(state, good);
      const wrap = el("div", "trade-row");
      const label = el("span");
      label.textContent = `${GOODS[good].name} @ ${price.toFixed(0)}g`;
      wrap.append(label);
      for (const amount of [1, 5, 20]) {
        const button = el("button");
        button.textContent = `${amount}`;
        button.disabled = state.treasury < price * amount;
        button.addEventListener("click", () => {
          this.callbacks.onBuy(good, amount);
        });
        wrap.append(button);
      }
      section.append(wrap);
    }

    return section;
  }
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
