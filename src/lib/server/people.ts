import "server-only";
import { type Maintainer, toMaintainers } from "@/lib/domain/people";
import { repoSlug } from "@/lib/domain/repo-ref";
import { stageSecret } from "./env";
import { contributors, fundingLinks } from "./github";
import { packageFacts } from "./npm";

/** Who stands behind one package, and whether anyone already pays them. */
export interface PackagePeople {
  pkg: string;
  /** `owner/name` of the source repository, or null when the package hides it. */
  repo: string | null;
  description: string | null;
  maintainers: Maintainer[];
  /** Funding the project already advertises, from npm and from FUNDING.yml. */
  funding: string[];
  /** True when a funding route already exists, so money can reach them today. */
  alreadyFunded: boolean;
  /** True when one person holds most of the work: the bus-factor warning. */
  singleMaintainer: boolean;
}

/** Looking up more than this risks the function's time budget. */
const MAX_PACKAGES = 12;
const BATCH = 4;

/** One person doing this much of the commits means the project has one person. */
const DOMINANT = 0.8;

async function resolveOne(pkg: string): Promise<PackagePeople> {
  const facts = await packageFacts(pkg);
  if (facts.repo === null) {
    return {
      pkg,
      repo: null,
      description: facts.description,
      maintainers: [],
      funding: facts.funding,
      alreadyFunded: facts.funding.length > 0,
      singleMaintainer: false,
    };
  }

  // `HEAD` lets the raw host pick the default branch, saving an API call per package.
  const [people, declared] = await Promise.all([contributors(facts.repo), fundingLinks(facts.repo, "HEAD")]);
  const maintainers = toMaintainers(people, stageSecret());
  const funding = [...new Set([...facts.funding, ...declared])];

  return {
    pkg,
    repo: repoSlug(facts.repo),
    description: facts.description,
    maintainers,
    funding,
    alreadyFunded: funding.length > 0,
    singleMaintainer: maintainers.length > 0 && (maintainers[0]?.share ?? 0) >= DOMINANT,
  };
}

/**
 * Finds the people behind each package. Nothing here decides money: it gathers
 * who did the work and whether a funding route already exists, so the
 * attribution agent and the split engine can reason about both.
 */
export async function resolvePeople(packages: readonly string[]): Promise<PackagePeople[]> {
  const wanted = packages.slice(0, MAX_PACKAGES);
  const out: PackagePeople[] = [];

  for (let i = 0; i < wanted.length; i += BATCH) {
    out.push(...(await Promise.all(wanted.slice(i, i + BATCH).map(resolveOne))));
  }
  return out;
}
