import { idx, inBounds, type GridSize } from "./grid.ts";

/**
 * A scalar value per tile, backed by one Float32Array.
 *
 * Aura strengths, terrain height, fertility and pathfinding costs are all
 * fields. Wrapping the typed array does three jobs at once: it keeps the index
 * arithmetic in one place, it makes out-of-bounds reads return a defined value
 * instead of `undefined`, and it gives the fields a serialisable shape.
 */
export class ScalarField {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;

  constructor(size: GridSize, fill = 0) {
    this.width = size.width;
    this.height = size.height;
    this.data = new Float32Array(size.width * size.height);
    if (fill !== 0) this.data.fill(fill);
  }

  /** Value at a tile; 0 outside the grid. */
  get(x: number, y: number): number {
    if (!inBounds(this, x, y)) return 0;
    return this.data[idx(this, x, y)] ?? 0;
  }

  set(x: number, y: number, value: number): void {
    if (!inBounds(this, x, y)) return;
    this.data[idx(this, x, y)] = value;
  }

  add(x: number, y: number, delta: number): void {
    if (!inBounds(this, x, y)) return;
    const i = idx(this, x, y);
    this.data[i] = (this.data[i] ?? 0) + delta;
  }

  fill(value: number): void {
    this.data.fill(value);
  }

  /** Bilinear sample at a continuous position, for smooth readings under a walking person. */
  sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const a = this.get(x0, y0);
    const b = this.get(x0 + 1, y0);
    const c = this.get(x0, y0 + 1);
    const d = this.get(x0 + 1, y0 + 1);
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }

  max(): number {
    let best = -Infinity;
    for (const value of this.data) best = Math.max(best, value);
    return best === -Infinity ? 0 : best;
  }

  clone(): ScalarField {
    const copy = new ScalarField(this);
    copy.data.set(this.data);
    return copy;
  }

  /** Compact serialisation: values rounded to 3 decimals, as a plain array. */
  toJSON(): number[] {
    return Array.from(this.data, (v) => Math.round(v * 1000) / 1000);
  }

  static fromJSON(size: GridSize, values: readonly number[]): ScalarField {
    const field = new ScalarField(size);
    field.data.set(values.slice(0, field.data.length));
    return field;
  }
}

/**
 * A small unsigned integer per tile — terrain type, ownership, flags.
 */
export class ByteField {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(size: GridSize, fill = 0) {
    this.width = size.width;
    this.height = size.height;
    this.data = new Uint8Array(size.width * size.height);
    if (fill !== 0) this.data.fill(fill);
  }

  get(x: number, y: number): number {
    if (!inBounds(this, x, y)) return 0;
    return this.data[idx(this, x, y)] ?? 0;
  }

  set(x: number, y: number, value: number): void {
    if (!inBounds(this, x, y)) return;
    this.data[idx(this, x, y)] = value;
  }

  fill(value: number): void {
    this.data.fill(value);
  }

  count(value: number): number {
    let total = 0;
    for (const entry of this.data) if (entry === value) total++;
    return total;
  }

  clone(): ByteField {
    const copy = new ByteField(this);
    copy.data.set(this.data);
    return copy;
  }

  toJSON(): number[] {
    return Array.from(this.data);
  }

  static fromJSON(size: GridSize, values: readonly number[]): ByteField {
    const field = new ByteField(size);
    field.data.set(values.slice(0, field.data.length));
    return field;
  }
}

/**
 * An entity id per tile, or -1 for none. Used for "which building occupies this
 * tile" and "which road segment is here" lookups, which happen constantly.
 */
export class IdField {
  readonly width: number;
  readonly height: number;
  readonly data: Int32Array;

  constructor(size: GridSize) {
    this.width = size.width;
    this.height = size.height;
    this.data = new Int32Array(size.width * size.height).fill(-1);
  }

  get(x: number, y: number): number {
    if (!inBounds(this, x, y)) return -1;
    return this.data[idx(this, x, y)] ?? -1;
  }

  set(x: number, y: number, value: number): void {
    if (!inBounds(this, x, y)) return;
    this.data[idx(this, x, y)] = value;
  }

  clear(value = -1): void {
    this.data.fill(value);
  }

  clone(): IdField {
    const copy = new IdField(this);
    copy.data.set(this.data);
    return copy;
  }

  toJSON(): number[] {
    return Array.from(this.data);
  }

  static fromJSON(size: GridSize, values: readonly number[]): IdField {
    const field = new IdField(size);
    field.data.set(values.slice(0, field.data.length));
    return field;
  }
}
