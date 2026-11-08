import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Verdict, judgePackages } from "@/lib/ai/attribute";
import { type PackagePeople, resolvePeople } from "./people";
import { planPayments } from "./pipeline";
import { type ScannedPackage, scanRepo } from "./scan";

vi.mock("./scan", () => ({ scanRepo: vi.fn() }));
vi.mock("./people", () => ({ resolvePeople: vi.fn() }));
vi.mock("@/lib/ai/attribute", () => ({ judgePackages: vi.fn() }));

const REF = { owner: "desilva23", name: "celebration-planner" };

const scanned = (name: string, productUses: number, testUses = 0): ScannedPackage => ({
  name,
  range: "^1.0.0",
  kind: "runtime",
  productUses,
  testUses,
  sites: Array.from({ length: productUses }, (_, i) => ({
    pkg: name,
    inTest: false,
    path: `src/f${i}.ts`,
    line: 1,
    specifier: name,
    text: `import x from "${name}";`,
  })),
});

const people = (pkg: string, shares: number[], repo: string | null = `o/${pkg}`): PackagePeople => ({
  pkg,
  repo,
  description: null,
  maintainers: shares.map((share, i) => ({ id: `${pkg}-${i}`, name: `${pkg} person ${i}`, commits: 10, share })),
  funding: [],
  alreadyFunded: false,
  singleMaintainer: (shares[0] ?? 0) >= 0.8,
});

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  judgements: [],
  outcome: "judged",
  model: null,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(scanRepo).mockResolvedValue({
    repo: "desilva23/celebration-planner",
    branch: "main",
    filesRead: 150,
    packages: [scanned("zod", 5), scanned("react", 5), scanned("server-only", 3), scanned("unused", 0)],
  });
  vi.mocked(resolvePeople).mockResolvedValue([
    people("zod", [0.95, 0.05]),
    people("react", [0.3, 0.3, 0.4]),
    people("server-only", [], null),
  ]);
  vi.mocked(judgePackages).mockResolvedValue(verdict());
});

describe("planPayments", () => {
  it("says what it is doing at each stage, in plain counts", async () => {
    const steps: string[] = [];
    await planPayments(REF, 2500, (m) => steps.push(m));
    expect(steps[0]).toBe("Reading desilva23/celebration-planner");
    expect(steps[1]).toBe("Read 150 files, 4 dependencies, 3 actually used");
    expect(steps).toContain("Finding who maintains 3 packages");
    expect(steps).toContain("Found 5 maintainers");
  });

  it("only looks up the people behind packages the code uses", async () => {
    await planPayments(REF, 2500);
    expect(resolvePeople).toHaveBeenCalledWith(["zod", "react", "server-only"]);
  });

  it("pays a package one person carries more than one a team shares, for the same use", async () => {
    const plan = await planPayments(REF, 2500);
    const earned = Object.fromEntries(plan.comparison.rows.map((r) => [r.pkg, r.byCodeCents]));
    expect(earned.zod).toBeGreaterThan(earned.react ?? 0);
    expect(plan.lone?.pkg).toBe("zod");
  });

  it("lets the agent's judgement move a weight, and keeps its reason", async () => {
    vi.mocked(judgePackages).mockResolvedValueOnce(
      verdict({
        judgements: [{ pkg: "react", importance: 1, role: "Renders the UI", reason: "Used everywhere" }],
        model: "openai/gpt-oss-120b",
      }),
    );
    const plan = await planPayments(REF, 2500);
    const react = plan.packages.find((p) => p.pkg === "react");
    expect(react?.role).toBe("Renders the UI");
    expect(react?.reason).toContain("Used everywhere");
    expect(plan.agentUsed).toBe(true);
  });

  it("lists a package with no repository as one nobody can be paid for, and why", async () => {
    const plan = await planPayments(REF, 2500);
    expect(plan.unpayable).toEqual([{ pkg: "server-only", reason: "The package does not point at a repository." }]);
  });

  it("pays out exactly the budget, and sets it beside a split of the whole dependency list", async () => {
    const plan = await planPayments(REF, 2500);
    expect(plan.allocations.reduce((sum, a) => sum + a.cents, 0)).toBe(2500);
    expect(plan.comparison.rows).toHaveLength(4);
    expect(plan.comparison.byList.neverImportedCents).toBe(625);
  });

  it.each([
    [
      verdict({ judgements: [{ pkg: "zod", importance: 0.5, role: "r", reason: "x" }] }),
      "The agent judged 1 package",
    ],
    [
      verdict({
        judgements: [{ pkg: "zod", importance: 0.5, role: "r", reason: "x" }],
        model: "openai/gpt-oss-20b",
      }),
      "The agent judged 1 package, on the smaller model while the larger was busy",
    ],
    [verdict({ outcome: "busy" }), "The agent is at its rate limit just now, so measurement alone decides"],
    [verdict({ outcome: "unavailable" }), "No AI key is set, so measurement alone decides"],
    [verdict({ outcome: "failed" }), "The agent could not answer, so measurement alone decides"],
  ])("tells the person how the agent did: %#", async (result, said) => {
    vi.mocked(judgePackages).mockResolvedValueOnce(result);
    const steps: string[] = [];
    const plan = await planPayments(REF, 2500, (m) => steps.push(m));
    expect(steps).toContain(said);
    expect(plan.agentOutcome).toBe(result.outcome);
  });

  it("pays nobody when nobody can be found", async () => {
    vi.mocked(resolvePeople).mockResolvedValueOnce([people("zod", [], null), people("react", [], null)]);
    const plan = await planPayments(REF, 2500);
    expect(plan.allocations).toEqual([]);
    expect(plan.totalCents).toBe(0);
  });
});
