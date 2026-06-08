# Sport Side Games Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Launch reusable, untimed five-question sport-specific quizzes, beginning with CFB, and include signed-in side-game results in personalized sport-card ordering.

**Architecture:** Keep side games separate from competitive daily challenges while reusing the canonical `sports` and `questions` tables. A server-side generator selects the same `easy, easy, medium, hard, hard` mix as the daily challenge, APIs serve player-safe questions and grade submissions, and separate side-game attempt tables persist signed-in results. Category pages use one reusable client quiz component for every sport and show an unavailable state when a bank is incomplete.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/Postgres, Vitest, Tailwind CSS.

---

### Task 1: Add Side-Game Attempt Tables

**Files:**
- Create: `supabase/migrations/202606080001_sport_quiz_attempts.sql`
- Create: `src/lib/__tests__/sportQuizMigration.test.ts`

**Step 1: Write the failing migration test**

Create `src/lib/__tests__/sportQuizMigration.test.ts` and assert that the migration:

- creates `public.sport_quiz_attempts`
- creates `public.sport_quiz_attempt_items`
- constrains attempts to five total questions and scores from zero to five
- references `auth.users`, `public.sports`, and `public.questions`
- enables row-level security on both tables
- creates authenticated select-own policies
- does not grant anonymous access

Use the existing source-file migration tests as the pattern:

```ts
const migration = await readFile(
  path.join(process.cwd(), "supabase/migrations/202606080001_sport_quiz_attempts.sql"),
  "utf8",
);

expect(migration).toContain("create table if not exists public.sport_quiz_attempts");
expect(migration).toContain("create table if not exists public.sport_quiz_attempt_items");
expect(migration).toContain("total_questions smallint not null check (total_questions = 5)");
expect(migration).not.toContain("grant select on public.sport_quiz_attempts to anon");
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/__tests__/sportQuizMigration.test.ts`

Expected: FAIL because the migration does not exist.

**Step 3: Write the migration**

Create the two tables:

```sql
create table if not exists public.sport_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  score smallint not null check (score between 0 and 5),
  total_questions smallint not null check (total_questions = 5),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sport_quiz_attempt_items (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.sport_quiz_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  chosen_option text not null check (chosen_option in ('A', 'B', 'C', 'D')),
  is_correct boolean not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (attempt_id, question_id)
);
```

Add indexes for `user_id`, `sport_id`, `attempt_id`, and `question_id`. Enable RLS. Add authenticated select-own policies; the item policy should use an `exists` check against the owning attempt. Grant authenticated users read-only access because writes happen through the verified server API and admin client.

**Step 4: Run the focused test**

Run: `npm test -- src/lib/__tests__/sportQuizMigration.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add supabase/migrations/202606080001_sport_quiz_attempts.sql src/lib/__tests__/sportQuizMigration.test.ts
git commit -m "feat: add sport quiz attempt storage"
```

### Task 2: Add Side-Game Domain Types, Validation, And Generator

**Files:**
- Create: `src/lib/sportQuiz.ts`
- Create: `src/lib/__tests__/sportQuiz.test.ts`
- Create: `src/lib/server/sportQuizGenerator.ts`
- Create: `src/lib/server/__tests__/sportQuizGenerator.test.ts`
- Modify: `src/lib/server/dailyChallengeGenerator.ts`

**Step 1: Write failing domain and generator tests**

Test these behaviors:

- the exported side-game slot mix equals `["easy", "easy", "medium", "hard", "hard"]`
- the generator returns five unique questions in that exact mix
- recent question IDs are avoided when enough fresh questions exist
- recent questions are reused only when needed to complete the run
- incomplete difficulty banks return `null`
- player-facing questions omit `correct_option`
- submissions require exactly the generated five question IDs and valid A-D answers
- grading returns score, total, and per-question correctness

The generator should accept an injected random function so tests remain deterministic:

```ts
generateSportQuizQuestions({
  candidates,
  recentQuestionIds,
  random: () => 0,
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/__tests__/sportQuiz.test.ts src/lib/server/__tests__/sportQuizGenerator.test.ts
```

