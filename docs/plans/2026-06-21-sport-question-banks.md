# Sport Question Banks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dedicated NBA, CBB, NFL, and NHL seed banks so every sport category has a reliable five-question side quiz.

**Architecture:** The quiz UI and API are already generic. This work only adds seed migrations and migration tests, plus a small update to the pending MLB migration to include the supplied Mariano Rivera postseason prompt.

**Tech Stack:** Supabase/Postgres migrations, TypeScript, Vitest.

---

### Task 1: Write Failing Migration Tests

**Files:**
- Create: `src/lib/__tests__/sportQuestionBanks.test.ts`
- Modify: `src/lib/__tests__/mlbQuestionBank.test.ts`

**Steps:**
1. Add tests for four new migrations:
   - `202606210001_nba_question_bank.sql`
   - `202606210002_cbb_question_bank.sql`
   - `202606210003_nfl_question_bank.sql`
   - `202606210004_nhl_question_bank.sql`
2. Assert each has 30 total questions and 10 per difficulty.
3. Assert supplied prompts are present.
4. Assert NFL Super Bowl prompts include numeric parentheses.
5. Assert MLB migration includes the Mariano Rivera postseason prompt.
6. Run focused tests and confirm they fail because migrations/prompts are missing.

### Task 2: Seed NBA And CBB Banks

**Files:**
- Create: `supabase/migrations/202606210001_nba_question_bank.sql`
- Create: `supabase/migrations/202606210002_cbb_question_bank.sql`

**Steps:**
1. Seed NBA with 30 sourced questions.
2. Seed CBB with 30 sourced questions.
3. Run focused tests until NBA/CBB assertions pass.
4. Commit the NBA/CBB slice.

### Task 3: Seed NFL And NHL Banks

**Files:**
- Create: `supabase/migrations/202606210003_nfl_question_bank.sql`
- Create: `supabase/migrations/202606210004_nhl_question_bank.sql`

**Steps:**
1. Seed NFL with 30 sourced questions and Super Bowl numeric parentheses.
2. Seed NHL with 30 sourced questions.
3. Run focused tests until NFL/NHL assertions pass.
4. Commit the NFL/NHL slice.

### Task 4: Update Pending MLB Bank

**Files:**
- Modify: `supabase/migrations/202606200001_mlb_question_bank.sql`
- Modify: `src/lib/__tests__/mlbQuestionBank.test.ts`

**Steps:**
1. Add the Mariano Rivera postseason earned-runs prompt by replacing one existing hard MLB row.
2. Run focused MLB test.
3. Commit the MLB prompt update.

### Task 5: Final Verification

Run:

```bash
npm test
npm run lint
npm run build
npx supabase migration list
git diff --check
```

Expected: all checks pass. Migration list should show the new local migrations pending until applied.
