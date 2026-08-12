# Nightly Daily 5 Verification Design

## Goal

Generate tomorrow's Daily 5 as a private draft, verify its questions against authoritative sources each evening, email a review report around 6 PM Central, and let an administrator keep or replace flagged questions before the challenge becomes live.

The verifier is advisory. It must never rewrite, retire, reclassify, or otherwise mutate a reusable question based only on an automated result.

## Existing Foundations

The application already has:

- reusable questions with source notes and reviewed timestamps;
- persisted daily challenges and immutable question snapshots;
- a generator that applies difficulty, sport-balance, and freshness preferences;
- Supabase authentication and service-role server access;
- Resend email notifications for player question reports; and
- private question-report and question-review data.

The new feature extends those paths instead of introducing a separate content system.

## Architecture

Vercel Cron invokes a private Next.js route through distinct once-daily Hobby-compatible entries. The route checks Central Time and proceeds only during the 6 PM and 7 PM hours. Each invocation performs at most one verification unit, allowing the persisted run to finish within function limits while database idempotency prevents duplicate work or email.

The job creates tomorrow's canonical challenge as an unpublished `generated` draft by calling the existing generator. It then fetches evidence from saved question sources, requests structured analysis from the OpenAI Responses API using GPT-5.6 Terra, stores the findings in Supabase, and sends a report through the existing Resend configuration.

The first player request on the challenge date publishes and serves the complete draft. If draft generation or verification fails, the existing on-demand generation path remains available so the Daily 5 does not disappear.

## Daily 5 Composition

The existing generator remains the single source of truth. A generated draft must contain exactly five distinct questions with this difficulty mix:

- two easy;
- one medium; and
- two hard.

The generator continues to prefer NBA and NFL coverage, at least three sports, no more than two questions from one sport, and questions not used recently. Its current relaxation behavior remains unchanged when the available pool is thin.

A replacement must have the same difficulty as the flagged question, must not appear elsewhere in the draft, and must satisfy freshness checks. The complete replacement set is rescored using the existing sport-balance rules. If no compliant replacement exists, the report states that instead of offering a weak swap.

## Source Collection

The verifier extracts HTTPS URLs from each question's `source_notes`. Source fetching applies:

- an explicit approved-domain allowlist;
- final-redirect domain validation;
- request timeouts;
- response-size limits;
- text-content checks; and
- safe HTML-to-text extraction.

Approved sources include official league, NCAA, team, school, and recognized historical database sites. ESPN is an approved secondary source. OpenAI web search is used only when saved sources are unavailable or inadequate and must be restricted to the approved domains.

The fetcher must reject private-network destinations, credentials in URLs, non-HTTPS protocols, unapproved redirects, and unsupported response types.

## Verification Results

GPT-5.6 Terra receives the question, answer choices, expected answer, and collected evidence. It must return validated structured output for each question:

- `passed`: the evidence supports the expected answer and wording;
- `risk`: evidence conflicts with the expected answer, exposes material ambiguity, or supports a different interpretation; or
- `unable_to_verify`: adequate evidence could not be collected.

Each result includes confidence, a concise explanation, evidence references, and potential conflicts. A model response that fails schema validation becomes `unable_to_verify`; it is never silently treated as passed.

If a primary question is flagged, the job selects a compliant replacement and verifies it before including it in the report.

## Data Model

Add a private `daily_question_review_runs` table containing:

- challenge and challenge date;
- job status and failure details;
- model and verifier version;
- start and completion timestamps;
- input, output, and search usage;
- estimated cost;
- email status and timestamp; and
- a unique scheduled-run key for idempotency.

Add a private `daily_question_review_items` table containing:

- review run, challenge, slot, and question;
- question snapshot reviewed;
- verdict, confidence, explanation, and conflicts;
- source-fetch and evidence metadata;
- replacement question and verified replacement snapshot when available;
- resolution (`pending`, `kept`, or `replaced`);
- resolver identity and timestamp; and
- replacement application details.

