# Timed Leaderboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add server-timed leaderboard eligibility so only signed-in attempts finished inside the timed window rank publicly.

**Architecture:** Add timer helpers in `src/lib/challengeTimer.ts`, persist start rows in Supabase, compute eligibility on the submit route from server timestamps, and update leaderboard sorting/UI to include average time. The client displays timer state but never controls leaderboard eligibility.

**Tech Stack:** Next.js App Router, React client component, Supabase Postgres/RLS, Vitest.

---

### Task 1: Timer Helpers

**Files:**
- Create: `src/lib/challengeTimer.ts`
- Create: `src/lib/__tests__/challengeTimer.test.ts`

**Steps:**
1. Write failing tests for duration calculation, remaining time, eligibility, and `MM:SS` formatting.
2. Run `npm test -- src/lib/__tests__/challengeTimer.test.ts` and confirm failure.
3. Implement helper functions and constants.
4. Re-run the targeted test and confirm pass.

### Task 2: Schema and Leaderboard Contract

**Files:**
- Create: `supabase/migrations/202605020001_timed_leaderboard.sql`
- Modify: `src/lib/leaderboard.ts`
- Modify: `src/lib/__tests__/leaderboard.test.ts`
- Modify: `src/components/LeaderboardTable.tsx`

**Steps:**
1. Add tests expecting `average_duration_ms` sorting and migration SQL for `daily_attempt_starts`, `duration_ms`, and `leaderboard_eligible`.
2. Run `npm test -- src/lib/__tests__/leaderboard.test.ts` and confirm failure.
3. Add the migration and leaderboard type/sort updates.
4. Update the table to show average time.
5. Re-run the targeted test and confirm pass.

### Task 3: Server Attempt Start and Submit Eligibility

**Files:**
- Modify: `src/lib/dailyChallenge.ts`
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/app/api/challenge/today/route.ts`
- Modify: `src/app/api/challenge/today/route.test.ts`
- Modify: `src/app/api/attempt/submit/route.ts`
- Modify: `src/app/api/attempt/submit/route.test.ts`

**Steps:**
1. Add failing route tests for signed-in challenge load creating/reusing a timer and signed-in submit saving `duration_ms` and `leaderboard_eligible`.
2. Run targeted API tests and confirm failure.
3. Add repository helpers for start rows and duration fields.
4. Update challenge response types and submit response status.
5. Re-run targeted API tests and confirm pass.

### Task 4: Play Page Timer UI

**Files:**
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/play/page.test.ts`

**Steps:**
1. Add a failing source-level test for timer UI strings and leaderboard status handling.
2. Run `npm test -- src/app/play/page.test.ts` and confirm failure.
3. Add timer display, expired/casual messaging, and result status conditions.
4. Re-run the targeted test and confirm pass.

### Task 5: Verification

**Commands:**
- `npm test`
- `npm run lint`
- `npm run build`

If the sandbox build hits the known Turbopack port-binding failure, rerun the build outside the sandbox.
