import { SPEEDS, TICKS_PER_SECOND } from "../data/balance.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { BUILDINGS, type BuildingId } from "../data/buildings.ts";
import { Camera } from "../render/camera.ts";
import { render, type Overlay } from "../render/renderer.ts";
import { buildAtlas } from "../render/sprites.ts";
import { constructionHours } from "../sim/economy.ts";
import { tick } from "../sim/game.ts";
import { findStartSite } from "../sim/island.ts";
import { newGame, startScenario } from "../sim/setup.ts";
import { CAMPAIGN } from "../data/scenarios.ts";
import {
  addBuilding,
  buildingAt,
  buildingCost,
  canPlace,
  notify,
  removeBuilding,
} from "../sim/state.ts";
import type { GameState } from "../sim/types.ts";
import { EdictsPanel } from "../ui/edicts-panel.ts";
import { recordMedal, StartScreen } from "../ui/start-screen.ts";
import { FleetPanel } from "../ui/fleet-panel.ts";
import { Hud, type Selection } from "../ui/hud.ts";
import { buildShip, crewShip, launch, loadShip, recall, recruitCaptain } from "../sim/fleet.ts";
import { loadFromSlot, saveToSlot } from "../sim/save.ts";
import { evaluateScenario } from "../sim/objectives.ts";
import { cancel as cancelEdict, issue as issueEdict } from "../sim/edicts.ts";
import { buy as buyGoods, sell as sellGoods } from "../sim/trade.ts";

/**
 * Boot, input and the game loop.
 *
 * The only file allowed to touch the clock, the DOM events or `performance.now`.
 * Everything below it is a pure function of state, which is what lets the whole
 * simulation be tested without a browser.
 */

const canvasElement = document.getElementById("view");
const uiRoot = document.getElementById("ui");
if (!(canvasElement instanceof HTMLCanvasElement) || !uiRoot) {
  throw new Error("missing canvas or ui root");
}
// Bound to a fresh const so the narrowing survives into the hoisted functions
// below, which TypeScript otherwise assumes could run before the check.
const canvas: HTMLCanvasElement = canvasElement;
const context = canvas.getContext("2d");
if (!context) throw new Error("this browser has no 2d canvas");
const ctx: CanvasRenderingContext2D = context;

const seed = readSeed();
/**
 * Reassigned when the player picks from the start screen. The game boots with a
 * valid island either way, so nothing below has to cope with there being no
 * world yet — the screen simply sits over a paused one.
 */
let state: GameState = startingGame(seed);
const atlas = buildAtlas();
const camera = new Camera();

let speedIndex = 1;
let picked: BuildingId | null = null;
let overlay: Overlay = "none";
let selection: Selection | null = null;
let hover: { x: number; y: number } | null = null;
let tickCarry = 0;
let lastFrame = performance.now();
let elapsed = 0;

const hud = new Hud(uiRoot, {
  onSpeed: (value) => {
    speedIndex = value;
  },
  onPickBuilding: (id) => {
    picked = id;
    hud.setPicked(id);
  },
  onOverlay: (value) => {
    overlay = value;
  },
  onSelect: (id) => {
    selection = id === null ? null : selection;
  },
  onDemolish: (id) => {
    removeBuilding(state, id);
  },
  onTogglePriority: (id) => {
    const building = state.buildings.get(id);
    if (!building) return;
    building.priority =
      building.priority === "low" ? "normal" : building.priority === "normal" ? "high" : "low";
  },
  onToggleEnabled: (id) => {
    const building = state.buildings.get(id);
    if (building) building.enabled = !building.enabled;
  },
  onFocus: (x, y) => {
    camera.lookAt(x, y);
  },
});

const fleetRoot = document.createElement("div");
uiRoot.append(fleetRoot);
const fleet = new FleetPanel(fleetRoot, {
  onBuildShip: (cls, yard) => {
    const built = buildShip(state, cls, yard);
    if (!built) {
      notify(state, "warning", "That yard cannot lay down such a hull");
      return;
    }
    const cost = SHIP_CLASSES[cls];
    state.lumber -= cost.lumber;
    state.treasury -= cost.gold;
    notify(state, "info", `${built.name} is laid down`);
  },
  onRecruitCaptain: () => {
    if (!recruitCaptain(state)) notify(state, "warning", "No captain would sign for that");
  },
  onCrew: (id) => {
    const ship = state.ships.get(id);
    if (ship && !crewShip(state, ship)) {
      notify(state, "warning", `${ship.name} wants a captain and more hands`);
    }
  },
  onLoad: (id) => {
    const ship = state.ships.get(id);
    if (ship) loadShip(state, ship);
  },
  onLaunch: (id, mission, region) => {
    const ship = state.ships.get(id);
    if (!ship) return;
    const result = launch(state, ship, mission, region);
    if (!result.ok) notify(state, "warning", result.reason ?? "She cannot sail");
  },
  onRecall: (id) => {
    const ship = state.ships.get(id);
    if (ship) recall(state, ship);
  },
  onOrders: (id, engagement, share) => {
    const ship = state.ships.get(id);
    if (!ship) return;
    ship.engagement = engagement;
    ship.share = share;
  },
  onFocus: (x, y) => {
    camera.lookAt(x, y);
  },
});

