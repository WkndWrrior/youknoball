# Player Feedback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a private, email-notified player feedback flow with a discreet site-wide link and a dedicated mobile-friendly form page.

**Architecture:** A client feedback form posts a validated payload to a Next.js route. The route resolves the optional Supabase session, persists through the service-role client, and then sends a best-effort Resend notification. A private Supabase table and internal review view preserve submissions independently of email delivery.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase/PostgreSQL, Resend HTTP API, Vitest.

---

### Task 1: Add the private feedback schema and review view

**Files:**
- Create: `supabase/migrations/202608010001_player_feedback.sql`
- Create: `src/lib/__tests__/feedbackMigration.test.ts`

**Step 1: Write the failing migration contract test**

Add a test that reads `202608010001_player_feedback.sql` and asserts that it:

- Creates `public.feedback_submissions`.
- Restricts `feedback_type` to `general`, `bug`, and `idea`.
- Restricts `status` to `new`, `reviewing`, `resolved`, and `dismissed`.
- Caps messages at 2,000 characters and contact email at 320 characters.
- Enables RLS and revokes `anon` and `authenticated` access.
- Creates `internal.feedback_review` and revokes access to the internal schema and view.
- Joins `public.profiles` for optional reporter display information.

**Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/__tests__/feedbackMigration.test.ts`

Expected: FAIL because the migration file does not exist.

**Step 3: Create the migration**

Create `public.feedback_submissions` with these columns:

```sql
id uuid primary key default gen_random_uuid(),
reporter_user_id uuid references auth.users (id) on delete set null,
feedback_type text not null check (feedback_type in ('general', 'bug', 'idea')),
message text not null check (char_length(message) between 1 and 2000),
contact_email text check (contact_email is null or char_length(contact_email) <= 320),
source_path text check (source_path is null or char_length(source_path) <= 200),
status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
reviewer_notes text,
reviewed_at timestamptz,
created_at timestamptz not null default timezone('utc', now())
```

Add indexes for `(status, created_at desc)` and non-null `reporter_user_id`. Enable RLS and revoke all privileges from `anon` and `authenticated`.

Create `internal.feedback_review` with report fields plus `profiles.display_name`. Revoke schema and view access from public application roles.

**Step 4: Run the focused test**

Run: `npm test -- src/lib/__tests__/feedbackMigration.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add supabase/migrations/202608010001_player_feedback.sql src/lib/__tests__/feedbackMigration.test.ts
git commit -m "feat: add private player feedback schema"
```

### Task 2: Validate and normalize feedback payloads

**Files:**
- Create: `src/lib/feedback.ts`
- Create: `src/lib/__tests__/feedback.test.ts`

**Step 1: Write failing payload tests**

Cover:

- Trimming a valid message and optional email.
- Normalizing contact email casing.
- Accepting `general`, `bug`, and `idea`.
- Treating blank optional email and source path as `null`.
- Rejecting unknown types, blank messages, messages over 2,000 characters, malformed email, email over 320 characters, external URLs, protocol-relative paths, query strings, fragments, paths over 200 characters, and a populated honeypot.

Use this intended API:

```ts
const parsed = parseFeedbackPayload({
  feedbackType: "bug",
  message: "  The category card did not open.  ",
  contactEmail: "  PLAYER@EXAMPLE.COM ",
  sourcePath: "/categories",
  website: "",
});
```

Expected normalized result:

```ts
{
  feedbackType: "bug",
  message: "The category card did not open.",
  contactEmail: "player@example.com",
  sourcePath: "/categories",
}
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/__tests__/feedback.test.ts`

Expected: FAIL because `@/lib/feedback` does not exist.

**Step 3: Implement minimal validation**

Export:

```ts
export const FEEDBACK_TYPES = ["general", "bug", "idea"] as const;
export const MAX_FEEDBACK_MESSAGE_LENGTH = 2000;
export const MAX_FEEDBACK_EMAIL_LENGTH = 320;
export const MAX_FEEDBACK_SOURCE_PATH_LENGTH = 200;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type ParsedFeedbackPayload = { ... };
export function parseFeedbackPayload(value: unknown): ParsedFeedbackPayload | null;
```

Keep source paths same-site and query-free by requiring a leading single slash and rejecting `?`, `#`, and `//` prefixes. Use a deliberately basic email shape check suitable for optional contact details rather than attempting full RFC parsing.

