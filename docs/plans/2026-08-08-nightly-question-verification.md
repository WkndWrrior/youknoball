# Nightly Daily 5 Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare tomorrow's Daily 5 as a private draft, verify every question against approved sources around 6 PM Central, email a saved risk report, and let an administrator safely keep or replace flagged questions before automatic publication.

**Architecture:** Vercel Cron calls a secret-protected Next.js route that prepares an unpublished canonical challenge, collects source evidence, invokes GPT-5.6 Terra through the Responses API, persists structured findings in private Supabase tables, and sends an every-night Resend report. Existing challenge generation remains authoritative for difficulty, sport balance, and freshness; a private review route applies only preverified same-difficulty replacements to unpublished drafts.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres/RLS, OpenAI Responses API, Resend, Vercel Cron, Cheerio, Vitest, Testing Library

---

### Task 1: Add Private Review Storage And Shared Types

**Files:**
- Create: `supabase/migrations/202608080001_nightly_question_verification.sql`
- Create: `src/lib/dailyQuestionReview.ts`
- Create: `src/lib/__tests__/dailyQuestionReviewMigration.test.ts`
- Create: `src/lib/__tests__/dailyQuestionReview.test.ts`

**Step 1: Write the failing migration contract test**

Assert that the migration defines `daily_question_review_runs` and `daily_question_review_items`, their checks, foreign keys, indexes, unique scheduled-run key, RLS, revoked grants, and an internal dashboard view. Include assertions that replacement resolution metadata and API usage/cost fields exist.

```ts
expect(sql).toContain("create table if not exists public.daily_question_review_runs");
expect(sql).toContain("unique (challenge_date, run_kind)");
expect(sql).toContain("check (verdict in ('passed', 'risk', 'unable_to_verify'))");
expect(sql).toContain("revoke all on public.daily_question_review_runs from public, anon, authenticated");
```

**Step 2: Run the test and verify RED**

Run: `npm test -- src/lib/__tests__/dailyQuestionReviewMigration.test.ts`

Expected: FAIL because the migration does not exist.

**Step 3: Write shared parser tests**

Define expected parsing for verdicts, confidence, resolution actions, UUID/date inputs, evidence arrays, and OpenAI structured output. Invalid or incomplete model output must normalize to `unable_to_verify`, never `passed`.

```ts
expect(parseVerificationFinding({ verdict: "passed" })).toBeNull();
expect(parseReviewAction({ itemId, action: "replace" })).toEqual({
  itemId,
  action: "replace",
});
```

**Step 4: Run the parser test and verify RED**

Run: `npm test -- src/lib/__tests__/dailyQuestionReview.test.ts`

Expected: FAIL because the shared module does not exist.

**Step 5: Implement the migration and minimal types/parsers**

Use private public-schema tables because PostgREST server repositories already use that pattern. Add:

- run status: `running`, `completed`, `partial`, `failed`, `budget_blocked`;
- run kind: `scheduled` initially;
- verdict: `passed`, `risk`, `unable_to_verify`;
- resolution: `pending`, `kept`, `replaced`;
- JSONB evidence/fetch metadata with object/array checks;
- token, search-call, and estimated-cost integer fields with nonnegative checks;
- `email_status`, `email_sent_at`, and bounded error text;
- unique `(challenge_date, run_kind)` and unique `(review_run_id, slot)`;
- service-role-only tables and `internal.daily_question_review` view.

Export strict TypeScript domain types and parsing helpers from `src/lib/dailyQuestionReview.ts`.

**Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/lib/__tests__/dailyQuestionReviewMigration.test.ts src/lib/__tests__/dailyQuestionReview.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add supabase/migrations/202608080001_nightly_question_verification.sql src/lib/dailyQuestionReview.ts src/lib/__tests__/dailyQuestionReviewMigration.test.ts src/lib/__tests__/dailyQuestionReview.test.ts
git commit -m "feat: add nightly question review storage"
```

### Task 2: Add Central-Time Scheduling Helpers

**Files:**
- Modify: `src/lib/date.ts`
- Create: `src/lib/__tests__/nightlyReviewSchedule.test.ts`

**Step 1: Write failing DST and date-boundary tests**

Cover 6 PM Central in summer and winter, the two UTC trigger windows, tomorrow's date near month/year boundaries, and rejection outside the intended hour.

```ts
expect(getNightlyReviewSchedule(new Date("2026-08-08T23:20:00Z"))).toEqual({
  shouldRun: true,
  challengeDate: "2026-08-09",
});
expect(getNightlyReviewSchedule(new Date("2026-12-08T00:20:00Z"))).toEqual({
  shouldRun: true,
  challengeDate: "2026-12-08",
});
```

**Step 2: Run and verify RED**

Run: `npm test -- src/lib/__tests__/nightlyReviewSchedule.test.ts`

Expected: FAIL because the helper is missing.

**Step 3: Implement pure scheduling helpers**

Reuse the existing `America/Chicago` formatter. Add an injectable `now` function, a safe next-calendar-day calculation, and `getNightlyReviewSchedule(now)` returning `{ shouldRun, challengeDate }`. Preserve existing `getTodayIsoDate()` behavior.

**Step 4: Run and verify GREEN**

Run: `npm test -- src/lib/__tests__/nightlyReviewSchedule.test.ts src/lib/__tests__/dailyChallenge.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/date.ts src/lib/__tests__/nightlyReviewSchedule.test.ts
git commit -m "feat: add Central nightly review scheduling"
```

### Task 3: Separate Draft Preparation From Publication

**Files:**
- Modify: `src/lib/server/dailyChallengeRepository.ts`
- Modify: `src/app/api/challenge/today/route.ts`
- Modify: `src/lib/server/__tests__/dailyChallengeRepository.test.ts`
- Modify: `src/app/api/challenge/today/route.test.ts`

**Step 1: Write failing repository tests**

Add tests proving:

- `prepareDailyChallengeDraftForDate(date)` uses the existing generator and persists status `generated` with five snapshots but no `published_at`;
- preparing the same date twice returns the same complete draft;
- the current-date resolution promotes a complete draft to `published` before serving;
- an incomplete/stale draft follows the existing cleanup/retry path; and
- normal on-demand generation still publishes immediately when no evening draft exists.

**Step 2: Run and verify RED**

Run: `npm test -- src/lib/server/__tests__/dailyChallengeRepository.test.ts src/app/api/challenge/today/route.test.ts`

Expected: FAIL because draft preparation and promotion are not distinct.

**Step 3: Refactor persistence minimally**

Split the current `persistGeneratedChallenge` operation into:

```ts
export async function prepareDailyChallengeDraftForDate(
  challengeDate: string,
): Promise<PreparedDailyChallengeDraft>;

async function publishCanonicalChallenge(
  challengeId: string,
  publishedAt: string,
): Promise<void>;
```

Add a `draft_ready` canonical read state for generated rows with five valid unique slots. The public current-date resolution promotes that state atomically and then serves it. The cron-facing preparation function returns question IDs and complete snapshots for verification without publishing.

Do not duplicate or replace `generateDailyChallengeQuestions`.

**Step 4: Run and verify GREEN**

Run: `npm test -- src/lib/server/__tests__/dailyChallengeRepository.test.ts src/app/api/challenge/today/route.test.ts src/lib/__tests__/dailyChallengeGenerator.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/server/dailyChallengeRepository.ts src/app/api/challenge/today/route.ts src/lib/server/__tests__/dailyChallengeRepository.test.ts src/app/api/challenge/today/route.test.ts
git commit -m "feat: prepare Daily 5 drafts before publication"
```

### Task 4: Select Composition-Safe Replacements

**Files:**
- Modify: `src/lib/server/dailyChallengeGenerator.ts`
- Modify: `src/lib/__tests__/dailyChallengeGenerator.test.ts`

**Step 1: Write failing replacement tests**

Cover same difficulty, no duplicate question, recent-question avoidance, unchanged slot, NBA/NFL coverage, sport diversity, max-two preference, deterministic tie-breaking, and no replacement when none is valid.

```ts
const replacement = selectDailyChallengeReplacement({
  selection,
  flaggedSlot: 3,
  candidates,
  recentQuestionIds,
});
expect(replacement?.difficulty).toBe(selection[2].difficulty);
expect(new Set(replaceAtSlot(selection, 3, replacement).map(q => q.id)).size).toBe(5);
```

**Step 2: Run and verify RED**

Run: `npm test -- src/lib/__tests__/dailyChallengeGenerator.test.ts`

Expected: FAIL because replacement selection is missing.

**Step 3: Implement replacement selection using the existing score**

Filter candidates to ready/daily-eligible questions at the flagged slot's difficulty. Exclude the five selected IDs. Rank resulting full selections with `scoreDailyChallengeSelection` and the existing comparator priorities. Reject candidates that worsen a currently satisfied target-sport coverage, unique-sport count, or max-two condition when a preserving candidate exists. Return `null` when no same-difficulty candidate exists.

**Step 4: Run and verify GREEN**

Run: `npm test -- src/lib/__tests__/dailyChallengeGenerator.test.ts`

Expected: PASS with all existing generation tests unchanged.

**Step 5: Commit**

```bash
git add src/lib/server/dailyChallengeGenerator.ts src/lib/__tests__/dailyChallengeGenerator.test.ts
git commit -m "feat: select safe Daily 5 replacements"
```

### Task 5: Safely Collect Saved Source Evidence

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/server/dailyQuestionSourceFetcher.ts`
- Create: `src/lib/server/__tests__/dailyQuestionSourceFetcher.test.ts`

