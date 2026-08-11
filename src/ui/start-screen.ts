import { CAPTAINS, kingNameOf, type CaptainDef } from "../data/captains.ts";
import { NATIONS } from "../data/nations.ts";
import { CAMPAIGN, type Scenario } from "../data/scenarios.ts";
import { BACKGROUNDS, FLAWS, QUALITIES } from "../data/traits.ts";
import type { King } from "../sim/types.ts";

/**
 * The screen before the game.
 *
 * Two choices, and they are the two the original opened with: which water, and
 * which king. The king is not decoration — his background and qualities move
 * whole aura fields, change what buildings cost and decide which nations will
 * ever speak to you, so the panel says what each one actually does rather than
 * just who they were.
 */

export interface StartChoice {
  mode: "sandbox" | "campaign";
  scenario: Scenario | null;
  king: King;
  seed: number;
}

const MEDAL_KEY = "tropico2.medals";

export type Medal = "gold" | "silver" | "bronze";

const MEDAL_RANK: Record<Medal, number> = { gold: 3, silver: 2, bronze: 1 };

function rankOf(medal: string | undefined): number {
  if (medal === "gold" || medal === "silver" || medal === "bronze") return MEDAL_RANK[medal];
  return 0;
}

/** Medals earned so far, by episode id. */
export function earnedMedals(): Partial<Record<string, string>> {
  try {
    const raw = localStorage.getItem(MEDAL_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<string, string>>) : {};
  } catch {
    return {};
  }
}

/** Remembers a medal, but never downgrades one already won. */
export function recordMedal(scenarioId: string, medal: Medal): void {
  try {
    const all = earnedMedals();
    if (rankOf(medal) <= rankOf(all[scenarioId])) return;
    all[scenarioId] = medal;
    localStorage.setItem(MEDAL_KEY, JSON.stringify(all));
  } catch {
    // No storage: medals simply are not remembered between sessions.
  }
}

export function kingFrom(captain: CaptainDef): King {
  return {
    name: kingNameOf(captain),
    captainId: captain.id,
    sex: captain.sex,
    nationality: captain.nationality,
    background: captain.background,
    qualities: [...captain.qualities],
    flaw: captain.flaw,
  };
}

/** Everything a king's traits do, in the player's words. */
export function describeTraits(captain: CaptainDef): { name: string; text: string }[] {
  const out = [
    {
      name: BACKGROUNDS[captain.background].name,
      text: BACKGROUNDS[captain.background].description,
    },
  ];
  for (const quality of captain.qualities) {
    out.push({ name: QUALITIES[quality].name, text: QUALITIES[quality].description });
  }
  out.push({ name: FLAWS[captain.flaw].name, text: FLAWS[captain.flaw].description });
  return out;
}

export class StartScreen {
  private readonly root: HTMLElement;
  private readonly onBegin: (choice: StartChoice) => void;
  private captain: CaptainDef;
  private scenario: Scenario | null = null;
  private seed: number;

  constructor(root: HTMLElement, seed: number, onBegin: (choice: StartChoice) => void) {
    this.root = root;
    this.onBegin = onBegin;
    this.seed = seed;
    // The campaign's own Pirate King wears Henry Morgan's face, so he leads.
    const preferred = CAPTAINS.find((c) => c.id === "henryMorgan") ?? CAPTAINS[0];
    if (!preferred) throw new Error("no captains defined");
    this.captain = preferred;
    this.root.id = "start";
    this.render();
  }

  private begin(): void {
    this.root.remove();
    this.onBegin({
      mode: this.scenario ? "campaign" : "sandbox",
      scenario: this.scenario,
      king: kingFrom(this.captain),
      seed: this.seed,
    });
  }

  private render(): void {
    this.root.innerHTML = "";

    const title = el("h1");
    title.textContent = "Tropico 2: Pirate Cove";
    const blurb = el("p", "tagline");
    blurb.textContent =
      "Your pirates want anarchy. Your captives need order. They live on the same island.";
    this.root.append(title, blurb);

    const columns = el("div", "start-columns");
    columns.append(this.modeColumn(), this.kingColumn());
    this.root.append(columns);

    const footer = el("div", "start-footer");
    const seedLabel = el("label");
    seedLabel.textContent = "Island seed";
    const seedInput = el("input");
    seedInput.type = "number";
    seedInput.value = String(this.seed);
    seedInput.addEventListener("input", () => {
      const parsed = Number.parseInt(seedInput.value, 10);
      if (Number.isFinite(parsed)) this.seed = parsed;
    });
    const roll = el("button");
    roll.textContent = "Roll";
    roll.addEventListener("click", () => {
      this.seed = Math.floor(Math.random() * 1_000_000);
      seedInput.value = String(this.seed);
    });

    const begin = el("button", "primary");
    begin.textContent = this.scenario ? `Begin: ${this.scenario.name}` : "Begin free play";
    begin.addEventListener("click", () => {
      this.begin();
    });

    footer.append(seedLabel, seedInput, roll, begin);
    this.root.append(footer);
  }

  private modeColumn(): HTMLElement {
    const column = el("div", "start-column");
    const heading = el("h3");
    heading.textContent = "Where";
    column.append(heading);

    const medals = earnedMedals();

    const sandbox = el("button", "start-item");
    sandbox.classList.toggle("active", this.scenario === null);
    const sandboxName = el("span");
    sandboxName.textContent = "Free play";
    const sandboxNote = el("span", "note");
    sandboxNote.textContent = "no clock, no objectives";
    sandbox.append(sandboxName, sandboxNote);
    sandbox.addEventListener("click", () => {
      this.scenario = null;
      this.render();
    });
    column.append(sandbox);

    for (const scenario of CAMPAIGN) {
      const item = el("button", "start-item");
      item.classList.toggle("active", this.scenario?.id === scenario.id);
      const name = el("span");
      name.textContent = `${scenario.index}. ${scenario.name}`;
      const note = el("span", "note");
      const medal = medals[scenario.id];
      note.textContent = medal ? `${medal} · ${scenario.start[0]}` : `${scenario.start[0]}`;
      if (medal) note.classList.add(`medal-${medal}`);
      item.append(name, note);
      item.title = scenario.briefing;
      item.addEventListener("click", () => {
        this.scenario = scenario;
        this.render();
      });
      column.append(item);
    }

    return column;
  }

  private kingColumn(): HTMLElement {
    const column = el("div", "start-column");
    const heading = el("h3");
    heading.textContent = "Who";
    column.append(heading);

    const list = el("div", "king-list");
    for (const captain of CAPTAINS) {
      const item = el("button", "start-item");
      item.classList.toggle("active", this.captain.id === captain.id);
      const name = el("span");
      name.textContent = kingNameOf(captain);
      const note = el("span", "note");
      note.textContent = NATIONS[captain.nationality].adjective;
      item.append(name, note);
      item.addEventListener("click", () => {
        this.captain = captain;
        this.render();
      });
      list.append(item);
    }
    column.append(list);

    const detail = el("div", "king-detail");
    const who = el("p", "king-blurb");
    who.textContent = this.captain.description;
    detail.append(who);

    for (const trait of describeTraits(this.captain)) {
      const wrap = el("div", "trait");
      const traitName = el("span", "trait-name");
      traitName.textContent = trait.name;
      const traitText = el("span", "trait-text");
      traitText.textContent = trait.text;
      wrap.append(traitName, traitText);
      detail.append(wrap);
    }
    column.append(detail);

    return column;
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
