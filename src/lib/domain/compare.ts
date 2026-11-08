import { apportion } from "./apportion";

/** A dependency as the scan found it. */
export interface Declared {
  name: string;
  kind: "runtime" | "development";
  productUses: number;
  testUses: number;
}

/** One dependency, paid two ways. */
export interface ComparisonRow {
  pkg: string;
  /** Real import counts, not just the few evidence lines a screen shows. */
  productUses: number;
  testUses: number;
  /** Imported anywhere in the repository, tests included. */
  imported: boolean;
  /** A runtime dependency that shipped code imports: it reaches users. */
  ships: boolean;
  /** Its share if the budget were split evenly across the dependency list. */
  byListCents: number;
  /** What Roll Credits actually pays for it. */
  byCodeCents: number;
}

export interface SplitSummary {
  /** Paid to packages the code never imports at all. */
  neverImportedCents: number;
  /** Paid to anything that never reaches users: unused, test-only or build tooling. */
  neverShipsCents: number;
}

export interface Comparison {
  rows: ComparisonRow[];
  byList: SplitSummary;
  byCode: SplitSummary;
}

/** The one person carrying a package alone, paid both ways for that package. */
export interface LoneMaintainer {
  pkg: string;
  name: string;
  byListCents: number;
  byCodeCents: number;
}

/** What each package earned in total, from the per-person breakdowns. */
export function totalsByPackage(allocations: readonly { byPackage: Record<string, number> }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const allocation of allocations) {
    for (const [pkg, cents] of Object.entries(allocation.byPackage)) totals.set(pkg, (totals.get(pkg) ?? 0) + cents);
  }
  return totals;
}

function summarise(rows: readonly ComparisonRow[], pick: (row: ComparisonRow) => number): SplitSummary {
  return {
    neverImportedCents: rows.filter((row) => !row.imported).reduce((sum, row) => sum + pick(row), 0),
    neverShipsCents: rows.filter((row) => !row.ships).reduce((sum, row) => sum + pick(row), 0),
  };
}

/**
 * Sets what Roll Credits pays beside what an even split of the dependency list
 * would pay, for the same budget and the same repository.
 *
 * The even split is the honest baseline: it is what "pay your dependencies"
 * means when nothing reads the code. Both columns are computed, not described,
 * so the difference on screen is a measurement.
 */
export function compareSplits(
  budgetCents: number,
  declared: readonly Declared[],
  paidByPackage: ReadonlyMap<string, number>,
): Comparison {
  const even = apportion(
    budgetCents,
    declared.map((d) => [d.name, 1] as const),
  );

  const rows = declared
    .map((d) => ({
      pkg: d.name,
      productUses: d.productUses,
      testUses: d.testUses,
      imported: d.productUses + d.testUses > 0,
      ships: d.kind === "runtime" && d.productUses > 0,
      // Every listed package gets an even share, so the lookup always finds one;
      // the fallback only satisfies the index-safety check.
      /* v8 ignore next */
      byListCents: even.get(d.name) ?? 0,
      byCodeCents: paidByPackage.get(d.name) ?? 0,
    }))
    .sort((a, b) => b.byCodeCents - a.byCodeCents || a.pkg.localeCompare(b.pkg));

  return {
    rows,
    byList: summarise(rows, (row) => row.byListCents),
    byCode: summarise(rows, (row) => row.byCodeCents),
  };
}

/**
 * The person the argument is about: one maintainer carrying a package alone,
 * and what each approach would pay them for it.
 */
export function loneMaintainer(
  packages: readonly {
    pkg: string;
    singleMaintainer: boolean;
    maintainers: readonly { id: string; name: string; share: number }[];
  }[],
  allocations: readonly { id: string; byPackage: Record<string, number> }[],
  comparison: Comparison,
): LoneMaintainer | null {
  const candidates = packages.flatMap((p) => {
    const top = p.maintainers[0];
    if (!p.singleMaintainer || top === undefined) return [];
    const byCodeCents = allocations.find((a) => a.id === top.id)?.byPackage[p.pkg] ?? 0;
    const byListCents = Math.round((comparison.rows.find((row) => row.pkg === p.pkg)?.byListCents ?? 0) * top.share);
    return [{ pkg: p.pkg, name: top.name, byListCents, byCodeCents }];
  });

  return candidates.sort((a, b) => b.byCodeCents - a.byCodeCents || a.pkg.localeCompare(b.pkg)).at(0) ?? null;
}
