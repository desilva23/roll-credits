import { count } from "@/lib/domain/text";
import { type Evidence, type Plan, type PlannedPackage, money } from "./api";

/** One declared dependency as the ledger shows it. Every amount is in cents. */
export interface LedgerRow {
  pkg: string;
  role: string;
  shipped: number;
  tests: number;
  /** The first place shipped code uses it, or a test when nothing that ships does. */
  firstUse: Evidence | null;
  /** How much of the package its top contributor wrote. Null where nobody was found, and on the total row. */
  topShare: number | null;
  /** Whether it already takes funding. Null on the total row, where it means nothing. */
  funded: boolean | null;
  byList: number;
  byCode: number;
  /** What reading the code moved, against splitting the dependency list. */
  change: number;
}

function firstUse(p: PlannedPackage | undefined): Evidence | null {
  if (p === undefined) return null;
  return p.evidence.find((e) => !e.inTest) ?? p.evidence[0] ?? null;
}

/**
 * Every declared dependency, including the ones nothing imports, so the
 * dependency-list split and this plan can be read side by side. Counts are the
 * real totals from the scan, not the few evidence lines the credits view shows.
 */
export function ledgerRows(plan: Plan): LedgerRow[] {
  const known = new Map(plan.packages.map((p) => [p.pkg, p]));
  return plan.comparison.rows.map((row) => {
    const p = known.get(row.pkg);
    return {
      pkg: row.pkg,
      role: p?.role ?? "—",
      shipped: row.productUses,
      tests: row.testUses,
      firstUse: firstUse(p),
      topShare: p?.maintainers[0]?.share ?? null,
      funded: p?.alreadyFunded ?? false,
      byList: row.byListCents,
      byCode: row.byCodeCents,
      change: row.byCodeCents - row.byListCents,
    };
  });
}

/**
 * The pinned last row. Both ways of splitting are summed, so anyone can see
 * they come to the same budget and that the changes come to nothing: reading
 * the code moves the money, it does not make more of it.
 */
export function ledgerTotal(rows: readonly LedgerRow[]): LedgerRow {
  const sum = (pick: (row: LedgerRow) => number): number => rows.reduce((total, row) => total + pick(row), 0);
  return {
    pkg: `All ${count(rows.length, "dependency", "dependencies")}`,
    role: "",
    shipped: sum((r) => r.shipped),
    tests: sum((r) => r.tests),
    firstUse: null,
    topShare: null,
    funded: null,
    byList: sum((r) => r.byList),
    byCode: sum((r) => r.byCode),
    change: sum((r) => r.change),
  };
}

/** The largest move in either direction, so the change bars share one scale. */
export function widestChange(rows: readonly LedgerRow[]): number {
  return Math.max(0, ...rows.map((r) => Math.abs(r.change)));
}

/** A change written the way a ledger writes it: +$8.17, −$0.79, $0.00. */
export function signedMoney(cents: number): string {
  if (cents === 0) return money(0);
  return `${cents > 0 ? "+" : "−"}${money(Math.abs(cents))}`;
}

function isEvidence(value: unknown): value is Evidence {
  return typeof value === "object" && value !== null && "path" in value && "line" in value;
}

const dollars = (value: unknown): string => (typeof value === "number" ? (value / 100).toFixed(2) : "");

const FOR_CSV: Partial<Record<string, (value: unknown) => string>> = {
  byList: dollars,
  byCode: dollars,
  change: dollars,
  topShare: (value) => (typeof value === "number" ? `${Math.round(value * 100)}%` : ""),
  funded: (value) => (typeof value === "boolean" ? (value ? "yes" : "no") : ""),
  firstUse: (value) => (isEvidence(value) ? `${value.path}:${value.line}` : ""),
};

/**
 * One cell as a spreadsheet should read it: amounts as plain dollars without a
 * symbol, so they add up in a formula, and empty where the ledger shows nothing.
 */
export function csvValue(field: string, value: unknown): string {
  const format = FOR_CSV[field];
  if (format !== undefined) return format(value);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
