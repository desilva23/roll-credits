import { describe, expect, it } from "vitest";
import { directDependencies } from "./dependencies";

describe("directDependencies", () => {
  it("reads runtime and development packages, sorted by name", () => {
    expect(
      directDependencies({
        dependencies: { zod: "^4.6.7", next: "^16.4.3" },
        devDependencies: { vitest: "^5.0.5" },
      }),
    ).toEqual([
      { name: "next", range: "^16.4.3", kind: "runtime" },
      { name: "vitest", range: "^5.0.5", kind: "development" },
      { name: "zod", range: "^4.6.7", kind: "runtime" },
    ]);
  });

  it("labels a package listed in both as runtime", () => {
    expect(directDependencies({ dependencies: { zod: "^4.0.0" }, devDependencies: { zod: "^3.0.0" } })).toEqual([
      { name: "zod", range: "^4.0.0", kind: "runtime" },
    ]);
  });

  it("keeps scoped names", () => {
    expect(directDependencies({ dependencies: { "@paypal/agent-toolkit": "1.11.0" } })).toEqual([
      { name: "@paypal/agent-toolkit", range: "1.11.0", kind: "runtime" },
    ]);
  });

  it("skips the toolchain packages a split should never pay", () => {
    expect(directDependencies({ devDependencies: { typescript: "^6.0.3" } })).toEqual([]);
  });

  it.each([{ dependencies: { "Bad Name": "1.0.0" } }, { dependencies: { zod: 4 } }])(
    "skips malformed entries in %j",
    (pkg) => {
      expect(directDependencies(pkg)).toEqual([]);
    },
  );

  it("treats a package.json with no dependencies as empty", () => {
    expect(directDependencies({})).toEqual([]);
  });

  it.each([null, "not an object", 42])("rejects %s", (pkg) => {
    expect(() => directDependencies(pkg)).toThrow(RangeError);
  });
});
