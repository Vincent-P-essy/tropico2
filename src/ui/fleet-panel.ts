import { CAPTAIN_COST } from "../data/balance.ts";
import { GOODS } from "../data/goods.ts";
import { REGIONS, REGION_IDS, type RegionId } from "../data/nations.ts";
import {
  ENGAGEMENTS,
  MISSIONS,
  PLUNDER_SHARES,
  PLUNDER_SHARE_IDS,
  SHIP_CLASSES,
  SHIP_CLASS_IDS,
  type EngagementId,
  type MissionId,
  type PlunderShare,
  type ShipClassId,
} from "../data/ships.ts";
import { crewShip, describeShip, launch, loadShip, recall } from "../sim/fleet.ts";
import { finishedBuildings } from "../sim/state.ts";
import type { GameState, Ship } from "../sim/types.ts";

/**
 * The admiralty.
 *
 * Everything to do with going to sea in one panel, because that is how the
 * player actually thinks about it: build a hull, sign a captain, put a crew and
 * some cutlasses aboard, choose water and a way of fighting, and send her out.
 */

export interface FleetCallbacks {
  onBuildShip: (cls: ShipClassId, yard: number) => void;
  onRecruitCaptain: () => void;
  onCrew: (ship: number) => void;
  onLoad: (ship: number) => void;
  onLaunch: (ship: number, mission: MissionId, region: RegionId) => void;
  onRecall: (ship: number) => void;
  onOrders: (ship: number, engagement: EngagementId, share: PlunderShare) => void;
  onFocus: (x: number, y: number) => void;
}

export class FleetPanel {
  private readonly root: HTMLElement;
  private readonly callbacks: FleetCallbacks;
  private open = false;
  private mission: MissionId = "cruise";
  private region: RegionId = "windwardPassage";

