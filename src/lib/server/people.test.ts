import { beforeEach, describe, expect, it, vi } from "vitest";
import { contributors, fundingLinks } from "./github";
import { packageFacts } from "./npm";
import { resolvePeople } from "./people";

vi.mock("./npm", () => ({ packageFacts: vi.fn() }));
vi.mock("./github", () => ({ contributors: vi.fn(), fundingLinks: vi.fn() }));
vi.mock("./env", () => ({ stageSecret: () => "test-secret" }));

const REPO = { owner: "colinhacks", name: "zod" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fundingLinks).mockResolvedValue([]);
  vi.mocked(contributors).mockResolvedValue([]);
});

describe("resolvePeople", () => {
  it("finds who maintains a package, under stage names, and whether one person carries it", async () => {
    vi.mocked(packageFacts).mockResolvedValueOnce({ repo: REPO, funding: [], description: "Schemas" });
    vi.mocked(contributors).mockResolvedValueOnce([
      { login: "colinhacks", contributions: 89 },
      { login: "helper", contributions: 11 },
    ]);
    const [zod] = await resolvePeople(["zod"]);

    expect(zod).toMatchObject({ pkg: "zod", repo: "colinhacks/zod", description: "Schemas", singleMaintainer: true });
    expect(zod?.maintainers.map((m) => m.share)).toEqual([0.89, 0.11]);
    expect(JSON.stringify(zod)).not.toContain('colinhacks"'); // no login in the result, only in the repo name
    expect(zod?.maintainers[0]?.name).toMatch(/^[A-Z][a-z]+ [A-Z]\. [A-Z][a-z]+$/);
  });

  it("joins npm's funding with FUNDING.yml, without repeats", async () => {
    vi.mocked(packageFacts).mockResolvedValueOnce({
      repo: REPO,
      funding: ["https://a", "https://b"],
      description: null,
    });
    vi.mocked(fundingLinks).mockResolvedValueOnce(["https://b", "github: [c]"]);
    const [zod] = await resolvePeople(["zod"]);
    expect(zod?.funding).toEqual(["https://a", "https://b", "github: [c]"]);
    expect(zod?.alreadyFunded).toBe(true);
  });

  it("reports a package that points at no repository, keeping npm's funding", async () => {
    vi.mocked(packageFacts).mockResolvedValueOnce({ repo: null, funding: ["https://a"], description: "x" });
    const [pkg] = await resolvePeople(["server-only"]);
    expect(pkg).toMatchObject({ repo: null, maintainers: [], alreadyFunded: true, singleMaintainer: false });
    expect(contributors).not.toHaveBeenCalled();
  });

  it("does not call a shared project carried by one person", async () => {
    vi.mocked(packageFacts).mockResolvedValueOnce({ repo: REPO, funding: [], description: null });
    vi.mocked(contributors).mockResolvedValueOnce([
      { login: "a", contributions: 30 },
      { login: "b", contributions: 30 },
      { login: "c", contributions: 40 },
    ]);
    expect((await resolvePeople(["react"]))[0]?.singleMaintainer).toBe(false);
  });

  it("looks up at most twelve packages", async () => {
    vi.mocked(packageFacts).mockResolvedValue({ repo: null, funding: [], description: null });
    const names = Array.from({ length: 20 }, (_, i) => `pkg${i}`);
    expect(await resolvePeople(names)).toHaveLength(12);
    expect(packageFacts).toHaveBeenCalledTimes(12);
  });
});
