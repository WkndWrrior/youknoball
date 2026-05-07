# Personalized Sport Cards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorder the homepage sport cards for signed-in players based on sports where they have performed well, while keeping all visible sport-card copy general.

**Architecture:** Keep the homepage server render stable with the default card order. Add a pure ranking helper for card ordering, a server API route that derives the signed-in user's sport performance from saved attempts plus canonical challenge item snapshots, and a small client component that fetches ordered slugs after hydration. If auth, history, or data lookup is unavailable, the card grid stays in the default order.

**Tech Stack:** Next.js App Router, React client component, Supabase server/admin clients, Vitest.

---

### Task 1: Sport Card Ranking Helper And Copy

**Files:**
- Modify: `src/lib/categories.ts`
- Create: `src/lib/__tests__/categories.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/__tests__/categories.test.ts`:

```ts
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

  it("breaks strength ties by sample size, recency, then default order", () => {
    const ranked = rankSportsCategoriesByPerformance(sportsCategories, [
      { slug: "nba", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-01" },
      { slug: "nfl", answeredCount: 6, correctCount: 4, lastAnsweredAt: "2026-05-02" },
      { slug: "nhl", answeredCount: 4, correctCount: 3, lastAnsweredAt: "2026-05-03" },
    ]);

    expect(ranked.map((category) => category.slug)).toEqual(["nhl", "nba", "nfl", "cbb"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/categories.test.ts`

Expected: FAIL because `rankSportsCategoriesByPerformance` does not exist and the NFL copy still uses the old text.

**Step 3: Implement the helper**

In `src/lib/categories.ts`, update the NFL description exactly and add:

```ts
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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/categories.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/categories.ts src/lib/__tests__/categories.test.ts
git commit -m "feat: rank sport cards by player strength"
```

### Task 2: Derive Player Sport Performance Server-Side