**Step 1: Install the HTML parser**

Run: `npm install cheerio`

Expected: `cheerio` is recorded as a production dependency.

**Step 2: Write failing URL and fetch tests**

Cover URL extraction from free-form source notes, deduplication, default and environment-extended allowlists, HTTPS-only rules, credentials, IP literals/private hosts, redirect validation, timeout, maximum bytes, content type, malformed HTML, and normalized extracted text.

```ts
expect(extractApprovedSourceUrls(notes)).toEqual([
  "https://www.ncaa.com/example",
  "https://www.espn.com/example",
]);
await expect(fetchSourceEvidence("http://127.0.0.1/private", fetchMock))
  .resolves.toMatchObject({ status: "rejected" });
```

**Step 3: Run and verify RED**

Run: `npm test -- src/lib/server/__tests__/dailyQuestionSourceFetcher.test.ts`

Expected: FAIL because the fetcher is missing.

**Step 4: Implement bounded source fetching**

Use `URL` for parsing and Cheerio for HTML extraction. Keep defaults for current bank domains and support `DAILY_REVIEW_APPROVED_SOURCE_DOMAINS` for additional official team/college sites. Use an abort timeout, manual redirect inspection, a maximum of three redirects, a maximum response body size, and no DNS/IP/private-network bypass. Return structured status metadata rather than throwing for per-source failures.

**Step 5: Run and verify GREEN**

Run: `npm test -- src/lib/server/__tests__/dailyQuestionSourceFetcher.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/server/dailyQuestionSourceFetcher.ts src/lib/server/__tests__/dailyQuestionSourceFetcher.test.ts
git commit -m "feat: collect approved question evidence"
```

### Task 6: Add The OpenAI Verifier And Budget Accounting

**Files:**
- Create: `src/lib/server/openAiQuestionVerifier.ts`
- Create: `src/lib/server/__tests__/openAiQuestionVerifier.test.ts`
- Create: `src/lib/server/dailyQuestionReviewBudget.ts`
- Create: `src/lib/server/__tests__/dailyQuestionReviewBudget.test.ts`

**Step 1: Write failing OpenAI client tests**

Test configuration absence, bearer authentication, `gpt-5.6-terra`, medium reasoning, `store: false`, strict JSON schema, bounded output, refusal/error handling, malformed output normalization, source evidence prompts, and a second web-search request only after an initial `unable_to_verify` result.

The fallback request must include the Responses API `web_search` tool with approved-domain filters and request source annotations. Assert that search calls and usage are collected from the response.

**Step 2: Run and verify RED**

Run: `npm test -- src/lib/server/__tests__/openAiQuestionVerifier.test.ts`

Expected: FAIL because the client is missing.

**Step 3: Implement the direct Responses API client**

Use server-side `fetch` rather than adding an SDK. Read `OPENAI_API_KEY` and optional `DAILY_REVIEW_OPENAI_MODEL`, defaulting to `gpt-5.6-terra`. Send a strict schema with:

```ts
type VerificationFinding = {
  verdict: "passed" | "risk" | "unable_to_verify";
  confidence: number;
  explanation: string;
  conflicts: string[];
  evidence: Array<{ url: string; title: string; support: string }>;
};
```

The prompt must distinguish unsupported evidence from contradiction, forbid rewriting, require direct support for the expected answer, and treat ambiguity as risk. Limit each source excerpt and total prompt size.

**Step 4: Write failing budget tests**

Test versioned Terra pricing, input/output/search cost estimates, month-boundary filtering in Central Time, default $10 limit, configurable limit, and a blocked result before any OpenAI call.

**Step 5: Run budget test and verify RED**

Run: `npm test -- src/lib/server/__tests__/dailyQuestionReviewBudget.test.ts`

