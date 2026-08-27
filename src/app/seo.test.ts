import { describe, expect, it } from "vitest";

import * as homePage from "@/app/page";
import * as categoriesPage from "@/app/categories/page";
import {
  generateMetadata as generateCategoryMetadata,
} from "@/app/categories/[slug]/page";
import * as leaderboardPage from "@/app/leaderboard/page";
import * as playLayout from "@/app/play/layout";
import * as feedbackPage from "@/app/feedback/page";
import {
  categorySeo,
  homepageDescription,
  homepageTitle,
  publicRoutes,
  siteUrl,
} from "@/lib/seo";

describe("public page SEO metadata", () => {
  it("gives the homepage an absolute title and self-referencing canonical", () => {
    expect(homePage.metadata).toEqual({
      title: { absolute: homepageTitle },
      description: homepageDescription,
      alternates: { canonical: "/" },
    });
  });

  it("gives the categories chooser its approved metadata", () => {
    expect(categoriesPage.metadata).toEqual({
      title: "Sports Trivia Quizzes",
      description:
        "Choose an NBA, NFL, college football, college basketball, NHL, or MLB trivia quiz on YouKnoBall and play five fresh questions whenever.",
      alternates: { canonical: "/categories" },
    });
  });

  it("provides approved metadata for the client-rendered play page", () => {
    expect(playLayout.metadata).toEqual({
      title: "Daily Sports Trivia Challenge",
      description:
        "Play today’s free five-question sports trivia challenge, test your all-sports knowledge, and compete on the YouKnoBall leaderboard.",
      alternates: { canonical: "/play" },
    });
  });

  it.each(Object.entries(categorySeo))(
    "gives the %s category its approved metadata",
    async (slug, expected) => {
      await expect(
        generateCategoryMetadata({ params: Promise.resolve({ slug }) }),
      ).resolves.toEqual({
        title: expected.title,
        description: expected.description,
        alternates: { canonical: expected.canonical },
      });
    },
  );

  it("marks unknown category slugs noindex without a canonical", async () => {
    await expect(
      generateCategoryMetadata({
        params: Promise.resolve({ slug: "not-a-sport" }),
      }),
    ).resolves.toEqual({
      robots: { index: false, follow: false },
    });
  });

  it("gives the leaderboard its approved metadata", () => {
    expect(leaderboardPage.metadata).toEqual({
      title: "Sports Trivia Leaderboard",
      description:
        "See how you rank against other YouKnoBall players by average Daily Challenge score, completion time, total plays, and recent results.",
      alternates: { canonical: "/leaderboard" },
    });
  });
});

describe("crawl controls", () => {
  it("allows public crawling while excluding only API, admin, and auth routes", async () => {
    const { default: robots } = await import("@/app/robots");

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/auth/"],
      },
      host: siteUrl,
      sitemap: `${siteUrl}/sitemap.xml`,
    });
  });

  it("publishes exactly the ten approved public URLs in the sitemap", async () => {
    const { default: sitemap } = await import("@/app/sitemap");

    expect(sitemap()).toEqual(
      publicRoutes.map((route) => ({
        url: `${siteUrl}${route}`,
      })),
    );
    expect(sitemap()).toHaveLength(10);
  });

  it.each([
    ["login", () => import("@/app/login/layout")],
    ["reset-password", () => import("@/app/reset-password/layout")],
    ["groups and descendants", () => import("@/app/groups/layout")],
    ["admin and descendants", () => import("@/app/admin/layout")],
  ])("marks %s noindex and nofollow", async (_route, loadLayout) => {
    const { metadata } = await loadLayout();

    expect(metadata).toEqual({
      robots: { index: false, follow: false },
    });
  });

  it("marks feedback noindex and nofollow while preserving its title", () => {
    expect(feedbackPage.metadata).toEqual({
      title: "Feedback",
      robots: { index: false, follow: false },
    });
  });
});
