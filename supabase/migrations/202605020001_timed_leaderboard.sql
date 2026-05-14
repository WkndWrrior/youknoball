alter table public.daily_attempts
  add column if not exists duration_ms integer
    check (duration_ms is null or duration_ms >= 0);

alter table public.daily_attempts
  add column if not exists leaderboard_eligible boolean not null default true;

create table if not exists public.daily_attempt_starts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  daily_challenge_id uuid references public.daily_challenges (id) on delete set null,
  challenge_date date not null,
  started_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, challenge_date)
);

create index if not exists daily_attempt_starts_user_id_idx
  on public.daily_attempt_starts (user_id);

create index if not exists daily_attempt_starts_daily_challenge_id_idx
  on public.daily_attempt_starts (daily_challenge_id);

alter table public.daily_attempt_starts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_attempt_starts'
      and policyname = 'daily_attempt_starts_select_own'
  ) then
    create policy daily_attempt_starts_select_own
      on public.daily_attempt_starts
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_attempt_starts'
      and policyname = 'daily_attempt_starts_insert_own'
  ) then
    create policy daily_attempt_starts_insert_own
      on public.daily_attempt_starts
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

grant select, insert on public.daily_attempt_starts to authenticated;

drop view if exists public.daily_leaderboard;

create view public.daily_leaderboard as
select
  p.display_name,
  round(avg(a.score)::numeric, 2) as average_score,
  round(avg(a.duration_ms))::int as average_duration_ms,
  count(*)::int as total_plays,
  max(c.challenge_date)::text as last_played_at
from public.daily_attempts a
join public.daily_challenges c
  on c.id = a.daily_challenge_id
join public.profiles p
  on p.id = a.user_id
where a.daily_challenge_id is not null
  and a.leaderboard_eligible is true
  and nullif(btrim(p.display_name), '') is not null
group by p.id, p.display_name;

grant select on public.daily_leaderboard to anon, authenticated;
