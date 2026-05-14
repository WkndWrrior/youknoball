create extension if not exists pgcrypto;

create table if not exists public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sports_slug_unique unique (slug)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete restrict,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A', 'B', 'C', 'D')),
  status text not null check (status in ('draft', 'ready', 'retired')),
  eligible_for_daily boolean not null default false,
  eligible_for_sport_quiz boolean not null default false,
  authoring_method text not null check (authoring_method in ('manual', 'ai_assisted')),
  source_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at
before update on public.questions
for each row
execute function public.set_updated_at();

create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null,
  status text not null check (status in ('generated', 'published', 'archived')),
  generation_method text not null check (generation_method in ('manual', 'semi_auto', 'auto')),
  rules_version text not null,
  generated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint daily_challenges_challenge_date_unique unique (challenge_date)
);

create table if not exists public.daily_challenge_items (
  id uuid primary key default gen_random_uuid(),
  daily_challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  question_id uuid not null references public.questions (id) on delete restrict,
  question_snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint daily_challenge_items_challenge_slot_unique unique (daily_challenge_id, slot)
);

/*
  Backfill legacy daily questions into the reusable content model.

  The first deployment keeps public.daily_challenge_questions in place so rollback
  stays possible while the canonical tables are populated from legacy rows.
  Each legacy challenge_date becomes one canonical daily_challenges row with the
  same five question ids and slot ordering in daily_challenge_items.
*/
with legacy_questions as (
  select
    q.*,
    lower(btrim(q.sport)) as sport_slug,
    btrim(q.sport) as sport_name,
    case
      when q.slot between 1 and 2 then 'easy'
      when q.slot = 3 then 'medium'
      else 'hard'
    end as reusable_difficulty
  from public.daily_challenge_questions q
),
legacy_sports as (
  select
    sport_slug,
    sport_name,
    min(challenge_date) as first_seen_at
  from legacy_questions
  group by sport_slug, sport_name
),
upserted_sports as (
  insert into public.sports (slug, name, is_active, sort_order, created_at)
  select
    sport_slug,
    sport_name,
    true,
    row_number() over (order by first_seen_at, sport_name),
    first_seen_at
  from legacy_sports
  on conflict (slug) do update set
    name = excluded.name,
    is_active = true,
    sort_order = excluded.sort_order
  returning id, slug, name, is_active, sort_order, created_at
),
upserted_questions as (
  insert into public.questions (
    id,
    sport_id,
    difficulty,
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_option,
    status,
    eligible_for_daily,
    eligible_for_sport_quiz,
    authoring_method,
    source_notes,
    reviewed_at,
    created_at,
    updated_at
  )
  select
    q.id,
    s.id,
    q.reusable_difficulty,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.correct_option,
    'ready',
    true,
    true,
    'manual',
    'Backfilled from public.daily_challenge_questions during question bank refactor.',
    q.created_at,
    q.created_at,
    q.created_at
  from legacy_questions q
  join upserted_sports s
    on s.slug = q.sport_slug
  on conflict (id) do update set
    sport_id = excluded.sport_id,
    difficulty = excluded.difficulty,
    question_text = excluded.question_text,
    option_a = excluded.option_a,
    option_b = excluded.option_b,
    option_c = excluded.option_c,
    option_d = excluded.option_d,
    correct_option = excluded.correct_option,
    status = excluded.status,
    eligible_for_daily = excluded.eligible_for_daily,
    eligible_for_sport_quiz = excluded.eligible_for_sport_quiz,
    authoring_method = excluded.authoring_method,
    source_notes = excluded.source_notes,
    reviewed_at = excluded.reviewed_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
  returning id
),
upserted_daily_challenges as (
  insert into public.daily_challenges (
    id,
    challenge_date,
    status,
    generation_method,
    rules_version,
    generated_at,
    published_at,
    created_at
  )
  select
    gen_random_uuid(),
    q.challenge_date,
    'published',
    'manual',
    'legacy-backfill-v1',
    min(q.created_at),
    min(q.created_at),
    min(q.created_at)
  from legacy_questions q
  group by q.challenge_date
  on conflict (challenge_date) do update set
    status = excluded.status,
    generation_method = excluded.generation_method,
    rules_version = excluded.rules_version,
    generated_at = excluded.generated_at,
    published_at = excluded.published_at,
    created_at = excluded.created_at
  returning id, challenge_date
),
upserted_daily_challenge_items as (
  insert into public.daily_challenge_items (
    daily_challenge_id,
    slot,
    question_id,
    question_snapshot
  )
  select
    challenges.id,
    q.slot,
    q.id,
    jsonb_build_object(
      'id', q.id,
      'difficulty', q.reusable_difficulty,
      'question_text', q.question_text,
      'option_a', q.option_a,
      'option_b', q.option_b,
      'option_c', q.option_c,
      'option_d', q.option_d,
      'correct_option', q.correct_option,
      'status', 'ready',
      'eligible_for_daily', true,
      'eligible_for_sport_quiz', true,
      'authoring_method', 'manual',
      'source_notes', 'Backfilled from public.daily_challenge_questions during question bank refactor.',
      'reviewed_at', q.created_at,
      'created_at', q.created_at,
      'updated_at', q.created_at,
      'sport', jsonb_build_object(
        'id', sports.id,
        'slug', sports.slug,
        'name', sports.name,
        'is_active', sports.is_active,
        'sort_order', sports.sort_order,
        'created_at', sports.created_at
      )
    )
  from legacy_questions q
  join upserted_daily_challenges challenges
    on challenges.challenge_date = q.challenge_date
  join upserted_questions questions
    on questions.id = q.id
  join upserted_sports sports
    on sports.slug = q.sport_slug
  order by q.challenge_date, q.slot
  on conflict (daily_challenge_id, slot) do update set
    question_id = excluded.question_id,
    question_snapshot = excluded.question_snapshot
  returning id
)
select 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_challenge_items_challenge_question_unique'
      and conrelid = 'public.daily_challenge_items'::regclass
  ) then
    alter table public.daily_challenge_items
      add constraint daily_challenge_items_challenge_question_unique unique (daily_challenge_id, question_id);
  end if;
