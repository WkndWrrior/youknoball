create unique index if not exists daily_challenges_id_challenge_date_unique
  on public.daily_challenges (id, challenge_date);

create table if not exists public.daily_question_review_runs (
  id uuid primary key default gen_random_uuid(),
  daily_challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  review_date date not null,
  challenge_date date not null,
  status text not null default 'preparing'
    check (status in ('preparing', 'running', 'completed', 'completed_with_flags', 'failed')),
  run_kind text not null default 'scheduled'
    check (run_kind in ('scheduled')),
  model text not null check (char_length(model) between 1 and 100),
  verifier_version text not null check (char_length(verifier_version) between 1 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  search_count integer not null default 0 check (search_count >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sending', 'sent', 'failed')),
  email_sent_at timestamptz,
  email_metadata jsonb not null default
    '{"provider":"resend","providerMessageId":null,"attempts":0,"lastAttemptAt":null,"failure":null}'::jsonb
    check (
      jsonb_typeof(email_metadata) = 'object'
      and email_metadata ?& array[
        'provider',
        'providerMessageId',
        'attempts',
        'lastAttemptAt',
        'failure'
      ]
      and email_metadata->>'provider' = 'resend'
      and jsonb_typeof(email_metadata->'attempts') = 'number'
      and (email_metadata->>'attempts')::integer between 0 and 10
      and (
        jsonb_typeof(email_metadata->'providerMessageId') = 'null'
        or (
          jsonb_typeof(email_metadata->'providerMessageId') = 'string'
          and char_length(email_metadata->>'providerMessageId') between 1 and 200
        )
      )
      and (
        jsonb_typeof(email_metadata->'lastAttemptAt') = 'null'
        or (
          jsonb_typeof(email_metadata->'lastAttemptAt') = 'string'
          and char_length(email_metadata->>'lastAttemptAt') between 1 and 50
        )
      )
      and (
        jsonb_typeof(email_metadata->'failure') = 'null'
        or (
          jsonb_typeof(email_metadata->'failure') = 'object'
          and email_metadata->'failure' ?& array['code', 'message', 'occurredAt']
          and jsonb_typeof(email_metadata->'failure'->'code') = 'string'
          and char_length(email_metadata->'failure'->>'code') between 1 and 100
          and jsonb_typeof(email_metadata->'failure'->'message') = 'string'
          and char_length(email_metadata->'failure'->>'message') between 1 and 1000
          and jsonb_typeof(email_metadata->'failure'->'occurredAt') = 'string'
          and char_length(email_metadata->'failure'->>'occurredAt') between 1 and 50
        )
      )
      and octet_length(email_metadata::text) <= 4000
    ),
  errors jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(errors) = 'array'
      and jsonb_array_length(errors) <= 20
      and octet_length(errors::text) <= 20000
    ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (review_date, run_kind),
  unique (challenge_date, run_kind),
  unique (id, daily_challenge_id),
  foreign key (daily_challenge_id, challenge_date)
    references public.daily_challenges (id, challenge_date)
    on delete cascade,
  check (review_date < challenge_date),
  check (
    (
      status = 'preparing'
      and started_at is null
      and completed_at is null
    )
    or (
      status = 'running'
      and started_at is not null
      and completed_at is null
    )
    or (
      status in ('completed', 'completed_with_flags')
      and started_at is not null
      and completed_at is not null
      and completed_at >= started_at
    )
    or (
      status = 'failed'
      and completed_at is not null
      and (started_at is null or completed_at >= started_at)
    )
  ),
  check (
    (
      email_status = 'pending'
      and email_sent_at is null
      and (email_metadata->>'attempts')::integer = 0
      and jsonb_typeof(email_metadata->'providerMessageId') = 'null'
      and jsonb_typeof(email_metadata->'lastAttemptAt') = 'null'
      and jsonb_typeof(email_metadata->'failure') = 'null'
    )
    or (
      email_status = 'sending'
      and email_sent_at is null
      and (email_metadata->>'attempts')::integer >= 1
      and jsonb_typeof(email_metadata->'providerMessageId') = 'null'
      and jsonb_typeof(email_metadata->'lastAttemptAt') = 'string'
      and jsonb_typeof(email_metadata->'failure') = 'null'
    )
    or (
      email_status = 'sent'
      and email_sent_at is not null
      and (email_metadata->>'attempts')::integer >= 1
      and email_metadata->>'providerMessageId' is not null
      and jsonb_typeof(email_metadata->'lastAttemptAt') = 'string'
      and jsonb_typeof(email_metadata->'failure') = 'null'
    )
    or (
      email_status = 'failed'
      and email_sent_at is null
      and (email_metadata->>'attempts')::integer >= 1
      and jsonb_typeof(email_metadata->'providerMessageId') = 'null'
      and jsonb_typeof(email_metadata->'lastAttemptAt') = 'string'
      and jsonb_typeof(email_metadata->'failure') = 'object'
    )
  )
);

create table if not exists public.daily_question_review_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.daily_question_review_runs (id) on delete cascade,
  daily_challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  question_id uuid not null references public.questions (id) on delete restrict,
  question_snapshot jsonb not null
    check (
      jsonb_typeof(question_snapshot) = 'object'
      and question_snapshot ?& array[
        'id',
        'question_text',
        'option_a',
        'option_b',
        'option_c',
        'option_d',
        'correct_option',
        'sport',
        'difficulty',
        'source_notes'
      ]
      and jsonb_typeof(question_snapshot->'id') = 'string'
      and question_snapshot->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (question_snapshot->>'id')::uuid = question_id
      and jsonb_typeof(question_snapshot->'question_text') = 'string'
      and char_length(btrim(question_snapshot->>'question_text')) between 1 and 1000
      and jsonb_typeof(question_snapshot->'option_a') = 'string'
      and char_length(btrim(question_snapshot->>'option_a')) between 1 and 500
      and jsonb_typeof(question_snapshot->'option_b') = 'string'
      and char_length(btrim(question_snapshot->>'option_b')) between 1 and 500
      and jsonb_typeof(question_snapshot->'option_c') = 'string'
      and char_length(btrim(question_snapshot->>'option_c')) between 1 and 500
      and jsonb_typeof(question_snapshot->'option_d') = 'string'
      and char_length(btrim(question_snapshot->>'option_d')) between 1 and 500
      and question_snapshot->>'correct_option' in ('A', 'B', 'C', 'D')
      and question_snapshot->>'difficulty' in ('easy', 'medium', 'hard')
      and jsonb_typeof(question_snapshot->'sport') = 'object'
      and question_snapshot->'sport' ?& array['slug', 'name']
      and jsonb_typeof(question_snapshot->'sport'->'slug') = 'string'
      and char_length(btrim(question_snapshot->'sport'->>'slug')) between 1 and 50
      and jsonb_typeof(question_snapshot->'sport'->'name') = 'string'
      and char_length(btrim(question_snapshot->'sport'->>'name')) between 1 and 100
      and (
        jsonb_typeof(question_snapshot->'source_notes') = 'null'
        or (
          jsonb_typeof(question_snapshot->'source_notes') = 'string'
          and char_length(question_snapshot->>'source_notes') <= 4000
        )
      )
    ),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'reviewing', 'completed', 'failed')),
  verdict text
    check (verdict in ('passed', 'risk', 'unable_to_verify')),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  explanation text check (explanation is null or char_length(explanation) <= 2000),
  conflicts jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(conflicts) = 'array'
      and jsonb_array_length(conflicts) <= 10
    ),
  source_fetch_results jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(source_fetch_results) = 'array'
      and jsonb_array_length(source_fetch_results) <= 20
    ),
  evidence jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(evidence) = 'array'
      and jsonb_array_length(evidence) <= 10
    ),
  replacement_question_id uuid references public.questions (id) on delete restrict,
  replacement_eligible boolean not null default false,
  replacement_question_snapshot jsonb
    check (
      replacement_question_snapshot is null
      or (
        jsonb_typeof(replacement_question_snapshot) = 'object'
        and replacement_question_snapshot ?& array[
          'id',
          'question_text',
          'option_a',
          'option_b',
          'option_c',
          'option_d',
          'correct_option',
          'sport',
          'difficulty',
          'source_notes'
        ]
        and jsonb_typeof(replacement_question_snapshot->'id') = 'string'
        and replacement_question_snapshot->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(replacement_question_snapshot->'question_text') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'question_text')) between 1 and 1000
        and jsonb_typeof(replacement_question_snapshot->'option_a') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'option_a')) between 1 and 500
        and jsonb_typeof(replacement_question_snapshot->'option_b') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'option_b')) between 1 and 500
        and jsonb_typeof(replacement_question_snapshot->'option_c') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'option_c')) between 1 and 500
        and jsonb_typeof(replacement_question_snapshot->'option_d') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'option_d')) between 1 and 500
        and replacement_question_snapshot->>'correct_option' in ('A', 'B', 'C', 'D')
        and replacement_question_snapshot->>'difficulty' in ('easy', 'medium', 'hard')
        and jsonb_typeof(replacement_question_snapshot->'sport') = 'object'
        and replacement_question_snapshot->'sport' ?& array['slug', 'name']
        and jsonb_typeof(replacement_question_snapshot->'sport'->'slug') = 'string'
        and char_length(btrim(replacement_question_snapshot->'sport'->>'slug')) between 1 and 50
        and jsonb_typeof(replacement_question_snapshot->'sport'->'name') = 'string'
        and char_length(btrim(replacement_question_snapshot->'sport'->>'name')) between 1 and 100
        and (
          jsonb_typeof(replacement_question_snapshot->'source_notes') = 'null'
          or (
            jsonb_typeof(replacement_question_snapshot->'source_notes') = 'string'
            and char_length(replacement_question_snapshot->>'source_notes') <= 4000
          )
        )
      )
    ),
  replacement_finding jsonb
    check (
      replacement_finding is null
      or (
        jsonb_typeof(replacement_finding) = 'object'
        and replacement_finding ?& array[
          'questionId',
          'verdict',
          'confidence',
          'explanation',
          'conflicts',
          'evidence',
          'verifiedAt'
        ]
        and jsonb_typeof(replacement_finding->'questionId') = 'string'
        and replacement_finding->>'questionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(replacement_finding->'verdict') = 'string'
        and replacement_finding->>'verdict' in ('passed', 'risk', 'unable_to_verify')
        and jsonb_typeof(replacement_finding->'confidence') = 'number'
        and (replacement_finding->>'confidence')::numeric between 0 and 1
        and jsonb_typeof(replacement_finding->'explanation') = 'string'
        and char_length(btrim(replacement_finding->>'explanation')) between 1 and 2000
        and jsonb_typeof(replacement_finding->'conflicts') = 'array'
        and jsonb_array_length(replacement_finding->'conflicts') <= 10
        and jsonb_typeof(replacement_finding->'evidence') = 'array'
        and jsonb_array_length(replacement_finding->'evidence') <= 10
        and jsonb_typeof(replacement_finding->'verifiedAt') = 'string'
        and char_length(replacement_finding->>'verifiedAt') between 1 and 50
      )
    ),
  resolution text not null default 'pending'
    check (resolution in ('pending', 'kept', 'replaced')),
  resolved_by uuid references auth.users (id) on delete restrict,
  resolved_at timestamptz,
  application_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(application_metadata) = 'object'),
  applied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (run_id, slot),
  foreign key (run_id, daily_challenge_id)
    references public.daily_question_review_runs (id, daily_challenge_id)
    on delete cascade,
  check (
    (
      review_status in ('pending', 'reviewing', 'failed')
      and verdict is null
      and confidence is null
      and explanation is null
      and jsonb_array_length(conflicts) = 0
      and jsonb_array_length(evidence) = 0
    )
    or (
      review_status = 'completed'
      and verdict is not null
      and confidence is not null
      and explanation is not null
    )
  ),
  check (
    verdict is null
    or verdict = 'unable_to_verify'
    or jsonb_array_length(evidence) > 0
  ),
  check (
    resolution <> 'replaced'
    or (
      replacement_eligible
      and replacement_question_id is not null
      and replacement_question_snapshot is not null
      and replacement_finding is not null
    )
  ),
  check (
    (
      replacement_question_id is null
      and replacement_question_snapshot is null
      and replacement_finding is null
      and not replacement_eligible
    )
    or (
      replacement_question_id is not null
      and replacement_question_snapshot is not null
      and replacement_finding is not null
      and replacement_question_id <> question_id
      and (replacement_question_snapshot->>'id')::uuid = replacement_question_id
      and (replacement_finding->>'questionId')::uuid = replacement_question_id
      and replacement_question_snapshot->>'difficulty' = question_snapshot->>'difficulty'
      and (
        not replacement_eligible
        or (
          replacement_finding->>'verdict' = 'passed'
          and jsonb_array_length(replacement_finding->'evidence') > 0
        )
      )
    )
  ),
  check (
    (
      resolution = 'pending'
      and resolved_by is null
      and resolved_at is null
      and applied_at is null
      and application_metadata = '{}'::jsonb
    )
    or (
      resolution = 'kept'
      and review_status = 'completed'
      and resolved_by is not null
      and resolved_at is not null
      and applied_at is null
      and application_metadata = '{}'::jsonb
      and resolved_at >= created_at
    )
    or (
      resolution = 'replaced'
      and review_status = 'completed'
      and resolved_by is not null
      and resolved_at is not null
      and applied_at is not null
      and resolved_at >= created_at
      and applied_at >= resolved_at
    )
  )
);

