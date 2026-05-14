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
  and a.duration_ms is not null
  and nullif(btrim(p.display_name), '') is not null
group by p.id, p.display_name;

grant select on public.daily_leaderboard to anon, authenticated;
