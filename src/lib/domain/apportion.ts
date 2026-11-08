/**
 * Splits a whole number of cents across keys in proportion to their weights.
 *
 * Largest remainder: everyone gets their whole cents, and the few left over go
 * to the largest fractions, so the parts always sum to exactly the total. Ties
 * break on key, so the same input always gives the same answer. A key listed
 * twice is one key with the combined weight; a weight that is zero, negative or
 * not a number earns nothing.
 */
export function apportion(cents: number, weights: readonly (readonly [string, number])[]): Map<string, number> {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError("cents must be a whole number of at least 0");

  const merged = new Map<string, number>();
  for (const [key, weight] of weights) {
    if (!Number.isFinite(weight) || weight <= 0) continue;
    merged.set(key, (merged.get(key) ?? 0) + weight);
  }

  const total = [...merged.values()].reduce((sum, weight) => sum + weight, 0);
  const out = new Map<string, number>();
  if (total <= 0) return out;

  const rows = [...merged.entries()].map(([key, weight]) => {
    const exact = (weight / total) * cents;
    const whole = Math.floor(exact);
    return { key, whole, fraction: exact - whole };
  });

  // Each floor loses less than one cent, so the leftover is smaller than the
  // number of keys and every spare cent has a distinct owner.
  const given = rows.reduce((sum, row) => sum + row.whole, 0);
  const lucky = new Set(
    [...rows]
      .sort((a, b) => b.fraction - a.fraction || a.key.localeCompare(b.key))
      .slice(0, cents - given)
      .map((row) => row.key),
  );

  for (const row of rows) out.set(row.key, row.whole + (lucky.has(row.key) ? 1 : 0));
  return out;
}
