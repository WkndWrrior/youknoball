# Guest Attempt Claim Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically save the just-finished guest daily challenge to the player's account after signup or sign-in returns them to `/play`.

**Architecture:** Keep the existing guest result storage, add a separate local pending-claim payload with the submitted answers, and replay that payload through the current `/api/attempt/submit` route once auth is available on `/play`. Treat duplicate saved-attempt responses as success so the UI can recover cleanly without a second persistence path.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase, Vitest

---

### Task 1: Add failing tests for guest pending-claim storage

**Files:**
- Modify: `src/lib/__tests__/dailyChallenge.test.ts`
- Modify: `src/app/play/page.tsx`

**Step 1: Write the failing test**
- Add tests for helper functions that write, read, and clear a pending guest-claim payload keyed by challenge date.
- Keep the payload minimal: challenge date plus submitted answers.

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/__tests__/dailyChallenge.test.ts
```

Expected: FAIL because no pending-claim helpers exist yet.

### Task 2: Add a failing test for the auto-claim client flow

**Files:**
- Modify: `src/app/play/page.test.tsx` or create it if absent
- Modify: `src/app/play/page.tsx`

**Step 1: Write the failing test**
- Render the play page with:
  - a stored guest result
  - a matching pending-claim payload
  - an authenticated session
- Expect the page to POST the stored date and answers to `/api/attempt/submit`.
- Expect a successful or duplicate response to replace the guest result with the saved result and clear the pending claim.

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/app/play/page.test.tsx
```

Expected: FAIL because the play page does not attempt an auto-claim.

### Task 3: Implement pending-claim helpers

**Files:**
- Modify: `src/lib/dailyChallenge.ts`
- Modify: `src/lib/__tests__/dailyChallenge.test.ts`

**Step 1: Write minimal implementation**
- Add a storage-key helper for pending claims.
- Add read/write/clear helpers with the same defensive parsing style used for stored guest results.

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/lib/__tests__/dailyChallenge.test.ts
```

Expected: PASS.

### Task 4: Implement guest auto-claim on `/play`

**Files:**
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/play/page.test.tsx`

**Step 1: Write minimal implementation**
- On guest submit, save the pending-claim payload alongside the existing guest result.
- After challenge load plus auth resolution, auto-submit the pending claim only when:
  - the current user is authenticated
  - the current challenge is ready
  - the pending claim date matches the current challenge date
- On success or duplicate response, replace the current result with the saved response and clear the pending claim.
- On failure, leave the guest result intact and surface a small non-blocking message.

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/app/play/page.test.tsx src/lib/__tests__/dailyChallenge.test.ts
```

Expected: PASS.

### Task 5: Verify the submit route still supports the claim flow

**Files:**
- Modify: `src/app/api/attempt/submit/route.test.ts`

**Step 1: Add route coverage**
- Add or adjust a route test to confirm duplicate saved-attempt responses still return the saved attempt payload needed by the auto-claim UI.

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/app/api/attempt/submit/route.test.ts
```

Expected: PASS.

### Task 6: Run full verification

**Files:**
- No new files

**Step 1: Run verification**

Run:

```bash
npm test
npm run lint
```

Expected: PASS.

**Step 2: Manual check**
- Start `npm run dev` from `/Users/teddy/youknoball/.worktrees/daily-challenge-mvp`
- Play as a guest and submit
- Sign up or sign in from the post-result prompt
- Confirm the run is automatically saved on return to `/play`
- Confirm the saved result still supports leaderboard name entry when needed
