import { type ImportSite } from "./imports";

/** What the scan knows about a package, as the weighting needs it. */
export interface Weighable {
  name: string;
  kind: "runtime" | "development";
  productUses: number;
  testUses: number;
}

/** How load-bearing a package is, and why. */
export interface Weight {
  pkg: string;
  /** Any non-negative scale; only ratios matter to the split. */
  score: number;
  /** One sentence a maintainer or judge can check against the evidence. */
  reason: string;
}

/**
 * Uses are counted on a log scale. A package imported in twenty files is more
 * load-bearing than one imported in five, but not four times as much: past a
 * point, extra import sites say more about how the code is organised than
 * about how much the project depends on the package.
 */
function fromUses(uses: number): number {
  return Math.log1p(uses);
}

/** Test-only packages still earn, because the tests are real work, but less. */
const TEST_ONLY_FACTOR = 0.25;

/** A development dependency that ships nothing to users earns less than one that does. */
const DEV_FACTOR = 0.6;

/**
 * Scores packages without asking a model anything.
 *
 * This is the contract the attribution agent has to meet, and the behaviour the
 * app falls back to when there is no AI key or the model is rate-limited. It is
 * deliberately simple and explainable: anything cleverer is the agent's job,
 * and the agent's output is checked against this shape before it can move money.
 */
export function weighPackages(packages: readonly Weighable[]): Weight[] {
  return packages.map((pkg) => {
    if (pkg.productUses === 0 && pkg.testUses === 0) {
      return { pkg: pkg.name, score: 0, reason: "Declared as a dependency but never imported, so it earns nothing." };
    }

    if (pkg.productUses === 0) {
      return {
        pkg: pkg.name,
        score: fromUses(pkg.testUses) * TEST_ONLY_FACTOR,
        reason: `Used only by the tests, in ${pkg.testUses} ${pkg.testUses === 1 ? "place" : "places"}.`,
      };
    }

    const base = fromUses(pkg.productUses);
    const factor = pkg.kind === "runtime" ? 1 : DEV_FACTOR;
    const where = pkg.kind === "runtime" ? "shipped code" : "the build";
    return {
      pkg: pkg.name,
      score: base * factor,
      reason: `Imported in ${pkg.productUses} ${pkg.productUses === 1 ? "place" : "places"} in ${where}.`,
    };
  });
}

/** The strongest few pieces of evidence for a package, for the credits roll. */
export function topEvidence(sites: readonly ImportSite[], keep = 3): ImportSite[] {
  return [...sites]
    .sort((a, b) => Number(a.inTest) - Number(b.inTest) || a.path.localeCompare(b.path) || a.line - b.line)
    .slice(0, keep);
}

/**
 * Below this, the work is genuinely shared and nobody is carrying the project.
 * Above it, one person increasingly is, and the split leans their way.
 */
const SHARED = 0.5;

/** The most a lone maintainer's package can be lifted above an evenly shared one. */
const MAX_LIFT = 3;

/**
 * How much to favour a package because one person holds it up.
 *
 * Deliberately a slope rather than a flag. A project where the top contributor
 * wrote 55% is barely different from one at 45%, and a rule that paid them very
 * differently would be arbitrary. The lift only starts once one person is doing
 * more than half the work, and reaches its maximum when they do nearly all of it.
 */
export function carriedAloneFactor(topShare: number): number {
  if (!Number.isFinite(topShare) || topShare <= SHARED) return 1;
  const past = Math.min(1, (topShare - SHARED) / (1 - SHARED));
  return 1 + (MAX_LIFT - 1) * past;
}

/** A weight after the people behind the package have been taken into account. */
export interface AdjustedWeight extends Weight {
  /** True when one person does most of the work here. */
  carriedAlone: boolean;
}

/**
 * Applies the maintainer signal to a package's weight.
 *
 * This is where the project's argument becomes money: a library one person
 * maintains alone earns more per use than one a staffed team maintains, because
 * the point is to reach the people nobody else is paying.
 */
export function adjustForMaintainers(weight: Weight, shares: readonly number[]): AdjustedWeight {
  const top = shares.length === 0 ? 0 : Math.max(...shares);
  const factor = carriedAloneFactor(top);
  if (factor === 1) return { ...weight, carriedAlone: false };

  const percent = Math.round(top * 100);
  return {
    pkg: weight.pkg,
    score: weight.score * factor,
    reason: `${weight.reason} One maintainer wrote ${percent}% of it, so it is weighted ${factor.toFixed(1)}x.`,
    carriedAlone: true,
  };
}