Expected: FAIL because the modules do not exist.

**Step 3: Export the shared difficulty mix**

Rename or alias the daily-only constant in `src/lib/server/dailyChallengeGenerator.ts` so both generators use one canonical mix:

```ts
export const FIVE_QUESTION_DIFFICULTY_MIX = [
  "easy",
  "easy",
  "medium",
  "hard",
  "hard",
] as const;
```

Keep the daily generator behavior unchanged.

**Step 4: Implement domain helpers**

In `src/lib/sportQuiz.ts`, add:

- player-safe question and response types
- start response union: `ready | unavailable`
- submit response type with `saved`, score, total, and results
- recent-question ID parser capped to a reasonable count, such as 25
- submitted-answer parser
- `toSportQuizPlayerQuestion`
- `gradeSportQuizAttempt`

Do not include `correct_option` in any start-response type.

**Step 5: Implement the pure generator**

In `src/lib/server/sportQuizGenerator.ts`:

- group candidates by difficulty
- put fresh candidates ahead of recent candidates within each group
- shuffle candidates with the injected random function
- select unique questions for each slot in the shared mix
- return `null` if any slot cannot be filled

**Step 6: Run focused tests**

Run:

```bash
npm test -- src/lib/__tests__/sportQuiz.test.ts src/lib/server/__tests__/sportQuizGenerator.test.ts src/lib/__tests__/dailyChallengeGenerator.test.ts
```

Expected: PASS with daily challenge behavior unchanged.

**Step 7: Commit**

```bash
git add src/lib/sportQuiz.ts src/lib/__tests__/sportQuiz.test.ts src/lib/server/sportQuizGenerator.ts src/lib/server/__tests__/sportQuizGenerator.test.ts src/lib/server/dailyChallengeGenerator.ts
git commit -m "feat: add reusable sport quiz generator"
```

### Task 3: Add Sport-Quiz Repository Operations

**Files:**
- Create: `src/lib/server/sportQuizRepository.ts`
- Create: `src/lib/server/__tests__/sportQuizRepository.test.ts`

**Step 1: Write failing repository tests**

Test:

- loading a known active sport and only its ready, `eligible_for_sport_quiz` questions
- loading recent signed-in question IDs from recent side-game attempt items
- returning unavailable when the sport is unknown or the bank cannot fill the mix
- reloading submitted question IDs and rejecting questions from another sport
- rejecting a submission whose difficulty mix is not exactly 2 easy, 1 medium, 2 hard
- grading guest submissions without inserting rows
- inserting one attempt and five item rows for a verified signed-in user

Mock `supabaseAdmin()` using the query-builder pattern from `dailyChallengeRepository.test.ts`.

**Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/server/__tests__/sportQuizRepository.test.ts`

Expected: FAIL because the repository does not exist.

**Step 3: Implement start operations**

Add repository methods:

```ts
getSportQuizForPlayer({
  slug,
  userId,
  clientRecentQuestionIds,
}): Promise<SportQuizStartResponse>
```

The method should:

- normalize the supported category slug
- load the active sport
- load ready, side-game-eligible questions for that sport
- combine recent server history with capped client recent IDs
- call the pure generator
- return player-safe questions or an unavailable response

**Step 4: Implement submission operations**

Add:

```ts
submitSportQuizAttempt({
  slug,
  userId,
  answers,
}): Promise<SportQuizSubmitResponse>
```

The method should:

- load all submitted question records with their sport
- validate exactly five unique supported question IDs
- validate the requested sport and exact difficulty mix
- grade server-side
- return `saved: false` for guests
- insert the attempt and five item rows for signed-in users

If item insertion fails after attempt insertion, delete the incomplete attempt before rethrowing.

**Step 5: Run the focused repository test**

Run: `npm test -- src/lib/server/__tests__/sportQuizRepository.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/server/sportQuizRepository.ts src/lib/server/__tests__/sportQuizRepository.test.ts
git commit -m "feat: add sport quiz repository"
```

### Task 4: Add Start And Submit APIs

**Files:**
- Create: `src/app/api/sport-quiz/[slug]/route.ts`
- Create: `src/app/api/sport-quiz/[slug]/route.test.ts`
- Create: `src/app/api/sport-quiz/[slug]/submit/route.ts`
- Create: `src/app/api/sport-quiz/[slug]/submit/route.test.ts`

**Step 1: Write failing start-route tests**

Test:

- guests receive a generated quiz and their client recent IDs are passed through
- verified signed-in users pass their verified user ID to the repository
- forged cookie user IDs are not trusted
- unknown slugs return 404
- unavailable banks return status 200 with `status: "unavailable"`
- repository failures return a retryable unavailable response

**Step 2: Write failing submit-route tests**

Test:

- malformed or incomplete answers return 400
- guests are graded with `userId: null`
- signed-in users are verified with `createSessionSupabaseServerClient(...).auth.getUser()`
- valid signed-in submissions return `saved: true`
- invalid sport or question sets return 400/404 without saving

**Step 3: Run route tests to verify they fail**

Run:

```bash
npm test -- src/app/api/sport-quiz/[slug]/route.test.ts src/app/api/sport-quiz/[slug]/submit/route.test.ts
```

Expected: FAIL because the routes do not exist.

**Step 4: Implement the routes**

Use `getSupabaseSessionFromRequest`, but verify signed-in users with `createSessionSupabaseServerClient(session.accessToken).auth.getUser()` before passing a user ID to persistence. Guests remain supported if no valid session exists.

Start body:

```ts
{ recentQuestionIds?: unknown }
```

Submit body:

```ts
{ answers?: unknown }
```

Do not return correct answers from the start route.

**Step 5: Run focused route tests**

Run:

```bash
npm test -- src/app/api/sport-quiz/[slug]/route.test.ts src/app/api/sport-quiz/[slug]/submit/route.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/app/api/sport-quiz
git commit -m "feat: add sport quiz APIs"
```

### Task 5: Include Side Games In Personalized Sport Performance

**Files:**
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/lib/server/__tests__/dailyChallengeRepository.test.ts`

**Step 1: Write the failing performance test**

Extend the existing `getPlayerSportCategoryPerformance` tests with daily and side-game attempts for the same sport. Assert that:

- answered and correct counts are combined
- side-game-only sports are returned
- the latest timestamp across both sources becomes `lastAnsweredAt`
- unsupported sport slugs remain excluded

Example expected aggregate:

```ts
[
  { slug: "cfb", answeredCount: 5, correctCount: 4, lastAnsweredAt: "2026-06-08T12:00:00Z" },
  { slug: "nfl", answeredCount: 7, correctCount: 5, lastAnsweredAt: "2026-06-08T13:00:00Z" },
]
```

**Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/lib/server/__tests__/dailyChallengeRepository.test.ts`

Expected: FAIL because only daily attempts are aggregated.

**Step 3: Extend performance aggregation**

In `getPlayerSportCategoryPerformance`:

- keep the existing daily attempt aggregation
- load recent `sport_quiz_attempts` for the user
- load the referenced sports to map IDs to supported slugs
- add each attempt's `total_questions` and `score` to the same aggregate
- use `created_at` for side-game recency

Keep the existing card-ranking minimum and ordering logic unchanged.

**Step 4: Run focused tests**

Run:

```bash
npm test -- src/lib/server/__tests__/dailyChallengeRepository.test.ts src/app/api/sport-cards/order/route.test.ts src/lib/__tests__/categories.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/server/dailyChallengeRepository.ts src/lib/server/__tests__/dailyChallengeRepository.test.ts
git commit -m "feat: include side games in sport performance"
```

### Task 6: Build The Reusable Category Quiz UI

**Files:**
- Create: `src/components/SportQuiz.tsx`
- Create: `src/components/__tests__/SportQuiz.test.ts`
- Modify: `src/app/categories/[slug]/page.tsx`
- Create: `src/app/categories/[slug]/page.test.ts`

**Step 1: Write failing source-level UI tests**

Following the repository's current source-file UI test pattern, assert:

- the category page renders `SportQuiz`
- the old preview-only copy is removed
- `SportQuiz` calls `/api/sport-quiz/${slug}` and `/api/sport-quiz/${slug}/submit`
- the component includes loading, unavailable, playing, submitting, results, and error states
- the component renders five questions and A-D answer controls
- **Submit Answers**, **Play Again**, and **Back to categories** actions exist
- no timer or leaderboard copy exists
- recent IDs use a slug-specific local-storage key and are capped

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/components/__tests__/SportQuiz.test.ts src/app/categories/[slug]/page.test.ts
```

