import { apportion } from "./apportion";

/**
 * Turns a budget into what each person is paid.
 *
 * Nothing in this file talks to a model, a network or a clock. The AI decides
 * how load-bearing a package is; this decides money, and only this. Every
 * amount is an integer number of cents, and the parts always sum to exactly
 * the budget, because a split that loses or invents a cent is a bug that pays
 * the wrong person.
 */

/** One person's claim on one package, as the resolver found them. */
export interface Claim {
  /** Stable person id. The same person across packages shares one id. */
  id: string;
  /** The generated name shown on the credits roll. */
  name: string;
  /** This person's share of that package's work, 0 to 1. */
  shareOfPackage: number;
}

/** A package, how much it matters here, and who maintains it. */
export interface WeightedPackage {
  pkg: string;
  /** How load-bearing the package is. Any non-negative scale; only ratios matter. */
  weight: number;
  maintainers: readonly Claim[];
}

/** What one person is paid, and which packages earned it. */
export interface Allocation {
  id: string;
  name: string;
  cents: number;
  /** The packages behind this amount, largest contribution first. */
  packages: string[];
  /** Exactly how many of `cents` each package earned. Always sums to `cents`. */
  byPackage: Record<string, number>;
}

export interface SplitResult {
  allocations: Allocation[];
  /** Everything that was paid out. Always equals the budget, or zero. */
  totalCents: number;
  /** People who earned something but less than the minimum, so were dropped. */
  belowMinimum: { name: string; cents: number }[];
}

/**
 * PayPal charges per payout item, and a few cents helps nobody. Anyone whose
 * share lands below this is dropped and their money re-spread over the rest,
 * so the budget still leaves in full.
 */
export const MINIMUM_PAYOUT_CENTS = 100;

/** Accumulated, pre-rounding entitlement for one person. */
interface Pot {
  id: string;
  name: string;
  exact: number;
  packages: Map<string, number>;
}

/** Shares each package's weight among its maintainers, merging people across packages. */
function pots(packages: readonly WeightedPackage[]): Map<string, Pot> {
  const byPerson = new Map<string, Pot>();

  for (const { pkg, weight, maintainers } of packages) {
    if (!Number.isFinite(weight) || weight <= 0) continue;
    for (const claim of maintainers) {
      const share = claim.shareOfPackage;
      if (!Number.isFinite(share) || share <= 0) continue;

      // One person maintaining several packages is still one person. A monorepo
      // publishes many packages from one repository, so without this merge the
      // same team would be paid once per package.
      const pot: Pot = byPerson.get(claim.id) ?? {
        id: claim.id,
        name: claim.name,
        exact: 0,
        packages: new Map<string, number>(),
      };
      const earned = weight * share;
      pot.exact += earned;
      pot.packages.set(pkg, (pot.packages.get(pkg) ?? 0) + earned);
      byPerson.set(claim.id, pot);
    }
  }

  return byPerson;
}

/** A pot with its rounded payout decided. */
interface Priced {
  pot: Pot;
  cents: number;
  /** The part of a cent that rounding threw away, used to hand back the remainder. */
  fraction: number;
}

/**
 * Largest remainder: give everyone their whole cents, then hand the few left
 * over to the largest fractions. Ties break on id so the same input always
 * produces the same payout. Amounts travel with their pot rather than in a
 * lookup table, so no later step has to cope with a missing key.
 */
function price(entitled: readonly Pot[], budgetCents: number): Priced[] {
  const total = entitled.reduce((sum, pot) => sum + pot.exact, 0);

  const priced = entitled.map((pot) => {
    const exactCents = (pot.exact / total) * budgetCents;
    const whole = Math.floor(exactCents);
    return { pot, cents: whole, fraction: exactCents - whole };
  });

  // Each person's floor loses less than one cent, so the leftover is always
  // smaller than the number of people: every spare cent has a distinct owner.
  const given = priced.reduce((sum, row) => sum + row.cents, 0);
  [...priced]
    .sort((a, b) => b.fraction - a.fraction || a.pot.id.localeCompare(b.pot.id))
    .slice(0, budgetCents - given)
    .forEach((row) => {
      row.cents += 1;
    });

  return priced;
}

/**
 * Splits a budget across the people behind the given packages.
 *
 * Anyone below the minimum is removed and the whole budget re-split over those
 * who remain, repeating until everyone left clears it. That keeps the promise
 * that the amount captured is the amount paid.
 */
export function splitBudget(budgetCents: number, packages: readonly WeightedPackage[]): SplitResult {
  if (!Number.isSafeInteger(budgetCents) || budgetCents <= 0) {
    throw new RangeError("budget must be a whole number of cents above zero");
  }

  let candidates = [...pots(packages).values()].sort((a, b) => b.exact - a.exact || a.id.localeCompare(b.id));
  const belowMinimum: { name: string; cents: number }[] = [];

  // Each pass drops the people who cannot clear the minimum and re-spreads the
  // whole budget. Dropping someone raises everyone else, so this settles.
  for (;;) {
    if (candidates.length === 0) return { allocations: [], totalCents: 0, belowMinimum };

    const priced = price(candidates, budgetCents);

    // The worst-paid person below the minimum, or nobody, which means the
    // split is settled. Dropping one at a time matters: removing everyone
    // short at once could empty the list that was about to become valid.
    const worst = priced
      .filter((row) => row.cents < MINIMUM_PAYOUT_CENTS)
      .sort((a, b) => a.cents - b.cents || a.pot.id.localeCompare(b.pot.id))
      .at(0);

    if (worst === undefined) {
      const allocations = priced.map(({ pot, cents }) => ({
        id: pot.id,
        name: pot.name,
        cents,
        packages: [...pot.packages.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p),
        // A person who maintains two packages earned more from one than the
        // other; this records which, to the cent, rather than halving it.
        byPackage: Object.fromEntries(apportion(cents, [...pot.packages.entries()])),
      }));
      return {
        allocations,
        totalCents: allocations.reduce((sum, a) => sum + a.cents, 0),
        belowMinimum,
      };
    }

    belowMinimum.push({ name: worst.pot.name, cents: worst.cents });
    candidates = candidates.filter((pot) => pot.id !== worst.pot.id);
  }
}
