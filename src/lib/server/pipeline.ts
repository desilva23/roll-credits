import "server-only";
import { type AgentInput, type Outcome, type Verdict, judgePackages } from "@/lib/ai/attribute";
import { factorFromImportance } from "@/lib/ai/contract";
import {
  type Comparison,
  type Declared,
  type LoneMaintainer,
  compareSplits,
  loneMaintainer,
  totalsByPackage,
} from "@/lib/domain/compare";
import { type ImportSite } from "@/lib/domain/imports";
import { type Maintainer } from "@/lib/domain/people";
import { type RepoRef, repoSlug } from "@/lib/domain/repo-ref";
import { type Allocation, type WeightedPackage, splitBudget } from "@/lib/domain/split";
import { count } from "@/lib/domain/text";
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
  /** Why the agent did or did not judge this plan, so the page can say so. */
  agentOutcome: Outcome;
  packages: PlannedPackage[];
  allocations: Allocation[];
  totalCents: number;
  belowMinimum: { name: string; cents: number }[];
  unpayable: { pkg: string; reason: string }[];
  /** The same budget split evenly across the dependency list, beside this plan. */
  comparison: Comparison;
  /** The person carrying a package alone, paid both ways. Null when nobody is. */
  lone: LoneMaintainer | null;
}

/** Looking up people is the slow part, so only the packages that can earn are resolved. */
const MAX_PACKAGES = 12;

/** What to tell the person about the agent, in words that say why when it did not run. */
function agentReport(verdict: Verdict, judged: number): string {
  if (verdict.outcome === "judged") {
    const fallback = verdict.model !== null && verdict.model !== "openai/gpt-oss-120b";
    return `The agent judged ${count(judged, "package")}${fallback ? ", on the smaller model while the larger was busy" : ""}`;
  }
  if (verdict.outcome === "busy") return "The agent is at its rate limit just now, so measurement alone decides";
  if (verdict.outcome === "unavailable") return "No AI key is set, so measurement alone decides";
  return "The agent could not answer, so measurement alone decides";
}

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
  say(
    `Read ${count(scan.filesRead, "file")}, ${count(scan.packages.length, "dependency", "dependencies")}, ` +
      `${earning.length} actually used`,
  );

  say(`Finding who maintains ${count(earning.length, "package")}`);
  const people = new Map((await resolvePeople(earning.map((p) => p.name))).map((p) => [p.pkg, p]));
  const heads = [...people.values()].reduce((n, p) => n + p.maintainers.length, 0);
  say(`Found ${count(heads, "maintainer")}`);

  const agentInput: AgentInput[] = earning.map((p) => ({
    pkg: p.name,
    kind: p.kind,
    productUses: p.productUses,
    testUses: p.testUses,
    description: people.get(p.name)?.description ?? null,
    evidence: topEvidence(p.sites),
  }));
  say("Asking the agent what each package does here");
  const verdict = await judgePackages(agentInput);
  const judged = new Map(verdict.judgements.map((j) => [j.pkg, j]));
  say(agentReport(verdict, judged.size));

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
    const opinion = judged.get(p.name);
    const factor = opinion === undefined ? 1 : factorFromImportance(opinion.importance);

    return {
      pkg: p.name,
      score: adjusted.score * factor,
      reason: opinion === undefined ? adjusted.reason : `${adjusted.reason} ${opinion.reason}`,
      role: opinion?.role ?? null,
      evidence: topEvidence(p.sites),
      repo: found.repo,
      maintainers: found.maintainers,
      alreadyFunded: found.alreadyFunded,
      singleMaintainer: adjusted.carriedAlone,
    };
  });

  return finish({ scan, budgetCents, packages, agentUsed: judged.size > 0, agentOutcome: verdict.outcome, say });
}

interface Finishing {
  scan: { repo: string; filesRead: number; packages: Declared[] };
  budgetCents: number;
  packages: PlannedPackage[];
  agentUsed: boolean;
  agentOutcome: Outcome;
  say: (message: string) => void;
}

/** Works out who cannot be paid, splits the budget, and assembles the plan. */
function finish({ scan, budgetCents, packages, agentUsed, agentOutcome, say }: Finishing): PaymentPlan {
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
  say(`Splitting the budget across ${count(split.allocations.length, "person", "people")}`);

  const comparison = compareSplits(budgetCents, scan.packages, totalsByPackage(split.allocations));

  return {
    repo: scan.repo,
    budgetCents,
    filesRead: scan.filesRead,
    agentUsed,
    agentOutcome,
    packages: [...packages].sort((a, b) => b.score - a.score || a.pkg.localeCompare(b.pkg)),
    allocations: split.allocations,
    totalCents: split.totalCents,
    belowMinimum: split.belowMinimum,
    unpayable,
    comparison,
    lone: loneMaintainer(packages, split.allocations, comparison),
  };
}