Expected: FAIL because accounting is missing.

**Step 6: Implement budget helpers**

Use integer microdollars internally. Default `DAILY_REVIEW_MONTHLY_BUDGET_CENTS` to `1000`. Estimate cost from API usage and recorded web-search calls. Return explicit `allowed`, `spent`, and `limit` values. Bound each model response so one run cannot materially overshoot the monthly gate.

**Step 7: Run and verify GREEN**

Run: `npm test -- src/lib/server/__tests__/openAiQuestionVerifier.test.ts src/lib/server/__tests__/dailyQuestionReviewBudget.test.ts`

Expected: PASS.

**Step 8: Commit**

```bash
git add src/lib/server/openAiQuestionVerifier.ts src/lib/server/__tests__/openAiQuestionVerifier.test.ts src/lib/server/dailyQuestionReviewBudget.ts src/lib/server/__tests__/dailyQuestionReviewBudget.test.ts
git commit -m "feat: verify questions with bounded OpenAI usage"
```

### Task 7: Persist And Orchestrate Idempotent Nightly Runs

**Files:**
- Create: `src/lib/server/dailyQuestionReviewRepository.ts`
- Create: `src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts`
- Create: `src/lib/server/dailyQuestionReviewService.ts`
- Create: `src/lib/server/__tests__/dailyQuestionReviewService.test.ts`
- Modify: `src/lib/server/dailyChallengeRepository.ts`

**Step 1: Write failing repository tests**

Cover start-or-observe semantics, conflict recovery, per-item upserts, partial completion, monthly spend query, email status, latest review load, and resolution load. Use the repository's existing Supabase mock-query style.

**Step 2: Run and verify RED**

Run: `npm test -- src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts`

Expected: FAIL because the repository is missing.

**Step 3: Implement the minimal review repository**

Keep all Supabase column projections explicit. Normalize unknown data before returning it. Treat unique conflicts as an existing run, and never expose service-role data to browser callers.

**Step 4: Write failing orchestration tests**

Test the complete sequence:

- budget gate;
- prepare tomorrow's draft once;
- create/observe run;
- collect evidence and verify five slots;
- select and verify replacements only for flagged items;
- persist progress after each item;
- calculate final status and cost;
- invoke email exactly once; and
- preserve completed work after a per-item or email failure.

Also test concurrent duplicate calls and a resumed partial run.

**Step 5: Run and verify RED**

Run: `npm test -- src/lib/server/__tests__/dailyQuestionReviewService.test.ts`

Expected: FAIL because the service is missing.

**Step 6: Implement orchestration with bounded concurrency**

Add `runNightlyQuestionReview({ challengeDate, now, dependencies? })`. Keep dependency injection at network/database boundaries for tests. Verify at most two questions concurrently, save each result immediately, and derive a deterministic final status. A failed replacement verification remains unavailable and is not offered.

**Step 7: Run and verify GREEN**

Run: `npm test -- src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts src/lib/server/__tests__/dailyQuestionReviewService.test.ts src/lib/server/__tests__/dailyChallengeRepository.test.ts`

Expected: PASS.

**Step 8: Commit**

```bash
git add src/lib/server/dailyQuestionReviewRepository.ts src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts src/lib/server/dailyQuestionReviewService.ts src/lib/server/__tests__/dailyQuestionReviewService.test.ts src/lib/server/dailyChallengeRepository.ts
git commit -m "feat: orchestrate nightly Daily 5 reviews"
```

### Task 8: Send The Every-Night Review Email

**Files:**
- Create: `src/lib/server/dailyQuestionReviewNotifications.ts`
- Create: `src/lib/server/__tests__/dailyQuestionReviewNotifications.test.ts`
- Modify: `src/lib/server/dailyQuestionReviewService.ts`

**Step 1: Write failing notification tests**

Cover reuse of `QUESTION_REPORT_EMAIL_FROM` and `QUESTION_REPORT_EMAIL_TO`, all-clear subject/body, risk emphasis, unable-to-verify language, replacement details, safe evidence URLs, estimated cost, admin review URL, missing configuration, timeout, bounded Resend errors, and no duplicate send for an already emailed run.

**Step 2: Run and verify RED**

Run: `npm test -- src/lib/server/__tests__/dailyQuestionReviewNotifications.test.ts`

Expected: FAIL because the notification module is missing.

**Step 3: Implement plain-text and minimal HTML email output**