drop trigger if exists daily_question_review_runs_set_updated_at
  on public.daily_question_review_runs;
create trigger daily_question_review_runs_set_updated_at
before update on public.daily_question_review_runs
for each row
execute function public.set_updated_at();

drop trigger if exists daily_question_review_items_set_updated_at
  on public.daily_question_review_items;
create trigger daily_question_review_items_set_updated_at
before update on public.daily_question_review_items
for each row
execute function public.set_updated_at();

create index if not exists daily_question_review_runs_status_review_date_idx
  on public.daily_question_review_runs (status, review_date desc);

create index if not exists daily_question_review_runs_challenge_id_idx
  on public.daily_question_review_runs (daily_challenge_id);

create index if not exists daily_question_review_items_run_verdict_idx
  on public.daily_question_review_items (run_id, verdict);

create index if not exists daily_question_review_items_run_status_idx
  on public.daily_question_review_items (run_id, review_status);

create index if not exists daily_question_review_items_resolution_idx
  on public.daily_question_review_items (resolution, created_at desc);

create index if not exists daily_question_review_items_question_id_idx
  on public.daily_question_review_items (question_id);

alter table public.daily_question_review_runs enable row level security;
alter table public.daily_question_review_items enable row level security;

revoke all on public.daily_question_review_runs from public, anon, authenticated;
revoke all on public.daily_question_review_items from public, anon, authenticated;

