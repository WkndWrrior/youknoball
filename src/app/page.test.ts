import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("home page layout", () => {
  it("puts the daily challenge hero before leaderboard and category sections", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );

    const heroIndex = source.indexOf('data-home-section="daily-hero"');
    const leaderboardIndex = source.indexOf('data-home-section="leaderboard-preview"');
    const categoriesIndex = source.indexOf('data-home-section="category-lanes"');

    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(leaderboardIndex).toBeGreaterThan(heroIndex);
    expect(categoriesIndex).toBeGreaterThan(leaderboardIndex);
    expect(source).toContain("Today&apos;s daily challenge");
    expect(source).toContain("The board follows the run.");
    expect(source).not.toContain("Ready to run.");
    expect(source).not.toContain("Not live yet.");
    expect(source).not.toContain("5 questions, all sports.");
    expect(source).not.toContain("Timed signed-in runs rank.");
    expect(source).not.toContain("Guests can play instantly.");
    expect(source).toContain("px-9 py-5 text-base");
    expect(source).toContain('className="mx-auto w-full max-w-4xl text-center"');
    expect(source).toContain("mx-auto mt-7 max-w-4xl");
    expect(source).toContain("mx-auto mt-7 max-w-2xl");
    expect(source).toContain("justify-center");
    expect(source).not.toContain("lg:text-8xl");
    expect(source).toContain("SportCategoryCards");
  });
});