**Files:**
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/lib/server/__tests__/dailyChallengeRepository.test.ts`

**Step 1: Write the failing test**

In `src/lib/server/__tests__/dailyChallengeRepository.test.ts`, import `getPlayerSportCategoryPerformance` and add a focused test. Extend `createThenableQuery` with `query.not = vi.fn(() => query);` only if the implementation uses `.not(...)`.

```ts
it("derives signed-in player sport performance from canonical attempts", async () => {
  const adminClient = createClientMock({
    daily_attempts: createThenableQuery({
      data: [
        {
          daily_challenge_id: "challenge_1",
          challenge_date: "2026-05-01",
          answers: {
            question_nba: "A",
            question_nfl: "B",
            question_nhl: "C",
          },
        },
        {
          daily_challenge_id: "challenge_2",
          challenge_date: "2026-05-02",
          answers: {
            question_nfl_2: "A",
          },
        },
      ],
      error: null,
    }),
    daily_challenge_items: createThenableQuery({
      data: [
        {
          daily_challenge_id: "challenge_1",
          question_id: "question_nba",
          question_snapshot: {
            id: "question_nba",
            question_text: "NBA",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "A",
            sport: { slug: "nba", name: "NBA" },
          },
        },
        {
          daily_challenge_id: "challenge_1",
          question_id: "question_nfl",
          question_snapshot: {
            id: "question_nfl",
            question_text: "NFL",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "C",
            sport: { slug: "nfl", name: "NFL" },
          },
        },
        {
          daily_challenge_id: "challenge_2",
          question_id: "question_nfl_2",
          question_snapshot: {
            id: "question_nfl_2",
            question_text: "NFL 2",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "A",
            sport: { slug: "nfl", name: "NFL" },
          },
        },
      ],
      error: null,
    }),
  });
  supabaseAdmin.mockReturnValue(adminClient);

  await expect(getPlayerSportCategoryPerformance("user_1")).resolves.toEqual([
    { slug: "nba", answeredCount: 1, correctCount: 1, lastAnsweredAt: "2026-05-01" },
    { slug: "nfl", answeredCount: 2, correctCount: 1, lastAnsweredAt: "2026-05-02" },
  ]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/__tests__/dailyChallengeRepository.test.ts`

Expected: FAIL because `getPlayerSportCategoryPerformance` is not exported.

**Step 3: Implement the repository method**

In `src/lib/server/dailyChallengeRepository.ts`, add an exported function that:

- Uses `supabaseAdmin()`.
- Reads recent attempts with `select("daily_challenge_id,challenge_date,answers")`, `.eq("user_id", userId)`, `.order("challenge_date", { ascending: false })`, `.limit(50)`.
- Filters out attempts without `daily_challenge_id`.
- Reads `daily_challenge_items` for those challenge IDs with `select("daily_challenge_id,question_id,question_snapshot")`.
- For each answered question, increments a per-sport aggregate using `question_snapshot.sport.slug`, `question_snapshot.correct_option`, and the submitted answer.
- Returns rows sorted by slug for deterministic tests.

Use existing local helpers where possible: `throwIfError`, `isRecord`, and `isAnswerOption`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/__tests__/dailyChallengeRepository.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/server/dailyChallengeRepository.ts src/lib/server/__tests__/dailyChallengeRepository.test.ts
git commit -m "feat: derive sport card performance"
```

### Task 3: Sport Card Order API

**Files:**
- Create: `src/app/api/sport-cards/order/route.ts`
- Create: `src/app/api/sport-cards/order/route.test.ts`

**Step 1: Write the failing tests**

Create `src/app/api/sport-cards/order/route.test.ts` that mocks:

- `getSupabaseSessionFromRequest`
- `getPlayerSportCategoryPerformance`

Test these cases:

- No session returns default slugs `["nba", "cbb", "nfl", "nhl"]`.
- Signed-in session returns slugs ranked by performance.
- Repository failure returns default slugs.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/sport-cards/order/route.test.ts`

Expected: FAIL because the route does not exist.

**Step 3: Implement the route**

Create `src/app/api/sport-cards/order/route.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";

import {
  rankSportsCategoriesByPerformance,
  sportsCategories,
} from "@/lib/categories";
import { getPlayerSportCategoryPerformance } from "@/lib/server/dailyChallengeRepository";
import { getSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";

export const dynamic = "force-dynamic";

function defaultSlugs() {
  return sportsCategories.map((category) => category.slug);
}

export async function GET(request: NextRequest) {
  const session = getSupabaseSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ slugs: defaultSlugs() });
  }

  try {
    const performance = await getPlayerSportCategoryPerformance(session.user.id);
    const categories = rankSportsCategoriesByPerformance(sportsCategories, performance);

    return NextResponse.json({
      slugs: categories.map((category) => category.slug),
    });
  } catch {
    return NextResponse.json({ slugs: defaultSlugs() });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/sport-cards/order/route.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/sport-cards/order/route.ts src/app/api/sport-cards/order/route.test.ts
git commit -m "feat: expose personalized sport card order"
```

### Task 4: Client Sport Card Grid

**Files:**
- Create: `src/components/SportCategoryCards.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.ts`

**Step 1: Write the failing test**

Update `src/app/page.test.ts` to keep the existing section-order checks and also expect:

```ts
expect(source).toContain("SportCategoryCards");
```

Create a lightweight source test or component test only if the project already has a stable client component render pattern. Otherwise, rely on the API/helper tests plus the homepage source test.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/page.test.ts`

Expected: FAIL because `SportCategoryCards` is not used yet.

**Step 3: Implement the client component**

Create `src/components/SportCategoryCards.tsx` with a client component that renders default cards immediately, fetches `/api/sport-cards/order` on mount, validates returned slugs, and reorders cards in memory. It should not show loading text or expose personalization.

In `src/app/page.tsx`, keep the existing `data-home-section="category-lanes"` section and heading copy. Replace the inline `sportsCategories.map(...)` grid with `<SportCategoryCards />`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/page.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/SportCategoryCards.tsx src/app/page.tsx src/app/page.test.ts
git commit -m "feat: personalize homepage sport cards"
```

### Task 5: Verification

**Files:**
- No edits expected.

**Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/__tests__/categories.test.ts src/lib/server/__tests__/dailyChallengeRepository.test.ts src/app/api/sport-cards/order/route.test.ts src/app/page.test.ts
```

Expected: PASS.

**Step 2: Run full validation**

Run:

```bash
npm test
npm run build
```

Expected: PASS. If the sandbox hits a known Next/Turbopack or network-related environment issue, capture the exact failure and rerun only when appropriate permissions are available.

**Step 3: Final commit if needed**

If verification requires small fixes, commit them:

```bash
git add <changed-files>
git commit -m "fix: stabilize personalized sport cards"
```
