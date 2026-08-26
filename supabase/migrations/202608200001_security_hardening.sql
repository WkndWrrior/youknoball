revoke insert on public.daily_attempts from authenticated;
revoke insert on public.daily_attempt_starts from authenticated;
revoke insert on public.leaderboard_groups from authenticated;
revoke insert on public.leaderboard_group_members from authenticated;

drop policy if exists daily_attempts_insert_own
  on public.daily_attempts;
drop policy if exists daily_attempt_starts_insert_own
  on public.daily_attempt_starts;
drop policy if exists leaderboard_groups_insert_owner
  on public.leaderboard_groups;
drop policy if exists leaderboard_group_members_insert_self
  on public.leaderboard_group_members;

create or replace function public.create_leaderboard_group_for_owner(
  p_owner_user_id uuid,
  p_name text,
  p_invite_code text
)
returns public.leaderboard_groups
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leaderboard_groups%rowtype;
begin
  if p_owner_user_id is null
    or p_name is null
    or not (char_length(btrim(p_name)) between 3 and 40)
    or p_invite_code is null
    or p_invite_code !~ '^[A-F0-9]{16}$'
  then
    raise exception 'Invalid leaderboard group input.';
  end if;

  insert into public.leaderboard_groups (
    name,
    owner_user_id,
    invite_code
  )
  values (
    btrim(p_name),
    p_owner_user_id,
    p_invite_code
  )
  returning * into v_group;

  insert into public.leaderboard_group_members (
    group_id,
    user_id,
    role
  )
  values (
    v_group.id,
    p_owner_user_id,
    'owner'
  );

  return v_group;
end;
$$;

revoke all on function public.create_leaderboard_group_for_owner(
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_leaderboard_group_for_owner(
  uuid,
  text,
  text
) to service_role;

alter function public.record_sport_quiz_attempt(
  uuid,
  uuid,
  uuid,
  smallint,
  smallint,
  jsonb
) set search_path = pg_catalog, public;
