import { describe, expect, it } from "vitest";
import { MAX_FACTOR, MIN_FACTOR, factorFromImportance, judgementsSchema } from "./contract";

describe("factorFromImportance", () => {
  it("leaves the measured score alone at the midpoint", () => {
    expect(factorFromImportance(0.5)).toBe(1);
  });

  it("cannot push a weight outside the agreed bounds", () => {
    expect(factorFromImportance(0)).toBe(MIN_FACTOR);
    expect(factorFromImportance(1)).toBe(MAX_FACTOR);
    for (const v of [-5, 5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const f = factorFromImportance(v);
      expect(f).toBeGreaterThanOrEqual(MIN_FACTOR);
      expect(f).toBeLessThanOrEqual(MAX_FACTOR);
    }
  });

  it("rises with importance", () => {
    expect(factorFromImportance(0.8)).toBeGreaterThan(factorFromImportance(0.6));
    expect(factorFromImportance(0.3)).toBeLessThan(factorFromImportance(0.5));
  });
});

describe("judgementsSchema", () => {
  const ok = { pkg: "zod", importance: 0.8, role: "Validates every request body", reason: "Guards all API input" };

  it("accepts a well-formed judgement", () => {
    expect(judgementsSchema.safeParse({ judgements: [ok] }).success).toBe(true);
  });

  it.each([
    ["importance above one", { ...ok, importance: 1.5 }],
    ["a negative importance", { ...ok, importance: -0.1 }],
    ["importance as a string", { ...ok, importance: "high" }],
    ["an empty package name", { ...ok, pkg: "" }],
    ["a missing reason", { pkg: "zod", importance: 0.5, role: "x" }],
    ["an essay instead of a reason", { ...ok, reason: "x".repeat(400) }],
  ])("rejects %s", (_label, bad) => {
    expect(judgementsSchema.safeParse({ judgements: [bad] }).success).toBe(false);
  });

  it("refuses a flood of judgements", () => {
    const many = Array.from({ length: 21 }, () => ok);
    expect(judgementsSchema.safeParse({ judgements: many }).success).toBe(false);
  });
});
