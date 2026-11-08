import { describe, expect, it } from "vitest";
import { apportion } from "./apportion";

const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);

describe("apportion", () => {
  it("splits by weight", () => {
    expect(
      Object.fromEntries(
        apportion(1000, [
          ["a", 3],
          ["b", 1],
        ]),
      ),
    ).toEqual({ a: 750, b: 250 });
  });

  it("always sums to exactly the total, however awkward the weights", () => {
    for (const cents of [0, 1, 2, 99, 100, 101, 999, 2500, 33_333]) {
      expect(
        sum(
          apportion(cents, [
            ["a", 1],
            ["b", 1],
            ["c", 1],
          ]),
        ),
      ).toBe(cents);
      expect(
        sum(
          apportion(cents, [
            ["a", 0.1],
            ["b", 0.2],
            ["c", 0.7],
          ]),
        ),
      ).toBe(cents);
    }
  });

  it("gives the spare cent to the largest fraction, and breaks ties by key", () => {
    expect(
      Object.fromEntries(
        apportion(100, [
          ["b", 1],
          ["a", 1],
          ["c", 1],
        ]),
      ),
    ).toEqual({ a: 34, b: 33, c: 33 });
  });

  it("treats a repeated key as one key with the combined weight", () => {
    expect(
      Object.fromEntries(
        apportion(100, [
          ["a", 1],
          ["a", 1],
          ["b", 2],
        ]),
      ),
    ).toEqual({ a: 50, b: 50 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("ignores a weight of %s", (bad) => {
    expect(
      Object.fromEntries(
        apportion(100, [
          ["a", 1],
          ["b", bad],
        ]),
      ),
    ).toEqual({ a: 100 });
  });

  it("gives nothing to anyone when no weight is usable", () => {
    expect(apportion(100, [["a", 0]]).size).toBe(0);
    expect(apportion(100, []).size).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])("rejects %s cents", (cents) => {
    expect(() => apportion(cents, [["a", 1]])).toThrow(RangeError);
  });
});