**Step 4: Run the focused test**

Run: `npm test -- src/lib/__tests__/feedback.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/feedback.ts src/lib/__tests__/feedback.test.ts
git commit -m "feat: validate player feedback"
```

### Task 3: Persist feedback through the server repository

**Files:**
- Create: `src/lib/server/feedbackRepository.ts`
- Create: `src/lib/server/__tests__/feedbackRepository.test.ts`

**Step 1: Write the failing repository test**

Use a fluent Supabase query mock and assert that `createFeedbackSubmission` inserts into `feedback_submissions` with snake-case database fields:

```ts
{
  reporter_user_id: "user-1",
  feedback_type: "idea",
  message: "Add a rivalry quiz.",
  contact_email: "player@example.com",
  source_path: "/categories",
}
```

Assert it selects `id` and returns the created row. Add an error test proving Supabase errors are thrown.

**Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/server/__tests__/feedbackRepository.test.ts`

Expected: FAIL because the repository does not exist.

**Step 3: Implement the repository**

Add `createFeedbackSubmission(client, input)` using the same service-client typing and `.insert(...).select("id").single()` pattern as question reports.

**Step 4: Run the focused test**

Run: `npm test -- src/lib/server/__tests__/feedbackRepository.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/server/feedbackRepository.ts src/lib/server/__tests__/feedbackRepository.test.ts
git commit -m "feat: persist player feedback"
```

### Task 4: Send best-effort feedback notifications

**Files:**
- Create: `src/lib/server/feedbackNotifications.ts`
- Create: `src/lib/server/__tests__/feedbackNotifications.test.ts`

**Step 1: Write failing notification tests**

Cover:

- Returning `{ sent: false, reason: "not_configured" }` without calling `fetch` when the existing Resend variables are absent.
- Sending to comma-separated `QUESTION_REPORT_EMAIL_TO` recipients.
- Reusing `RESEND_API_KEY` and `QUESTION_REPORT_EMAIL_FROM`.
- Including submission ID, feedback type, message, optional contact email, reporter user ID, source path, and an `internal.feedback_review` SQL query.
- Throwing the Resend error body for a non-OK response.

**Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/server/__tests__/feedbackNotifications.test.ts`

Expected: FAIL because the notification module does not exist.

**Step 3: Implement the notification sender**

Implement `sendFeedbackNotification(feedback, fetchImpl = fetch)`. POST plain-text email JSON to `https://api.resend.com/emails` with a subject such as `Player feedback: Bug`.

Do not require a database client because all feedback details are already available after validation and persistence.

**Step 4: Run the focused test**

Run: `npm test -- src/lib/server/__tests__/feedbackNotifications.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/server/feedbackNotifications.ts src/lib/server/__tests__/feedbackNotifications.test.ts
git commit -m "feat: email player feedback notifications"
```

### Task 5: Add the public feedback API

**Files:**
- Create: `src/app/api/feedback/route.ts`
- Create: `src/app/api/feedback/route.test.ts`

**Step 1: Write failing API tests**

Mirror the question-report route test style and cover:

- Guest submission persists with `reporterUserId: null`.
- Valid session cookie attaches the signed-in user ID.
- Invalid and honeypot payloads return 400 before persistence.
- Database failure returns 500.
- Notification failure still returns 200 after persistence.
- Success returns `Thanks for helping us make You Kno Ball better.`

**Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/api/feedback/route.test.ts`

Expected: FAIL because the route does not exist.

**Step 3: Implement the route**

Follow the established question-report sequence:

1. Parse request JSON with `parseFeedbackPayload`.
2. Resolve the optional session via `getSupabaseSessionFromRequest`.
3. Get `supabaseAdmin()` and persist.
4. Attempt `sendFeedbackNotification` inside an inner `try/catch`.
5. Return success after persistence.
6. Return generic 400 and 500 messages without leaking server details.

Export `dynamic = "force-dynamic"`.

**Step 4: Run the focused test**

Run: `npm test -- src/app/api/feedback/route.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/feedback/route.ts src/app/api/feedback/route.test.ts
git commit -m "feat: accept player feedback"
```

### Task 6: Build the dedicated feedback page

**Files:**
- Create: `src/components/FeedbackForm.tsx`
- Create: `src/components/__tests__/FeedbackForm.test.ts`
- Create: `src/app/feedback/page.tsx`
- Create: `src/app/feedback/page.test.ts`

**Step 1: Write failing UI contract tests**

Following the repository's source-contract test pattern, assert that:

- The page renders `FeedbackForm` and passes a validated `from` pathname.
- The page has a concise `Feedback` heading and supporting sentence.
- The form offers General, Bug, and Idea controls.
- Message is required and capped at 2,000 characters.
- Contact email is optional and uses `type="email"` with a 320-character cap.
- The honeypot is hidden from users and omitted from tab order.
- The form posts to `/api/feedback`.
- Success clears the editable fields; failure preserves them.
- Status and error text use accessible roles.

**Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/__tests__/FeedbackForm.test.ts src/app/feedback/page.test.ts`

Expected: FAIL because the component and page do not exist.

**Step 3: Implement the form and page**

Create a client form with a stable segmented control, textarea, optional email input, visually hidden honeypot, submitting state, success state, and retryable error state. Keep the page unframed except for the actual form panel and align its typography with existing compact application pages.

Accept `searchParams` in the page, normalize `from` using the same pathname rules, and pass only the safe pathname into the client form.

**Step 4: Run the focused tests**

Run: `npm test -- src/components/__tests__/FeedbackForm.test.ts src/app/feedback/page.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/FeedbackForm.tsx src/components/__tests__/FeedbackForm.test.ts src/app/feedback/page.tsx src/app/feedback/page.test.ts
git commit -m "feat: add player feedback page"
```

### Task 7: Add the feedback link to every page

**Files:**
- Create: `src/components/SiteFooter.tsx`
- Create: `src/components/__tests__/SiteFooter.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/groups/page.test.ts`

**Step 1: Write the failing footer tests**

Assert that:

- `SiteFooter` uses `usePathname` and links to `/feedback` with the current pathname as `from`.
- The root layout renders `SiteFooter` after the main content wrapper.
- The link label is exactly `Feedback`.
- The footer uses compact, muted styling and stays in document flow.

**Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/__tests__/SiteFooter.test.ts src/app/groups/page.test.ts`

Expected: FAIL because the site footer does not exist.

**Step 3: Implement the footer and layout integration**

Create a small client `SiteFooter`. Build its href with `pathname: "/feedback"` and `query: { from: pathname }` so Next.js handles encoding.

Render it once in `RootLayout`. Make the body a vertical flex container and the content wrapper flex to fill short pages, placing the footer at the page bottom without fixed positioning.

**Step 4: Run the focused tests**

Run: `npm test -- src/components/__tests__/SiteFooter.test.ts src/app/groups/page.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/SiteFooter.tsx src/components/__tests__/SiteFooter.test.ts src/app/layout.tsx src/app/groups/page.test.ts
git commit -m "feat: add site-wide feedback link"
```

### Task 8: Verify, deploy the migration, and document the review query

**Files:**
- Modify: `docs/plans/2026-06-22-question-quality-roadmap.md`

**Step 1: Update the roadmap**

Record the player-feedback submission and notification flow as complete and add the review query:

```sql
select *
from internal.feedback_review
order by submitted_at desc;
```

Use the actual timestamp alias defined in the migration.

**Step 2: Run all verification commands**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0 with no test failures, lint errors, build errors, or whitespace errors.

**Step 3: Inspect the final diff and status**

Run:

```bash
git status --short
git diff --stat HEAD~7..HEAD
```

Confirm only the feedback feature, migration, tests, footer integration, and roadmap changed.

**Step 4: Commit the roadmap update**

```bash
git add docs/plans/2026-06-22-question-quality-roadmap.md
git commit -m "docs: record player feedback workflow"
```

**Step 5: Push the migration after user-approved deployment**

Run: `npx supabase db push`

Expected: migration `202608010001_player_feedback.sql` applies successfully.

**Step 6: Push the completed branch after user-approved publication**

Run the chosen branch integration flow, then push to `origin/main` only after final verification on the integrated state.
