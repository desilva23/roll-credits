import { keyed, stageName } from "./stage-name";

/** A contributor as GitHub reports them. Never leaves the server in this shape. */
export interface RawContributor {
  login: string;
  contributions: number;
}

/** A maintainer as the rest of the app sees them: no login, no avatar. */
export interface Maintainer {
  /** Stable, keyed from the login, so one person keeps one id without the login being exposed. */
  id: string;
  /** The generated name shown everywhere in place of the login. */
  name: string;
  commits: number;
  /** This person's share of the commits among those counted, 0 to 1. */
  share: number;
}

/**
 * Accounts that commit on a project's behalf without being a person to pay.
 * GitHub marks app accounts with a `[bot]` suffix, but plenty of automation
 * predates that convention, so the common names are listed too.
 */
const BOT_NAMES = new Set([
  "dependabot",
  "renovate",
  "greenkeeper",
  "github-actions",
  "snyk-bot",
  "semantic-release-bot",
  "allcontributors",
  "codecov",
  "imgbot",
  "mergify",
  "stale",
  "web-flow",
]);

// Only the separated forms. A bare `bot` ending would also catch real people
// called `abbot` or `talbot`, and a wrongly dropped maintainer is paid nothing,
// which is a worse mistake than letting an unusual bot through to the agent.
const BOT_SUFFIX = /(?:\[bot\]|-bot|_bot)$/i;

/** True when a contributor is automation rather than someone who could be paid. */
export function isBot(login: string): boolean {
  const key = login.trim().toLowerCase();
  if (key === "") return false;
  return BOT_NAMES.has(key) || BOT_SUFFIX.test(key);
}

/** A keyed id, so a person can be recognised across packages without the login leaving the server. */
export function maintainerId(login: string, secret: string): string {
  return `m_${keyed(secret, "maintainer-id", login).subarray(0, 8).toString("hex")}`;
}

/**
 * Turns GitHub's contributor list into the people a split can pay: bots removed,
 * the busiest kept, and each one's share of the work recorded. The share is the
 * bus-factor signal too, because one person at 0.9 means the project has one
 * person.
 */
export function toMaintainers(contributors: readonly RawContributor[], secret: string, keep = 5): Maintainer[] {
  const people = contributors
    .filter((c) => c.login.trim() !== "" && !isBot(c.login) && c.contributions > 0)
    .sort((a, b) => b.contributions - a.contributions)
    .slice(0, Math.max(0, keep));

  const total = people.reduce((sum, c) => sum + c.contributions, 0);
  if (total === 0) return [];

  return people.map((c) => ({
    id: maintainerId(c.login, secret),
    name: stageName(c.login, secret),
    commits: c.contributions,
    share: c.contributions / total,
  }));
}
