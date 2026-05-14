# YouKnowBall Question Bank Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the rigid daily-only question schema with a reusable sports trivia bank plus persisted generated daily challenges, while preserving current gameplay and leaderboard behavior during the transition.

**Architecture:** Introduce new normalized content tables alongside the current schema first, then cut reads and writes over behind the existing API routes before retiring legacy daily-question storage. Keep the player-facing API stable while moving internals to `sports`, `questions`, `daily_challenges`, and `daily_challenge_items`, and derive freshness/generation from persisted challenge history.

**Tech Stack:** Next.js App Router, Supabase Postgres, Supabase RLS, TypeScript, Vitest

---

### Task 1: Add the New Content Schema Beside the Legacy Schema

**Files:**
- Create: `supabase/migrations/<timestamp>_question_bank_refactor.sql`
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Test: `src/lib/__tests__/dailyChallenge.test.ts`

**Step 1: Write the failing test**

Add a pure-data test case proving the new domain model can represent:
- future sports via a lookup row such as `cfb`
- reusable questions with one primary sport
- a canonical daily challenge composed from reusable questions

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/dailyChallenge.test.ts`
Expected: FAIL because the current shared types do not model `sports`, `questions`, or persisted daily challenge composition.

**Step 3: Write minimal implementation**

In the migration plan, define these new tables and constraints without removing the legacy table yet:
- `sports`
  - `id`, `slug`, `name`, `is_active`, `sort_order`, `created_at`
  - unique `slug`
- `questions`
  - `id`, `sport_id`, `difficulty`, `question_text`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_option`
  - `status`, `eligible_for_daily`, `eligible_for_sport_quiz`
  - `authoring_method`, `source_notes`, `reviewed_at`, `created_at`, `updated_at`
- `daily_challenges`
  - `id`, `challenge_date`, `status`, `generation_method`, `rules_version`, `generated_at`, `published_at`, `created_at`
- `daily_challenge_items`
  - `id`, `daily_challenge_id`, `slot`, `question_id`, `question_snapshot`, `created_at`
- extend `daily_attempts` with nullable `daily_challenge_id`

Also update shared TypeScript domain types so the new data model exists in code before repository cutover.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/dailyChallenge.test.ts`
Expected: PASS with new content model types available.

**Step 5: Commit**

```bash
git add supabase/migrations src/lib/dailyChallenge.ts src/lib/__tests__/dailyChallenge.test.ts
git commit -m "feat: add reusable question bank schema foundation"
```

### Task 2: Add Player-Safe Repository Reads on the New Schema

**Files:**
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/app/api/challenge/today/route.ts`
- Test: `src/app/api/challenge/today/route.test.ts`

**Step 1: Write the failing test**

Extend the route test to expect the daily challenge read path to load from:
- `daily_challenges`
- `daily_challenge_items`
- question snapshots or joined questions

The response must still expose only player-safe fields with no `correct_option`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/challenge/today/route.test.ts`
Expected: FAIL because the current repository still reads `daily_challenge_questions` directly.

**Step 3: Write minimal implementation**

Refactor repository reads so `getChallengeForDate`:
- resolves the canonical `daily_challenges` row by `challenge_date`
- loads its five `daily_challenge_items` in slot order
- returns player-safe question data from `question_snapshot` or a joined projection
- never exposes `correct_option` on public reads

Keep the route contract unchanged:
- `status: "ready"` with five ordered questions
- `status: "unavailable"` when no canonical daily challenge exists

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/challenge/today/route.test.ts`
Expected: PASS with the same client response shape backed by the new schema.

**Step 5: Commit**

```bash
git add src/lib/server/dailyChallengeRepository.ts src/app/api/challenge/today/route.ts src/app/api/challenge/today/route.test.ts
git commit -m "refactor: serve daily challenge from canonical challenge tables"
```

### Task 3: Implement the Generator and Relaxation Rules

**Files:**
- Create: `src/lib/server/dailyChallengeGenerator.ts`
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/app/api/challenge/today/route.ts`
- Test: `src/lib/__tests__/dailyChallengeGenerator.test.ts`

**Step 1: Write the failing test**

Add generator tests that assert:
- slot difficulty is fixed as easy, easy, medium, hard, hard
- NBA and NFL are included when possible
- target is at least 3 sports total
- no sport exceeds 2 questions
- freshness is preferred
- generator still returns 5 questions when sport mix must weaken

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/dailyChallengeGenerator.test.ts`
Expected: FAIL because no generator exists yet.

