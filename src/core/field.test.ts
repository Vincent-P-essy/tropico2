import { describe, expect, it } from "vitest";
import { ByteField, IdField, ScalarField } from "./field.ts";

const size = { width: 6, height: 5 };

describe("ScalarField", () => {
  it("starts at zero and stores values per tile", () => {
    const field = new ScalarField(size);
    expect(field.get(2, 2)).toBe(0);
    field.set(2, 2, 7.5);
    expect(field.get(2, 2)).toBe(7.5);
    expect(field.get(3, 2)).toBe(0);
  });

  it("honours an initial fill", () => {
    expect(new ScalarField(size, 3).get(0, 0)).toBe(3);
  });

  it("reads zero outside the grid instead of undefined", () => {
    const field = new ScalarField(size, 9);
    expect(field.get(-1, 0)).toBe(0);
    expect(field.get(0, -1)).toBe(0);
    expect(field.get(size.width, 0)).toBe(0);
    expect(field.get(0, size.height)).toBe(0);
  });

  it("ignores writes outside the grid", () => {
    const field = new ScalarField(size);
    field.set(-5, 2, 100);
    field.set(99, 99, 100);
    expect(field.max()).toBe(0);
  });

  it("accumulates with add", () => {
    const field = new ScalarField(size);
    field.add(1, 1, 5);
    field.add(1, 1, 2.5);
    expect(field.get(1, 1)).toBe(7.5);
  });

  it("reports the maximum, and zero for an empty grid", () => {
    const field = new ScalarField(size);
    expect(field.max()).toBe(0);
    field.set(0, 0, -4);
    field.set(5, 4, 12);
    expect(field.max()).toBe(12);
  });

  it("samples bilinearly between tiles", () => {
    const field = new ScalarField(size);
    field.set(0, 0, 0);
    field.set(1, 0, 10);
    expect(field.sample(0, 0)).toBeCloseTo(0);
    expect(field.sample(0.5, 0)).toBeCloseTo(5);
    expect(field.sample(1, 0)).toBeCloseTo(10);
  });

  it("samples the corner average at the centre of four tiles", () => {
    const field = new ScalarField(size);
    field.set(0, 0, 4);
    field.set(1, 0, 8);
    field.set(0, 1, 0);
    field.set(1, 1, 4);
    expect(field.sample(0.5, 0.5)).toBeCloseTo(4);
  });

  it("clones without aliasing", () => {
    const field = new ScalarField(size);
    field.set(3, 3, 1);
    const copy = field.clone();
    copy.set(3, 3, 2);
    expect(field.get(3, 3)).toBe(1);
    expect(copy.get(3, 3)).toBe(2);
  });

  it("round-trips through JSON", () => {
    const field = new ScalarField(size);
    field.set(4, 1, 2.5);
    field.set(0, 4, -1.25);
    const restored = ScalarField.fromJSON(size, JSON.parse(JSON.stringify(field)) as number[]);
    expect(restored.get(4, 1)).toBe(2.5);
    expect(restored.get(0, 4)).toBe(-1.25);
    expect(restored.get(1, 1)).toBe(0);
  });
});

describe("ByteField", () => {
  it("stores small integers and counts them", () => {
    const field = new ByteField(size);
    field.set(0, 0, 3);
    field.set(1, 0, 3);
    field.set(2, 0, 5);
    expect(field.count(3)).toBe(2);
    expect(field.count(5)).toBe(1);
    expect(field.count(0)).toBe(size.width * size.height - 3);
  });

  it("reads zero outside the grid", () => {
    expect(new ByteField(size, 4).get(-1, -1)).toBe(0);
  });

  it("round-trips through JSON", () => {
    const field = new ByteField(size, 2);
    field.set(5, 4, 7);
    const restored = ByteField.fromJSON(size, JSON.parse(JSON.stringify(field)) as number[]);
    expect(restored.get(5, 4)).toBe(7);
    expect(restored.get(0, 0)).toBe(2);
  });
});

describe("IdField", () => {
  it("starts empty as -1", () => {
    const field = new IdField(size);
    expect(field.get(0, 0)).toBe(-1);
    expect(field.get(5, 4)).toBe(-1);
  });

  it("stores ids and clears back to empty", () => {
    const field = new IdField(size);
    field.set(2, 3, 42);
    expect(field.get(2, 3)).toBe(42);
    field.clear();
    expect(field.get(2, 3)).toBe(-1);
  });

  it("reads -1 outside the grid", () => {
    const field = new IdField(size);
    field.set(0, 0, 1);
    expect(field.get(-1, 0)).toBe(-1);
    expect(field.get(6, 0)).toBe(-1);
  });

  it("round-trips through JSON", () => {
    const field = new IdField(size);
    field.set(1, 1, 17);
    const restored = IdField.fromJSON(size, JSON.parse(JSON.stringify(field)) as number[]);
    expect(restored.get(1, 1)).toBe(17);
    expect(restored.get(0, 0)).toBe(-1);
  });
});