grant select, insert, update on public.daily_question_review_runs to service_role;
grant select, insert, update on public.daily_question_review_items to service_role;

comment on table public.daily_question_review_runs is
  'Service-role-only operational record for each nightly Daily 5 verification run.';

comment on table public.daily_question_review_items is
  'Service-role-only verification findings and administrator resolutions for a nightly Daily 5 review.';

create schema if not exists internal;

revoke all on schema internal from public, anon, authenticated;

create or replace view internal.daily_question_review
with (security_invoker = true)
as
select
  r.id as run_id,
  r.daily_challenge_id,
  r.review_date,
  r.challenge_date,
  r.status as run_status,
  r.run_kind,
  r.model,
  r.verifier_version,
  r.started_at,
  r.completed_at,
  r.input_tokens,
  r.output_tokens,
  r.search_count,
  r.estimated_cost_usd,
  r.email_status,
  r.email_sent_at,
  r.email_metadata,
  r.errors as run_errors,
  i.id as review_item_id,
  i.slot,
  i.question_id,
  i.question_snapshot->'sport'->>'slug' as sport,
  i.question_snapshot->'sport'->>'name' as sport_name,
  i.question_snapshot->>'difficulty' as difficulty,
  i.question_snapshot,
  i.review_status,
  i.verdict,
  i.confidence,
  i.explanation,
  i.conflicts,
  i.source_fetch_results,
  i.evidence,
  i.replacement_question_id,
  i.replacement_eligible,
  i.replacement_question_snapshot,
  i.replacement_finding,
  i.resolution,
  i.resolved_by,
  i.resolved_at,
  i.application_metadata,
  i.applied_at,
  i.created_at as item_created_at,
  i.updated_at as item_updated_at
from public.daily_question_review_runs r
join public.daily_question_review_items i
  on i.run_id = r.id;

comment on view internal.daily_question_review is
  'Service-role-only owner review view for nightly Daily 5 verification findings and resolutions.';

revoke all on internal.daily_question_review from public, anon, authenticated;

grant usage on schema internal to service_role;
grant select on internal.daily_question_review to service_role;
