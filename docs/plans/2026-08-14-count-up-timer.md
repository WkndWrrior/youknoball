# Count-Up Daily Challenge Timer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Count signed-in Daily 5 time upward from zero, cap the displayed and stored duration at 90 seconds, and keep capped attempts leaderboard-eligible.

**Architecture:** Keep the server start timestamp authoritative. Add a shared capped-elapsed helper used by both the play UI and submission route so display and persistence cannot diverge; preserve the existing minimum-duration and missing-timer checks.

**Tech Stack:** Next.js, React, TypeScript, Vitest

---

### Task 1: Shared Timer Semantics

**Files:**
- Modify: `src/lib/challengeTimer.ts`
- Test: `src/lib/__tests__/challengeTimer.test.ts`

1. Change the expected limit test from 120,000 ms to 90,000 ms and add failing cases for capped elapsed duration below, at, and above the limit.
2. Run `npm test -- --run src/lib/__tests__/challengeTimer.test.ts` and confirm the new assertions fail for the old countdown behavior.
3. Set `leaderboardTimerLimitMs` to 90,000 ms and implement a capped elapsed helper using the authoritative start timestamp.
4. Update timer formatting assertions for elapsed values while retaining `MM:SS` formatting.
5. Run the focused test and commit the shared timer behavior.

### Task 2: Count-Up Play Display

**Files:**
- Modify: `src/app/play/page.tsx`
- Test: `src/app/play/page.test.ts`

1. Add failing source-level assertions that the play page uses capped elapsed time and no longer contains countdown/expired-window copy.
2. Run `npm test -- --run src/app/play/page.test.ts` and verify the assertions fail.
3. Replace remaining-time calculation with capped elapsed calculation and display copy that explains the 90-second cap without implying the quiz closes.
4. Keep the interval lifecycle and guest fallback unchanged.
5. Run the focused test and commit the UI behavior.

### Task 3: Capped Server Submission

**Files:**
- Modify: `src/app/api/attempt/submit/route.ts`
- Test: `src/app/api/attempt/submit/route.test.ts`

1. Rewrite the expired-attempt test to require `durationMs: 90_000`, `leaderboardEligible: true`, and a ranked response for a submission after 90 seconds.
2. Run `npm test -- --run src/app/api/attempt/submit/route.test.ts` and verify the test fails against raw duration storage.
3. Use the shared capped elapsed helper when deriving duration from the server start timestamp.
4. Preserve `timer_unavailable` and minimum-duration behavior.
5. Run the focused route test and commit the server behavior.

### Task 4: Verification

**Files:**
- Verify only

1. Run the three focused test files together.
2. Run `npm test`.
3. Run `npm run lint`.
4. Run `npx tsc --noEmit` and distinguish any unchanged baseline errors.
5. Run `git diff --check`, inspect the final diff, and request a focused code review.
