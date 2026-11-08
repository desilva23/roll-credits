import "server-only";
import { type AgentInput, judgePackages } from "@/lib/ai/attribute";
import { factorFromImportance } from "@/lib/ai/contract";
import { type ImportSite } from "@/lib/domain/imports";
import { type Maintainer } from "@/lib/domain/people";
import { type RepoRef, repoSlug } from "@/lib/domain/repo-ref";
import { type Allocation, type WeightedPackage, splitBudget } from "@/lib/domain/split";
import { adjustForMaintainers, topEvidence, weighPackages } from "@/lib/domain/weight";
import { resolvePeople } from "./people";
import { scanRepo } from "./scan";

/** A package as the plan presents it: what it is, why it matters, who is behind it. */
export interface PlannedPackage {
  pkg: string;
  score: number;
  /** Why it is weighted this way, in language a maintainer can check. */
  reason: string;
  /** What the agent says the package does here, or null when it did not run. */
  role: string | null;
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
  /** True when the agent ran. False means the measured weighting alone decided. */
  agentUsed: boolean;
  packages: PlannedPackage[];
  allocations: Allocation[];
  totalCents: number;
  belowMinimum: { name: string; cents: number }[];
  unpayable: { pkg: string; reason: string }[];
}

/** Looking up people is the slow part, so only the packages that can earn are resolved. */
const MAX_PACKAGES = 12;

/**
 * Turns a repository and a budget into who gets paid what.
 *
 * Every step runs on the server: the browser never supplies a use count, a
 * weight or an amount. The agent argues about importance within fixed bounds;
 * `splitBudget` alone decides money, and it works unchanged when the agent
 * does not run.
 */
export async function planPayments(
  ref: RepoRef,
  budgetCents: number,
  say: (message: string) => void = () => undefined,
): Promise<PaymentPlan> {
  say(`Reading ${repoSlug(ref)}`);
  const scan = await scanRepo(ref);

  const measured = new Map(weighPackages(scan.packages).map((w) => [w.pkg, w]));
  const earning = scan.packages.filter((p) => (measured.get(p.name)?.score ?? 0) > 0).slice(0, MAX_PACKAGES);
  say(`Read ${scan.filesRead} files, ${scan.packages.length} dependencies, ${earning.length} actually used`);

  say(`Finding who maintains ${earning.length} packages`);
  const people = new Map((await resolvePeople(earning.map((p) => p.name))).map((p) => [p.pkg, p]));
  const heads = [...people.values()].reduce((n, p) => n + p.maintainers.length, 0);
  say(`Found ${heads} maintainers`);

  const agentInput: AgentInput[] = earning.map((p) => ({
    pkg: p.name,
    kind: p.kind,
    productUses: p.productUses,
    testUses: p.testUses,
    description: people.get(p.name)?.description ?? null,
    evidence: topEvidence(p.sites),
  }));
  say("Asking the agent what each package does here");
  const judged = new Map((await judgePackages(agentInput)).map((j) => [j.pkg, j]));
  say(
    judged.size > 0 ? `The agent judged ${judged.size} packages` : "No agent available; using the measured weighting",
  );

  const packages: PlannedPackage[] = earning.map((p) => {
    const base = measured.get(p.name) ?? { pkg: p.name, score: 0, reason: "" };
    const found = people.get(p.name) ?? {
      repo: null,
      maintainers: [],
      alreadyFunded: false,
      singleMaintainer: false,
    };

    // The maintainer signal first: a library one person holds up earns more per
    // use than one a staffed team maintains. Then the agent, which may scale
    // that between half and double but can set no amount itself.
    const adjusted = adjustForMaintainers(
      base,
      found.maintainers.map((m) => m.share),
    );
    const verdict = judged.get(p.name);
    const factor = verdict === undefined ? 1 : factorFromImportance(verdict.importance);

    return {
      pkg: p.name,
      score: adjusted.score * factor,
      reason: verdict === undefined ? adjusted.reason : `${adjusted.reason} ${verdict.reason}`,
      role: verdict?.role ?? null,
      evidence: topEvidence(p.sites),
      repo: found.repo,
      maintainers: found.maintainers,
      alreadyFunded: found.alreadyFunded,
      singleMaintainer: adjusted.carriedAlone,
    };
  });

  return finish({ scan, budgetCents, packages, agentUsed: judged.size > 0, say });
}

interface Finishing {
  scan: { repo: string; filesRead: number };
  budgetCents: number;
  packages: PlannedPackage[];
  agentUsed: boolean;
  say: (message: string) => void;
}

/** Works out who cannot be paid, splits the budget, and assembles the plan. */
function finish({ scan, budgetCents, packages, agentUsed, say }: Finishing): PaymentPlan {
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
  say(`Splitting the budget across ${split.allocations.length} people`);

  return {
    repo: scan.repo,
    budgetCents,
    filesRead: scan.filesRead,
    agentUsed,
    packages: [...packages].sort((a, b) => b.score - a.score || a.pkg.localeCompare(b.pkg)),
    allocations: split.allocations,
    totalCents: split.totalCents,
    belowMinimum: split.belowMinimum,
    unpayable,
  };
}