const edictRoot = document.createElement("div");
uiRoot.append(edictRoot);
const edicts = new EdictsPanel(edictRoot, {
  onIssue: (id, ctx) => {
    const result = issueEdict(state, id, ctx);
    if (!result.ok) notify(state, "warning", result.reason ?? "That cannot be done");
  },
  onCancel: (id, nation) => {
    cancelEdict(state, id, nation);
  },
  onSell: (good, amount) => {
    const result = sellGoods(state, good, amount);
    if (!result.ok) notify(state, "warning", result.reason ?? "Nobody is buying");
  },
  onBuy: (good, amount) => {
    const result = buyGoods(state, good, amount);
    if (!result.ok) notify(state, "warning", result.reason ?? "Nobody is selling");
  },
});

/** Points the camera at the settlement rather than a corner of the sea. */
function lookAtSettlement(): void {
  const site = findStartSite(state.island, 9);
  camera.lookAt(site.x + 4, site.y + 4);
}
lookAtSettlement();

/*
 * The start screen. Skipped when the URL already says what to play, so a direct
 * link and the headless harness both land straight in the game.
 */
const chosenByUrl = new URLSearchParams(window.location.search).has("episode");
if (!chosenByUrl) {
  speedIndex = 0;
  const startRoot = document.createElement("div");
  document.body.append(startRoot);
  new StartScreen(startRoot, seed, (choice) => {
    state = choice.scenario
      ? startScenario(choice.scenario, choice.seed, choice.king)
      : newGame({ seed: choice.seed, islandSize: 64, king: choice.king });
    lookAtSettlement();
    speedIndex = 1;
  });
}

resize();
window.addEventListener("resize", resize);

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.viewWidth = window.innerWidth;
  camera.viewHeight = window.innerHeight;
}

// ── Input ───────────────────────────────────────────────────────────────────

let dragging = false;
let dragMoved = false;
let lastPointer = { x: 0, y: 0 };

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  dragging = true;
  dragMoved = false;
  lastPointer = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointermove", (event) => {
  const tile = camera.screenToTile(event.clientX, event.clientY);
  hover = { x: Math.floor(tile.x), y: Math.floor(tile.y) };

  if (!dragging) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
  // Middle button and shift-drag pan; a plain drag pans too unless placing.
  if (picked === null || event.buttons === 4 || event.shiftKey) {
    camera.panBy(-dx, -dy);
    camera.clampToIsland(state.island.width, state.island.height);
  }
  lastPointer = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  if (dragMoved) return;
  const tile = camera.screenToTile(event.clientX, event.clientY);
  handleClick(Math.floor(tile.x), Math.floor(tile.y));
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  picked = null;
  hud.setPicked(null);
  selection = null;
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    camera.zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 0.9 : 1.1);
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  const speedKeys: Record<string, number> = { " ": 0, "1": 1, "2": 2, "3": 3, "4": 4 };
  const speed = speedKeys[event.key];
  if (speed !== undefined) {
    event.preventDefault();
    speedIndex = speedIndex === 0 && speed === 0 ? 1 : speed;
    return;
  }
  if (event.key === "f" || event.key === "F") fleet.toggle();
  if (event.key === "e" || event.key === "E") edicts.toggle();
  if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    notify(state, saveToSlot(state, "quick") ? "good" : "warning", "Saved");
  }
  if (event.key === "Escape") {
    picked = null;
    hud.setPicked(null);
    selection = null;
  }
  const pan = 60;
  if (event.key === "ArrowLeft") camera.panBy(-pan, 0);
  if (event.key === "ArrowRight") camera.panBy(pan, 0);
  if (event.key === "ArrowUp") camera.panBy(0, -pan);
  if (event.key === "ArrowDown") camera.panBy(0, pan);
});

