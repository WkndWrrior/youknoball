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

  it("includes college football with approved copy", () => {
    expect(sportsCategories.find((category) => category.slug === "cfb")).toMatchObject({
      title: "CFB",
      eyebrow: "Campus Gameday",
      description:
        "Campus football trivia for fans who know rivalries, rankings, bowl chaos, and November stakes.",
    });
  });

  it("includes MLB after NHL with general baseball copy", () => {
    expect(sportsCategories.at(-1)).toMatchObject({
      slug: "mlb",
      title: "MLB",
      eyebrow: "Box score brain",
      description:
        "Summer baseball trivia for fans who track pennant races, record books, October swings, and bullpen chaos.",
    });
  });

  it("keeps the default order when no sport has enough history", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nfl", answeredCount: 2, correctCount: 2, lastAnsweredAt: "2026-05-01" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual([
      "nba",
      "cbb",
      "nfl",
      "cfb",
      "nhl",
      "mlb",
    ]);
  });

  it("puts the second strongest sport first and the strongest sport second", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nba", answeredCount: 5, correctCount: 3, lastAnsweredAt: "2026-05-01" },
      { slug: "nfl", answeredCount: 4, correctCount: 4, lastAnsweredAt: "2026-05-02" },
      { slug: "nhl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual([
      "nhl",
      "nfl",
      "nba",
      "cbb",
      "cfb",
      "mlb",
    ]);
  });

  it("moves a single qualified strongest sport into the second position", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nfl", answeredCount: 3, correctCount: 3, lastAnsweredAt: "2026-05-02" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual([
      "nba",
      "nfl",
      "cbb",
      "cfb",
      "nhl",
      "mlb",
    ]);
  });

  it("breaks equal-accuracy ties by larger sample size", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nba", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
      { slug: "nfl", answeredCount: 8, correctCount: 6, lastAnsweredAt: "2026-05-01" },
      { slug: "nhl", answeredCount: 6, correctCount: 3, lastAnsweredAt: "2026-05-02" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual([
      "nba",
      "nfl",
      "nhl",
      "cbb",
      "cfb",
      "mlb",
    ]);
  });

  it("breaks equal-accuracy and equal-sample ties by newer recency", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nba", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-01" },
      { slug: "nfl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
      { slug: "nhl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-02" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual([
      "nhl",
      "nfl",
      "nba",
      "cbb",
      "cfb",
      "mlb",
    ]);
  });

  it("falls back to default order when accuracy, sample size, and recency tie", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nhl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
      { slug: "nfl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
      { slug: "nba", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual([
      "nfl",
      "nba",
      "nhl",
      "cbb",
      "cfb",
      "mlb",
    ]);
  });
});
