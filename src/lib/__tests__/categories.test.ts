import { describe, expect, it } from "vitest";

import {
  rankSportsCategoriesByPerformance,
  sportsCategories,
} from "@/lib/categories";

describe("sportsCategories", () => {
  it("keeps exact general NFL copy", () => {
    expect(sportsCategories.find((category) => category.slug === "nfl")?.description).toBe(
      "You been watching film huh? That's cool, watch this",
    );
  });

  it("keeps the default order when no sport has enough history", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nfl", answeredCount: 2, correctCount: 2, lastAnsweredAt: "2026-05-01" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual(["nba", "cbb", "nfl", "nhl"]);
  });

  it("moves enough-history strongest sports ahead of the default order", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nba", answeredCount: 5, correctCount: 3, lastAnsweredAt: "2026-05-01" },
      { slug: "nfl", answeredCount: 4, correctCount: 4, lastAnsweredAt: "2026-05-02" },
      { slug: "nhl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual(["nfl", "nhl", "nba", "cbb"]);
  });

  it("breaks equal-accuracy ties by larger sample size", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nba", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
      { slug: "nfl", answeredCount: 8, correctCount: 6, lastAnsweredAt: "2026-05-01" },
      { slug: "nhl", answeredCount: 6, correctCount: 3, lastAnsweredAt: "2026-05-02" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual(["nfl", "nba", "nhl", "cbb"]);
  });

  it("falls back to default order when accuracy, sample size, and recency tie", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nhl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
      { slug: "nfl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
      { slug: "nba", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual(["nba", "nfl", "nhl", "cbb"]);
  });
});