Enable RLS and grant no player-facing access. Server routes use the service role. Private internal review views may expose normalized data for Supabase dashboard inspection.

## Email And Review

Send an email every evening, including all-clear nights, to the existing `QUESTION_REPORT_EMAIL_TO` recipients. The message includes:

- tomorrow's date and overall status;
- all five questions and verdicts;
- explanations and evidence links;
- a verified same-difficulty replacement for each flagged question when available;
- estimated cost for the run;
- job errors or incomplete checks; and
- a secure link to the private review page.

Email links only navigate with GET requests. They never mutate data because email security systems may prefetch links.

The review page requires a valid Supabase session and an administrator allowlist. Keep and replace operations use confirmed POST requests. Replacements update only tomorrow's draft item and its snapshot, then record the administrator, timestamp, previous question, and replacement question. Reusable question-bank rows remain untouched.

## Scheduling And Idempotency

Thirty-six once-daily Vercel cron entries use five-minute offsets across UTC hours 23, 00, and 01. This remains compatible with Vercel Hobby's once-per-day expression restriction and covers 6-8 PM Central across daylight-saving changes. The route accepts only local hours 18 and 19; irrelevant or drifted invocations exit without work.

One invocation processes one unfinished primary, otherwise one required replacement, otherwise finalizes and attempts email. A three-minute token-fenced lease, active budget reservation, unique challenge date, persisted usage events, and transactional state transitions make retries deterministic. Concurrent callers observe the active run; email may arrive after 6 PM as the units complete.

## Budget Controls

Use a dedicated OpenAI project with a project-scoped API key. The initial account configuration is:

- $10 prepaid balance;
- Auto Recharge disabled; and
- a $10 application-side monthly limit.

The server records API-reported token and search usage and estimates cost using versioned pricing configuration. Before starting a run, it checks the current month's recorded spend. Per-request token limits, bounded searches, one scheduled run per date, and the monthly gate limit exposure. If the budget blocks a run, the failure is stored and a Resend alert is attempted without calling OpenAI.

## Failure Handling

Source failures, OpenAI failures, invalid model output, database failures, and email failures are recorded separately. Completed findings remain available even when a later step fails.

The nightly email clearly distinguishes factual risk from unavailable evidence and operational failure. No automated failure rewrites or retires a question. A flagged or incomplete review does not block the challenge from becoming playable at the start of its date.

The cron route is protected by `CRON_SECRET`. OpenAI, Supabase service-role, and Resend credentials remain server-only Vercel environment variables and are never returned to the browser or committed to Git.

## Testing

Automated tests cover:

- unchanged Daily 5 generation and relaxation rules;
- replacement composition and freshness safeguards;
- source URL extraction and domain enforcement;
- redirect, timeout, content-type, and response-size handling;
- OpenAI request construction and structured response parsing;
- all verification verdicts and failure modes;
- usage recording and monthly budget enforcement;
- cron authorization, Central Time gating, and idempotency;
- nightly all-clear and risk emails;
- administrator authorization and confirmed keep/replace actions; and
- existing gameplay, submission, and leaderboard behavior.

Tests mock OpenAI, source websites, and Resend. They never consume API credit or send real email. Rollout includes one controlled production verification and one real email after the secrets are configured.

## Deployment

Implementation and automated verification happen locally first. The user then:

1. creates a dedicated OpenAI API project;
2. purchases $10 in prepaid credit and disables Auto Recharge;
3. creates a project-scoped API key;
4. adds the API key, cron secret, admin allowlist, and existing email settings to Vercel; and
5. deploys the application to Vercel production.

The nightly schedule starts only after the production deployment. A custom website domain is not required for the cron job; Vercel can invoke the production `vercel.app` deployment. Resend can send independently once its sending domain is verified.

Production setup and operations are documented in
`docs/runbooks/nightly-question-verification.md`. Deployment remains a manual
handoff: the migration, Vercel configuration, OpenAI credit/key creation, and
the first real email are not performed by the local implementation workflow.
