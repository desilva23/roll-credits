import { describe, expect, it } from "vitest";
import { keyed, stageName } from "./stage-name";

const SECRET = "test-secret";

describe("stageName", () => {
  it("gives the same person the same name every time", () => {
    expect(stageName("sindresorhus", SECRET)).toBe(stageName("sindresorhus", SECRET));
  });

  it("ignores case and surrounding space, so one account is one person", () => {
    expect(stageName("  SindreSorhus  ", SECRET)).toBe(stageName("sindresorhus", SECRET));
  });

  it("reads like a film credit", () => {
    expect(stageName("sindresorhus", SECRET)).toMatch(/^[A-Z][a-z]+ [A-Z]\. [A-Z][a-z]+$/);
  });

  it("does not leak the login it came from", () => {
    expect(stageName("sindresorhus", SECRET).toLowerCase()).not.toContain("sindre");
  });

  it("cannot be worked out without the secret", () => {
    // The point of keying: the same login under another secret is someone else,
    // so hashing a public contributor list does not reveal who a name is.
    const names = new Set(["one", "two", "three", "four"].map((secret) => stageName("sindresorhus", secret)));
    expect(names.size).toBeGreaterThan(1);
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
    expect(new Set(logins.map((l) => stageName(l, SECRET))).size).toBeGreaterThanOrEqual(logins.length - 1);
  });

  it("stays distinct even for logins differing by one character", () => {
    const names = new Set(Array.from({ length: 400 }, (_, i) => stageName(`maintainer-${i}`, SECRET)));
    expect(names.size).toBeGreaterThanOrEqual(395);
  });

  it.each(["", "   "])("rejects a login of %j", (login) => {
    expect(() => stageName(login, SECRET)).toThrow(RangeError);
  });
});

describe("keyed", () => {
  it("separates purposes, so a name and an id never share a hash", () => {
    expect(keyed(SECRET, "stage-name", "ada").equals(keyed(SECRET, "maintainer-id", "ada"))).toBe(false);
  });

  it("refuses to work without a secret", () => {
    expect(() => keyed("", "stage-name", "ada")).toThrow(RangeError);
  });
});
