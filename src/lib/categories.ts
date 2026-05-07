export type CategoryCard = {
  slug: "nba" | "cbb" | "nfl" | "nhl";
  title: string;
  eyebrow: string;
  description: string;
};

export const sportsCategories: CategoryCard[] = [
  {
    slug: "nba",
    title: "NBA",
    eyebrow: "Shot diet",
    description: "Daily challenge energy, but tuned for league-pass addicts and playoff overreactors.",
  },
  {
    slug: "cbb",
    title: "CBB",
    eyebrow: "Bracket brain",
    description: "Campus hoops trivia built for the people who remember bids, bubbles, and bad beats.",
  },
  {
    slug: "nfl",
    title: "NFL",
    eyebrow: "Sunday tape",
    description: "You been watching film huh? That's cool, watch this",
  },
  {
    slug: "nhl",
    title: "NHL",
    eyebrow: "Puck IQ",
    description: "Cold-rink knowledge for fans who care about line combos, goalie heaters, and chaos.",
  },
];

export type SportCategorySlug = CategoryCard["slug"];

export type SportCategoryPerformance = {
  slug: string;
  answeredCount: number;
  correctCount: number;
  lastAnsweredAt: string | null;
};

export const sportCardMinimumAnsweredQuestions = 3;

function getAccuracy(row: SportCategoryPerformance) {
  return row.answeredCount > 0 ? row.correctCount / row.answeredCount : 0;
}

function getTime(value: string | null) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function rankSportsCategoriesByPerformance(
  categories: CategoryCard[],
  performanceRows: SportCategoryPerformance[],
) {
  const defaultRank = new Map(categories.map((category, index) => [category.slug, index]));
  const performanceBySlug = new Map(
    performanceRows.map((row) => [row.slug.trim().toLowerCase(), row]),
  );

  return [...categories].sort((left, right) => {
    const leftPerformance = performanceBySlug.get(left.slug);
    const rightPerformance = performanceBySlug.get(right.slug);
    const leftEligible =
      Boolean(leftPerformance) &&
      leftPerformance!.answeredCount >= sportCardMinimumAnsweredQuestions;
    const rightEligible =
      Boolean(rightPerformance) &&
      rightPerformance!.answeredCount >= sportCardMinimumAnsweredQuestions;

    if (leftEligible !== rightEligible) {
      return leftEligible ? -1 : 1;
    }

    if (leftEligible && rightEligible && leftPerformance && rightPerformance) {
      const accuracyDelta = getAccuracy(rightPerformance) - getAccuracy(leftPerformance);
      if (accuracyDelta !== 0) return accuracyDelta;

      const sampleDelta = rightPerformance.answeredCount - leftPerformance.answeredCount;
      if (sampleDelta !== 0) return sampleDelta;

      const recencyDelta =
        getTime(rightPerformance.lastAnsweredAt) - getTime(leftPerformance.lastAnsweredAt);
      if (recencyDelta !== 0) return recencyDelta;
    }

    return (defaultRank.get(left.slug) ?? 0) - (defaultRank.get(right.slug) ?? 0);
  });
}

export function getCategoryBySlug(slug: string) {
  return sportsCategories.find((category) => category.slug === slug) ?? null;
}
