import { describe, expect, it } from "vitest";

import {
  categorySeo,
  homepageDescription,
  homepageTitle,
  publicRoutes,
  siteName,
  siteUrl,
} from "@/lib/seo";

describe("SEO contract", () => {
  it("uses the canonical site identity", () => {
    expect(siteName).toBe("YouKnoBall");
    expect(siteUrl).toBe("https://youknoball.com");
  });

  it("defines the approved homepage metadata", () => {
    expect(homepageTitle).toBe("YouKnoBall | Daily Sports Trivia");
    expect(homepageDescription).toBe(
      "Play YouKnoBall, a free daily five-question sports trivia challenge covering the NBA, NFL, college football, college basketball, NHL, and MLB.",
    );
  });

  it("lists every public indexable route", () => {
    expect(publicRoutes).toEqual([
      "/",
      "/play",
      "/categories",
      "/categories/nba",
      "/categories/nfl",
      "/categories/cfb",
      "/categories/cbb",
      "/categories/nhl",
      "/categories/mlb",
      "/leaderboard",
    ]);
  });

  it("defines approved metadata for every supported category", () => {
    expect(categorySeo).toEqual({
      nba: {
        title: "NBA Trivia Quiz",
        description:
          "Test your NBA knowledge with a free five-question trivia quiz covering players, teams, iconic moments, records, and championships.",
        canonical: "/categories/nba",
      },
      nfl: {
        title: "NFL Trivia Quiz",
        description:
          "Test your NFL knowledge with a free five-question trivia quiz covering players, teams, iconic moments, records, and Super Bowls.",
        canonical: "/categories/nfl",
      },
      cfb: {
        title: "College Football Trivia Quiz",
        description:
          "Test your college football knowledge with five trivia questions covering players, programs, rivalries, bowls, and national championships.",
        canonical: "/categories/cfb",
      },
      cbb: {
        title: "College Basketball Trivia Quiz",
        description:
          "Test your college basketball knowledge with five trivia questions covering players, programs, March Madness, and championship moments.",
        canonical: "/categories/cbb",
      },
      nhl: {
        title: "NHL Trivia Quiz",
        description:
          "Test your NHL knowledge with a free five-question trivia quiz covering players, teams, records, awards, and Stanley Cup moments.",
        canonical: "/categories/nhl",
      },
      mlb: {
        title: "MLB Trivia Quiz",
        description:
          "Test your MLB knowledge with a free five-question trivia quiz covering players, teams, records, pennant races, and World Series moments.",
        canonical: "/categories/mlb",
      },
    });
  });
});
