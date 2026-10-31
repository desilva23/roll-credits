/** A package the scanned repository lists as a direct dependency. */
export interface DirectDependency {
  /** The npm name, e.g. `zod` or `@paypal/agent-toolkit`. */
  name: string;
  /** The range as written in package.json, kept for the evidence trail. */
  range: string;
  /** Runtime dependencies carry more weight than build-time ones. */
  kind: "runtime" | "development";
}

/**
 * Packages that ship as part of the toolchain everyone already pays for, or
 * that resolve to a single huge monorepo. Paying these crowds out the people
 * the project exists to find, so they never enter a split.
 */
const EXCLUDED = new Set(["typescript", "node", "npm"]);

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Reads the direct dependencies out of a package.json. Transitive packages are
 * deliberately ignored: this project pays for what your code actually calls,
 * and the import graph decides that later.
 */
export function directDependencies(pkg: unknown): DirectDependency[] {
  if (typeof pkg !== "object" || pkg === null) throw new RangeError("package.json is not an object");
  const { dependencies = {}, devDependencies = {} } = pkg as PackageJson;

  const found = new Map<string, DirectDependency>();
  const add = (entries: Record<string, string>, kind: DirectDependency["kind"]): void => {
    for (const [name, range] of Object.entries(entries)) {
      if (!NPM_NAME.test(name) || EXCLUDED.has(name) || found.has(name)) continue;
      if (typeof range !== "string") continue;
      found.set(name, { name, range, kind });
    }
  };

  // Runtime first, so a package listed in both keeps the stronger label.
  add(dependencies, "runtime");
  add(devDependencies, "development");

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
