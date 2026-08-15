# Search-First Daily Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify every nightly Daily 5 answer with approved-domain web search and let an authorized owner correct and reverify a flagged answer before publication.

**Architecture:** Simplify `openAiQuestionVerifier` to one search-enabled request with one bounded malformed-output retry, deriving stored evidence from returned search metadata. Add a service-role-only atomic correction RPC, a small server orchestration module, an authenticated API route, and radio-button controls on the existing private review page.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase/PostgreSQL, OpenAI Responses API, React.

---

### Task 1: Make verification search-first and source-derived

**Files:**
- Modify: `src/lib/server/__tests__/openAiQuestionVerifier.test.ts`
- Modify: `src/lib/server/openAiQuestionVerifier.ts`

**Step 1: Write failing verifier tests**

Replace saved-evidence-first expectations with tests asserting:

- the first request includes `tools: [{ type: "web_search", filters: { allowed_domains: ... } }]` and the search-call cap;
- the strict schema contains only `verdict`, `confidence`, `explanation`, and `conflicts`;
- `passed` and `risk` evidence is built from approved returned search sources;
- a decision with no approved returned source normalizes to `unable_to_verify`;
- malformed JSON or schema output triggers exactly one second search request;
- a second malformed response throws `malformed_output` with combined usage/search accounting; and
- fabricated or unapproved returned source URLs are excluded.

**Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/lib/server/__tests__/openAiQuestionVerifier.test.ts`

Expected: failures showing the first request has no web-search tool and the schema still requires model-authored evidence.

**Step 3: Implement the minimal verifier change**

In `openAiQuestionVerifier.ts`:

- remove `evidence` from `VERIFICATION_SCHEMA` and the raw model decision type;
- always call `performRequest(..., true)`;
- convert approved `collectSearchMetadata()` sources into finding evidence using the decision explanation as the concise support text;
- require at least one approved source for `passed` or `risk`;
- throw `OpenAiQuestionVerifierError("malformed_output", ...)` for absent, non-JSON, or invalid structured output;
- retry only malformed/incomplete output once and combine accounting across both calls; and
- preserve model, timeout, token, source-domain, usage, response-size, and search-call limits.

**Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/lib/server/__tests__/openAiQuestionVerifier.test.ts`

Expected: all verifier tests pass.

**Step 5: Commit**

```bash
git add src/lib/server/openAiQuestionVerifier.ts src/lib/server/__tests__/openAiQuestionVerifier.test.ts
git commit -m "fix: make daily verification search first"
```

### Task 2: Add an atomic answer-correction database operation

**Files:**
- Create: `supabase/migrations/202608150001_daily_review_answer_corrections.sql`
- Modify: `src/lib/__tests__/dailyQuestionReviewMigration.test.ts`
- Modify: `src/lib/server/dailyQuestionReviewRepository.ts`
- Modify: `src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts`

**Step 1: Write failing migration and repository tests**

Assert the migration creates a revoked-by-default, service-role-only `correct_daily_question_review_answer` function that:

- locks the review item, run, challenge, canonical question, and daily challenge item;
- accepts only options A-D and a passed finding with evidence;
- requires an unresolved completed flag and a generated unpublished challenge;
- requires the canonical and draft answers to still match the reviewed snapshot;
- updates `questions.correct_option`, both stored snapshots, passed finding fields, resolution metadata, and correction audit metadata; and
- returns explicit `corrected`, `conflict`, `not_draft`, or `missing` outcomes.

Add repository tests for valid RPC parameter mapping and malformed database responses.

**Step 2: Run tests and verify RED**

Run: `npm test -- --run src/lib/__tests__/dailyQuestionReviewMigration.test.ts src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts`

Expected: failures because the migration and repository wrapper do not exist.

**Step 3: Implement migration and repository wrapper**

Create the SQL function and add `correctDailyQuestionReviewAnswer()` to the repository. Pass the normalized finding, previous/new option, resolver ID, and timestamp. Do not permit arbitrary question text or option edits.

**Step 4: Run tests and verify GREEN**

Run the Task 2 command again and expect all tests to pass.

**Step 5: Commit**

```bash
git add supabase/migrations/202608150001_daily_review_answer_corrections.sql src/lib/__tests__/dailyQuestionReviewMigration.test.ts src/lib/server/dailyQuestionReviewRepository.ts src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts
git commit -m "feat: add atomic daily answer corrections"
```

### Task 3: Add the authenticated verify-and-apply endpoint

