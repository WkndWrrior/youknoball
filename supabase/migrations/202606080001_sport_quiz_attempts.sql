create table if not exists public.sport_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  submission_id uuid not null,
  score smallint not null check (score between 0 and 5),
  total_questions smallint not null check (total_questions = 5),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, submission_id)
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

create or replace function public.record_sport_quiz_attempt(
  p_user_id uuid,
  p_sport_id uuid,
  p_submission_id uuid,
  p_score smallint,
  p_total_questions smallint,
  p_items jsonb
)
returns table (
  attempt_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  recorded_attempt_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) <> 5
  then
    raise exception 'A sport quiz attempt requires exactly five items.';
  end if;

  insert into public.sport_quiz_attempts (
    user_id,
    sport_id,
    submission_id,
    score,
    total_questions
  )
  values (
    p_user_id,
    p_sport_id,
    p_submission_id,
    p_score,
    p_total_questions
  )
  on conflict (user_id, submission_id) do nothing
  returning id into recorded_attempt_id;

  if recorded_attempt_id is null then
    select attempts.id
    into recorded_attempt_id
    from public.sport_quiz_attempts attempts
    where attempts.user_id = p_user_id
      and attempts.submission_id = p_submission_id;

    return query select recorded_attempt_id, false;
    return;
  end if;

  insert into public.sport_quiz_attempt_items (
    attempt_id,
    question_id,
    chosen_option,
    is_correct
  )
  select
    recorded_attempt_id,
    (item ->> 'question_id')::uuid,
    item ->> 'chosen_option',
    (item ->> 'is_correct')::boolean
  from jsonb_array_elements(p_items) item;

  return query select recorded_attempt_id, true;
end;
$$;

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

revoke all on function public.record_sport_quiz_attempt(
  uuid,
  uuid,
  uuid,
  smallint,
  smallint,
  jsonb
) from public, anon, authenticated;

grant execute on function public.record_sport_quiz_attempt(
  uuid,
  uuid,
  uuid,
  smallint,
  smallint,
  jsonb
) to service_role;