**Step 3: Write minimal implementation**

Implement a generator module that:
- selects only `questions.status = ready`
- filters by `eligible_for_daily = true`
- fills slots by target difficulty
- prefers questions not used recently in persisted daily challenge history
- uses the following priority:
  1. satisfy difficulty
  2. include NBA and NFL when possible
  3. reach at least 3 sports when possible
  4. keep max 2 per sport when possible
  5. always return 5 questions
- relaxes freshness and then sport-balance preferences if the pool is thin

Persist the generated output by creating:
- one `daily_challenges` row
- five `daily_challenge_items` rows with `question_snapshot`

The route should:
- load existing canonical challenge first
- generate and persist only when none exists for the date

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/dailyChallengeGenerator.test.ts src/app/api/challenge/today/route.test.ts`
Expected: PASS with deterministic persisted generation behavior.

**Step 5: Commit**

```bash
git add src/lib/server/dailyChallengeGenerator.ts src/lib/server/dailyChallengeRepository.ts src/app/api/challenge/today/route.ts src/lib/__tests__/dailyChallengeGenerator.test.ts src/app/api/challenge/today/route.test.ts
git commit -m "feat: generate and persist canonical daily challenges"
```

### Task 4: Re-anchor Saved Attempts to Canonical Daily Challenges

**Files:**
- Modify: `supabase/migrations/<timestamp>_question_bank_refactor.sql`
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/app/api/attempt/submit/route.ts`
- Test: `src/app/api/attempt/submit/route.test.ts`

**Step 1: Write the failing test**

Extend submit-route tests so saved signed-in attempts are keyed by `daily_challenge_id`, not only by a date string, while the public response can still include `date`.

Add a duplicate-submit expectation against the same canonical challenge row.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/attempt/submit/route.test.ts`
Expected: FAIL because the current implementation still inserts and checks duplicates by `challenge_date`.

**Step 3: Write minimal implementation**

Update the migration plan and repository so:
- `daily_attempts.daily_challenge_id` exists and is populated
- historical rows are backfilled by joining legacy `challenge_date` to canonical `daily_challenges`
- uniqueness shifts toward `user_id + daily_challenge_id`
- repository lookups and inserts use `daily_challenge_id`

Keep `challenge_date` temporarily during the bridge if needed for leaderboard compatibility, but stop treating it as the durable identity.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/attempt/submit/route.test.ts`
Expected: PASS with signed-in persistence and duplicate detection tied to canonical daily challenge rows.

**Step 5: Commit**

```bash
git add supabase/migrations src/lib/server/dailyChallengeRepository.ts src/app/api/attempt/submit/route.ts src/app/api/attempt/submit/route.test.ts
git commit -m "refactor: tie daily attempts to canonical challenge ids"
```

### Task 5: Backfill Legacy Daily Questions into Reusable Content

**Files:**
- Modify: `supabase/migrations/<timestamp>_question_bank_refactor.sql`
- Modify: `README.md`
- Test: manual migration verification notes in `README.md`

**Step 1: Write the failing test**

Write a checklist-driven migration verification note that proves the refactor preserves:
- legacy published daily challenges
- historical attempts
- leaderboard math

The engineer should not proceed until they can explain how legacy `daily_challenge_questions` rows map into the new schema.

**Step 2: Run test to verify it fails**

Run: manual review of the migration plan against current legacy tables
Expected: FAIL until a documented backfill mapping exists.

**Step 3: Write minimal implementation**

Document and implement the migration sequence:
- seed `sports` from distinct legacy `sport` values
- create one reusable `questions` row per legacy question row
- create one `daily_challenges` row per distinct `challenge_date`
- create five `daily_challenge_items` rows per daily challenge
- populate `question_snapshot` from legacy content at backfill time
- backfill `daily_attempts.daily_challenge_id`

Explicitly note that legacy rows should remain in place during the first deployment so rollback stays possible.

**Step 4: Run test to verify it passes**

Run: manual verification on a staging copy of the database
Expected:
- row counts reconcile by date
- leaderboard totals match before and after
- no signed-in attempts are orphaned

**Step 5: Commit**

```bash
git add supabase/migrations README.md
git commit -m "docs: define legacy backfill for question bank refactor"
```

### Task 6: Lock Down Correct Answers and RLS

**Files:**
- Modify: `supabase/migrations/<timestamp>_question_bank_refactor.sql`
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Test: `src/app/api/challenge/today/route.test.ts`

