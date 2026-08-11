import { idx, inBounds, type GridSize, type Point } from "./grid.ts";

/**
 * A* over the tile grid.
 *
 * Movement is eight-directional. Diagonals cost √2 and are forbidden when they
 * would cut the corner of an impassable tile, so nobody walks through the
 * corner of a warehouse.
 *
 * Per-tile costs let roads be cheap: a captive hauling corn will detour onto a
 * road rather than trudge across the jungle, which is what makes road layout a
 * real decision instead of decoration.
 */

const DIAGONAL = Math.SQRT2;

/** Neighbour offsets: four orthogonals first, then four diagonals. */
const STEPS: readonly { dx: number; dy: number; cost: number }[] = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: DIAGONAL },
  { dx: -1, dy: 1, cost: DIAGONAL },
  { dx: -1, dy: -1, cost: DIAGONAL },
  { dx: 1, dy: -1, cost: DIAGONAL },
];

export interface PathRequest {
  readonly size: GridSize;
  /** Whether a walker may stand on this tile. */
  readonly passable: (x: number, y: number) => boolean;
  /** Relative cost of entering a tile; must be ≥ 1 or the heuristic stops being admissible. */
  readonly cost?: (x: number, y: number) => number;
  readonly start: Point;
  /** Search succeeds on the first tile satisfying this. */
  readonly isGoal: (x: number, y: number) => boolean;
  /**
   * Optimistic remaining distance. Must never overestimate. Omit for a
   * best-first search that still terminates but may return a longer path.
   */
  readonly heuristic?: (x: number, y: number) => number;
  /** Safety valve for pathological searches; the search gives up beyond this. */
  readonly maxNodes?: number;
}

/** Octile distance: the exact cost of an unobstructed 8-way walk at unit cost. */
export function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx > dy ? dx - dy + DIAGONAL * dy : dy - dx + DIAGONAL * dx;
}

/** A min-heap of node indices keyed by f-score, with a stable tie-break on insertion order. */
class OpenSet {
  private readonly heap: number[] = [];
  private readonly f: Float64Array;
  private readonly order: Int32Array;
  private counter = 0;

  constructor(capacity: number) {
    this.f = new Float64Array(capacity);
    this.order = new Int32Array(capacity);
  }

  get size(): number {
    return this.heap.length;
  }

  push(node: number, f: number): void {
    this.f[node] = f;
    this.order[node] = this.counter++;
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): number {
    const top = this.heap[0] ?? -1;
    const last = this.heap.pop();
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  /** Ordering: lower f first; equal f resolved by insertion order for determinism. */
  private less(a: number, b: number): boolean {
    const fa = this.f[a] ?? 0;
    const fb = this.f[b] ?? 0;
    if (fa !== fb) return fa < fb;
    return (this.order[a] ?? 0) < (this.order[b] ?? 0);
  }

  private bubbleUp(start: number): void {
    let i = start;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const a = this.heap[i];
      const b = this.heap[parent];
      if (a === undefined || b === undefined || !this.less(a, b)) break;
      this.heap[i] = b;
      this.heap[parent] = a;
      i = parent;
    }
  }

  private sinkDown(start: number): void {
    let i = start;
    const n = this.heap.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      const s = this.heap[smallest];
      const l = this.heap[left];
      const r = this.heap[right];
      if (left < n && l !== undefined && s !== undefined && this.less(l, s)) smallest = left;
      const cur = this.heap[smallest];
      if (right < n && r !== undefined && cur !== undefined && this.less(r, cur)) smallest = right;
      if (smallest === i) return;
      const a = this.heap[i];
      const b = this.heap[smallest];
      if (a === undefined || b === undefined) return;
      this.heap[i] = b;
      this.heap[smallest] = a;
      i = smallest;
    }
  }
}

/**
 * Finds a route from `start` to the nearest goal tile.
 *
 * Returns the tiles to walk through *excluding* the start, so an empty array
 * means "already there". Returns null when no route exists within the budget.
 */