function handleClick(x: number, y: number): void {
  if (picked) {
    placeBuilding(picked, x, y);
    return;
  }

  const building = buildingAt(state, x, y);
  if (building) {
    selection = { kind: "building", id: building.id };
    return;
  }

  // Nothing built here — is somebody standing on the tile?
  let nearest: { id: number; distance: number } | null = null;
  for (const person of state.people.values()) {
    if (person.activity === "dead" || person.inside >= 0) continue;
    const distance = Math.hypot(person.x - x, person.y - y);
    if (distance < 1.2 && (!nearest || distance < nearest.distance)) {
      nearest = { id: person.id, distance };
    }
  }
  selection = nearest ? { kind: "person", id: nearest.id } : null;
}

function placeBuilding(id: BuildingId, x: number, y: number): void {
  const check = canPlace(state, id, x, y);
  if (!check.ok) {
    notify(state, "warning", check.reason ?? "Cannot build there", { x, y });
    return;
  }

  const cost = buildingCost(state, id);
  state.lumber -= cost.lumber;
  state.treasury -= cost.gold;
  const hours = constructionHours(id);
  addBuilding(state, id, x, y, hours <= 0 ? { instant: true } : { constructionHours: hours });

  // Roads and free structures stay on the cursor so a run of them is one drag.
  if (BUILDINGS[id].lumber <= 1 && BUILDINGS[id].gold === 0) return;
  picked = null;
  hud.setPicked(null);
}

// ── The loop ────────────────────────────────────────────────────────────────

function frame(now: number): void {
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  elapsed += dt;

  const multiplier = SPEEDS[speedIndex] ?? 1;
  if (multiplier > 0 && state.status === "playing") {
    tickCarry += dt * TICKS_PER_SECOND * multiplier;
    // Cap the catch-up so a backgrounded tab does not freeze on return.
    const steps = Math.min(240, Math.floor(tickCarry));
    tickCarry -= steps;
    for (let i = 0; i < steps; i++) tick(state, 1);
  }

  const ghostValid = hover ? hud.showPlacement(state, picked, hover.x, hover.y) : false;

  render(ctx, state, camera, atlas, {
    overlay,
    time: elapsed,
    selected: selection?.kind === "building" ? selection.id : undefined,
    hovered: hover ?? undefined,
    ghost: picked && hover ? { def: picked, x: hover.x, y: hover.y, valid: ghostValid } : undefined,
  });

  if (state.status === "won" && state.medal && state.scenario) {
    recordMedal(state.scenario.id, state.medal);
  }

  hud.update(state, selection);
  fleet.update(state);
  edicts.setTarget(selection?.kind === "person" ? { kind: "person", id: selection.id } : null);
  edicts.update(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

/**
 * `?episode=1` through `?episode=16` plays that campaign episode, with its own
 * start date, starting resources and objectives. Without it you get free play.
 */
function startingGame(islandSeed: number): GameState {
  const param = new URLSearchParams(window.location.search).get("episode");
  const index = param === null ? Number.NaN : Number.parseInt(param, 10);
  if (Number.isFinite(index)) {
    const scenario = CAMPAIGN[Math.max(1, Math.min(CAMPAIGN.length, index)) - 1];
    if (scenario) return startScenario(scenario, islandSeed);
  }
  return newGame({ seed: islandSeed, islandSize: 64 });
}

/** `?seed=1650` picks an island; anything else gets a random one. */
function readSeed(): number {
  const param = new URLSearchParams(window.location.search).get("seed");
  const parsed = param === null ? Number.NaN : Number.parseInt(param, 10);
  return Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 1_000_000);
}

// Exposed so the headless screenshot harness can drive a deterministic run.
declare global {
  interface Window {
    tropico?: {
      state: () => GameState;
      advance: (ticks: number) => void;
      setSpeed: (index: number) => void;
      lookAt: (x: number, y: number) => void;
      zoom: (value: number) => void;
      setOverlay: (value: Overlay) => void;
      toggleFleet: () => void;
      toggleEdicts: () => void;
      save: () => boolean;
      hasSave: () => boolean;
      objectives: () => { label: string; done: boolean; detail: string }[];
    };
  }
}

window.tropico = {
  state: () => state,
  toggleFleet: () => {
    fleet.toggle();
  },
  toggleEdicts: () => {
    edicts.toggle();
  },
  save: () => saveToSlot(state, "quick"),
  hasSave: () => loadFromSlot("quick") !== null,
  objectives: () =>
    state.scenario
      ? evaluateScenario(state, state.scenario).map(({ label, done, detail }) => ({
          label,
          done,
          detail,
        }))
      : [],
  advance: (ticks) => {
    for (let i = 0; i < ticks; i++) tick(state, 1);
  },
  setSpeed: (index) => {
    speedIndex = index;
  },
  lookAt: (x, y) => {
    camera.lookAt(x, y);
  },
  zoom: (value) => {
    camera.zoom = value;
  },
  setOverlay: (value) => {
    overlay = value;
  },
};