**Step 1: Write the failing test**

Add or extend a test proving public challenge reads cannot return `correct_option`, even though scoring still works server-side.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/challenge/today/route.test.ts`
Expected: FAIL if any public repository projection still leaks answer keys.

**Step 3: Write minimal implementation**

In the migration and repository layer:
- remove public read access from any table containing answer keys
- keep public challenge consumption routed through server code only
- preserve authenticated self-access on `profiles` and `daily_attempts`
- rebuild any leaderboard or player-safe read surfaces so they expose only the fields needed by the UI

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/challenge/today/route.test.ts`
Expected: PASS with answer keys kept server-only.

**Step 5: Commit**

```bash
git add supabase/migrations src/lib/server/dailyChallengeRepository.ts src/app/api/challenge/today/route.test.ts
git commit -m "fix: keep correct answers out of public read paths"
```

### Task 7: Rebuild Leaderboard and Stats on the New Attempt Identity

**Files:**
- Modify: `supabase/migrations/<timestamp>_question_bank_refactor.sql`
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/app/leaderboard/page.tsx`
- Test: `src/lib/__tests__/leaderboard.test.ts`

**Step 1: Write the failing test**

Extend leaderboard tests to prove ranking still works when stats are derived from `daily_attempts` joined through `daily_challenge_id`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/leaderboard.test.ts`
Expected: FAIL until repository queries and the leaderboard view are updated.

**Step 3: Write minimal implementation**

Update the leaderboard view and repository reads so:
- average score still uses only the daily all-sports challenge
- totals and recency derive from canonical challenge-backed attempts
- public output remains `display_name`, `average_score`, `total_plays`, `last_played_at`

Keep the UI contract unchanged.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/leaderboard.test.ts`
Expected: PASS with stable ranking behavior after the refactor.

**Step 5: Commit**

```bash
git add supabase/migrations src/lib/server/dailyChallengeRepository.ts src/app/leaderboard/page.tsx src/lib/__tests__/leaderboard.test.ts
git commit -m "refactor: rebuild leaderboard on canonical daily attempts"
```

### Task 8: Retire the Legacy Daily Question Store

**Files:**
- Modify: `supabase/migrations/<timestamp>_question_bank_refactor.sql`
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `README.md`
- Test: full regression verification

**Step 1: Write the failing test**

Create a final regression checklist that verifies:
- no repository code reads `daily_challenge_questions`
- no route logic depends on legacy `challenge_date` identity for saved attempts
- challenge generation, play, scoring, and leaderboard still work

**Step 2: Run test to verify it fails**

Run: `rg -n "daily_challenge_questions|challenge_date" src/lib/server src/app/api README.md`
Expected: legacy usages still present until the cleanup is complete.

**Step 3: Write minimal implementation**

After the new read and write paths are fully stable:
- drop or archive `daily_challenge_questions`
- remove legacy fallback code
- make `daily_attempts.daily_challenge_id` required
- remove now-redundant legacy bridge logic and documentation caveats

Do this only after the previous tasks are deployed and verified.

**Step 4: Run test to verify it passes**

Run:
- `npm test`
- `npm run lint`
- `npm run build`
- `rg -n "daily_challenge_questions" src supabase README.md`

Expected:
- tests pass
- lint passes
- build passes
- no live code depends on the legacy table

**Step 5: Commit**

```bash
git add supabase/migrations src/lib/server/dailyChallengeRepository.ts src/app/api README.md
git commit -m "refactor: remove legacy daily challenge question storage"
```

### Final Verification

**Run in order:**

```bash
npm test
npm run lint
npm run build
```

**Database verification checklist:**
- `sports` includes at least `nba`, `cbb`, `nfl`, `nhl`, and supports adding `cfb` without schema changes
- all public play reads exclude `correct_option`
- one canonical `daily_challenges` row exists per published date
- each canonical daily challenge has exactly five `daily_challenge_items`
- signed-in duplicate protection is enforced by `user_id + daily_challenge_id`
- leaderboard output matches pre-refactor totals for migrated historical rows

### Assumptions

- The main daily all-sports challenge remains the only persisted competitive mode in this phase.
- Sport-specific quiz play can reuse `questions` later without requiring immediate attempt persistence changes.
- `question_snapshot` is acceptable for preserving historical integrity even though it duplicates some question fields.
- Daily generation should always publish five questions, even if freshness or ideal sport mix must relax.
- NBA and NFL are target sports for the generator, but not hard failure conditions.
