alter table public.sport_quiz_attempts
  add column if not exists submission_id uuid;

update public.sport_quiz_attempts
set submission_id = gen_random_uuid()
where submission_id is null;

alter table public.sport_quiz_attempts
  alter column submission_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sport_quiz_attempts'::regclass
      and conname = 'sport_quiz_attempts_user_submission_unique'
  ) then
    alter table public.sport_quiz_attempts
      add constraint sport_quiz_attempts_user_submission_unique
      unique (user_id, submission_id);
  end if;
end $$;

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

    if recorded_attempt_id is null then
      raise exception 'Unable to resolve existing sport quiz attempt.';
    end if;

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
