import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubError } from "./github";
import { callTool } from "./mcp-tools";
import { openOrder } from "./orders";
import { type PaymentPlan, planPayments } from "./pipeline";

vi.mock("./pipeline", () => ({ planPayments: vi.fn() }));
vi.mock("./orders", () => ({ openOrder: vi.fn() }));
const plan = vi.mocked(planPayments);
const order = vi.mocked(openOrder);

const ORIGIN = "https://app.example";

/** Just enough of a real plan for the brief: two packages, one person alone. */
function aPlan(people = 9): PaymentPlan {
  const pkg = (name: string, role: string | null, path: string) => ({
    pkg: name,
    score: 1,
    reason: `Imported in shipped code.`,
    role,
    evidence: [{ pkg: name, inTest: false, path, line: 3, specifier: name, text: "import" }],
    repo: null,
    maintainers: [],
    alreadyFunded: false,
    singleMaintainer: false,
  });
  return {
    repo: "desilva23/celebration-planner",
    budgetCents: 2500,
    filesRead: 150,
    agentUsed: true,
    agentOutcome: "judged",
    packages: [pkg("zod", "Validates data.", "src/a.ts"), pkg("react", null, "src/b.tsx")],
    allocations: Array.from({ length: people }, (_, i) => ({
      id: `m${i}`,
      name: `Person ${i}`,
      cents: 100,
      packages: [],
      byPackage: {},
    })),
    totalCents: 2500,
    belowMinimum: [],
    unpayable: [],
    comparison: {
      rows: [
        {
          pkg: "react",
          productUses: 21,
          testUses: 2,
          imported: true,
          ships: true,
          byListCents: 89,
          byCodeCents: 1018,
        },
        { pkg: "zod", productUses: 5, testUses: 0, imported: true, ships: true, byListCents: 89, byCodeCents: 996 },
      ],
      byList: { neverImportedCents: 983, neverShipsCents: 2054 },
      byCode: { neverImportedCents: 0, neverShipsCents: 62 },
    },
    lone: { pkg: "zod", name: "Araminta D. Soderholm", byListCents: 79, byCodeCents: 996 },
  };
}

const textOf = (r: { content: { text: string }[] }): string => r.content.map((c) => c.text).join("\n");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("who_to_credit", () => {
  it("reports who would be paid, in the order the money goes, with evidence and the comparison", async () => {
    plan.mockResolvedValueOnce(aPlan());
    const result = await callTool("who_to_credit", { repo: "desilva23/celebration-planner" }, ORIGIN);
    const brief = textOf(result);

    expect(result.isError).toBeUndefined();
    expect(brief).toContain("150 files, 2 dependencies");
    expect(brief.indexOf("react: $10.18")).toBeLessThan(brief.indexOf("zod: $9.96"));
    expect(brief).toContain("zod: $9.96. Validates data. Imported");
    expect(brief).toContain("evidence: src/a.ts:3");
    expect(brief).toContain("$20.54 to code that never reaches users");
    expect(brief).toContain("carrying zod alone gets $9.96 here, against $0.79");
    expect(brief).toContain("call credit_maintainers");
  });

  it("says one person, not one people", async () => {
    plan.mockResolvedValueOnce(aPlan(1));
    expect(textOf(await callTool("who_to_credit", { repo: "a/b" }, ORIGIN))).toContain("paid to 1 person:");
  });

  it("asks for a repository when given none", async () => {
    expect((await callTool("who_to_credit", {}, ORIGIN)).isError).toBe(true);
    expect(plan).not.toHaveBeenCalled();
  });

  it("passes on what went wrong with the repository", async () => {
    plan.mockRejectedValueOnce(new GitHubError("That repository does not exist, or is not public.", 404));
    const result = await callTool("who_to_credit", { repo: "a/b" }, ORIGIN);
    expect(result).toMatchObject({ isError: true });
    expect(textOf(result)).toContain("does not exist");
  });

  it("does not leak an unexpected error", async () => {
    plan.mockRejectedValueOnce(new Error("socket hang up at 10.0.0.3"));
    expect(textOf(await callTool("who_to_credit", { repo: "a/b" }, ORIGIN))).toBe(
      "Roll Credits could not read that repository.",
    );
  });
});

describe("credit_maintainers", () => {
  it("opens a payment for a person to approve, returning to the address the agent used", async () => {
    plan.mockResolvedValueOnce(aPlan());
    order.mockResolvedValueOnce({ orderId: "O1", approveUrl: "https://pay.example/O1" });
    const result = await callTool(
      "credit_maintainers",
      { repo: "desilva23/celebration-planner", amount_usd: 10 },
      ORIGIN,
    );

    expect(order).toHaveBeenCalledWith(1000, { owner: "desilva23", name: "celebration-planner" }, ORIGIN);
    expect(textOf(result)).toContain("Approve $10.00 in PayPal to pay them:\nhttps://pay.example/O1");
    expect(textOf(result)).toContain("Nothing is paid until a person approves");
  });

  it.each([0, 0.5, 501, "ten"])("refuses an amount of %s, and opens nothing", async (amount) => {
    const result = await callTool("credit_maintainers", { repo: "a/b", amount_usd: amount }, ORIGIN);
    expect(result.isError).toBe(true);
    expect(order).not.toHaveBeenCalled();
  });

  it("never asks a person to pay for a repository where nobody can be paid", async () => {
    plan.mockResolvedValueOnce({ ...aPlan(), allocations: [] });
    const result = await callTool("credit_maintainers", { repo: "a/b", amount_usd: 10 }, ORIGIN);
    expect(result.isError).toBe(true);
    expect(order).not.toHaveBeenCalled();
  });

  it("says so when PayPal gives no approval link", async () => {
    plan.mockResolvedValueOnce(aPlan());
    order.mockResolvedValueOnce({ orderId: "O1", approveUrl: null });
    expect((await callTool("credit_maintainers", { repo: "a/b", amount_usd: 10 }, ORIGIN)).isError).toBe(true);
  });
});

describe("any other tool", () => {
  it("is reported, not thrown", async () => {
    expect(await callTool("delete_everything", {}, ORIGIN)).toMatchObject({ isError: true });
  });
});
