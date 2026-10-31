import { describe, expect, it } from "vitest";
import { type ImportSite } from "./imports";
import { type Weighable, topEvidence, weighPackages } from "./weight";

const pkg = (over: Partial<Weighable> = {}): Weighable => ({
  name: "zod",
  kind: "runtime",
  productUses: 5,
  testUses: 0,
  ...over,
});

describe("weighPackages", () => {
  it("gives an unused package nothing, and says so", () => {
    const [w] = weighPackages([pkg({ productUses: 0, testUses: 0 })]);
    expect(w?.score).toBe(0);
    expect(w?.reason).toContain("never imported");
  });

  it("ranks more-used packages above less-used ones", () => {
    const [heavy, light] = weighPackages([pkg({ name: "a", productUses: 20 }), pkg({ name: "b", productUses: 2 })]);
    expect(heavy?.score).toBeGreaterThan(light?.score ?? 0);
  });

  it("does not let a widely imported package dwarf a focused one", () => {
    const [many, few] = weighPackages([pkg({ name: "a", productUses: 40 }), pkg({ name: "b", productUses: 4 })]);
    // Ten times the imports must not mean ten times the money.
    expect((many?.score ?? 0) / (few?.score ?? 1)).toBeLessThan(3);
  });

  it("puts shipped code above the build", () => {
    const [runtime, dev] = weighPackages([
      pkg({ name: "a", kind: "runtime" }),
      pkg({ name: "b", kind: "development" }),
    ]);
    expect(runtime?.score).toBeGreaterThan(dev?.score ?? 0);
    expect(dev?.reason).toContain("the build");
  });

  it("still pays a test-only package, but less than the same use in shipped code", () => {
    const [testOnly, shipped] = weighPackages([
      pkg({ name: "a", productUses: 0, testUses: 10 }),
      pkg({ name: "b", productUses: 10 }),
    ]);
    expect(testOnly?.score).toBeGreaterThan(0);
    expect(testOnly?.score).toBeLessThan(shipped?.score ?? 0);
    expect(testOnly?.reason).toContain("only by the tests");
  });

  it("counts one use in the singular", () => {
    expect(weighPackages([pkg({ productUses: 1 })])[0]?.reason).toContain("1 place in");
    expect(weighPackages([pkg({ productUses: 0, testUses: 1 })])[0]?.reason).toContain("1 place");
  });

  it("scores nothing for an empty list", () => {
    expect(weighPackages([])).toEqual([]);
  });
});

describe("topEvidence", () => {
  const site = (path: string, line: number, inTest = false): ImportSite => ({
    pkg: "zod",
    inTest,
    path,
    line,
    specifier: "zod",
    text: `import { z } from "zod";`,
  });

  it("prefers shipped code over tests", () => {
    const picked = topEvidence([site("a.test.ts", 1, true), site("b.ts", 9)], 1);
    expect(picked[0]?.path).toBe("b.ts");
  });

  it("is stable and keeps only what was asked for", () => {
    const sites = [site("c.ts", 2), site("a.ts", 5), site("a.ts", 1)];
    expect(topEvidence(sites, 2).map((s) => `${s.path}:${s.line}`)).toEqual(["a.ts:1", "a.ts:5"]);
  });

  it("does not change the caller's array", () => {
    const sites = [site("c.ts", 2), site("a.ts", 1)];
    topEvidence(sites);
    expect(sites[0]?.path).toBe("c.ts");
  });
});