  constructor(root: HTMLElement, callbacks: FleetCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.id = "fleet";
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

  update(state: GameState): void {
    if (!this.open) return;
    this.root.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = "The Fleet";
    this.root.append(title);

    this.root.append(this.buildYardSection(state));
    this.root.append(this.buildOrdersSection());

    const list = document.createElement("div");
    list.className = "fleet-list";
    const ships = [...state.ships.values()];
    if (ships.length === 0) {
      const empty = document.createElement("p");
      empty.className = "desc";
      empty.textContent =
        "No ships. Build a boatyard on the coast, steal a shipwright, and lay down a hull — nothing on this island pays for itself until something of yours is at sea.";
      list.append(empty);
    }
    for (const ship of ships) list.append(this.shipCard(state, ship));
    this.root.append(list);
  }

  private buildYardSection(state: GameState): HTMLElement {
    const section = document.createElement("div");
    section.className = "section";
    const heading = document.createElement("h4");
    heading.textContent = "Yards";
    section.append(heading);

    const yards = [
      ...finishedBuildings(state, "boatyard"),
      ...finishedBuildings(state, "shipyard"),
    ];
    if (yards.length === 0) {
      const note = document.createElement("p");
      note.className = "desc";
      note.textContent = "No boatyard or shipyard, so nothing can be laid down.";
      section.append(note);
      return section;
    }

    const row = document.createElement("div");
    row.className = "chip-row";
    for (const cls of SHIP_CLASS_IDS) {
      const def = SHIP_CLASSES[cls];
      const yard = yards.find((y) => def.small || y.def === "shipyard");
      const affordable =
        yard !== undefined && state.lumber >= def.lumber && state.treasury >= def.gold;
      const button = document.createElement("button");
      button.textContent = def.name;
      button.disabled = !affordable;
      button.title = `${def.lumber} lumber${def.gold > 0 ? `, ${def.gold} gold` : ""} · ${def.crew} crew · ${def.description}`;
      button.addEventListener("click", () => {
        if (yard) this.callbacks.onBuildShip(cls, yard.id);
      });
      row.append(button);
    }
    section.append(row);

    const recruit = document.createElement("button");
    recruit.textContent = `Recruit a captain (${CAPTAIN_COST}g)`;
    recruit.disabled = state.treasury < CAPTAIN_COST;
    recruit.addEventListener("click", () => {
      this.callbacks.onRecruitCaptain();
    });
    section.append(recruit);
    return section;
  }

  private buildOrdersSection(): HTMLElement {
    const section = document.createElement("div");
    section.className = "section";
    const heading = document.createElement("h4");
    heading.textContent = "Sailing orders";
    section.append(heading);

    const missions = document.createElement("div");
    missions.className = "chip-row";
    for (const id of Object.keys(MISSIONS) as MissionId[]) {
      const button = document.createElement("button");
      button.textContent = MISSIONS[id].name;
      button.title = MISSIONS[id].description;
      button.classList.toggle("active", this.mission === id);
      button.addEventListener("click", () => {
        this.mission = id;
      });
      missions.append(button);
    }

    const regions = document.createElement("div");
    regions.className = "chip-row";
    for (const id of REGION_IDS) {
      const button = document.createElement("button");
      button.textContent = REGIONS[id].name.replace("The ", "");
      button.title = `${REGIONS[id].description} · ${REGIONS[id].distance} days out`;
      button.classList.toggle("active", this.region === id);
      button.addEventListener("click", () => {
        this.region = id;
      });
      regions.append(button);
    }

    section.append(missions, regions);
    return section;
  }

  private shipCard(state: GameState, ship: Ship): HTMLElement {
    const card = document.createElement("div");
    card.className = "ship";

    const name = document.createElement("div");
    name.className = "ship-name";
    name.textContent = `${ship.name} · ${SHIP_CLASSES[ship.cls].name}`;
    const status = document.createElement("div");
    status.className = "sub";
    status.textContent = describeShip(ship);
    card.append(name, status);

    const captain = ship.captain >= 0 ? state.people.get(ship.captain) : undefined;
    card.append(
      line("Captain", captain?.name ?? "none"),
      line("Crew", `${ship.crew.length} / ${SHIP_CLASSES[ship.cls].crew}`),
      line("Hull", `${Math.round(ship.hull)} / ${ship.maxHull}`),
    );

    const cargo = (["seaRations", "cutlasses", "cannon", "muskets"] as const)
      .map((good) => `${Math.round(ship.cargo[good])} ${GOODS[good].name.toLowerCase()}`)
      .join(", ");
    card.append(line("Aboard", cargo));

    if (ship.status === "inPort") {
      const actions = document.createElement("div");
      actions.className = "chip-row";

      const crew = document.createElement("button");
      crew.textContent = "Crew her";
      crew.addEventListener("click", () => {
        this.callbacks.onCrew(ship.id);
      });

      const load = document.createElement("button");
      load.textContent = "Load";
      load.title = "Take rations and arms from the dock's stores";
      load.addEventListener("click", () => {
        this.callbacks.onLoad(ship.id);
      });

      const sail = document.createElement("button");
      sail.textContent = "Sail";
      sail.disabled = ship.captain < 0 || ship.crew.length === 0 || ship.cargo.seaRations <= 0;
      sail.title =
        ship.captain < 0
          ? "She has no captain"
          : ship.crew.length === 0
            ? "She has no crew"
            : ship.cargo.seaRations <= 0
              ? "She has no rations aboard"
              : `${MISSIONS[this.mission].name} in ${REGIONS[this.region].name}`;
      sail.addEventListener("click", () => {
        this.callbacks.onLaunch(ship.id, this.mission, this.region);
      });

      actions.append(crew, load, sail);
      card.append(actions);

      const orders = document.createElement("div");
      orders.className = "chip-row";
      for (const id of Object.keys(ENGAGEMENTS) as EngagementId[]) {
        const button = document.createElement("button");
        button.textContent = ENGAGEMENTS[id].name;
        button.title = ENGAGEMENTS[id].description;
        button.classList.toggle("active", ship.engagement === id);
        button.addEventListener("click", () => {
          this.callbacks.onOrders(ship.id, id, ship.share);
        });
        orders.append(button);
      }
      for (const id of PLUNDER_SHARE_IDS) {
        const button = document.createElement("button");
        button.textContent = PLUNDER_SHARES[id].name;
        button.title = PLUNDER_SHARES[id].description;
        button.classList.toggle("active", ship.share === id);
        button.addEventListener("click", () => {
          this.callbacks.onOrders(ship.id, ship.engagement, id);
        });
        orders.append(button);
      }
      card.append(orders);
    } else if (ship.status === "onStation" || ship.status === "outbound") {
      const back = document.createElement("button");
      back.textContent = "Recall";
      back.addEventListener("click", () => {
        this.callbacks.onRecall(ship.id);
      });
      card.append(back);
    }

    if (ship.log.length > 0) {
      const log = document.createElement("div");
      log.className = "ship-log";
      for (const entry of ship.log.slice(-4)) {
        const item = document.createElement("div");
        item.textContent = entry;
        log.append(item);
      }
      card.append(log);
    }

    if (ship.dock >= 0) {
      const dock = state.buildings.get(ship.dock);
      if (dock) {
        card.style.cursor = "pointer";
        card.addEventListener("click", (event) => {
          if ((event.target as HTMLElement).tagName === "BUTTON") return;
          this.callbacks.onFocus(dock.x, dock.y);
        });
      }
    }

    return card;
  }
}

function line(key: string, value: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  const k = document.createElement("span");
  k.className = "k";
  k.textContent = key;
  const v = document.createElement("span");
  v.className = "v";
  v.textContent = value;
  row.append(k, v);
  return row;
}

/** Re-exported so main.ts can apply the panel's actions in one place. */
export const fleetActions = { crewShip, launch, loadShip, recall };
