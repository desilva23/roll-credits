import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubError, contributors, defaultBranch, fetchFile, fundingLinks, listSourceFiles } from "./github";

const REF = { owner: "desilva23", name: "celebration-planner" };
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const text = (body: string, status = 200) => new Response(body, { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defaultBranch", () => {
  it("uses the branch the repository builds from", async () => {
    fetchMock.mockResolvedValueOnce(json({ default_branch: "trunk" }));
    expect(await defaultBranch(REF)).toBe("trunk");
  });

  it("assumes main when GitHub does not say", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await defaultBranch(REF)).toBe("main");
  });

  it.each([
    [404, "does not exist, or is not public"],
    [403, "limiting requests"],
    [429, "limiting requests"],
    [500, "could not be reached"],
  ])("explains a %i in words a person can act on", async (status, words) => {
    fetchMock.mockResolvedValueOnce(json({}, status));
    const error: unknown = await defaultBranch(REF).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).message).toContain(words);
  });
});

describe("fetchFile", () => {
  it("returns a file's text", async () => {
    fetchMock.mockResolvedValueOnce(text('{"name":"x"}'));
    expect(await fetchFile(REF, "main", "package.json")).toBe('{"name":"x"}');
  });

  it("returns null for a file that is not there", async () => {
    fetchMock.mockResolvedValueOnce(text("", 404));
    expect(await fetchFile(REF, "main", "package.json")).toBeNull();
  });

  it("fails for any other problem", async () => {
    fetchMock.mockResolvedValueOnce(text("", 502));
    await expect(fetchFile(REF, "main", "package.json")).rejects.toThrow(GitHubError);
  });
});

describe("listSourceFiles", () => {
  it("reads product code first, then everything else, then tests, and skips what is not this project's", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        tree: [
          { path: "src/app/page.test.tsx", type: "blob" },
          { path: "vitest.config.mts", type: "blob" },
          { path: "next.config.ts", type: "blob" },
          { path: "src/lib/deep/thing.ts", type: "blob" },
          { path: "src/app/page.tsx", type: "blob" },
          { path: "node_modules/zod/index.js", type: "blob" },
          { path: "dist/bundle.js", type: "blob" },
          { path: "README.md", type: "blob" },
          { path: "src", type: "tree" },
          { type: "blob" },
        ],
      }),
    );
    expect(await listSourceFiles(REF, "main")).toEqual([
      "src/app/page.tsx",
      "src/lib/deep/thing.ts",
      "next.config.ts",
      "vitest.config.mts",
      "src/app/page.test.tsx",
    ]);
  });

  it("copes with an empty tree", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await listSourceFiles(REF, "main")).toEqual([]);
  });
});

describe("contributors", () => {
  it("keeps the rows that name a person and a count", async () => {
    fetchMock.mockResolvedValueOnce(
      json([
        { login: "ada", contributions: 90 },
        { login: "bo" },
        { contributions: 5 },
        { login: "cy", contributions: 4 },
      ]),
    );
    expect(await contributors(REF)).toEqual([
      { login: "ada", contributions: 90 },
      { login: "cy", contributions: 4 },
    ]);
  });

  it("gives nobody, rather than failing the reading, when GitHub will not list them", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(await contributors(REF)).toEqual([]);
  });
});

describe("fundingLinks", () => {
  it("reads FUNDING.yml, leaving out comments and blank lines", async () => {
    fetchMock.mockResolvedValueOnce(
      text("# who to thank\ngithub: [ada]\n\nopen_collective: zod # the team\ncustom:\n  - https://x.example\n"),
    );
    expect(await fundingLinks(REF, "HEAD")).toEqual([
      "github: [ada]",
      "open_collective: zod",
      "custom:",
      "https://x.example",
    ]);
  });

  it("finds none when the project asks for nothing", async () => {
    fetchMock.mockResolvedValueOnce(text("", 404));
    expect(await fundingLinks(REF, "HEAD")).toEqual([]);
  });

  it("finds none when GitHub fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await fundingLinks(REF, "HEAD")).toEqual([]);
  });
});