end
$$;

alter table public.daily_attempts
  add column if not exists daily_challenge_id uuid references public.daily_challenges (id) on delete set null;

alter table public.daily_attempts
  drop constraint if exists daily_attempts_user_id_challenge_date_key;

update public.daily_attempts as attempts
set daily_challenge_id = challenges.id
from public.daily_challenges as challenges
where attempts.daily_challenge_id is null
  and attempts.challenge_date = challenges.challenge_date;

create unique index if not exists daily_attempts_user_id_challenge_date_unique
  on public.daily_attempts (user_id, challenge_date);

create index if not exists questions_sport_id_idx
  on public.questions (sport_id);

create index if not exists daily_challenge_items_daily_challenge_id_idx
  on public.daily_challenge_items (daily_challenge_id);

create index if not exists daily_challenge_items_question_id_idx
  on public.daily_challenge_items (question_id);

create index if not exists daily_attempts_daily_challenge_id_idx
  on public.daily_attempts (daily_challenge_id);

create unique index if not exists daily_attempts_user_id_daily_challenge_id_unique
  on public.daily_attempts (user_id, daily_challenge_id)
  where daily_challenge_id is not null;

create or replace view public.daily_leaderboard as
select
  p.display_name,
  round(avg(a.score)::numeric, 2) as average_score,
  count(*)::int as total_plays,
  max(c.challenge_date)::text as last_played_at
from public.daily_attempts a
join public.daily_challenges c
  on c.id = a.daily_challenge_id
join public.profiles p
  on p.id = a.user_id
where a.daily_challenge_id is not null
  and nullif(btrim(p.display_name), '') is not null
group by p.id, p.display_name;

grant select on public.daily_leaderboard to anon, authenticated;

alter table public.questions enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.daily_challenge_items enable row level security;
alter table public.daily_challenge_questions enable row level security;

drop policy if exists daily_challenge_questions_select_public on public.daily_challenge_questions;

revoke select on public.questions from anon, authenticated;
revoke select on public.daily_challenges from anon, authenticated;
revoke select on public.daily_challenge_items from anon, authenticated;
revoke select on public.daily_challenge_questions from anon, authenticated;