Use the existing Resend HTTP pattern, abort timeout, and recipient parsing. Build the review URL from `NEXT_PUBLIC_SITE_URL` with a safe Vercel production fallback passed by the cron route. Email every completed, partial, failed, or budget-blocked scheduled run. Never put mutation URLs in the message.

**Step 4: Integrate send-once persistence**

The service must claim/send/update email state in a way that duplicate cron calls cannot emit duplicate reports. Email failure updates the run but does not erase findings.

**Step 5: Run and verify GREEN**

Run: `npm test -- src/lib/server/__tests__/dailyQuestionReviewNotifications.test.ts src/lib/server/__tests__/dailyQuestionReviewService.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/server/dailyQuestionReviewNotifications.ts src/lib/server/__tests__/dailyQuestionReviewNotifications.test.ts src/lib/server/dailyQuestionReviewService.ts
git commit -m "feat: email nightly question review reports"
```

### Task 9: Add The Secret-Protected Vercel Cron Route

**Files:**
- Create: `src/app/api/cron/daily-question-review/route.ts`
- Create: `src/app/api/cron/daily-question-review/route.test.ts`
- Create: `vercel.json`

**Step 1: Write failing route tests**

Test missing/malformed `CRON_SECRET`, valid bearer authorization, outside-window no-op, challenge-date calculation, service invocation, controlled error responses, and no secret leakage. Allow a test-only `now` dependency through a pure handler factory rather than query parameters.

**Step 2: Run and verify RED**

Run: `npm test -- src/app/api/cron/daily-question-review/route.test.ts`

Expected: FAIL because the route is missing.

**Step 3: Implement the route and Vercel schedules**

Create a dynamic Node.js route with bounded duration. Authorize `Authorization: Bearer ${CRON_SECRET}` using constant-time comparison. Compute the Central schedule and return `204` outside the window. Configure two once-daily UTC schedules covering CDT and CST; idempotency makes overlapping invocations harmless.

```json
{
  "crons": [
    { "path": "/api/cron/daily-question-review", "schedule": "0 23 * * *" },
    { "path": "/api/cron/daily-question-review", "schedule": "0 0 * * *" }
  ]
}
```

Verify the final Vercel schema accepts duplicate-path schedules; if Vercel rejects duplicate paths, create two thin route aliases that call the same handler.

**Step 4: Run and verify GREEN**

Run: `npm test -- src/app/api/cron/daily-question-review/route.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/cron/daily-question-review/route.ts src/app/api/cron/daily-question-review/route.test.ts vercel.json
git commit -m "feat: schedule nightly question verification"
```

### Task 10: Add The Private Review Page And Confirmed Actions

**Files:**
- Create: `src/lib/server/adminAuth.ts`
- Create: `src/lib/server/__tests__/adminAuth.test.ts`
- Create: `src/app/admin/daily-review/[date]/page.tsx`
- Create: `src/app/admin/daily-review/[date]/DailyReviewActions.tsx`
- Create: `src/app/admin/daily-review/[date]/page.test.tsx`
- Create: `src/app/api/admin/daily-review/[date]/resolve/route.ts`
- Create: `src/app/api/admin/daily-review/[date]/resolve/route.test.ts`
- Modify: `src/lib/server/dailyQuestionReviewRepository.ts`
- Modify: `supabase/migrations/202608080001_nightly_question_verification.sql`

**Step 1: Write failing administrator-auth tests**

Test a missing session, forged cookie, valid Supabase `getUser()` result, absent allowlist, and `DAILY_REVIEW_ADMIN_USER_IDS` parsing. Authorization requires both server-verified authentication and allowlist membership.

**Step 2: Run and verify RED**

Run: `npm test -- src/lib/server/__tests__/adminAuth.test.ts`

Expected: FAIL because admin auth is missing.

**Step 3: Implement server-only admin authorization**

Use the request cookie only to obtain the access token, then call Supabase Auth `getUser()` through the session client. Compare the returned user ID against a trimmed UUID allowlist. Return no review data before authorization succeeds.

**Step 4: Write failing resolution-route tests**

Test authorization, date/item validation, keep action, replacement action, same-difficulty enforcement, draft-only enforcement, duplicate-question rejection, repeat-action idempotency, and audit metadata.

**Step 5: Run and verify RED**

Run: `npm test -- src/app/api/admin/daily-review/[date]/resolve/route.test.ts`

Expected: FAIL because the route is missing.

**Step 6: Add an atomic service-role resolution RPC**

