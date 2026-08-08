create table if not exists public.daily_question_review_runs (
  id uuid primary key default gen_random_uuid(),
  daily_challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  challenge_date date not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed', 'budget_blocked')),
  run_kind text not null default 'scheduled'
    check (run_kind in ('scheduled')),
  model text not null check (char_length(model) between 1 and 100),
  verifier_version text not null check (char_length(verifier_version) between 1 and 100),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  search_count integer not null default 0 check (search_count >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'failed')),
  email_sent_at timestamptz,
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (challenge_date, run_kind),
  unique (id, daily_challenge_id)
);

create table if not exists public.daily_question_review_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.daily_question_review_runs (id) on delete cascade,
  daily_challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  question_id uuid not null references public.questions (id) on delete restrict,
  question_snapshot jsonb not null
    check (jsonb_typeof(question_snapshot) = 'object'),
  verdict text
    check (verdict in ('passed', 'risk', 'unable_to_verify')),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  explanation text check (explanation is null or char_length(explanation) <= 2000),
  conflicts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conflicts) = 'array'),
  source_fetch_results jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_fetch_results) = 'array'),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  replacement_question_id uuid references public.questions (id) on delete restrict,
  replacement_question_snapshot jsonb
    check (
      replacement_question_snapshot is null
      or jsonb_typeof(replacement_question_snapshot) = 'object'
    ),
  replacement_finding jsonb
    check (replacement_finding is null or jsonb_typeof(replacement_finding) = 'object'),
  resolution text not null default 'pending'
    check (resolution in ('pending', 'kept', 'replaced')),
  resolved_by uuid references auth.users (id) on delete set null,
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
    (verdict is null and confidence is null and explanation is null)
    or (verdict is not null and confidence is not null and explanation is not null)
  ),
  check (
    resolution <> 'replaced'
    or replacement_question_id is not null
  )
);

create index if not exists daily_question_review_runs_status_challenge_date_idx
  on public.daily_question_review_runs (status, challenge_date desc);

create index if not exists daily_question_review_runs_challenge_id_idx
  on public.daily_question_review_runs (daily_challenge_id);

create index if not exists daily_question_review_items_run_verdict_idx
  on public.daily_question_review_items (run_id, verdict);

create index if not exists daily_question_review_items_resolution_idx
  on public.daily_question_review_items (resolution, created_at desc);

create index if not exists daily_question_review_items_question_id_idx
  on public.daily_question_review_items (question_id);

alter table public.daily_question_review_runs enable row level security;
alter table public.daily_question_review_items enable row level security;

revoke all on public.daily_question_review_runs from public, anon, authenticated;
revoke all on public.daily_question_review_items from public, anon, authenticated;

comment on table public.daily_question_review_runs is
  'Private operational record for each nightly Daily 5 verification run.';

comment on table public.daily_question_review_items is
  'Private verification findings and administrator resolutions for a nightly Daily 5 review.';

create schema if not exists internal;

revoke all on schema internal from public, anon, authenticated;

create or replace view internal.daily_question_review
with (security_invoker = true)
as
select
  r.id as run_id,
  r.daily_challenge_id,
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
  r.error_message as run_error_message,
  i.id as review_item_id,
  i.slot,
  i.question_id,
  s.slug as sport,
  s.name as sport_name,
  q.difficulty,
  i.question_snapshot,
  i.verdict,
  i.confidence,
  i.explanation,
  i.conflicts,
  i.source_fetch_results,
  i.evidence,
  i.replacement_question_id,
  i.replacement_question_snapshot,
  i.replacement_finding,
  i.resolution,
  i.resolved_by,
  p.display_name as resolver_display_name,
  i.resolved_at,
  i.application_metadata,
  i.applied_at,
  i.created_at as item_created_at,
  i.updated_at as item_updated_at
from public.daily_question_review_runs r
join public.daily_question_review_items i
  on i.run_id = r.id
join public.questions q
  on q.id = i.question_id
join public.sports s
  on s.id = q.sport_id
left join public.profiles p
  on p.id = i.resolved_by;

comment on view internal.daily_question_review is
  'Private owner review view for nightly Daily 5 verification findings and resolutions.';

revoke all on internal.daily_question_review from public, anon, authenticated;