**Files:**
- Create: `src/lib/server/adminDailyReviewCorrection.ts`
- Create: `src/lib/server/__tests__/adminDailyReviewCorrection.test.ts`
- Create: `src/app/api/admin/daily-review/[date]/correct-answer/route.ts`
- Create: `src/app/api/admin/daily-review/[date]/correct-answer/route.test.ts`

**Step 1: Write failing orchestration and route tests**

Cover:

- allowlisted admin authentication, same-origin, JSON content type, date, UUID, and answer-option validation;
- rejection when the option is unchanged, item is resolved, or review item is missing;
- evidence collection and search-first verification of a snapshot differing only in `correct_option`;
- no correction RPC call for `risk` or `unable_to_verify`;
- correction RPC call only for `passed` with evidence;
- safe handling of stale/published RPC outcomes; and
- a response containing the finding, approved evidence, and estimated API cost.

**Step 2: Run tests and verify RED**

Run: `npm test -- --run src/lib/server/__tests__/adminDailyReviewCorrection.test.ts 'src/app/api/admin/daily-review/[date]/correct-answer/route.test.ts'`

Expected: failures because the module and route do not exist.

**Step 3: Implement orchestration and route**

The orchestration module loads the review, creates a proposed snapshot, collects saved sources, calls `verifyQuestionWithOpenAi`, estimates actual usage with `estimateDailyQuestionReviewCostMicrodollars`, and calls the atomic repository operation only for a passed finding. The route follows the existing resolve route's authorization and request-hardening pattern.

**Step 4: Run tests and verify GREEN**

Run the Task 3 command again and expect all tests to pass.

**Step 5: Commit**

```bash
git add src/lib/server/adminDailyReviewCorrection.ts src/lib/server/__tests__/adminDailyReviewCorrection.test.ts 'src/app/api/admin/daily-review/[date]/correct-answer/route.ts' 'src/app/api/admin/daily-review/[date]/correct-answer/route.test.ts'
git commit -m "feat: verify admin answer corrections"
```

### Task 4: Add correction controls to the private review page

**Files:**
- Modify: `src/app/admin/daily-review/[date]/DailyReviewActions.tsx`
- Modify: `src/app/admin/daily-review/[date]/page.tsx`
- Modify: `src/app/admin/daily-review/[date]/page.test.tsx`

**Step 1: Write failing page tests**

Assert unresolved flagged items render:

- four radio choices with option letters and text;
- the existing correct option selected initially;
- a **Verify and apply** command disabled until a different option is selected;
- existing Keep and Replace commands; and
- a region for rejected verification details and evidence links.

**Step 2: Run test and verify RED**

Run: `npm test -- --run 'src/app/admin/daily-review/[date]/page.test.tsx'`

Expected: failure because correction controls are absent.

**Step 3: Implement the controls**

Pass the question options and current correct option into `DailyReviewActions`. Submit the selected option to the new route, disable all commands while pending, refresh on applied success, and render a non-applied finding without losing the selection.

**Step 4: Run test and verify GREEN**

Run the Task 4 command again and expect all tests to pass.

**Step 5: Commit**

```bash
git add 'src/app/admin/daily-review/[date]/DailyReviewActions.tsx' 'src/app/admin/daily-review/[date]/page.tsx' 'src/app/admin/daily-review/[date]/page.test.tsx'
git commit -m "feat: edit flagged answers in daily review"
```

### Task 5: Verify, review, and integrate

**Files:**
- Review all files changed in Tasks 1-4.

**Step 1: Run focused tests**

```bash
npm test -- --run src/lib/server/__tests__/openAiQuestionVerifier.test.ts src/lib/__tests__/dailyQuestionReviewMigration.test.ts src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts src/lib/server/__tests__/adminDailyReviewCorrection.test.ts 'src/app/api/admin/daily-review/[date]/correct-answer/route.test.ts' 'src/app/admin/daily-review/[date]/page.test.tsx'
```

Expected: all focused tests pass.

**Step 2: Run full verification**

```bash
npm test
npm run lint
git diff --check main...HEAD
```

Expected: tests and lint pass with no whitespace errors. Run `npx tsc --noEmit` and confirm it introduces no errors beyond any baseline errors already present on `main`.

**Step 3: Request code review**

Review search-source trust, retry/accounting limits, admin authorization, draft immutability, atomic database guards, and test coverage. Resolve all Critical and Important findings.

**Step 4: Finish branch**

Use `superpowers:finishing-a-development-branch` and offer local merge, PR, keep, or discard options.
