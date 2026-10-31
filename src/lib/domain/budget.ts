/**
 * Every amount in this app is an integer number of cents, decided here and
 * never by the client or the model. Section 6 of the plan calls these the
 * money invariants.
 */

export const MIN_BUDGET_CENTS = 100;
export const MAX_BUDGET_CENTS = 100_000_00;

/** Formats cents as a PayPal amount string, e.g. 1234 becomes "12.34". */
export function toAmountValue(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError("cents must be a whole number of at least 0");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** Rejects anything that is not a whole, in-range budget. */
export function parseBudgetCents(input: unknown): number {
  if (!Number.isSafeInteger(input)) throw new RangeError("budget must be a whole number of cents");
  const cents = input as number;
  if (cents < MIN_BUDGET_CENTS || cents > MAX_BUDGET_CENTS) throw new RangeError("budget is out of range");
  return cents;
}
