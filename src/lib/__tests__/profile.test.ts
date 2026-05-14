import { describe, expect, it } from "vitest";

import { normalizeDisplayName } from "@/lib/profile";

describe("normalizeDisplayName", () => {
  it("trims valid names and keeps spacing minimal", () => {
    expect(normalizeDisplayName("  Ball Knower  ")).toEqual({
      value: "Ball Knower",
      error: null,
    });
  });

  it("rejects names that are too short or too long", () => {
    expect(normalizeDisplayName("ab")).toEqual({
      value: null,
      error: "Display name must be between 3 and 24 characters.",
    });
    expect(normalizeDisplayName("a".repeat(25))).toEqual({
      value: null,
      error: "Display name must be between 3 and 24 characters.",
    });
  });
});
