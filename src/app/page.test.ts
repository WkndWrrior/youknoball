import { readFile } from "node:fs/promises";
import path from "node:path";

import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { WebsiteStructuredData } from "@/components/WebsiteStructuredData";

describe("home page layout", () => {
  it("puts the daily challenge hero before category sections and leaderboard", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );

    const heroIndex = source.indexOf('data-home-section="daily-hero"');
    const leaderboardIndex = source.indexOf('data-home-section="leaderboard-preview"');
    const categoriesIndex = source.indexOf('data-home-section="category-lanes"');

    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(categoriesIndex).toBeGreaterThan(heroIndex);
    expect(leaderboardIndex).toBeGreaterThan(categoriesIndex);
    expect(source).toContain("Today&apos;s challenge");
    expect(source).toContain("Play today’s all-sports challenge as a guest.");
    expect(source).toContain(
      "Prove that you kno ball. Climb the leaderboard and see where you rank when the day settles.",
    );
    expect(source).toContain("getSupabaseSessionFromCookieValue");
    expect(source).toContain("Play Now");
    expect(source).toContain("View Leaderboard");
    expect(source).toContain("The board follows the run.");
    expect(source).not.toContain("Ready to run.");
    expect(source).not.toContain("Not live yet.");
    expect(source).not.toContain("5 questions, all sports.");
    expect(source).not.toContain("Timed signed-in runs rank.");
    expect(source).not.toContain("Guests can play instantly.");
    expect(source).toContain("px-4 pt-5 pb-6 sm:px-6 sm:pt-6 sm:pb-10");
    expect(source).toContain("min-h-[calc(100svh-10rem)]");
    expect(source).toContain("sm:min-h-[calc(100svh-10rem)]");
    expect(source).toContain("lg:min-h-[calc(100svh-10rem)]");
    expect(source).toContain("whitespace-nowrap");
    expect(source).toContain("text-[clamp(2.35rem,11.5vw,3rem)]");
    expect(source).toContain("sm:text-[5.52rem]");
    expect(source).toContain("lg:text-[6.44rem]");
    expect(source).toContain("inline-flex w-full");
    expect(source).toContain("sm:w-auto sm:px-10 sm:py-6 sm:text-lg");
    expect(source).toContain('className="mx-auto w-full max-w-5xl text-center"');
    expect(source).toContain("mx-auto mt-8 max-w-5xl");
    expect(source).toContain("mx-auto mt-8 max-w-3xl");
    expect(source).toContain("justify-center");
    expect(source).toContain("rounded-[1.75rem]");
    expect(source).toContain("sm:rounded-[2.25rem]");
    expect(source).toContain("rounded-[2rem]");
    expect(source).toContain('className="mx-auto mt-10 w-full max-w-6xl sm:mt-12"');
    expect(source).toContain("Stay in yo lane");
    expect(source).toContain(
      "Sport-specific quizzes with fresh questions across the games you follow closest.",
    );
    expect(source).not.toContain("More lanes");
    expect(source).not.toContain("Daily challenge first.");
    expect(source).not.toContain("Category universes next.");
    expect(source).toContain("SportCategoryCards");
  });

  it("renders exactly one static WebSite JSON-LD script", () => {
    const elements = Children.toArray(WebsiteStructuredData());

    expect(elements).toHaveLength(1);
    expect(isValidElement(elements[0])).toBe(true);

    const script = elements[0] as ReactElement<{
      type: string;
      dangerouslySetInnerHTML: { __html: string };
    }>;

    expect(script.type).toBe("script");
    expect(script.props.type).toBe("application/ld+json");
    expect(JSON.parse(script.props.dangerouslySetInnerHTML.__html)).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "YouKnoBall",
      url: "https://youknoball.com/",
    });
  });
});
