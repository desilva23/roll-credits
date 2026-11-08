import { describe, expect, it } from "vitest";
import { count } from "./text";

describe("count", () => {
  it("uses the singular for exactly one", () => {
    expect(count(1, "person", "people")).toBe("1 person");
  });

  it.each([0, 2, 28])("uses the plural for %i", (n) => {
    expect(count(n, "person", "people")).toBe(`${n} people`);
  });

  it("adds an s when no plural is given", () => {
    expect(count(3, "package")).toBe("3 packages");
    expect(count(1, "package")).toBe("1 package");
  });
});
