import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as GitHubModule from "./github";
import { GitHubError, defaultBranch, fetchFile, listSourceFiles } from "./github";
import { scanRepo } from "./scan";

vi.mock("./github", async (importOriginal) => {
  const real = await importOriginal<typeof GitHubModule>();
  return { ...real, defaultBranch: vi.fn(), fetchFile: vi.fn(), listSourceFiles: vi.fn() };
});

const REF = { owner: "desilva23", name: "celebration-planner" };
const files = new Map<string, string>();

beforeEach(() => {
  vi.resetAllMocks();
  files.clear();
  vi.mocked(defaultBranch).mockResolvedValue("main");
  vi.mocked(fetchFile).mockImplementation(async (_ref, _branch, path) => files.get(path) ?? null);
  vi.mocked(listSourceFiles).mockImplementation(async () => [...files.keys()].filter((p) => p !== "package.json"));
});

describe("scanRepo", () => {
  it("counts each dependency's uses in shipped code and in tests, separately", async () => {
    files.set("package.json", JSON.stringify({ dependencies: { zod: "^4" }, devDependencies: { vitest: "^5" } }));
    files.set("src/a.ts", `import { z } from "zod";`);
    files.set("src/b.ts", `import { z } from "zod";`);
    files.set("src/a.test.ts", `import { it } from "vitest";\nimport { z } from "zod";`);

    const scan = await scanRepo(REF);
    const byName = Object.fromEntries(scan.packages.map((p) => [p.name, p]));
    expect(byName.zod).toMatchObject({ productUses: 2, testUses: 1 });
    expect(byName.vitest).toMatchObject({ productUses: 0, testUses: 1 });
    expect(scan.packages[0]?.name).toBe("zod");
    expect(scan).toMatchObject({ repo: "desilva23/celebration-planner", branch: "main", filesRead: 3 });
  });

  it("does not count a file that has gone missing", async () => {
    files.set("package.json", JSON.stringify({ dependencies: { zod: "^4" } }));
    files.set("src/a.ts", `import { z } from "zod";`);
    vi.mocked(listSourceFiles).mockResolvedValueOnce(["src/a.ts", "src/gone.ts"]);
    expect((await scanRepo(REF)).filesRead).toBe(1);
  });

  it("says plainly that only JavaScript projects can be read, when there is no package.json", async () => {
    const error: unknown = await scanRepo(REF).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).message).toContain("JavaScript and TypeScript projects");
  });

  it("says so when package.json cannot be read", async () => {
    files.set("package.json", "{ not json");
    await expect(scanRepo(REF)).rejects.toThrow("could not be read");
  });
});
