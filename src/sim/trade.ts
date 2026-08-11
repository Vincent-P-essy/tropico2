import { BLACK_MARKET_DECAY, BLACK_MARKET_MARKUP } from "../data/balance.ts";
import { CARGO_GOODS, GOODS, type GoodId } from "../data/goods.ts";
import { NATIONS } from "../data/nations.ts";
import { addStock, stockOf, takeStock } from "./economy.ts";
import { receiveGold } from "./game.ts";
import { finishedBuildings, notify } from "./state.ts";
import { fail, OK, type CommandResult, type GameState } from "./types.ts";

/**
 * The two ways gold and goods change hands without a cruise.
 *
 * The **Smuggler's Cove** sells your surplus abroad, but only once you have
 * opened it to a nation — and that nation then knows exactly where you live,
 * which is the price of every legitimate trade this island ever makes.
 *
 * The **Black Market** buys ship supplies you have not built yet. Its prices
 * climb with every purchase and settle again if you leave it alone, so it
 * rewards buying in bulk and punishes using it as a permanent substitute for an
 * armoury.
 */

/** Skill of the traders working somewhere, which moves prices in your favour. */
function traderSkill(state: GameState, buildingId: number): number {
  const building = state.buildings.get(buildingId);
  if (!building) return 0;
  let sum = 0;
  let count = 0;
  for (const id of building.workers) {
    const worker = state.people.get(id);
    if (worker?.job?.job !== "trader") continue;
    sum += worker.skill;
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

/** What the cove would pay per unit right now. */
export function salePrice(state: GameState, good: GoodId): number {
  const cove = finishedBuildings(state, "smugglersCove")[0];
  if (!cove?.openTo) return 0;
  const base = GOODS[good].salePrice;
  if (base <= 0) return 0;
  // A skilled trader gets a better price, up to a quarter more.
  return base * (1 + Math.max(0, traderSkill(state, cove.id) - 1) * 0.05);
}

/** Everything on the island that the cove would take, and how much of it there is. */
export function sellable(state: GameState): { good: GoodId; amount: number; price: number }[] {
  const cove = finishedBuildings(state, "smugglersCove")[0];
  if (!cove?.openTo) return [];

  const out: { good: GoodId; amount: number; price: number }[] = [];
  for (const good of Object.keys(GOODS) as GoodId[]) {
    if (GOODS[good].salePrice <= 0) continue;
    let amount = 0;
    for (const building of state.buildings.values()) amount += stockOf(building, good);
    if (amount < 1) continue;
    out.push({ good, amount: Math.floor(amount), price: salePrice(state, good) });
  }
  return out;
}

/** Sells goods from anywhere on the island through the cove. */
export function sell(state: GameState, good: GoodId, amount: number): CommandResult {
  const cove = finishedBuildings(state, "smugglersCove")[0];
  if (!cove) return fail("Needs a smuggler's cove");
  if (!cove.openTo) return fail("The cove is not open to anybody yet");
  const price = salePrice(state, good);
  if (price <= 0) return fail(`Nobody abroad wants ${GOODS[good].name.toLowerCase()}`);

  let taken = 0;
  for (const building of state.buildings.values()) {
    if (taken >= amount) break;
    taken += takeStock(building, good, amount - taken);
  }
  if (taken <= 0) return fail(`No ${GOODS[good].name.toLowerCase()} to sell`);

  const gold = taken * price;
  receiveGold(state, gold);
  notify(
    state,
    "good",
    `Sold ${Math.round(taken)} ${GOODS[good].name.toLowerCase()} to ${NATIONS[cove.openTo].name} for ${Math.round(gold)} gold`,
  );
  return OK;
}

/** What the black market is asking per unit right now. */
export function buyPrice(state: GameState, good: GoodId): number {
  const base = GOODS[good].buyPrice;
  if (base <= 0) return 0;
  const market = finishedBuildings(state, "blackMarket")[0];
  const skill = market ? traderSkill(state, market.id) : 0;
  const markup = state.marketMarkup[good] ?? 0;
  // A skilled trader knocks something off; every purchase puts it back on.
  return base * (1 + markup) * (1 - Math.min(0.3, Math.max(0, skill - 1) * 0.06));
}

/**
 * Buys supplies and lands them at a dock.
 *
 * Nothing bought here appears by magic in a ship's hold: it goes to a dock like
 * anything else, and a hauler still has to load it.
 */
export function buy(state: GameState, good: GoodId, amount: number): CommandResult {
  if (!CARGO_GOODS.includes(good)) return fail("The market deals in ship supplies only");
  const market = finishedBuildings(state, "blackMarket")[0];
  if (!market) return fail("Needs a black market");
  const dock = finishedBuildings(state, "dock")[0];
  if (!dock) return fail("Needs a dock to land it at");

  const unit = buyPrice(state, good);
  const affordable = Math.min(amount, Math.floor(state.treasury / Math.max(1, unit)));
  if (affordable <= 0) return fail(`Cannot afford any at ${Math.round(unit)} gold each`);

  const landed = addStock(dock, good, affordable);
  if (landed <= 0) return fail("The dock's stores are full");

  state.treasury -= landed * unit;
  // Repeated buying moves the price against you; it settles again if you stop.
  state.marketMarkup[good] = (state.marketMarkup[good] ?? 0) + landed * BLACK_MARKET_MARKUP;
  notify(
    state,
    "info",
    `Bought ${landed} ${GOODS[good].name.toLowerCase()} for ${Math.round(landed * unit)} gold`,
  );
  return OK;
}

/** Monthly: prices drift back toward base if the market has been left alone. */
export function relaxMarket(state: GameState): void {
  const relaxed: GameState["marketMarkup"] = {};
  for (const good of Object.keys(state.marketMarkup) as GoodId[]) {
    const settled = Math.max(0, (state.marketMarkup[good] ?? 0) - BLACK_MARKET_DECAY);
    if (settled > 0) relaxed[good] = settled;
  }
  state.marketMarkup = relaxed;
}