export function findPath(request: PathRequest): Point[] | null {
  const { size, start, passable, isGoal } = request;
  const cost = request.cost ?? (() => 1);
  const heuristic = request.heuristic ?? (() => 0);
  const maxNodes = request.maxNodes ?? size.width * size.height;

  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  if (!inBounds(size, sx, sy)) return null;
  if (isGoal(sx, sy)) return [];

  const total = size.width * size.height;
  const g = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open = new OpenSet(total);

  const startNode = idx(size, sx, sy);
  g[startNode] = 0;
  open.push(startNode, heuristic(sx, sy));

  let expanded = 0;
  while (open.size > 0) {
    const current = open.pop();
    if (current < 0) break;
    if (closed[current] === 1) continue;
    closed[current] = 1;

    const cx = current % size.width;
    const cy = (current - cx) / size.width;

    if (isGoal(cx, cy)) return reconstruct(size, cameFrom, current);

    if (++expanded > maxNodes) break;

    for (const step of STEPS) {
      const nx = cx + step.dx;
      const ny = cy + step.dy;
      if (!inBounds(size, nx, ny)) continue;
      const node = idx(size, nx, ny);
      if (closed[node] === 1) continue;
      if (!passable(nx, ny)) continue;

      // No squeezing diagonally between two blocked tiles.
      if (step.dx !== 0 && step.dy !== 0) {
        if (!passable(cx + step.dx, cy) || !passable(cx, cy + step.dy)) continue;
      }

      const tentative = (g[current] ?? Infinity) + step.cost * Math.max(1, cost(nx, ny));
      if (tentative >= (g[node] ?? Infinity)) continue;

      g[node] = tentative;
      cameFrom[node] = current;
      open.push(node, tentative + heuristic(nx, ny));
    }
  }

  return null;
}

function reconstruct(size: GridSize, cameFrom: Int32Array, goal: number): Point[] {
  const out: Point[] = [];
  let node = goal;
  while (node >= 0) {
    const x = node % size.width;
    out.push({ x, y: (node - x) / size.width });
    const previous = cameFrom[node];
    if (previous === undefined || previous < 0) break;
    node = previous;
  }
  out.pop(); // drop the start tile
  out.reverse();
  return out;
}

/** The common case: a route to one specific tile. */
export function findPathTo(
  size: GridSize,
  passable: (x: number, y: number) => boolean,
  start: Point,
  goal: Point,
  cost?: (x: number, y: number) => number,
): Point[] | null {
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);
  return findPath({
    size,
    passable,
    ...(cost ? { cost } : {}),
    start,
    isGoal: (x, y) => x === gx && y === gy,
    heuristic: (x, y) => octile(x, y, gx, gy),
  });
}

/**
 * Breadth-first flood from a set of sources, returning step counts per tile and
 * -1 where unreachable. Used for reachability checks such as "is this building
 * connected to the road network".
 */
export function floodFill(
  size: GridSize,
  passable: (x: number, y: number) => boolean,
  sources: readonly Point[],
  maxDistance = Infinity,
): Int32Array {
  const distance = new Int32Array(size.width * size.height).fill(-1);
  const queue: number[] = [];
  for (const source of sources) {
    const x = Math.floor(source.x);
    const y = Math.floor(source.y);
    if (!inBounds(size, x, y) || !passable(x, y)) continue;
    const node = idx(size, x, y);
    if (distance[node] !== -1) continue;
    distance[node] = 0;
    queue.push(node);
  }

  // The queue grows while we walk it — that is the breadth-first sweep, not a
  // bug. Array iteration re-checks length each step, so appended tiles are visited.
  for (const current of queue) {
    const d = distance[current] ?? 0;
    if (d >= maxDistance) continue;
    const cx = current % size.width;
    const cy = (current - cx) / size.width;
    for (const step of STEPS) {
      const nx = cx + step.dx;
      const ny = cy + step.dy;
      if (!inBounds(size, nx, ny)) continue;
      const node = idx(size, nx, ny);
      if (distance[node] !== -1) continue;
      if (!passable(nx, ny)) continue;
      if (step.dx !== 0 && step.dy !== 0) {
        if (!passable(cx + step.dx, cy) || !passable(cx, cy + step.dy)) continue;
      }
      distance[node] = d + 1;
      queue.push(node);
    }
  }

  return distance;
}
