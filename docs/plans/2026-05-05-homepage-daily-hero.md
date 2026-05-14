# Homepage Daily Hero Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the homepage so the daily challenge is the dominant first screen and leaderboard content sits underneath.

**Architecture:** Keep the existing server data loading in `src/app/page.tsx`. Change only the JSX layout and add a source-level regression test that checks the order of homepage sections.

**Tech Stack:** Next.js App Router, Tailwind CSS, Vitest.

---

### Task 1: Homepage Ordering Test

**Files:**
- Create: `src/app/page.test.ts`

**Steps:**
1. Add a test that reads `src/app/page.tsx` and checks for `data-home-section="daily-hero"`, `data-home-section="leaderboard-preview"`, and `data-home-section="category-lanes"`.
2. Verify the daily hero marker appears before the leaderboard marker, and the leaderboard marker appears before the category marker.
3. Run `npm test -- src/app/page.test.ts` and expect failure before implementation.

### Task 2: Hero-First Layout

**Files:**
- Modify: `src/app/page.tsx`

**Steps:**
1. Replace the split top grid with a full-width hero.
2. Move the leaderboard preview into its own section below the hero.
3. Keep categories as the final homepage section.
4. Run focused tests, full tests, lint, and build.
