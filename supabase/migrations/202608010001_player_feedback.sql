create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references auth.users (id) on delete set null,
  feedback_type text not null check (feedback_type in ('general', 'bug', 'idea')),
  message text not null check (char_length(message) between 1 and 2000),
  contact_email text check (contact_email is null or char_length(contact_email) <= 320),
  source_path text check (source_path is null or char_length(source_path) <= 200),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists feedback_submissions_status_created_at_idx
  on public.feedback_submissions (status, created_at desc);

create index if not exists feedback_submissions_reporter_user_id_idx
  on public.feedback_submissions (reporter_user_id)
  where reporter_user_id is not null;

alter table public.feedback_submissions enable row level security;

revoke all on public.feedback_submissions from anon, authenticated;

comment on table public.feedback_submissions is
  'Private storage for player feedback submissions.';

create schema if not exists internal;

revoke all on schema internal from public, anon, authenticated;

create or replace view internal.feedback_review
with (security_invoker = true)
as
select
  f.id,
  f.reporter_user_id,
  p.display_name as reporter_display_name,
  f.feedback_type,
  f.message,
  f.contact_email,
  f.source_path,
  f.status,
  f.reviewer_notes,
  f.reviewed_at,
  f.created_at
from public.feedback_submissions f
left join public.profiles p
  on p.id = f.reporter_user_id;

comment on view internal.feedback_review is
  'Private review queue for player feedback. Query from Supabase dashboard only.';

revoke all on internal.feedback_review from public, anon, authenticated;
