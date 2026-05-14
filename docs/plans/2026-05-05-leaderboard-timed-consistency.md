# Leaderboard Timed Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make leaderboard score, time, and plays refer to the same timed eligible attempts.

**Architecture:** Add a new Supabase migration because the prior timed leaderboard migration has already been applied. Update group leaderboard aggregation to ignore eligible rows without `duration_ms`, and tighten the shared table layout with fixed right-aligned stat columns.

**Tech Stack:** Next.js App Router, Supabase SQL migrations, Vitest, Tailwind CSS.

---

### Task 1: Public Leaderboard Migration

**Files:**
- Create: `supabase/migrations/202605050001_leaderboard_timed_attempt_filter.sql`
- Modify: `src/lib/__tests__/leaderboard.test.ts`

**Steps:**
1. Add a failing test that expects the corrective migration to drop/recreate `public.daily_leaderboard` and filter `a.duration_ms is not null`.
2. Run `npm test -- src/lib/__tests__/leaderboard.test.ts` and verify it fails because the migration is missing.
3. Add the migration.
4. Rerun the focused test.

### Task 2: Group Leaderboard Aggregation

**Files:**
- Modify: `src/lib/leaderboardGroups.ts`
- Modify: `src/lib/__tests__/leaderboardGroups.test.ts`

**Steps:**
1. Add an eligible but untimed attempt to the group leaderboard test and expect it to be excluded from average score, time, plays, and last played.
2. Run `npm test -- src/lib/__tests__/leaderboardGroups.test.ts` and verify it fails.
3. Require `duration_ms !== null` when grouping attempts.
4. Rerun the focused test.

### Task 3: Leaderboard Table Layout

**Files:**
- Modify: `src/components/LeaderboardTable.tsx`
- Create: `src/components/__tests__/LeaderboardTable.test.ts`

**Steps:**
1. Add a source-level test for fixed stat grid columns and right-aligned stat cells.
2. Run the component test and verify it fails.
3. Update the table grid to fixed rank/stat columns, min-width player column, and right-aligned stat headers/cells.
4. Run focused tests, full tests, lint, and build.
