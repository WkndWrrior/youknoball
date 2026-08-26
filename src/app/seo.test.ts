import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as homePage from "@/app/page";
import * as categoriesPage from "@/app/categories/page";
import {
  generateMetadata as generateCategoryMetadata,
} from "@/app/categories/[slug]/page";
import * as leaderboardPage from "@/app/leaderboard/page";
import { categorySeo, homepageDescription, homepageTitle } from "@/lib/seo";

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

  it("provides approved metadata for the client-rendered play page", async () => {
    const layoutPath = path.join(process.cwd(), "src/app/play/layout.tsx");

    expect(existsSync(layoutPath)).toBe(true);
    if (!existsSync(layoutPath)) return;

    const source = await readFile(layoutPath, "utf8");

    expect(source).toContain("export const metadata: Metadata");
    expect(source).toContain('title: "Daily Sports Trivia Challenge"');
    expect(source).toContain(
      "Play today’s free five-question sports trivia challenge, test your all-sports knowledge, and compete on the YouKnoBall leaderboard.",
    );
    expect(source).toContain('alternates: { canonical: "/play" }');
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
