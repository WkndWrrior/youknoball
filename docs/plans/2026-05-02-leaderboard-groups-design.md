# Leaderboard Groups Design

## Goal

Let players create private leaderboard groups and invite friends with a shareable link.

## MVP Scope

- Signed-in players can create a group.
- Each group has a readable name and a unique invite code.
- Group owners invite friends by sharing `/groups/join/[code]`.
- Signed-in players can join a group from an invite link.
- Members can view `/groups/[code]`, which shows a leaderboard filtered to group members.
- Group leaderboards use the same timed leaderboard eligibility rules as the public board.

Out of scope for this pass:

- Removing members.
- User search.
- Email invitations.
- Friend requests.
- Public/private discovery.
- Group chat or activity feeds.

## Data Model

`leaderboard_groups`

- `id`
- `name`
- `owner_user_id`
- `invite_code`
- `created_at`
- `updated_at`

`leaderboard_group_members`

- `group_id`
- `user_id`
- `role`: `owner` or `member`
- `joined_at`

The owner is also inserted as a member when the group is created.

## Access Model

All group operations require authentication.

The server validates the Supabase session, then uses server-side repository methods to create groups, join groups, list a user's groups, and read group leaderboard data. The public invite code is enough to request a join, but viewing the group leaderboard requires membership.

## UX

Add a `Groups` navigation link.

`/groups`

- Lists the user's groups.
- Has a compact create-group form.
- Links each group to `/groups/[code]`.

`/groups/[code]`

- Shows group name.
- Shows invite link with copy affordance.
- Shows group leaderboard.

`/groups/join/[code]`

- Shows a join button.
- Requires sign-in before joining.
- After joining, links to the group page.

## Ranking

Group leaderboards use the same ranking as the public leaderboard:

1. Average score, highest first.
2. Average completion time, fastest first.
3. Total plays, highest first.
4. Last played date, newest first.

Only timed leaderboard-eligible attempts count.
