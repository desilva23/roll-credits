import "server-only";
import { type Maintainer } from "@/lib/domain/people";
import { type RepoRef } from "@/lib/domain/repo-ref";
import { type Allocation, type WeightedPackage, splitBudget } from "@/lib/domain/split";
import { type ImportSite } from "@/lib/domain/imports";
import { topEvidence, weighPackages } from "@/lib/domain/weight";
import { resolvePeople } from "./people";
import { scanRepo } from "./scan";

/** A package as the plan presents it: what it is, why it matters, who is behind it. */
export interface PlannedPackage {
  pkg: string;
  score: number;
  reason: string;
  evidence: ImportSite[];
  repo: string | null;
  maintainers: Maintainer[];
  alreadyFunded: boolean;
  singleMaintainer: boolean;
}

export interface PaymentPlan {
  repo: string;
  budgetCents: number;
  filesRead: number;
  packages: PlannedPackage[];
  allocations: Allocation[];
  totalCents: number;
  /** Earned something, but too little to be worth a payout. */
  belowMinimum: { name: string; cents: number }[];
  /** Packages that matter but have nobody to pay, with the reason. */
  unpayable: { pkg: string; reason: string }[];
}

/** Looking up people is the slow part, so only the packages that can earn are resolved. */
const MAX_PACKAGES = 12;

/**
 * Turns a repository and a budget into who gets paid what.
 *
 * Every step runs on the server: the browser never supplies a use count, a
 * weight or an amount. The weighting here is the deterministic one, which the
 * attribution agent will refine without being allowed to decide any amount.
 */
export async function planPayments(ref: RepoRef, budgetCents: number): Promise<PaymentPlan> {
  const scan = await scanRepo(ref);

  const weights = new Map(weighPackages(scan.packages).map((w) => [w.pkg, w]));
  const earning = scan.packages.filter((p) => (weights.get(p.name)?.score ?? 0) > 0).slice(0, MAX_PACKAGES);

  const people = new Map((await resolvePeople(earning.map((p) => p.name))).map((p) => [p.pkg, p]));

  const packages: PlannedPackage[] = earning.map((p) => {
    const weight = weights.get(p.name) ?? { score: 0, reason: "" };
    const found = people.get(p.name) ?? {
      repo: null,
      maintainers: [],
      alreadyFunded: false,
      singleMaintainer: false,
    };
    return {
      pkg: p.name,
      score: weight.score,
      reason: weight.reason,
      evidence: topEvidence(p.sites),
      repo: found.repo,
      maintainers: found.maintainers,
      alreadyFunded: found.alreadyFunded,
      singleMaintainer: found.singleMaintainer,
    };
  });

  const unpayable = packages
    .filter((p) => p.maintainers.length === 0)
    .map((p) => ({
      pkg: p.pkg,
      reason: p.repo === null ? "The package does not point at a repository." : "No human contributors were found.",
    }));

  const weighted: WeightedPackage[] = packages
    .filter((p) => p.maintainers.length > 0)
    .map((p) => ({
      pkg: p.pkg,
      weight: p.score,
      maintainers: p.maintainers.map((m) => ({ id: m.id, name: m.name, shareOfPackage: m.share })),
    }));

  const split =
    weighted.length > 0 ? splitBudget(budgetCents, weighted) : { allocations: [], totalCents: 0, belowMinimum: [] };

  return {
    repo: scan.repo,
    budgetCents,
    filesRead: scan.filesRead,
    packages,
    allocations: split.allocations,
    totalCents: split.totalCents,
    belowMinimum: split.belowMinimum,
    unpayable,
  };
}
