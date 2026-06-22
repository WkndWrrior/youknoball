create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete restrict,
  reporter_user_id uuid references auth.users (id) on delete set null,
  context text not null default 'unknown'
    check (context in ('daily_challenge', 'sport_quiz', 'unknown')),
  reason text not null
    check (reason in ('wrong_answer', 'unclear_question', 'typo', 'other')),
  note text
    check (note is null or char_length(note) <= 500),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists question_reports_question_id_idx
  on public.question_reports (question_id);

create index if not exists question_reports_status_created_at_idx
  on public.question_reports (status, created_at desc);

create index if not exists question_reports_reporter_user_id_idx
  on public.question_reports (reporter_user_id)
  where reporter_user_id is not null;

alter table public.question_reports enable row level security;

revoke all on public.question_reports from anon, authenticated;

comment on table public.question_reports is
  'Private review queue for player-reported question issues.';
