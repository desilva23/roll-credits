import "server-only";
import { isTestPath } from "@/lib/domain/imports";
import { type RepoRef, repoSlug } from "@/lib/domain/repo-ref";

const API = "https://api.github.com";

/** Source files worth reading for import sites. */
const SOURCE_FILE = /\.(?:tsx?|jsx?|mts|cts|mjs|cjs)$/;

/** Paths that hold other people's code, builds or fixtures rather than this project's. */
const IGNORED_PATH =
  /(?:^|\/)(?:node_modules|dist|build|out|coverage|vendor|\.next|__fixtures__|__snapshots__)(?:\/|$)/;

/** Reading every file would exhaust the function's time budget on a large repo. */
const MAX_FILES = 150;

/** Where a project's own code lives. Read these before root configs. */
const SOURCE_DIR = /^(?:src|app|lib|packages|components|server)\//;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "roll-credits",
    ...(token === undefined || token === "" ? {} : { Authorization: `Bearer ${token}` }),
  };
}

async function api(path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { headers: headers(), cache: "no-store" });
  if (res.status === 404) throw new GitHubError("repository or file not found", 404);
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError("GitHub rate limit reached; set GITHUB_TOKEN", 429);
  }
  if (!res.ok) throw new GitHubError(`GitHub returned ${res.status}`, res.status);
  return res.json();
}

/** The branch the repository actually builds from. */
export async function defaultBranch(ref: RepoRef): Promise<string> {
  const repo = (await api(`/repos/${repoSlug(ref)}`)) as { default_branch?: string };
  return repo.default_branch ?? "main";
}

/** Reads one text file from the repository, or null when it is absent. */
export async function fetchFile(ref: RepoRef, branch: string, path: string): Promise<string | null> {
  const res = await fetch(`https://raw.githubusercontent.com/${repoSlug(ref)}/${branch}/${path}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new GitHubError(`could not read ${path}`, res.status);
  return res.text();
}

/**
 * Lists the repository's own source files, product code first and test code
 * last, so that when the budget runs out it is test files that were skipped.
 * Ordering by depth inside each group keeps entry points ahead of leaves.
 */
export async function listSourceFiles(ref: RepoRef, branch: string): Promise<string[]> {
  const tree = (await api(`/repos/${repoSlug(ref)}/git/trees/${branch}?recursive=1`)) as {
    tree?: { path?: string; type?: string; size?: number }[];
    truncated?: boolean;
  };

  return (tree.tree ?? [])
    .flatMap((entry) => (entry.type === "blob" && typeof entry.path === "string" ? [entry.path] : []))
    .filter((path) => SOURCE_FILE.test(path) && !IGNORED_PATH.test(path))
    .sort((a, b) => rank(a) - rank(b) || a.split("/").length - b.split("/").length || a.localeCompare(b))
    .slice(0, MAX_FILES);
}

/** Product code in a source directory first, then anything else, then tests. */
function rank(path: string): number {
  if (isTestPath(path)) return 2;
  return SOURCE_DIR.test(path) ? 0 : 1;
}
