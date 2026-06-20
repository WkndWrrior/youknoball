# MLB Category Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add MLB as a normal sport category, seed a verified MLB question bank, and allow MLB to appear in the daily challenge without making it a priority sport.

**Architecture:** Reuse the existing category metadata, question-bank migration, side-game API, and daily generator. MLB is just another active sport with ready questions; the daily generator keeps NBA and NFL as the only target sports, so MLB can appear through normal variety and freshness scoring but is not forced into daily coverage.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres migrations, Vitest.

---

### Task 1: Add MLB Category Metadata

**Files:**
- Modify: `src/lib/categories.ts`
- Modify: `src/lib/__tests__/categories.test.ts`

**Step 1: Write the failing test**

Add a test asserting that `sportsCategories` includes MLB after NHL with approved copy and that the no-history default order ends with MLB.

Run: `npm test -- src/lib/__tests__/categories.test.ts`

Expected: FAIL because `mlb` is not a valid category slug and no MLB card exists.

**Step 2: Implement the category**

Add `mlb` to `CategoryCard["slug"]` and append an MLB category object after NHL.

**Step 3: Verify**

Run: `npm test -- src/lib/__tests__/categories.test.ts`

Expected: PASS.

**Step 4: Commit**

Run:

```bash
git add src/lib/categories.ts src/lib/__tests__/categories.test.ts
git commit -m "feat: add mlb category card"
```

### Task 2: Add MLB Question Bank

**Files:**
- Create: `supabase/migrations/202606200001_mlb_question_bank.sql`
- Create: `src/lib/__tests__/mlbQuestionBank.test.ts`

**Step 1: Write the failing migration test**

Assert that the migration inserts active sport `mlb`/`MLB`, includes 30 question values, includes 10 easy, 10 medium, and 10 hard rows, and marks questions eligible for both daily and sport quiz play.

Run: `npm test -- src/lib/__tests__/mlbQuestionBank.test.ts`

Expected: FAIL because the migration does not exist.

**Step 2: Implement the migration**

Create a migration using the existing CFB seed pattern. Use source notes on every question.

**Step 3: Verify**

Run: `npm test -- src/lib/__tests__/mlbQuestionBank.test.ts`

Expected: PASS.

**Step 4: Commit**

Run:

```bash
git add supabase/migrations/202606200001_mlb_question_bank.sql src/lib/__tests__/mlbQuestionBank.test.ts
git commit -m "feat: add mlb question bank"
```

### Task 3: Lock Daily Generator MLB Behavior

**Files:**
- Modify: `src/lib/__tests__/dailyChallengeGenerator.test.ts`
- Keep production behavior in `src/lib/server/dailyChallengeGenerator.ts` unless a test exposes a gap.

**Step 1: Write failing or protective tests**

Add tests proving:

- MLB can be selected when it is the best non-target variety option.
- NBA and NFL remain preferred target sports over MLB when the lineup otherwise ties.

Run: `npm test -- src/lib/__tests__/dailyChallengeGenerator.test.ts`

Expected: tests should protect the existing intended behavior; if one fails, make the minimal generator change.

**Step 2: Verify**

Run: `npm test -- src/lib/__tests__/dailyChallengeGenerator.test.ts`

Expected: PASS.

**Step 3: Commit**

Run:

```bash
git add src/lib/__tests__/dailyChallengeGenerator.test.ts src/lib/server/dailyChallengeGenerator.ts
git commit -m "test: lock mlb daily challenge priority"
```

### Task 4: Final Verification

Run:

```bash
npm test
npm run lint
npm run build
npx supabase migration list
git diff --check
```

Expected: all pass, and Supabase shows the new local MLB migration pending until pushed.
