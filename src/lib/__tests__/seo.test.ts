import { describe, expect, it } from "vitest";

import {
  brandBackground,
  brandOrange,
  buildSocialMetadata,
  categorySeo,
  compactMark,
  homepageDescription,
  homepageTitle,
  publicRoutes,
  serializeStructuredData,
  siteName,
  siteUrl,
  visualWordmark,
  websiteStructuredData,
} from "@/lib/seo";

describe("SEO contract", () => {
  it("uses the canonical site identity", () => {
    expect(siteName).toBe("YouKnoBall");
    expect(siteUrl).toBe("https://youknoball.com");
  });

  it("defines the approved visual identity", () => {
    expect(visualWordmark).toBe("YOUKNOBALL");
    expect(compactMark).toBe("YKB");
    expect(brandOrange).toBe("#ff7a18");
    expect(brandBackground).toBe("#050505");
  });

  it("defines the approved homepage metadata", () => {
    expect(homepageTitle).toBe("YouKnoBall | Daily Sports Trivia");
    expect(homepageDescription).toBe(
      "Play YouKnoBall, a free daily five-question sports trivia challenge covering the NBA, NFL, college football, college basketball, NHL, and MLB.",
    );
  });

  it("builds page-specific social metadata around one shared brand image", () => {
    expect(
      buildSocialMetadata(
        "NBA Trivia Quiz",
        "Test your NBA knowledge.",
        "/categories/nba",
      ),
    ).toEqual({
      openGraph: {
        type: "website",
        locale: "en_US",
        siteName: "YouKnoBall",
        title: "NBA Trivia Quiz | YouKnoBall",
        description: "Test your NBA knowledge.",
        url: "https://youknoball.com/categories/nba",
        images: [
          {
            url: "https://youknoball.com/opengraph-image",
            width: 1200,
            height: 630,
            type: "image/png",
            alt: "YouKnoBall",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: "NBA Trivia Quiz | YouKnoBall",
        description: "Test your NBA knowledge.",
        images: ["https://youknoball.com/opengraph-image"],
      },
    });
  });

  it("does not repeat the brand in the approved homepage social title", () => {
    const metadata = buildSocialMetadata(
      homepageTitle,
      homepageDescription,
      "/",
    );

    expect(metadata.openGraph?.title).toBe(homepageTitle);
    expect(metadata.twitter?.title).toBe(homepageTitle);
  });

  it("defines and safely serializes the homepage WebSite schema", () => {
    expect(websiteStructuredData).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "YouKnoBall",
      url: "https://youknoball.com/",
    });
    expect(JSON.parse(serializeStructuredData(websiteStructuredData))).toEqual(
      websiteStructuredData,
    );
    expect(serializeStructuredData({ value: "<script>" })).toBe(
      '{"value":"\\u003cscript>"}',
    );
  });

  it("lists every public indexable route", () => {
    const categoryCanonicals = Object.values(categorySeo).map(
      ({ canonical }) => canonical,
    );

    expect(categoryCanonicals).toEqual([
      "/categories/nba",
      "/categories/nfl",
      "/categories/cfb",
      "/categories/cbb",
      "/categories/nhl",
      "/categories/mlb",
    ]);
    expect(publicRoutes).toEqual([
      "/",
      "/play",
      "/categories",
      ...categoryCanonicals,
      "/leaderboard",
    ]);
    categoryCanonicals.forEach((canonical) => {
      expect(publicRoutes).toContain(canonical);
    });
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
