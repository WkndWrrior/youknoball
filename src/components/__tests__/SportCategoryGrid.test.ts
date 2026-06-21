import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("SportCategoryGrid", () => {
  it("renders the full category chooser as a responsive vertical page grid", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/SportCategoryGrid.tsx"),
      "utf8",
    );
    const sharedSource = await readFile(
      path.join(process.cwd(), "src/components/SportCategoryShared.tsx"),
      "utf8",
    );

    expect(source).toContain('"use client"');
    expect(source).toContain("useOrderedSportCategories");
    expect(source).toContain('data-category-grid');
    expect(sharedSource).toContain('data-category-card');
    expect(source).toContain("grid-cols-1");
    expect(source).toContain("sm:grid-cols-2");
    expect(source).toContain("lg:grid-cols-3");
    expect(source).toContain("SportCategoryCardLink");
    expect(sharedSource).not.toContain("\n        Play\n");
    expect(sharedSource).not.toContain("Explore preview");
    expect(source).not.toContain("aria-label=\"Previous category\"");
    expect(source).not.toContain("aria-label=\"Next category\"");
    expect(source).not.toContain("overflow-x-auto");
    expect(source).not.toContain("snap-x");
  });
});
