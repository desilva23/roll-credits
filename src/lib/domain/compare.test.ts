import { describe, expect, it } from "vitest";
import { type Declared, compareSplits, loneMaintainer, totalsByPackage } from "./compare";

const dep = (name: string, over: Partial<Declared> = {}): Declared => ({
  name,
  kind: "runtime",
  productUses: 1,
  testUses: 0,
  ...over,
});

describe("totalsByPackage", () => {
  it("adds up what every person earned from each package", () => {
    const totals = totalsByPackage([{ byPackage: { zod: 300, next: 100 } }, { byPackage: { next: 50 } }]);
    expect(Object.fromEntries(totals)).toEqual({ zod: 300, next: 150 });
  });
});

describe("compareSplits", () => {
  const declared = [
    dep("zod"),
    dep("vitest", { kind: "development", productUses: 0, testUses: 64 }),
    dep("knip", { kind: "development", productUses: 0, testUses: 0 }),
    dep("eslint", { kind: "development", productUses: 1 }),
  ];
  const paid = new Map([
    ["zod", 900],
    ["vitest", 100],
  ]);

  it("splits the dependency list evenly, to the cent", () => {
    const c = compareSplits(1000, declared, paid);
    expect(c.rows.map((r) => r.byListCents).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(new Set(c.rows.map((r) => r.byListCents))).toEqual(new Set([250]));
  });

  it("knows what ships, what is only tested, and what is never imported", () => {
    const rows = Object.fromEntries(compareSplits(1000, declared, paid).rows.map((r) => [r.pkg, r]));
    expect(rows.zod).toMatchObject({ ships: true, imported: true });
    expect(rows.vitest).toMatchObject({ ships: false, imported: true });
    expect(rows.knip).toMatchObject({ ships: false, imported: false });
    expect(rows.eslint).toMatchObject({ ships: false, imported: true });
  });

  it("measures how much each approach spends on code that never reaches users", () => {
    const c = compareSplits(1000, declared, paid);
    expect(c.byList).toEqual({ neverImportedCents: 250, neverShipsCents: 750 });
    expect(c.byCode).toEqual({ neverImportedCents: 0, neverShipsCents: 100 });
  });

  it("orders rows by what Roll Credits pays", () => {
    expect(compareSplits(1000, declared, paid).rows.map((r) => r.pkg)).toEqual(["zod", "vitest", "eslint", "knip"]);
  });

  it("copes with an empty dependency list", () => {
    expect(compareSplits(1000, [], new Map())).toEqual({
      rows: [],
      byList: { neverImportedCents: 0, neverShipsCents: 0 },
      byCode: { neverImportedCents: 0, neverShipsCents: 0 },
    });
  });
});

describe("loneMaintainer", () => {
  const comparison = compareSplits(
    1000,
    [dep("zod"), dep("react")],
    new Map([
      ["zod", 600],
      ["react", 400],
    ]),
  );
  const alone = { pkg: "zod", singleMaintainer: true, maintainers: [{ id: "m1", name: "Ada", share: 0.9 }] };
  const team = { pkg: "react", singleMaintainer: false, maintainers: [{ id: "m2", name: "Team", share: 0.3 }] };

  it("finds the person carrying a package alone, paid both ways", () => {
    const found = loneMaintainer([alone, team], [{ id: "m1", byPackage: { zod: 600 } }], comparison);
    expect(found).toEqual({ pkg: "zod", name: "Ada", byListCents: 450, byCodeCents: 600 });
  });

  it("picks whoever Roll Credits pays most when several are alone", () => {
    const other = { pkg: "react", singleMaintainer: true, maintainers: [{ id: "m3", name: "Bo", share: 0.95 }] };
    const allocations = [
      { id: "m1", byPackage: { zod: 100 } },
      { id: "m3", byPackage: { react: 300 } },
    ];
    expect(loneMaintainer([alone, other], allocations, comparison)?.name).toBe("Bo");
  });

  it("breaks a tie on package name, so the same input always picks the same person", () => {
    const other = { pkg: "react", singleMaintainer: true, maintainers: [{ id: "m3", name: "Bo", share: 0.95 }] };
    const allocations = [
      { id: "m1", byPackage: { zod: 200 } },
      { id: "m3", byPackage: { react: 200 } },
    ];
    expect(loneMaintainer([alone, other], allocations, comparison)?.pkg).toBe("react");
  });

  it("returns nobody when every project is shared", () => {
    expect(loneMaintainer([team], [], comparison)).toBeNull();
  });

  it("ignores a lone project with no maintainer listed", () => {
    expect(loneMaintainer([{ pkg: "zod", singleMaintainer: true, maintainers: [] }], [], comparison)).toBeNull();
  });

  it("counts a lone maintainer Roll Credits could not pay as zero, not missing", () => {
    const found = loneMaintainer([alone], [], comparison);
    expect(found?.byCodeCents).toBe(0);
  });

  it("counts a package missing from the comparison as earning nothing by list", () => {
    const stray = { pkg: "left-pad", singleMaintainer: true, maintainers: [{ id: "m9", name: "Cy", share: 1 }] };
    expect(loneMaintainer([stray], [{ id: "m9", byPackage: { "left-pad": 200 } }], comparison)).toEqual({
      pkg: "left-pad",
      name: "Cy",
      byListCents: 0,
      byCodeCents: 200,
    });
  });
});
