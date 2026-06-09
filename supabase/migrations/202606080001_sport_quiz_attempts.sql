create table if not exists public.sport_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  score smallint not null check (score between 0 and 5),
  total_questions smallint not null check (total_questions = 5),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sport_quiz_attempt_items (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.sport_quiz_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  chosen_option text not null check (chosen_option in ('A', 'B', 'C', 'D')),
  is_correct boolean not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (attempt_id, question_id)
);

create index if not exists sport_quiz_attempts_user_id_idx
  on public.sport_quiz_attempts (user_id);

create index if not exists sport_quiz_attempts_user_id_created_at_idx
  on public.sport_quiz_attempts (user_id, created_at desc);

create index if not exists sport_quiz_attempts_sport_id_idx
  on public.sport_quiz_attempts (sport_id);

create index if not exists sport_quiz_attempt_items_attempt_id_idx
  on public.sport_quiz_attempt_items (attempt_id);

create index if not exists sport_quiz_attempt_items_question_id_idx
  on public.sport_quiz_attempt_items (question_id);

alter table public.sport_quiz_attempts enable row level security;
alter table public.sport_quiz_attempt_items enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sport_quiz_attempts'
      and policyname = 'sport_quiz_attempts_select_own'
  ) then
    create policy sport_quiz_attempts_select_own
      on public.sport_quiz_attempts
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sport_quiz_attempt_items'
      and policyname = 'sport_quiz_attempt_items_select_own'
  ) then
    create policy sport_quiz_attempt_items_select_own
      on public.sport_quiz_attempt_items
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.sport_quiz_attempts attempts
          where attempts.id = sport_quiz_attempt_items.attempt_id
            and attempts.user_id = auth.uid()
        )
      );
  end if;
end $$;

revoke all on public.sport_quiz_attempts from anon, authenticated;
revoke all on public.sport_quiz_attempt_items from anon, authenticated;

grant select on public.sport_quiz_attempts to authenticated;
grant select on public.sport_quiz_attempt_items to authenticated;
