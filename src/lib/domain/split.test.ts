import { describe, expect, it } from "vitest";
import { MINIMUM_PAYOUT_CENTS, type WeightedPackage, splitBudget } from "./split";

const solo = (id: string, name = id): { id: string; name: string; shareOfPackage: number } => ({
  id,
  name,
  shareOfPackage: 1,
});

describe("splitBudget", () => {
  it("gives the whole budget to the only maintainer", () => {
    const result = splitBudget(2500, [{ pkg: "zod", weight: 1, maintainers: [solo("a")] }]);
    expect(result.allocations).toEqual([
      { id: "a", name: "a", cents: 2500, packages: ["zod"], byPackage: { zod: 2500 } },
    ]);
    expect(result.totalCents).toBe(2500);
  });

  it("divides by weight", () => {
    const result = splitBudget(1000, [
      { pkg: "heavy", weight: 3, maintainers: [solo("a")] },
      { pkg: "light", weight: 1, maintainers: [solo("b")] },
    ]);
    expect(result.allocations.map((a) => a.cents)).toEqual([750, 250]);
  });

  it("divides a package by how much of it each person wrote", () => {
    const result = splitBudget(1000, [
      {
        pkg: "zod",
        weight: 1,
        maintainers: [
          { id: "a", name: "a", shareOfPackage: 0.9 },
          { id: "b", name: "b", shareOfPackage: 0.1 },
        ],
      },
    ]);
    expect(result.allocations.map((a) => a.cents)).toEqual([900, 100]);
  });

  it("pays a person once even when they maintain several packages", () => {
    const result = splitBudget(1000, [
      { pkg: "next", weight: 1, maintainers: [solo("same")] },
      { pkg: "eslint-config-next", weight: 1, maintainers: [solo("same")] },
    ]);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.cents).toBe(1000);
    expect(result.allocations[0]?.packages).toEqual(["eslint-config-next", "next"]);
  });

  it("always pays out exactly the budget, whatever the weights", () => {
    const awkward: WeightedPackage[] = [
      { pkg: "a", weight: 1, maintainers: [solo("p1")] },
      { pkg: "b", weight: 1, maintainers: [solo("p2")] },
      { pkg: "c", weight: 1, maintainers: [solo("p3")] },
    ];
    for (const budget of [1000, 1001, 999, 10_000, 3333, 100_000]) {
      const result = splitBudget(budget, awkward);
      expect(result.totalCents).toBe(budget);
    }
  });

  it("never pays anyone a trivial amount", () => {
    const many: WeightedPackage[] = Array.from({ length: 40 }, (_, i) => ({
      pkg: `pkg${i}`,
      weight: i === 0 ? 1000 : 1,
      maintainers: [solo(`p${i}`)],
    }));
    const result = splitBudget(1000, many);
    for (const a of result.allocations) expect(a.cents).toBeGreaterThanOrEqual(MINIMUM_PAYOUT_CENTS);
    expect(result.totalCents).toBe(1000);
    expect(result.belowMinimum.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const input: WeightedPackage[] = [
      { pkg: "a", weight: 1, maintainers: [solo("p1")] },
      { pkg: "b", weight: 1, maintainers: [solo("p2")] },
      { pkg: "c", weight: 1, maintainers: [solo("p3")] },
    ];
    expect(splitBudget(1000, input)).toEqual(splitBudget(1000, input));
  });

  it("records exactly what each package earned a person, by weight rather than halving", () => {
    const result = splitBudget(1000, [
      { pkg: "big", weight: 3, maintainers: [solo("a")] },
      { pkg: "small", weight: 1, maintainers: [solo("a")] },
    ]);
    expect(result.allocations[0]?.byPackage).toEqual({ big: 750, small: 250 });
  });

  it("lists the packages that earned the money, largest first", () => {
    const result = splitBudget(1000, [
      { pkg: "small", weight: 1, maintainers: [solo("a")] },
      { pkg: "big", weight: 9, maintainers: [solo("a")] },
    ]);
    expect(result.allocations[0]?.packages).toEqual(["big", "small"]);
  });

  it.each([
    ["no packages", [] as WeightedPackage[]],
    ["a package with no maintainers", [{ pkg: "a", weight: 1, maintainers: [] }]],
    ["only zero weights", [{ pkg: "a", weight: 0, maintainers: [solo("a")] }]],
    ["a negative weight", [{ pkg: "a", weight: -5, maintainers: [solo("a")] }]],
    ["a zero share", [{ pkg: "a", weight: 1, maintainers: [{ id: "a", name: "a", shareOfPackage: 0 }] }]],
    ["an infinite weight", [{ pkg: "a", weight: Number.POSITIVE_INFINITY, maintainers: [solo("a")] }]],
  ])("pays nobody when there is %s", (_label, packages) => {
    const result = splitBudget(1000, packages);
    expect(result.allocations).toEqual([]);
    expect(result.totalCents).toBe(0);
  });

  it("pays nobody when the budget cannot clear the minimum even once", () => {
    const result = splitBudget(50, [{ pkg: "a", weight: 1, maintainers: [solo("a")] }]);
    expect(result.allocations).toEqual([]);
    expect(result.belowMinimum).toHaveLength(1);
  });

  it.each([0, -1, 10.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])("rejects a budget of %s", (budget) => {
    expect(() => splitBudget(budget, [{ pkg: "a", weight: 1, maintainers: [solo("a")] }])).toThrow(RangeError);
  });
});

describe("splitBudget invariants under random input", () => {
  // Hand-written cases cover the shapes we thought of. Money code also has to
  // survive the ones we did not, so this walks a deterministic pseudo-random
  // sweep of awkward weights, shared maintainers and odd budgets.
  it("conserves the budget, pays whole cents, and never pays anyone twice", () => {
    let seed = 12345;
    const rand = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = (n: number): number => Math.floor(rand() * n);

    for (let round = 0; round < 2000; round += 1) {
      const budget = 1 + pick(500_000);
      const packages = Array.from({ length: pick(12) }, (_, i) => ({
        pkg: `pkg${i}`,
        weight: rand() * 100,
        maintainers: Array.from({ length: 1 + pick(4) }, () => {
          const id = `p${pick(10)}`;
          return { id, name: id, shareOfPackage: rand() };
        }),
      }));

      const result = splitBudget(budget, packages);
      const paid = result.allocations.reduce((sum, a) => sum + a.cents, 0);

      expect(paid).toBe(result.totalCents);
      if (result.allocations.length > 0) expect(paid).toBe(budget);
      for (const a of result.allocations) {
        expect(Number.isSafeInteger(a.cents)).toBe(true);
        expect(a.cents).toBeGreaterThanOrEqual(MINIMUM_PAYOUT_CENTS);
        expect(Object.values(a.byPackage).reduce((sum, c) => sum + c, 0)).toBe(a.cents);
      }
      const ids = result.allocations.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
