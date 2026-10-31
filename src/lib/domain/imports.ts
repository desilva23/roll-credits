/** One place in the source where a package is actually used. */
export interface ImportSite {
  /** The npm package the specifier belongs to, e.g. `zod`. */
  pkg: string;
  /** True when the file is a test or test helper rather than shipped code. */
  inTest: boolean;
  /** Repository-relative path, e.g. `src/lib/server/paypal.ts`. */
  path: string;
  /** 1-indexed, so it can be linked straight to GitHub. */
  line: number;
  /** The specifier as written, e.g. `zod/v4` or `@paypal/agent-toolkit/openai`. */
  specifier: string;
  /** The line itself, trimmed, as the evidence a judge or maintainer reads. */
  text: string;
}

/**
 * Matches the module specifier in the import forms that appear in real code:
 * `import … from "x"`, bare `import "x"`, `export … from "x"`, `require("x")`
 * and dynamic `import("x")`.
 */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["']([^"'\n]+)["']/g;

/** The longest a line may be before it is treated as generated or minified. */
const MAX_LINE = 400;

/** Test files, their helpers, and the config that only exists to run them. */
const TEST_PATH =
  /(?:^|\/)(?:tests?|e2e|__tests__|__mocks__)\/|\.(?:test|spec)\.[jt]sx?$|^(?:vitest|playwright|jest|stryker)\.config\./;

/**
 * Whether a path holds test code. A package used only here supports the work
 * but is not what the product runs on, and the split must be able to tell.
 */
export function isTestPath(path: string): boolean {
  return TEST_PATH.test(path);
}

/** True for a package specifier, false for a path or anything with a URL scheme. */
function isBareSpecifier(specifier: string): boolean {
  if (specifier === "" || specifier.startsWith(".") || specifier.startsWith("/")) return false;
  // Covers `node:fs` and `https://…` in one test.
  return !/^[a-z][a-z0-9+.-]*:/i.test(specifier);
}

/**
 * Turns a module specifier into the npm package it belongs to, or null for a
 * relative path, a Node builtin or an absolute URL. Subpaths are stripped, so
 * `zod/v4` and `@scope/pkg/sub` resolve to `zod` and `@scope/pkg`.
 */
export function packageOfSpecifier(specifier: string): string | null {
  if (!isBareSpecifier(specifier)) return null;

  const [first, second] = specifier.split("/");
  if (first === undefined || first === "") return null;
  if (!first.startsWith("@")) return first;
  return second === undefined || second === "" ? null : `${first}/${second}`;
}

/**
 * Finds every import site in one source file. This is the heart of the
 * attribution story: it reads what the code actually pulls in, rather than
 * trusting the dependency list, so a package nobody imports earns nothing.
 */
export function findImportSites(path: string, source: string, wanted: ReadonlySet<string>): ImportSite[] {
  const sites: ImportSite[] = [];
  const inTest = isTestPath(path);

  for (const [index, raw] of source.split("\n").entries()) {
    if (raw.length > MAX_LINE) continue;
    const text = raw.trim();
    if (text === "" || text.startsWith("//") || text.startsWith("*")) continue;

    SPECIFIER.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SPECIFIER.exec(raw)) !== null) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const pkg = packageOfSpecifier(specifier);
      if (pkg === null || !wanted.has(pkg)) continue;
      sites.push({ pkg, inTest, path, line: index + 1, specifier, text });
    }
  }

  return sites;
}
