create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_length check (
    display_name is null
    or char_length(btrim(display_name)) between 3 and 24
  )
);

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.profiles
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.daily_challenge_questions (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null,
  slot smallint not null check (slot between 1 and 5),
  sport text not null,
  difficulty text not null check (difficulty in ('starter', 'pro')),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A', 'B', 'C', 'D')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (challenge_date, slot)
);

create table if not exists public.daily_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_date date not null,
  score smallint not null check (score between 0 and 5),
  total_questions smallint not null check (total_questions = 5),
  answers jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, challenge_date)
);

create index if not exists daily_attempts_user_id_idx
  on public.daily_attempts (user_id);

create index if not exists daily_attempts_challenge_date_idx
  on public.daily_attempts (challenge_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists daily_attempts_set_updated_at on public.daily_attempts;
create trigger daily_attempts_set_updated_at
before update on public.daily_attempts
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.daily_challenge_questions enable row level security;
alter table public.daily_attempts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles
      for select
      to authenticated
      using (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
      on public.profiles
      for insert
      to authenticated
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_challenge_questions'
      and policyname = 'daily_challenge_questions_select_public'
  ) then
    create policy daily_challenge_questions_select_public
      on public.daily_challenge_questions
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_attempts'
      and policyname = 'daily_attempts_select_own'
  ) then
    create policy daily_attempts_select_own
      on public.daily_attempts
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_attempts'
      and policyname = 'daily_attempts_insert_own'
  ) then
    create policy daily_attempts_insert_own
      on public.daily_attempts
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant select on public.daily_challenge_questions to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.daily_attempts to authenticated;

create or replace view public.daily_leaderboard as
select
  p.display_name,
  round(avg(a.score)::numeric, 2) as average_score,
  count(*)::int as total_plays,
  max(a.challenge_date)::text as last_played_at
from public.daily_attempts a
join public.profiles p on p.id = a.user_id
where nullif(btrim(p.display_name), '') is not null
group by p.id, p.display_name;

grant select on public.daily_leaderboard to anon, authenticated;
