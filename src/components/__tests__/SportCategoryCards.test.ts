import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("SportCategoryCards", () => {
  function getIconCaseSource(source: string, slug: string) {
    const start = source.indexOf(`case "${slug}"`);
    const end = source.indexOf("case ", start + 1);

    return end === -1 ? source.slice(start) : source.slice(start, end);
  }

  it("renders the category cards as a hard-stop horizontal carousel", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/SportCategoryCards.tsx"),
      "utf8",
    );
    const sharedSource = await readFile(
      path.join(process.cwd(), "src/components/SportCategoryShared.tsx"),
      "utf8",
    );

    expect(source).toContain('data-category-carousel');
    expect(sharedSource).toContain('data-category-card');
    expect(source).toContain('aria-label="Previous category"');
    expect(source).toContain('aria-label="Next category"');
    expect(source).toContain("canScrollPrevious");
    expect(source).toContain("canScrollNext");
    expect(source).toContain("scrollByCard(-1)");
    expect(source).toContain("scrollByCard(1)");
    expect(source).toContain("getCenteredCardIndex");
    expect(source).toContain("scrollToCategoryIndex");
    expect(source).toContain("Math.max(0, Math.min(cards.length - 1, targetIndex))");
    expect(source).toContain("setCanScrollNext(index < cards.length - 1)");
    expect(source).not.toContain("maxScrollLeft");
    expect(source).not.toContain("carousel.scrollBy");
    expect(source).toContain("centerInitialMobileCard");
    expect(source).toContain('window.matchMedia("(max-width: 767px)")');
    expect(source).toContain('scrollToCategoryIndex(1, "auto")');
    expect(source).toContain("snap-x snap-mandatory");
    expect(source).toContain("grid-cols-[2rem_minmax(0,1fr)_2rem]");
    expect(source).toContain("justify-self-center");
    expect(source).toContain("px-5");
    expect(source).toContain("snap-center");
    expect(source).not.toContain("absolute left-1 top-1/2");
    expect(source).not.toContain("absolute right-1 top-1/2");
    expect(source).toContain("basis-full");
    expect(source).toContain("md:basis-[46%]");
    expect(source).toContain("lg:basis-[31%]");
    expect(source).toContain("useOrderedSportCategories");
    expect(source).toContain("SportCategoryCardLink");
    expect(sharedSource).toContain("CategoryIcon");
    expect(sharedSource).toContain('case "nba"');
    expect(sharedSource).toContain('case "cbb"');
    expect(sharedSource).toContain('case "nfl"');
    expect(sharedSource).toContain('case "cfb"');
    expect(sharedSource).toContain('case "nhl"');
    expect(sharedSource).toContain('case "mlb"');
    expect(source).not.toContain("grid gap-4");
  });

  it("uses a supported field goal for NFL, a stringed triangle pennant for CFB, an obtuse-angled NHL stick, and a home plate MLB shape", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/SportCategoryShared.tsx"),
      "utf8",
    );

    const nflIcon = getIconCaseSource(source, "nfl");
    const cfbIcon = getIconCaseSource(source, "cfb");
    const nhlIcon = getIconCaseSource(source, "nhl");
    const mlbIcon = getIconCaseSource(source, "mlb");

    expect(nflIcon).toContain("M7 6v8h10V6M12 14v6M9 20h6");
    expect(nflIcon).not.toContain("M12 14V6");
    expect(nflIcon).not.toContain("M8 6v12M16 6v12");
    expect(cfbIcon).toContain("M5 6v12l14-6Z");
    expect(cfbIcon).toContain("M5 8H2.5M5 16H2.5");
    expect(cfbIcon).not.toContain("c-1.1");
    expect(cfbIcon).not.toContain("M6 7h12l-4 4 4 4H6Z");
    expect(cfbIcon).not.toContain("M7 20V5");
    expect(cfbIcon).not.toContain("M12 19V6M7 6v6h10V6M5 19h14");
    expect(nhlIcon).toContain("M20 5 16 17M16 17H8M14 19h5");
    expect(nhlIcon).not.toContain("M8 5 16 17M16 17H8M14 19h5");
    expect(nhlIcon).not.toContain("M16 5 8 17M8 17h8M5 19h5");
    expect(mlbIcon).toContain("M6 5h12v9l-6 5-6-5Z");
    expect(mlbIcon).not.toContain("<rect");
    expect(mlbIcon).not.toContain("<circle");
    expect(mlbIcon).not.toContain("M5 19.5 15.2 9.3");
    expect(mlbIcon).not.toContain("M6 12 12 6l6 6-6 6Z");
  });
});
