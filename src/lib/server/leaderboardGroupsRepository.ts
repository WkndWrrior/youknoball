import "server-only";

import { randomBytes } from "node:crypto";

import {
  buildGroupLeaderboardEntries,
  type GroupLeaderboardAttempt,
  type GroupLeaderboardProfile,
} from "@/lib/leaderboardGroups";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import type { ServerSupabaseClient } from "@/lib/server/supabaseServer";

export type LeaderboardGroupRole = "owner" | "member";

export type LeaderboardGroup = {
  id: string;
  name: string;
  inviteCode: string;
  ownerUserId: string;
  createdAt: string;
};

export type LeaderboardGroupListItem = LeaderboardGroup & {
  role: LeaderboardGroupRole;
  memberCount: number;
};

export type LeaderboardGroupDetail = {
  group: LeaderboardGroup;
  role: LeaderboardGroupRole;
  memberCount: number;
  entries: LeaderboardEntry[];
};

type LeaderboardGroupRow = {
  id: string;
  name: string;
  invite_code: string;
  owner_user_id: string;
  created_at: string;
};

type LeaderboardGroupMemberRow = {
  group_id: string;
  user_id: string;
  role: LeaderboardGroupRole;
  joined_at: string;
};

const GROUP_COLUMNS = "id,name,invite_code,owner_user_id,created_at";
const MEMBER_COLUMNS = "group_id,user_id,role,joined_at";
const GROUP_INVITE_CODE_LENGTH = 16;

function toGroup(row: LeaderboardGroupRow): LeaderboardGroup {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
  };
}

function generateInviteCode() {
  return randomBytes(GROUP_INVITE_CODE_LENGTH / 2).toString("hex").toUpperCase();
}

function isDuplicateError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function isMissingRpcError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST202"
  );
}

function throwIfError(error: unknown, message: string) {
  if (error) {
    throw new Error(message);
  }
}

export async function createLeaderboardGroupForOwner(
  client: ServerSupabaseClient,
  input: {
    ownerUserId: string;
    name: string;
  },
) {
  let groupRow: LeaderboardGroupRow | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    const { data, error } = await client.rpc(
      "create_leaderboard_group_for_owner",
      {
        p_owner_user_id: input.ownerUserId,
        p_name: input.name,
        p_invite_code: inviteCode,
      },
    );

    if (isDuplicateError(error)) {
      continue;
    }

    if (isMissingRpcError(error)) {
      const { data: fallbackData, error: fallbackError } = await client
        .from("leaderboard_groups")
        .insert({
          name: input.name,
          owner_user_id: input.ownerUserId,
          invite_code: inviteCode,
        })
        .select(GROUP_COLUMNS)
        .single();

      if (isDuplicateError(fallbackError)) {
        continue;
      }

      throwIfError(fallbackError, "Unable to create group.");
      const fallbackGroup = fallbackData as unknown as LeaderboardGroupRow;
      const { error: memberError } = await client
        .from("leaderboard_group_members")
        .insert({
          group_id: fallbackGroup.id,
          user_id: input.ownerUserId,
          role: "owner",
        });

      throwIfError(memberError, "Unable to create group membership.");
      return toGroup(fallbackGroup);
    }

    throwIfError(error, "Unable to create group.");
    groupRow = data as unknown as LeaderboardGroupRow;
    break;
  }

  if (!groupRow) {
    throw new Error("Unable to create group.");
  }

  return toGroup(groupRow);
}