Extend the migration with a revoked-by-default Postgres function that locks the review item and challenge item, verifies the challenge is still unpublished, applies only the stored verified replacement, updates the snapshot/question ID, and records resolution metadata. The route revalidates the full selection with the generator before calling the RPC.

**Step 7: Write failing page tests**

Test redirect/forbidden states, all five rows, verdict labels, evidence links, replacement preview, disabled replacement when unavailable, cost/status display, and confirmation UI. Keep the page operational and compact; do not expose it in public navigation.

**Step 8: Implement the page and actions**

Use a server-rendered page plus a small client action component for POST confirmation and refresh. GET navigation has no side effects. Keep/replacement buttons use clear text and familiar icons only where an existing icon library is available.

**Step 9: Run and verify GREEN**

Run: `npm test -- src/lib/server/__tests__/adminAuth.test.ts src/app/api/admin/daily-review/[date]/resolve/route.test.ts src/app/admin/daily-review/[date]/page.test.tsx`

Expected: PASS.

**Step 10: Commit**

```bash
git add src/lib/server/adminAuth.ts src/lib/server/__tests__/adminAuth.test.ts src/app/admin/daily-review src/app/api/admin/daily-review src/lib/server/dailyQuestionReviewRepository.ts supabase/migrations/202608080001_nightly_question_verification.sql
git commit -m "feat: review and replace flagged Daily 5 questions"
```

### Task 11: Document Configuration And Verify The Complete Feature

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-08-08-nightly-question-verification-design.md`
- Create: `docs/runbooks/nightly-question-verification.md`

**Step 1: Document environment variables and rollout**

Document without secret values:

- `OPENAI_API_KEY`
- `DAILY_REVIEW_OPENAI_MODEL` (optional; default `gpt-5.6-terra`)
- `DAILY_REVIEW_MONTHLY_BUDGET_CENTS` (default `1000`)
- `DAILY_REVIEW_APPROVED_SOURCE_DOMAINS` (optional additions)
- `DAILY_REVIEW_ADMIN_USER_IDS`
- `CRON_SECRET`
- existing `RESEND_API_KEY`
- existing `QUESTION_REPORT_EMAIL_FROM`
- existing `QUESTION_REPORT_EMAIL_TO`
- `NEXT_PUBLIC_SITE_URL`

Include OpenAI setup: dedicated project, $10 prepaid credit, Auto Recharge off, project key, usage dashboard, and key rotation. Include Vercel production setup, manual cron invocation, Supabase review queries, Resend verification, failure diagnosis, and rollback steps.

**Step 2: Run focused migration and feature tests**

Run:

```bash
npm test -- src/lib/__tests__/dailyQuestionReviewMigration.test.ts src/lib/__tests__/nightlyReviewSchedule.test.ts src/lib/server/__tests__/dailyQuestionSourceFetcher.test.ts src/lib/server/__tests__/openAiQuestionVerifier.test.ts src/lib/server/__tests__/dailyQuestionReviewBudget.test.ts src/lib/server/__tests__/dailyQuestionReviewRepository.test.ts src/lib/server/__tests__/dailyQuestionReviewService.test.ts src/lib/server/__tests__/dailyQuestionReviewNotifications.test.ts src/app/api/cron/daily-question-review/route.test.ts src/lib/server/__tests__/adminAuth.test.ts src/app/api/admin/daily-review/[date]/resolve/route.test.ts src/app/admin/daily-review/[date]/page.test.tsx
```

Expected: all focused tests PASS.

**Step 3: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: 0 failing tests, 0 lint errors, successful production build, and no whitespace errors.

**Step 4: Perform a security and requirements review**

Check:

- no secret appears in client bundles, source, logs, or test snapshots;
- cron and admin routes fail closed;
- URL fetching cannot reach private/local networks;
- verification never mutates reusable questions;
- replacements preserve difficulty and composition;
- duplicate triggers cannot duplicate email;
- all-clear email is generated;
- current Daily 5 behavior remains available when review fails; and
- no real OpenAI or Resend call occurred during automated tests.

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-08-08-nightly-question-verification-design.md docs/runbooks/nightly-question-verification.md
git commit -m "docs: add nightly verification runbook"
```

**Step 6: Prepare deployment without performing external writes**

List the exact Supabase migration, Vercel environment variables, OpenAI billing/key steps, and controlled production smoke test. Do not push migrations, deploy, purchase credit, create keys, or send a real email until the user explicitly completes or authorizes those external steps.
