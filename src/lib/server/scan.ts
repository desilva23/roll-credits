import "server-only";
import { type DirectDependency, directDependencies } from "@/lib/domain/dependencies";
import { type ImportSite, findImportSites } from "@/lib/domain/imports";
import { type RepoRef, repoSlug } from "@/lib/domain/repo-ref";
import { GitHubError, defaultBranch, fetchFile, listSourceFiles } from "./github";

/** What the scan found out about one package. */
export interface ScannedPackage extends DirectDependency {
  /** Where the repository's own code imports it. Empty means it is declared but unused. */
  sites: ImportSite[];
  /** Uses in shipped code. This, not the raw total, is what earns a share. */
  productUses: number;
  /** Uses in tests and their config. Real work, but not what the product runs on. */
  testUses: number;
}

export interface ScanResult {
  repo: string;
  branch: string;
  filesRead: number;
  packages: ScannedPackage[];
}

/** How many files to read at once. Enough to be quick, few enough to stay polite. */
const BATCH = 8;

/**
 * Reads a public repository and works out which of its declared dependencies
 * the code actually imports, with a file and line for each use. Nothing here
 * decides money; it only gathers the evidence later steps reason about.
 */
export async function scanRepo(ref: RepoRef): Promise<ScanResult> {
  const branch = await defaultBranch(ref);

  const manifest = await fetchFile(ref, branch, "package.json");
  if (manifest === null) throw new GitHubError("no package.json at the repository root", 404);

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifest);
  } catch {
    throw new GitHubError("package.json is not valid JSON", 422);
  }

  const declared = directDependencies(parsed);
  const wanted = new Set(declared.map((dep) => dep.name));
  const sitesByPackage = new Map<string, ImportSite[]>();

  const paths = await listSourceFiles(ref, branch);
  let filesRead = 0;

  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    const sources = await Promise.all(
      batch.map(async (path) => ({ path, text: await fetchFile(ref, branch, path) })),
    );

    for (const { path, text } of sources) {
      if (text === null) continue;
      filesRead += 1;
      for (const site of findImportSites(path, text, wanted)) {
        sitesByPackage.set(site.pkg, [...(sitesByPackage.get(site.pkg) ?? []), site]);
      }
    }
  }

  const packages = declared
    .map((dep) => {
      const sites = sitesByPackage.get(dep.name) ?? [];
      const testUses = sites.filter((site) => site.inTest).length;
      return { ...dep, sites, productUses: sites.length - testUses, testUses };
    })
    // Shipped-code use decides the order, because that is what the attribution
    // agent reads next. A package used only by the tests sorts below one the
    // product actually runs on, however often the tests mention it.
    .sort((a, b) => b.productUses - a.productUses || b.testUses - a.testUses || a.name.localeCompare(b.name));

  return { repo: repoSlug(ref), branch, filesRead, packages };
}
