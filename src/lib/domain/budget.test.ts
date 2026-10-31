import { describe, expect, it } from "vitest";
import { MAX_BUDGET_CENTS, MIN_BUDGET_CENTS, parseBudgetCents, toAmountValue } from "./budget";

describe("toAmountValue", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [1234, "12.34"],
    [100_000, "1000.00"],
  ])("formats %i cents as %s", (cents, expected) => {
    expect(toAmountValue(cents)).toBe(expected);
  });

  it.each([-1, 1.5, Number.NaN])("rejects %s", (cents) => {
    expect(() => toAmountValue(cents)).toThrow(RangeError);
  });
});

describe("parseBudgetCents", () => {
  it("accepts the range ends", () => {
    expect(parseBudgetCents(MIN_BUDGET_CENTS)).toBe(MIN_BUDGET_CENTS);
    expect(parseBudgetCents(MAX_BUDGET_CENTS)).toBe(MAX_BUDGET_CENTS);
  });

  it.each([MIN_BUDGET_CENTS - 1, MAX_BUDGET_CENTS + 1, 10.5, "500", null])("rejects %s", (input) => {
    expect(() => parseBudgetCents(input)).toThrow(RangeError);
  });
});
