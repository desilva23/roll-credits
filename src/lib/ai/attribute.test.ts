import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AgentInput, judgePackages } from "./attribute";

const cache = vi.hoisted(() => ({ through: true }));

// The real cache needs Next's runtime. Here it calls straight through, or,
// when a test asks, fails the way a broken cache would.
vi.mock("next/cache", () => ({
  unstable_cache:
    <T>(fn: () => Promise<T>) =>
    () => {
      if (!cache.through) throw new Error("cache down");
      return fn();
    },
}));

const fetchMock = vi.fn();

const input: AgentInput[] = [
  { pkg: "zod", kind: "runtime", productUses: 5, testUses: 0, description: null, evidence: [] },
];

const judgement = (pkg: string) => ({ pkg, importance: 0.8, role: "Validates data", reason: "Guards every form" });
const reply = (judgements: unknown[]) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ judgements }) } }] }), {
    status: 200,
  });
const busy = () => new Response("{}", { status: 429 });
const modelOf = (n: number): string =>
  (JSON.parse(String(fetchMock.mock.calls[n]?.[1]?.body)) as { model: string }).model;

beforeEach(() => {
  cache.through = true;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GROQ_API_KEY", "test-key");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("judgePackages", () => {
  it("uses the larger model when it answers", async () => {
    fetchMock.mockResolvedValueOnce(reply([judgement("zod")]));
    const verdict = await judgePackages(input);
    expect(verdict).toMatchObject({ outcome: "judged", model: "openai/gpt-oss-120b" });
    expect(verdict.judgements).toHaveLength(1);
  });

  it("falls back to the smaller model, on its own budget, when the larger is at its rate limit", async () => {
    fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(reply([judgement("zod")]));
    const verdict = await judgePackages(input);
    expect(verdict).toMatchObject({ outcome: "judged", model: "openai/gpt-oss-20b" });
    expect([modelOf(0), modelOf(1)]).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  });

  it("says busy, not failed, when every model is at its limit", async () => {
    fetchMock.mockResolvedValue(busy());
    expect(await judgePackages(input)).toEqual({ judgements: [], outcome: "busy", model: null });
  });

  it("says failed when a model errors rather than being busy", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValueOnce(busy());
    expect((await judgePackages(input)).outcome).toBe("failed");
  });

  it("drops judgements of packages it was not asked about", async () => {
    fetchMock.mockResolvedValueOnce(reply([judgement("zod"), judgement("left-pad")]));
    expect((await judgePackages(input)).judgements.map((j) => j.pkg)).toEqual(["zod"]);
  });

  it("treats a reply that is not the agreed shape as a failure", async () => {
    const garbage = () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 });
    fetchMock.mockResolvedValueOnce(garbage()).mockResolvedValueOnce(garbage());
    expect((await judgePackages(input)).outcome).toBe("failed");
  });

  it("treats a reply with no content as a failure", async () => {
    const empty = () => new Response(JSON.stringify({ choices: [] }), { status: 200 });
    fetchMock.mockResolvedValueOnce(empty()).mockResolvedValueOnce(empty());
    expect((await judgePackages(input)).outcome).toBe("failed");
  });

  it("survives the network failing", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect((await judgePackages(input)).outcome).toBe("failed");
  });

  it("survives the cache failing", async () => {
    cache.through = false;
    expect((await judgePackages(input)).outcome).toBe("failed");
  });

  it("needs no network at all without a key", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    expect(await judgePackages(input)).toEqual({ judgements: [], outcome: "unavailable", model: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks nothing when there is nothing to judge", async () => {
    expect((await judgePackages([])).judgements).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
