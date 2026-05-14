# Share Links Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add native and platform share controls to the daily result card.

**Architecture:** Keep share construction in a small `src/lib/shareLinks.ts` helper and keep `/play` responsible for UI events. Use the existing `shareText` response as the base result text, then append a canonical `/play` URL on the client.

**Tech Stack:** Next.js App Router, React client component, Vitest, browser Web Share API, URL-based X/Facebook share links.

---

### Task 1: Add Share Link Helper Tests

**Files:**
- Create: `src/lib/__tests__/shareLinks.test.ts`
- Create: `src/lib/shareLinks.ts`

**Step 1: Write failing tests**

Cover `buildShareMessage`, `buildNativeShareData`, `buildXShareUrl`, and `buildFacebookShareUrl`.

**Step 2: Run targeted test**

Run: `npm test -- src/lib/__tests__/shareLinks.test.ts`

Expected: FAIL because `src/lib/shareLinks.ts` does not exist.

**Step 3: Implement helper module**

Add URL normalization and URLSearchParams-based share URL builders.

**Step 4: Run targeted test**

Run: `npm test -- src/lib/__tests__/shareLinks.test.ts`

Expected: PASS.

### Task 2: Wire Result Card Controls

**Files:**
- Modify: `src/app/play/page.tsx`
- Create: `src/app/play/page.test.ts`

**Step 1: Write failing test**

Add a lightweight source-level test that verifies the page imports the share helper module and renders the `Share`, `X`, and `Facebook` controls.

**Step 2: Run targeted test**

Run: `npm test -- src/app/play/page.test.ts`

Expected: FAIL because the share controls are not present.

**Step 3: Implement UI**

Use `buildNativeShareData`, `buildShareMessage`, `buildXShareUrl`, and `buildFacebookShareUrl` in the result card. Add `shareResult()` that calls `navigator.share()` when available and falls back to copying.

**Step 4: Run targeted tests**

Run:
- `npm test -- src/lib/__tests__/shareLinks.test.ts`
- `npm test -- src/app/play/page.test.ts`

Expected: PASS.

### Task 3: Full Verification

**Files:**
- Verify only.

**Step 1: Run automated checks**

Run:
- `npm test`
- `npm run lint`
- `npm run build`

Expected: all pass. If the sandbox build hits the known Turbopack port-binding panic, rerun the build outside the sandbox.

**Step 2: Manual smoke test**

Open `http://localhost:3000/play`, submit a result, and confirm the result card exposes Share, Copy result, X, and Facebook controls.
