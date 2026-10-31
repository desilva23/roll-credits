import { describe, expect, it } from "vitest";
import { findImportSites, isTestPath, packageOfSpecifier } from "./imports";

describe("isTestPath", () => {
  it.each([
    "src/lib/budget.test.ts",
    "src/components/Panel.spec.tsx",
    "e2e/checkout.ts",
    "test/helpers.ts",
    "tests/helpers.ts",
    "src/__tests__/thing.ts",
    "src/__mocks__/paypal.ts",
    "vitest.config.mts",
    "playwright.config.ts",
  ])("treats %s as test code", (path) => {
    expect(isTestPath(path)).toBe(true);
  });

  it.each(["src/lib/budget.ts", "src/app/page.tsx", "next.config.ts", "src/latest/thing.ts"])(
    "treats %s as product code",
    (path) => {
      expect(isTestPath(path)).toBe(false);
    },
  );
});

describe("packageOfSpecifier", () => {
  it.each([
    ["zod", "zod"],
    ["zod/v4", "zod"],
    ["@paypal/agent-toolkit", "@paypal/agent-toolkit"],
    ["@paypal/agent-toolkit/openai", "@paypal/agent-toolkit"],
  ])("maps %s to %s", (specifier, expected) => {
    expect(packageOfSpecifier(specifier)).toBe(expected);
  });

  it.each(["./local", "../up", "/absolute", "node:fs", "https://esm.sh/zod", "", "@scope"])(
    "ignores %s",
    (specifier) => {
      expect(packageOfSpecifier(specifier)).toBeNull();
    },
  );
});

describe("findImportSites", () => {
  const wanted = new Set(["zod", "next", "@paypal/agent-toolkit"]);

  it("finds each import form with its line number", () => {
    const source = [
      `import { z } from "zod";`,
      `import "next/font";`,
      `const tk = require("@paypal/agent-toolkit/openai");`,
      `const lazy = await import("next/navigation");`,
      `export { thing } from "zod/v4";`,
    ].join("\n");

    expect(findImportSites("src/a.ts", source, wanted)).toEqual([
      { pkg: "zod", inTest: false, path: "src/a.ts", line: 1, specifier: "zod", text: `import { z } from "zod";` },
      { pkg: "next", inTest: false, path: "src/a.ts", line: 2, specifier: "next/font", text: `import "next/font";` },
      {
        pkg: "@paypal/agent-toolkit",
        inTest: false,
        path: "src/a.ts",
        line: 3,
        specifier: "@paypal/agent-toolkit/openai",
        text: `const tk = require("@paypal/agent-toolkit/openai");`,
      },
      {
        pkg: "next",
        inTest: false,
        path: "src/a.ts",
        line: 4,
        specifier: "next/navigation",
        text: `const lazy = await import("next/navigation");`,
      },
      {
        pkg: "zod",
        inTest: false,
        path: "src/a.ts",
        line: 5,
        specifier: "zod/v4",
        text: `export { thing } from "zod/v4";`,
      },
    ]);
  });

  it("marks sites in a test file", () => {
    const sites = findImportSites("src/lib/thing.test.ts", `import { z } from "zod";`, wanted);
    expect(sites).toHaveLength(1);
    expect(sites[0]?.inTest).toBe(true);
  });

  it("ignores packages that were not asked for", () => {
    expect(findImportSites("a.ts", `import x from "unlisted";`, wanted)).toEqual([]);
  });

  it.each([
    ["a relative import", `import x from "./local";`],
    ["a commented-out line", `// import { z } from "zod";`],
    ["a jsdoc line", `* import { z } from "zod";`],
    ["a blank line", "   "],
  ])("skips %s", (_label, source) => {
    expect(findImportSites("a.ts", source, wanted)).toEqual([]);
  });

  it("skips minified or generated lines", () => {
    const long = `import{z}from"zod";`.padEnd(401, " ");
    expect(findImportSites("a.ts", long, wanted)).toEqual([]);
  });

  it("finds two packages on one line", () => {
    const source = `const a = require("zod"), b = require("next");`;
    expect(findImportSites("a.ts", source, wanted).map((s) => s.specifier)).toEqual(["zod", "next"]);
  });
});
