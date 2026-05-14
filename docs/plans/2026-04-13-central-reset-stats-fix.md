# Central Reset And Signed-In Stats Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the daily challenge reset to 12:01 AM America/Chicago and fix the signed-in submit flow so saved attempts still return scores and stats.

**Architecture:** Add one shared date helper that computes the active challenge date in America/Chicago with a one-minute post-midnight cutoff, then update all challenge-date callers to use it. Fix the signed-in submit regression by computing player stats directly from the user's `daily_attempts` rows instead of joining through `daily_challenges`, which is intentionally not client-readable under current RLS.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Vitest

---

### Task 1: Add failing tests for the new active-date logic

**Files:**
- Modify: `src/app/api/challenge/today/route.test.ts`
- Modify: `src/lib/__tests__/dailyChallenge.test.ts`

**Step 1: Write failing tests**
- Add a route test that freezes time at `2026-04-13T05:00:30.000Z` and expects the active challenge date to still be `2026-04-12`.
- Add a route test that freezes time at `2026-04-13T05:01:00.000Z` and expects the active challenge date to be `2026-04-13`.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/app/api/challenge/today/route.test.ts src/lib/__tests__/dailyChallenge.test.ts
```

Expected: the new Central-time reset assertions fail because date resolution still uses UTC midnight.

### Task 2: Add a failing test for the signed-in submit/stats regression

**Files:**
- Modify: `src/app/api/attempt/submit/route.test.ts`
- Modify: `src/lib/__tests__/leaderboard.test.ts`

**Step 1: Write failing tests**
- Add a signed-in submit route test where stats are derived from `daily_attempts` rows without needing `daily_challenges` join access, and assert the response still includes the score payload and saved stats.
- Add a repository stats test that expects `getPlayerStats` to read `score,challenge_date` from `daily_attempts`.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/app/api/attempt/submit/route.test.ts src/lib/__tests__/leaderboard.test.ts
```

Expected: the new assertions fail because stats still use `daily_challenges!inner(...)`.

### Task 3: Implement the shared Central-time challenge date helper

**Files:**
- Modify: `src/lib/date.ts`
- Modify: `src/app/api/challenge/today/route.ts`
- Modify: `src/app/page.tsx`

**Step 1: Write minimal implementation**
- Add a helper that computes the active challenge date in `America/Chicago`.
- Keep the challenge on the previous date until `12:01 AM` Chicago time.
- Reuse the helper in the homepage and challenge API route instead of calling `toISOString().slice(0, 10)`.

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/app/api/challenge/today/route.test.ts src/lib/__tests__/dailyChallenge.test.ts
```

Expected: the new date tests pass.

### Task 4: Fix signed-in stats loading in the submit flow

**Files:**
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/app/api/attempt/submit/route.ts`

**Step 1: Write minimal implementation**
- Change `getPlayerStats` to read only from `daily_attempts`.
- Preserve `averageScore`, `totalPlays`, and `lastPlayedAt` using `challenge_date`.
- Keep the submit response shape the same so the play page still renders score, share text, and stats.

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/app/api/attempt/submit/route.test.ts src/lib/__tests__/leaderboard.test.ts
```

Expected: the signed-in submit and stats tests pass.

### Task 5: Verify the integrated behavior

**Files:**
- No new files

**Step 1: Run verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass.

**Step 2: Manual check**
- Run `npm run dev` from `/Users/teddy/youknoball/.worktrees/daily-challenge-mvp`
- Open `/api/challenge/today` around the expected reset boundary when practical
- Submit a signed-in attempt and confirm the score renders and the response no longer fails with `Unable to load player stats`
