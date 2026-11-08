import { describe, expect, it } from "vitest";
import { isBot, maintainerId, toMaintainers } from "./people";

const SECRET = "test-secret";

describe("isBot", () => {
  it.each(["dependabot", "dependabot[bot]", "renovate", "github-actions", "Greenkeeper", "release-bot", "web-flow"])(
    "treats %s as automation",
    (login) => {
      expect(isBot(login)).toBe(true);
    },
  );

  it.each(["sindresorhus", "abbot", "tj", "robot-lover-dev", ""])("treats %j as a person", (login) => {
    expect(isBot(login)).toBe(false);
  });
});

describe("maintainerId", () => {
  it("is stable and case-insensitive", () => {
    expect(maintainerId("Sindre", SECRET)).toBe(maintainerId("sindre", SECRET));
  });

  it("differs between people and reveals nothing", () => {
    expect(maintainerId("alice", SECRET)).not.toBe(maintainerId("bob", SECRET));
    expect(maintainerId("alice", SECRET)).not.toContain("alice");
  });
});

describe("toMaintainers", () => {
  const raw = [
    { login: "alice", contributions: 70 },
    { login: "bob", contributions: 30 },
    { login: "dependabot[bot]", contributions: 500 },
  ];

  it("drops bots however much they commit", () => {
    expect(toMaintainers(raw, SECRET).map((m) => m.commits)).toEqual([70, 30]);
  });

  it("gives shares that sum to one", () => {
    const shares = toMaintainers(raw, SECRET).map((m) => m.share);
    expect(shares).toEqual([0.7, 0.3]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("never exposes the login", () => {
    const [first] = toMaintainers(raw, SECRET);
    expect(JSON.stringify(first)).not.toContain("alice");
  });

  it("keeps only the busiest few", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ login: `dev${i}`, contributions: 12 - i }));
    expect(toMaintainers(many, SECRET, 3).map((m) => m.commits)).toEqual([12, 11, 10]);
  });

  it("shows one person holding a project up", () => {
    const [solo] = toMaintainers(
      [
        { login: "alice", contributions: 94 },
        { login: "bob", contributions: 6 },
      ],
      SECRET,
    );
    expect(solo?.share).toBeCloseTo(0.94);
  });

  it.each([[[]], [[{ login: "ghost", contributions: 0 }]], [[{ login: "   ", contributions: 5 }]]])(
    "returns nobody for %j",
    (input) => {
      expect(toMaintainers(input, SECRET)).toEqual([]);
    },
  );
});
