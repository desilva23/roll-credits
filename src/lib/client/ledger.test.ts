import { describe, expect, it } from "vitest";
import type { ComparisonRow, Plan, PlannedPackage } from "./api";
import { csvValue, ledgerRows, ledgerTotal, signedMoney, widestChange } from "./ledger";

const used = (pkg: string, over: Partial<PlannedPackage> = {}): PlannedPackage => ({
  pkg,
  score: 1,
  reason: "Used to validate requests",
  role: "Validates input",
  evidence: [],
  repo: `o/${pkg}`,
  maintainers: [{ id: "m_1", name: "Philippa R. Nakagawa", commits: 89, share: 0.89 }],
  alreadyFunded: false,
  singleMaintainer: true,
  ...over,
});

const row = (pkg: string, byListCents: number, byCodeCents: number, uses = 0): ComparisonRow => ({
  pkg,
  productUses: uses,
  testUses: 1,
  imported: uses > 0,
  ships: uses > 0,
  byListCents,
  byCodeCents,
});

function planOf(packages: PlannedPackage[], rows: ComparisonRow[]): Plan {
  return {
    repo: "desilva23/celebration-planner",
    budgetCents: 2500,
    filesRead: 150,
    agentUsed: true,
    agentOutcome: "judged",
    packages,
    allocations: [],
    totalCents: 2500,
    belowMinimum: [],
    unpayable: [],
    comparison: {
      rows,
      byList: { neverImportedCents: 0, neverShipsCents: 0 },
      byCode: { neverImportedCents: 0, neverShipsCents: 0 },
    },
    lone: null,
  };
}

describe("ledgerRows", () => {
  const zod = used("zod", {
    evidence: [
      { path: "src/a.test.ts", line: 1, text: 'import { z } from "zod";', inTest: true },
      { path: "src/lib/zod.ts", line: 3, text: 'import { z } from "zod";', inTest: false },
    ],
  });
  const plan = planOf([zod], [row("zod", 79, 996, 5), row("vitest", 89, 0)]);

  it("lists every declared dependency, used or not, with what each split pays it", () => {
    const [first, second] = ledgerRows(plan);
    expect(first).toMatchObject({ pkg: "zod", role: "Validates input", topShare: 0.89, funded: false });
    expect(first).toMatchObject({ byList: 79, byCode: 996, change: 917 });
    expect(second).toMatchObject({ pkg: "vitest", role: "—", topShare: null, funded: false, firstUse: null });
    expect(second?.change).toBe(-89);
  });

  it("points at shipped code first, and at a test only when nothing that ships uses it", () => {
    expect(ledgerRows(plan)[0]?.firstUse?.path).toBe("src/lib/zod.ts");
    const testOnly = used("vitest", { evidence: [{ path: "t.test.ts", line: 2, text: "x", inTest: true }] });
    expect(ledgerRows(planOf([testOnly], [row("vitest", 89, 0)]))[0]?.firstUse?.path).toBe("t.test.ts");
    expect(ledgerRows(planOf([used("left-pad")], [row("left-pad", 10, 10)]))[0]?.firstUse).toBeNull();
  });
});

describe("ledgerTotal", () => {
  it("adds both splits to the same budget, so the changes add up to nothing", () => {
    const rows = ledgerRows(planOf([], [row("a", 1250, 2000, 3), row("b", 1250, 500, 1)]));
    expect(ledgerTotal(rows)).toMatchObject({ pkg: "All 2 dependencies", byList: 2500, byCode: 2500, change: 0 });
    expect(ledgerTotal(rows)).toMatchObject({ shipped: 4, tests: 2 });
  });

  it("leaves blank what cannot honestly be added up", () => {
    const total = ledgerTotal(ledgerRows(planOf([used("zod")], [row("zod", 2500, 2500, 1)])));
    expect(total).toMatchObject({ pkg: "All 1 dependency", topShare: null, funded: null, firstUse: null });
  });
});

describe("widestChange", () => {
  it("is the largest move in either direction", () => {
    expect(widestChange(ledgerRows(planOf([], [row("a", 100, 1000), row("b", 1200, 0)])))).toBe(1200);
  });

  it("is zero when there is nothing to compare", () => {
    expect(widestChange([])).toBe(0);
  });
});

describe("signedMoney", () => {
  it.each([
    [917, "+$9.17"],
    [-79, "−$0.79"],
    [0, "$0.00"],
  ])("writes %i cents as %s", (cents, written) => {
    expect(signedMoney(cents)).toBe(written);
  });
});

describe("csvValue", () => {
  it("writes amounts as plain dollars a spreadsheet can add", () => {
    expect(csvValue("byCode", 996)).toBe("9.96");
    expect(csvValue("change", -89)).toBe("-0.89");
    expect(csvValue("byList", null)).toBe("");
  });

  it("writes shares, funding and evidence the way the screen does", () => {
    expect(csvValue("topShare", 0.894)).toBe("89%");
    expect(csvValue("topShare", null)).toBe("");
    expect(csvValue("funded", true)).toBe("yes");
    expect(csvValue("funded", false)).toBe("no");
    expect(csvValue("funded", null)).toBe("");
    expect(csvValue("firstUse", { path: "src/lib/zod.ts", line: 3, text: "", inTest: false })).toBe(
      "src/lib/zod.ts:3",
    );
    expect(csvValue("firstUse", null)).toBe("");
  });

  it("passes text and counts through, and anything else as empty", () => {
    expect(csvValue("pkg", "zod")).toBe("zod");
    expect(csvValue("shipped", 5)).toBe("5");
    expect(csvValue("pkg", undefined)).toBe("");
  });
});
