import type { Metadata } from "next";

import type { SportCategorySlug } from "@/lib/categories";

export const siteName = "YouKnoBall";
export const siteUrl = "https://youknoball.com";
export const visualWordmark = "YOUKNOBALL";
export const compactMark = "YKB";
export const brandOrange = "#ff7a18";
export const brandBackground = "#050505";
export const homepageTitle = `${siteName} | Daily Sports Trivia`;
export const homepageDescription =
  "Play YouKnoBall, a free daily five-question sports trivia challenge covering the NBA, NFL, college football, college basketball, NHL, and MLB.";
export const socialImageUrl = `${siteUrl}/opengraph-image`;

export function buildSocialMetadata(
  title: string,
  description: string,
  canonical: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  const socialTitle = title.endsWith(`| ${siteName}`)
    ? title
    : `${title} | ${siteName}`;

  return {
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName,
      title: socialTitle,
      description,
      url: new URL(canonical, `${siteUrl}/`).toString(),
      images: [
        {
          url: socialImageUrl,
          width: 1200,
          height: 630,
          type: "image/png",
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [socialImageUrl],
    },
  };
}

export const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: `${siteUrl}/`,
} as const;

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

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