Expected: FAIL because the reusable quiz component does not exist and the page is still a preview.

**Step 3: Implement `SportQuiz`**

Build a client component that:

- loads a run on mount
- reads and sends guest recent question IDs
- requires all five answers before submitting
- submits selected answers without any timer data
- displays score and per-question correctness after submission
- appends completed question IDs to capped local history
- resets state and requests a fresh run on **Play Again**
- keeps layout stable and readable on mobile and desktop

Use the existing daily play page's question and option styling as the behavioral reference, but omit timer, sharing, leaderboard, display-name, and guest-claim flows.

**Step 4: Replace the category preview**

Keep the category title, eyebrow, and description as the page identity. Replace the preview panel with the reusable quiz component:

```tsx
<SportQuiz slug={category.slug} title={category.title} />
```

**Step 5: Run focused UI tests**

Run:

```bash
npm test -- src/components/__tests__/SportQuiz.test.ts src/app/categories/[slug]/page.test.ts
```

Expected: PASS.

**Step 6: Run the dev server and inspect CFB**

Run: `npm run dev`

Inspect:

- `/categories/cfb` on desktop
- `/categories/cfb` at a small mobile viewport
- a category without enough questions
- guest submission and replay
- signed-in submission and replay

Confirm that text does not overlap, cards do not resize while answers/results change, and no timer or leaderboard elements appear.

**Step 7: Commit**

```bash
git add src/components/SportQuiz.tsx src/components/__tests__/SportQuiz.test.ts src/app/categories/[slug]/page.tsx src/app/categories/[slug]/page.test.ts
git commit -m "feat: launch sport side game UI"
```

### Task 7: Verify And Apply The Database Migration

**Files:**
- No new files expected

**Step 1: Run focused side-game tests**

Run:

```bash
npm test -- src/lib/__tests__/sportQuizMigration.test.ts src/lib/__tests__/sportQuiz.test.ts src/lib/server/__tests__/sportQuizGenerator.test.ts src/lib/server/__tests__/sportQuizRepository.test.ts src/app/api/sport-quiz/[slug]/route.test.ts src/app/api/sport-quiz/[slug]/submit/route.test.ts src/components/__tests__/SportQuiz.test.ts src/app/categories/[slug]/page.test.ts
```

Expected: PASS.

**Step 2: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit successfully.

**Step 3: Request code review**

Use `@superpowers:requesting-code-review` and address any correctness, security, or missing-test findings before database deployment.

**Step 4: Check linked migration status**

Run: `npx supabase migration list`

Expected: `202606080001` appears locally and is pending remotely.

**Step 5: Apply the migration after explicit approval**

Run: `npx supabase db push`

Expected: `202606080001_sport_quiz_attempts.sql` applies successfully.

**Step 6: Verify remote migration status**

Run: `npx supabase migration list`

Expected: local and remote migration versions match.

**Step 7: Final smoke test**

Run the app against the linked Supabase project and verify:

- CFB starts with 2 easy, 1 medium, and 2 hard questions
- guests receive results but create no attempt rows
- signed-in runs create one attempt and five item rows
- **Play Again** produces a fresh run when enough unseen questions exist
- signed-in side-game performance can affect homepage sport-card ordering

**Step 8: Commit any verification fixes**

```bash
git add <only files changed by verification fixes>
git commit -m "fix: finish sport side game verification"
```
