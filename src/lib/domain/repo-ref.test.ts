import { describe, expect, it } from "vitest";
import { parseRepoRef, repoSlug } from "./repo-ref";

describe("parseRepoRef", () => {
  it.each([
    "desilva23/roll-credits",
    "https://github.com/desilva23/roll-credits",
    "http://github.com/desilva23/roll-credits",
    "https://www.github.com/desilva23/roll-credits",
    "github.com/desilva23/roll-credits",
    "https://github.com/desilva23/roll-credits.git",
    "git+https://github.com/desilva23/roll-credits.git",
    "git@github.com:desilva23/roll-credits.git",
    "https://github.com/desilva23/roll-credits/tree/main/src",
    "  desilva23/roll-credits  ",
  ])("reads %s", (input) => {
    expect(parseRepoRef(input)).toEqual({ owner: "desilva23", name: "roll-credits" });
  });

  it("keeps dots inside a name but drops only a trailing .git", () => {
    expect(parseRepoRef("vercel/next.js")).toEqual({ owner: "vercel", name: "next.js" });
  });

  it.each(["", "   ", "desilva23", "/roll-credits", "-bad/name", "owner/.hidden", "owner/name!"])(
    "rejects %s",
    (input) => {
      expect(() => parseRepoRef(input)).toThrow(RangeError);
    },
  );
});

describe("repoSlug", () => {
  it("joins owner and name", () => {
    expect(repoSlug({ owner: "vercel", name: "next.js" })).toBe("vercel/next.js");
  });
});
