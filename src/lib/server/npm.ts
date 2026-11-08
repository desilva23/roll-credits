import "server-only";
import { type RepoRef, parseRepoRef } from "@/lib/domain/repo-ref";

const REGISTRY = "https://registry.npmjs.org";

/** What the registry knows about a package that matters to attribution. */
export interface PackageFacts {
  /** The GitHub repository, when the package points at one. */
  repo: RepoRef | null;
  /** Funding links the package already declares, as npm reports them. */
  funding: string[];
  description: string | null;
}

interface RegistryDoc {
  description?: string;
  repository?: { url?: string } | string;
  funding?: unknown;
}

/** npm records funding as a string, an object, or a list of either. */
function fundingUrls(funding: unknown): string[] {
  const entries = Array.isArray(funding) ? funding : [funding];
  return entries.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (typeof entry === "object" && entry !== null) {
      const { url } = entry as { url?: unknown };
      if (typeof url === "string") return [url];
    }
    return [];
  });
}

/**
 * Reads a package's registry entry. Only the latest metadata is requested, so
 * the response stays small even for a package with thousands of versions.
 */
export async function packageFacts(name: string): Promise<PackageFacts> {
  const res = await fetch(`${REGISTRY}/${encodeURIComponent(name)}/latest`, {
    headers: { Accept: "application/json", "User-Agent": "roll-credits" },
    // Registry metadata is public and slow-moving; see github.ts for why.
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { repo: null, funding: [], description: null };

  const doc = (await res.json()) as RegistryDoc;
  const rawRepo = typeof doc.repository === "string" ? doc.repository : doc.repository?.url;
  return { repo: githubRepo(rawRepo), funding: fundingUrls(doc.funding), description: doc.description ?? null };
}

/** npm's shorthand for a GitHub repository: `owner/name`, or `github:owner/name`. */
const SHORTHAND = /^(?:github:)?[\w.-]+\/[\w.-]+$/;

/**
 * The GitHub repository a package points at, or null for anywhere else.
 * Besides full URLs, npm accepts `owner/name` as shorthand for GitHub; a
 * package published that way would otherwise look as if nobody maintains it.
 */
function githubRepo(raw: string | undefined): RepoRef | null {
  if (raw === undefined) return null;
  const candidate = raw.includes("github.com") ? raw : SHORTHAND.test(raw) ? raw.replace(/^github:/, "") : null;
  if (candidate === null) return null;
  try {
    return parseRepoRef(candidate);
  } catch {
    return null;
  }
}
