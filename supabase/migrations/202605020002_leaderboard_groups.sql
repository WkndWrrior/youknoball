create table if not exists public.leaderboard_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 40),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.leaderboard_group_members (
  group_id uuid not null references public.leaderboard_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, user_id)
);

create index if not exists leaderboard_group_members_user_id_idx
  on public.leaderboard_group_members (user_id);

create index if not exists leaderboard_group_members_group_id_idx
  on public.leaderboard_group_members (group_id);

drop trigger if exists leaderboard_groups_set_updated_at on public.leaderboard_groups;
create trigger leaderboard_groups_set_updated_at
before update on public.leaderboard_groups
for each row
execute function public.set_updated_at();

alter table public.leaderboard_groups enable row level security;
alter table public.leaderboard_group_members enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leaderboard_groups'
      and policyname = 'leaderboard_groups_select_member'
  ) then
    create policy leaderboard_groups_select_member
      on public.leaderboard_groups
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.leaderboard_group_members members
          where members.group_id = leaderboard_groups.id
            and members.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leaderboard_groups'
      and policyname = 'leaderboard_groups_insert_owner'
  ) then
    create policy leaderboard_groups_insert_owner
      on public.leaderboard_groups
      for insert
      to authenticated
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leaderboard_group_members'
      and policyname = 'leaderboard_group_members_select_member'
  ) then
    create policy leaderboard_group_members_select_member
      on public.leaderboard_group_members
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leaderboard_group_members'
      and policyname = 'leaderboard_group_members_insert_self'
  ) then
    create policy leaderboard_group_members_insert_self
      on public.leaderboard_group_members
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;
end $$;

grant select, insert on public.leaderboard_groups to authenticated;
grant select, insert on public.leaderboard_group_members to authenticated;
