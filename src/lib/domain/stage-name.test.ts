import { describe, expect, it } from "vitest";
import { stageName } from "./stage-name";

describe("stageName", () => {
  it("gives the same person the same name every time", () => {
    expect(stageName("sindresorhus")).toBe(stageName("sindresorhus"));
  });

  it("ignores case and surrounding space, so one account is one person", () => {
    expect(stageName("  SindreSorhus  ")).toBe(stageName("sindresorhus"));
  });

  it("reads like a film credit", () => {
    expect(stageName("sindresorhus")).toMatch(/^[A-Z][a-z]+ [A-Z]\. [A-Z][a-z]+$/);
  });

  it("does not leak the login it came from", () => {
    expect(stageName("sindresorhus").toLowerCase()).not.toContain("sindre");
  });

  it("keeps real-looking logins apart", () => {
    const parts = [
      "sindre",
      "ljharb",
      "wycats",
      "kentcdodds",
      "yyx990803",
      "gaearon",
      "tj",
      "feross",
      "isaacs",
      "jon",
    ];
    const logins = parts.flatMap((a) => parts.map((b) => `${a}-${b}`));
    expect(new Set(logins.map(stageName)).size).toBe(logins.length);
  });

  it("stays mostly distinct even for logins differing by one character", () => {
    const names = new Set(Array.from({ length: 400 }, (_, i) => stageName(`maintainer-${i}`)));
    // Worst case for a hash: 400 near-identical inputs. Collisions must stay rare.
    expect(names.size).toBeGreaterThanOrEqual(390);
  });

  it.each(["", "   "])("rejects %j", (login) => {
    expect(() => stageName(login)).toThrow(RangeError);
  });
});
