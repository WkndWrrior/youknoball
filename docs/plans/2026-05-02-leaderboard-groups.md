# Leaderboard Groups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add invite-link leaderboard groups so signed-in players can create a private group, invite friends, and view a member-only leaderboard.

**Architecture:** Add pure group/domain helpers, a Supabase migration for group tables, server repository functions backed by Supabase admin access after session validation, authenticated API routes, and small client components for create/list/join/detail pages.

**Tech Stack:** Next.js App Router, React client components, Supabase Postgres/RLS, Vitest.

---

### Task 1: Domain Helpers

**Files:**
- Create: `src/lib/leaderboardGroups.ts`
- Create: `src/lib/__tests__/leaderboardGroups.test.ts`

**Steps:**
1. Write failing tests for group-name normalization, invite-code normalization, invite URL building, and group leaderboard aggregation.
2. Run `npm test -- src/lib/__tests__/leaderboardGroups.test.ts` and confirm failure.
3. Implement helper functions.
4. Re-run targeted tests and confirm pass.

### Task 2: Schema and Repository

**Files:**
- Create: `supabase/migrations/202605020002_leaderboard_groups.sql`
- Create: `src/lib/server/leaderboardGroupsRepository.ts`
- Modify: `src/lib/__tests__/leaderboardGroups.test.ts`

**Steps:**
1. Add a migration source test expecting group tables, membership roles, invite-code uniqueness, and RLS.
2. Run targeted tests and confirm failure.
3. Add the migration and repository functions for create, list, join, and detail.
4. Re-run targeted tests and confirm pass.

### Task 3: API Routes

**Files:**
- Create: `src/app/api/groups/route.ts`
- Create: `src/app/api/groups/route.test.ts`
- Create: `src/app/api/groups/join/route.ts`
- Create: `src/app/api/groups/join/route.test.ts`
- Create: `src/app/api/groups/[code]/route.ts`
- Create: `src/app/api/groups/[code]/route.test.ts`

**Steps:**
1. Write failing route tests for auth-required create/list, join-by-code, and member-only group detail.
2. Run targeted API tests and confirm failure.
3. Implement routes using session validation and repository functions.
4. Re-run targeted API tests and confirm pass.

### Task 4: UI Pages

**Files:**
- Create: `src/components/GroupsDashboard.tsx`
- Create: `src/components/GroupLeaderboardView.tsx`
- Create: `src/components/JoinGroupView.tsx`
- Create: `src/app/groups/page.tsx`
- Create: `src/app/groups/[code]/page.tsx`
- Create: `src/app/groups/join/[code]/page.tsx`
- Create: `src/app/groups/page.test.ts`
- Modify: `src/app/layout.tsx`

**Steps:**
1. Add source-level page tests for route/component wiring and navigation.
2. Run targeted page tests and confirm failure.
3. Implement the client components and pages.
4. Re-run targeted tests and confirm pass.

### Task 5: Verification

**Commands:**
- `npm test`
- `npm run lint`
- `npm run build`

If the sandbox build hits the known Turbopack port-binding issue, rerun outside the sandbox.