export async function listLeaderboardGroupsForUser(
  client: ServerSupabaseClient,
  userId: string,
): Promise<LeaderboardGroupListItem[]> {
  const { data: membershipRows, error: membershipError } = await client
    .from("leaderboard_group_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  throwIfError(membershipError, "Unable to load groups.");

  const memberships = (membershipRows ?? []) as unknown as LeaderboardGroupMemberRow[];
  const groupIds = memberships.map((membership) => membership.group_id);
  if (groupIds.length === 0) {
    return [];
  }

  const { data: groupRows, error: groupError } = await client
    .from("leaderboard_groups")
    .select(GROUP_COLUMNS)
    .in("id", groupIds);

  throwIfError(groupError, "Unable to load groups.");

  const { data: allMemberRows, error: countError } = await client
    .from("leaderboard_group_members")
    .select("group_id,user_id")
    .in("group_id", groupIds);

  throwIfError(countError, "Unable to load group members.");

  const groupById = new Map(
    ((groupRows ?? []) as unknown as LeaderboardGroupRow[]).map((row) => [
      row.id,
      toGroup(row),
    ]),
  );
  const memberCountByGroupId = new Map<string, number>();
  for (const row of (allMemberRows ?? []) as unknown as Array<{ group_id: string }>) {
    memberCountByGroupId.set(
      row.group_id,
      (memberCountByGroupId.get(row.group_id) ?? 0) + 1,
    );
  }

  return memberships
    .map((membership) => {
      const group = groupById.get(membership.group_id);
      if (!group) {
        return null;
      }

      return {
        ...group,
        role: membership.role,
        memberCount: memberCountByGroupId.get(group.id) ?? 1,
      };
    })
    .filter((group): group is LeaderboardGroupListItem => group !== null);
}

export async function getLeaderboardGroupByInviteCode(
  client: ServerSupabaseClient,
  inviteCode: string,
) {
  const { data, error } = await client
    .from("leaderboard_groups")
    .select(GROUP_COLUMNS)
    .eq("invite_code", inviteCode)
    .maybeSingle();

  throwIfError(error, "Unable to load group.");

  return data ? toGroup(data as unknown as LeaderboardGroupRow) : null;
}

export async function joinLeaderboardGroupByInviteCode(
  client: ServerSupabaseClient,
  input: {
    userId: string;
    inviteCode: string;
  },
) {
  const group = await getLeaderboardGroupByInviteCode(client, input.inviteCode);
  if (!group) {
    return null;
  }

  const { error } = await client
    .from("leaderboard_group_members")
    .upsert(
      {
        group_id: group.id,
        user_id: input.userId,
        role: "member",
      },
      { onConflict: "group_id,user_id", ignoreDuplicates: true },
    );

  throwIfError(error, "Unable to join group.");

  return group;
}

export async function getLeaderboardGroupDetail(
  client: ServerSupabaseClient,
  input: {
    userId: string;
    inviteCode: string;
  },
): Promise<LeaderboardGroupDetail | null> {
  const group = await getLeaderboardGroupByInviteCode(client, input.inviteCode);
  if (!group) {
    return null;
  }

  const { data: membershipRow, error: membershipError } = await client
    .from("leaderboard_group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", group.id)
    .eq("user_id", input.userId)
    .maybeSingle();

  throwIfError(membershipError, "Unable to load group membership.");
  if (!membershipRow) {
    return null;
  }

  const { data: memberRows, error: membersError } = await client
    .from("leaderboard_group_members")
    .select("user_id")
    .eq("group_id", group.id);

  throwIfError(membersError, "Unable to load group members.");

  const memberUserIds = ((memberRows ?? []) as unknown as Array<{ user_id: string }>).map(
    (row) => row.user_id,
  );

  const { data: profileRows, error: profileError } = await client
    .from("profiles")
    .select("id,display_name")
    .in("id", memberUserIds);

  throwIfError(profileError, "Unable to load group profiles.");

  const { data: attemptRows, error: attemptError } = await client
    .from("daily_attempts")
    .select("user_id,score,duration_ms,challenge_date,leaderboard_eligible,daily_challenge_id")
    .in("user_id", memberUserIds);

  throwIfError(attemptError, "Unable to load group leaderboard.");

  return {
    group,
    role: (membershipRow as unknown as LeaderboardGroupMemberRow).role,
    memberCount: memberUserIds.length,
    entries: buildGroupLeaderboardEntries({
      memberUserIds,
      profiles: (profileRows ?? []) as unknown as GroupLeaderboardProfile[],
      attempts: (attemptRows ?? []) as unknown as GroupLeaderboardAttempt[],
    }),
  };
}
