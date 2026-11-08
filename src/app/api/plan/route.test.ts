import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubError } from "@/lib/server/github";
import { type PaymentPlan, planPayments } from "@/lib/server/pipeline";
import { POST } from "./route";

vi.mock("@/lib/server/pipeline", () => ({ planPayments: vi.fn() }));

/** Posts a reading and collects the streamed lines as they would arrive. */
async function read(body: unknown): Promise<{ status: number; lines: Record<string, unknown>[] }> {
  const res = await POST(new Request("https://app.example/api/plan", { method: "POST", body: JSON.stringify(body) }));
  const text = await res.text();
  return {
    status: res.status,
    lines: text
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("reading a repository", () => {
  it("streams each step as it happens, then the plan", async () => {
    vi.mocked(planPayments).mockImplementationOnce(async (_ref, _budget, say) => {
      say?.("Reading a/b");
      say?.("Found 3 maintainers");
      return { repo: "a/b" } as PaymentPlan;
    });
    const { status, lines } = await read({ repo: "a/b", budgetCents: 2500 });
    expect(status).toBe(200);
    expect(lines).toEqual([{ step: "Reading a/b" }, { step: "Found 3 maintainers" }, { plan: { repo: "a/b" } }]);
  });

  it("refuses a request without a repository and a budget", async () => {
    const { status, lines } = await read({ repo: "a/b" });
    expect(status).toBe(400);
    expect(lines[0]?.error).toBeDefined();
  });

  it.each([
    ["something that is not owner/name", { repo: "not a repo", budgetCents: 2500 }, "as owner/name"],
    ["a name GitHub would not allow", { repo: "bad!/name", budgetCents: 2500 }, "not a GitHub repository name"],
    ["a budget out of range", { repo: "a/b", budgetCents: 0 }, "out of range"],
  ])("explains %s on the stream", async (_label, body, words) => {
    const { lines } = await read(body);
    expect(String(lines.at(-1)?.error)).toContain(words);
    expect(planPayments).not.toHaveBeenCalled();
  });

  it("passes on GitHub's explanation", async () => {
    vi.mocked(planPayments).mockRejectedValueOnce(
      new GitHubError("That repository does not exist, or is not public.", 404),
    );
    const { lines } = await read({ repo: "a/b", budgetCents: 2500 });
    expect(lines.at(-1)?.error).toBe("That repository does not exist, or is not public.");
  });

  it("does not leak an unexpected error", async () => {
    vi.mocked(planPayments).mockRejectedValueOnce(new Error("ECONNRESET 10.0.0.3"));
    const { lines } = await read({ repo: "a/b", budgetCents: 2500 });
    expect(lines.at(-1)?.error).toBe("Could not build a plan for that repository.");
  });
});
