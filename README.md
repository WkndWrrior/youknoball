# YouKnowBall

YouKnowBall is a Next.js + Supabase trivia app for the daily sports challenge, player attempts, and leaderboard tracking.

## Local Development

- Install dependencies with `npm install`
- Start the app with `npm run dev`
- Run the test suite with `npm test`

## Nightly Daily 5 Verification

The production cron privately drafts and verifies tomorrow's Daily 5 at 6 PM
Central, emails an owner report, and exposes flagged items on an allowlisted
admin page. It never automatically edits or retires reusable questions.

Required production configuration:

- `OPENAI_API_KEY`
- `CRON_SECRET`
- `DAILY_REVIEW_ADMIN_USER_IDS`
- `RESEND_API_KEY`
- `QUESTION_REPORT_EMAIL_FROM`
- `QUESTION_REPORT_EMAIL_TO`
- `NEXT_PUBLIC_SITE_URL`
- the existing Supabase public and service-role settings

Optional configuration:

- `DAILY_REVIEW_OPENAI_MODEL` defaults to `gpt-5.6-terra`
- `DAILY_REVIEW_MONTHLY_BUDGET_CENTS` defaults to `1000`
- `DAILY_REVIEW_APPROVED_SOURCE_DOMAINS` adds comma-separated domains

See [the nightly verification runbook](docs/runbooks/nightly-question-verification.md)
for setup, review queries, smoke testing, diagnosis, and rollback.

## Database Migrations

Schema changes live in `supabase/migrations/`.

Task 5 backfills the legacy `public.daily_challenge_questions` table into the new reusable content model:

- `sports`
- `questions`
- `daily_challenges`
- `daily_challenge_items`

The first deployment keeps the legacy table in place so rollback stays possible while the new rows are populated and verified.

## Task 5 Manual Verification Checklist

Use this checklist on a staging copy of the database before cutting traffic over to the new schema.

- [ ] Explain the mapping from legacy rows to the new schema: `daily_challenge_questions.sport` seeds `sports.slug` and `sports.name`; `daily_challenge_questions.id` becomes `questions.id` and `daily_challenge_items.question_id`; `daily_challenge_questions.challenge_date` becomes `daily_challenges.challenge_date`; `daily_challenge_questions.slot` becomes `daily_challenge_items.slot`; `daily_attempts.daily_challenge_id` is backfilled by matching `challenge_date` to `daily_challenges.challenge_date`; `questions.difficulty` is derived from slot during backfill: `1-2 = easy`, `3 = medium`, `4-5 = hard`
- [ ] Confirm each challenge date still has exactly five rows before and after the backfill.
- [ ] Confirm the legacy and canonical question sets reconcile for each historical `challenge_date`; the canonical daily should represent the same five-question set, in the same slot order, for that date.
- [ ] Confirm each `daily_challenges` row has exactly five `daily_challenge_items` rows after the backfill.
- [ ] Confirm `question_snapshot` on each item reflects the legacy question content at backfill time.
- [ ] Capture leaderboard output before migration, run the migration, then confirm `public.daily_leaderboard` returns the same `average_score`, `total_plays`, and `last_played_at` values for the same staging data set.
- [ ] Confirm no signed-in attempt is orphaned: every row in `public.daily_attempts` with a non-null `daily_challenge_id` joins to a `daily_challenges` row for the same `challenge_date`.
- [ ] Leave `public.daily_challenge_questions` in place for the first deployment window so rollback remains possible.

Suggested reconciliation query:

```sql
select
  legacy.challenge_date,
  array_agg(legacy.id order by legacy.slot) as legacy_question_ids,
  array_agg(canonical.question_id order by canonical.slot) as canonical_question_ids
from public.daily_challenge_questions legacy
join public.daily_challenges challenge
  on challenge.challenge_date = legacy.challenge_date
join public.daily_challenge_items canonical
  on canonical.daily_challenge_id = challenge.id
 and canonical.slot = legacy.slot
group by legacy.challenge_date
order by legacy.challenge_date;
```

## Assumptions Used By The Backfill

- Backfilled reusable questions are marked `status = 'ready'`, `eligible_for_daily = true`, and `eligible_for_sport_quiz = true`.
- Backfilled daily challenges use `status = 'published'`, `generation_method = 'manual'`, and a legacy-specific rules version marker.
- Legacy timestamps are preserved where practical during backfill; the migration uses the earliest legacy timestamp for the challenge date.
