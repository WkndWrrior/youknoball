import type { SportCategorySlug } from "@/lib/categories";

export const siteName = "YouKnoBall";
export const siteUrl = "https://youknoball.com";
export const homepageTitle = `${siteName} | Daily Sports Trivia`;
export const homepageDescription =
  "Play YouKnoBall, a free daily five-question sports trivia challenge covering the NBA, NFL, college football, college basketball, NHL, and MLB.";

type CategorySeo = {
  title: string;
  description: string;
  canonical: `/categories/${SportCategorySlug}`;
};

export const categorySeo = {
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
} as const satisfies Record<SportCategorySlug, CategorySeo>;

export const publicRoutes = [
  "/",
  "/play",
  "/categories",
  ...Object.values(categorySeo).map(({ canonical }) => canonical),
  "/leaderboard",
] as const;
