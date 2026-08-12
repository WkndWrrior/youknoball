# Nightly Question Verification Runbook

## Purpose

Starting at 6 PM America/Chicago, Supabase Cron invokes a private route that drafts
tomorrow's Daily 5, checks authoritative sources, stores findings, and emails
the owner after all work completes.
Findings are advisory; automation never rewrites, retires, or reclassifies a
reusable question.

## Production Setup

1. Apply `supabase/migrations/202608080001_nightly_question_verification.sql`.
2. Deploy to Vercel production with Fluid Compute enabled. The current
   deployment requires the Hobby default and maximum duration of 300 seconds.
3. Verify the Resend domain used by `QUESTION_REPORT_EMAIL_FROM`.
4. Create a dedicated OpenAI API project, add $10 prepaid credit, disable Auto
   Recharge, and create a project-scoped API key. API billing is separate from
   a ChatGPT subscription.
5. Generate a long random `CRON_SECRET` and identify the Supabase Auth UUIDs
   allowed to review questions.
6. Store the production origin and the same bearer secret in Supabase Vault.
7. Manually run `supabase/cron/nightly_question_verification.sql` in the
   Supabase SQL Editor after the production route is deployed.

Use the OpenAI usage dashboard to monitor that dedicated project's spend. Rotate
its project key immediately if it may have been exposed, then update Vercel
Production and redeploy.

Do not put secret values in source control, logs, tickets, or this runbook.

## Vercel Variables

Set these for Production:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Dedicated OpenAI project key |
| `DAILY_REVIEW_OPENAI_MODEL` | No | Defaults to `gpt-5.6-terra` |
| `DAILY_REVIEW_MONTHLY_BUDGET_CENTS` | No | Defaults to `1000` ($10) |
| `DAILY_REVIEW_APPROVED_SOURCE_DOMAINS` | No | Comma-separated allowlist additions |
| `DAILY_REVIEW_ADMIN_USER_IDS` | Yes | Comma-separated Supabase Auth UUIDs |
| `CRON_SECRET` | Yes | Supabase Cron bearer secret |
| `RESEND_API_KEY` | Yes | Resend server API key |
| `QUESTION_REPORT_EMAIL_FROM` | Yes | Verified Resend sender |
| `QUESTION_REPORT_EMAIL_TO` | Yes | Comma-separated owner recipients |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical HTTPS production origin |

The existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` must also be present. Redeploy after changes.

## Schedule And Manual Run

Create the two named Vault secrets once, replacing the placeholders locally:

```sql
select vault.create_secret(
  'https://YOUR_PRODUCTION_DOMAIN',
  'daily_review_site_url',
  'Nightly question review production origin'
);

select vault.create_secret(
  'PASTE_THE_SAME_VALUE_AS_VERCEL_CRON_SECRET',
  'daily_review_cron_secret',
  'Nightly question review bearer token'
);
```

Then open `supabase/cron/nightly_question_verification.sql` and run its complete
contents manually in the Supabase SQL Editor. Do not put either value in that
file. The script validates both secrets, enables `pg_cron` and `pg_net`, safely
replaces the named `nightly-question-verification` job, and schedules one POST
every five minutes during UTC hours 23, 00, 01, and 02.

The route accepts only the 6 PM, 7 PM, and 8 PM Central hours. The wider UTC
range covers daylight-saving changes; irrelevant invocations return `204`.
Inspect the installed job without revealing secrets:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'nightly-question-verification';
```

Each accepted invocation verifies at most one primary or replacement question.
The run keeps its active reservation and resumes deterministically on later
invocations. Leases, unique run keys, usage-event IDs, and email claims make
duplicate or imprecise delivery safe. The 8 PM window also retries failed or
stale-sending email claims for terminal runs. The email can arrive after 6 PM
as units complete. This design does not require a Pro plan, but the current
Vercel deployment must retain Fluid Compute and the 300-second route duration.
It cannot guarantee recovery after a scheduler outage that spans every accepted
Central-time window.

During the 6 PM, 7 PM, or 8 PM Central hour:

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://youknoball.com/api/cron/daily-question-review"
```

Outside those hours, an authorized request returns `204` and does no work.
Never add a query parameter that bypasses the time gate.

## Owner Review

The email links to `/admin/daily-review/YYYY-MM-DD`. Access requires a
server-verified Supabase session and an allowlisted user UUID. Email GET links
never mutate data. Keep and Replace require a confirmed same-origin POST.
Replace applies only the stored, freshly revalidated candidate while the
challenge is unpublished.

Supabase dashboard queries:

```sql
select *
from internal.daily_question_review
order by challenge_date desc, slot;
```

```sql
select review_date, challenge_date, status, reserved_microdollars,
       actual_microdollars, denial_reason, acquired_at, reconciled_at
from public.daily_question_review_reservations
order by acquired_at desc;
```

These objects are service-role-only and are not player-visible.

## Controlled Smoke Test

1. Confirm the migration appears in `npx supabase migration list`.
2. Confirm Auto Recharge is off and the OpenAI project has no unrelated keys.
3. Confirm Vercel Production variables exist without printing their values.
4. During the 6 PM, 7 PM, or 8 PM Central hour, invoke the route repeatedly until its
   response is `completed`; each `in_progress` response represents at most one
   persisted verification unit.
5. Confirm one draft, one scheduled run, five review items, and one reconciled
   reservation exist for tomorrow.
6. Confirm the email arrives and its admin link requires authentication.
7. Confirm opening the link does not mutate data. Exercise Keep or Replace only
   on a controlled flagged item and verify its audit fields.
8. Confirm reusable `public.questions` rows were not modified.

The first controlled run and real email consume external services and require
explicit owner authorization. Automated tests use mocks and spend no credit.

## Diagnosis

- `401`: the bearer value does not match `CRON_SECRET`.
- `503`: `CRON_SECRET` is absent or malformed.
- `204`: the request is outside the 6 PM, 7 PM, and 8 PM Central hours.
- Budget blocked: inspect `daily_question_review_reservations`; no OpenAI call
  should have occurred.
- Source failure: inspect `source_fetch_results` for blocked domains, redirects,
  timeouts, unsupported content, or private-network rejection.
- Verification failure: inspect run errors and usage events. Active reservations
  remain conservative until a token-owning worker finalizes them.
- Missing email: inspect `email_status`, `email_metadata`, Resend logs, domain
  verification, and recipient configuration.
- Admin `404`/`403`: verify Supabase `getUser()` and the exact allowlisted UUID.

Rotate a suspected OpenAI, Resend, Supabase, or cron secret immediately, update
Vercel Production, and redeploy. Never print the old or new value.

## Rollback

1. Stop scheduling with
   `select cron.unschedule('nightly-question-verification');`, or rotate
   `CRON_SECRET` first to stop authorized invocations immediately.
2. Deploy the previous application commit.
3. Revoke the dedicated OpenAI key if verification is being retired.
4. Leave additive review tables and audit rows in place while any prior deploy
   may reference them.
5. The on-demand Daily 5 path continues to generate and publish challenges when
   nightly review is disabled or fails.
