import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { packageFacts } from "./npm";

const fetchMock = vi.fn();
const registry = (doc: unknown, status = 200) => new Response(JSON.stringify(doc), { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("packageFacts", () => {
  it("follows a repository given as a git URL", async () => {
    fetchMock.mockResolvedValueOnce(
      registry({ description: "Schemas", repository: { url: "git+https://github.com/colinhacks/zod.git" } }),
    );
    expect(await packageFacts("zod")).toEqual({
      repo: { owner: "colinhacks", name: "zod" },
      funding: [],
      description: "Schemas",
    });
  });

  it.each(["sindresorhus/got", "github:sindresorhus/got"])("understands npm's shorthand %s", async (shorthand) => {
    fetchMock.mockResolvedValueOnce(registry({ repository: shorthand }));
    expect((await packageFacts("got")).repo).toEqual({ owner: "sindresorhus", name: "got" });
  });

  it.each([
    ["a repository on another host", "https://gitlab.com/owner/name"],
    ["a malformed GitHub address", "https://github.com/"],
    ["no repository at all", undefined],
  ])("finds no GitHub repository for %s", async (_label, repository) => {
    fetchMock.mockResolvedValueOnce(registry({ repository }));
    expect((await packageFacts("x")).repo).toBeNull();
  });

  it("collects funding however npm records it, and ignores what it cannot read", async () => {
    fetchMock.mockResolvedValueOnce(
      registry({
        funding: [
          "https://github.com/sponsors/a",
          { type: "opencollective", url: "https://oc.com/b" },
          { type: "x" },
          7,
        ],
      }),
    );
    expect((await packageFacts("x")).funding).toEqual(["https://github.com/sponsors/a", "https://oc.com/b"]);
  });

  it("treats a single funding entry as a list of one", async () => {
    fetchMock.mockResolvedValueOnce(registry({ funding: { url: "https://github.com/sponsors/a" } }));
    expect((await packageFacts("x")).funding).toEqual(["https://github.com/sponsors/a"]);
  });

  it("returns nothing it cannot find, rather than failing the reading", async () => {
    fetchMock.mockResolvedValueOnce(registry({}, 404));
    expect(await packageFacts("missing")).toEqual({ repo: null, funding: [], description: null });
  });

  it("asks the registry for a scoped package by its encoded name", async () => {
    fetchMock.mockResolvedValueOnce(registry({}));
    await packageFacts("@paypal/agent-toolkit");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("%40paypal%2Fagent-toolkit/latest");
  });
});
