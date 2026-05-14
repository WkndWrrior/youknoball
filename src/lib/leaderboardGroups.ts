import { sortLeaderboardEntries, type LeaderboardEntry } from "@/lib/leaderboard";

export type LeaderboardGroupRole = "owner" | "member";

export type LeaderboardGroupSummary = {
  id: string;
  name: string;
  inviteCode: string;
  ownerUserId: string;
  createdAt: string;
};

export type LeaderboardGroupListItem = LeaderboardGroupSummary & {
  role: LeaderboardGroupRole;
  memberCount: number;
};

export type LeaderboardGroupDetail = {
  group: LeaderboardGroupSummary;
  role: LeaderboardGroupRole;
  memberCount: number;
  entries: LeaderboardEntry[];
};

export type NormalizedLeaderboardGroupName = {
  value: string | null;
  error: string | null;
};

export type GroupLeaderboardProfile = {
  id: string;
  display_name: string | null;
};

export type GroupLeaderboardAttempt = {
  user_id: string;
  score: number;
  duration_ms: number | null;
  challenge_date: string;
  leaderboard_eligible: boolean;
  daily_challenge_id: string | null;
};

export function normalizeLeaderboardGroupName(
  rawValue: string,
): NormalizedLeaderboardGroupName {
  const value = rawValue.trim().replace(/\s+/g, " ");

  if (value.length < 3 || value.length > 40) {
    return {
      value: null,
      error: "Group name must be between 3 and 40 characters.",
    };
  }

  return {
    value,
    error: null,
  };
}

export function normalizeGroupInviteCode(rawValue: string) {
  const value = rawValue.trim().toUpperCase();

  if (!/^[A-Z0-9]{6,12}$/.test(value)) {
    return null;
  }

  return value;
}

export function buildGroupInvitePath(inviteCode: string) {
  return `/groups/join/${inviteCode}`;
}

export function buildGroupPath(inviteCode: string) {
  return `/groups/${inviteCode}`;
}

export function buildGroupInviteUrl(siteUrl: string, inviteCode: string) {
  return `${siteUrl.trim().replace(/\/+$/, "")}${buildGroupInvitePath(inviteCode)}`;
}

export function buildGroupLeaderboardEntries(input: {
  memberUserIds: string[];
  profiles: GroupLeaderboardProfile[];
  attempts: GroupLeaderboardAttempt[];
}) {
  const memberUserIds = new Set(input.memberUserIds);
  const displayNameByUserId = new Map(
    input.profiles
      .map((profile) => [profile.id, profile.display_name?.trim() ?? ""] as const)
      .filter(([, displayName]) => displayName.length > 0),
  );
  const attemptsByUserId = new Map<string, GroupLeaderboardAttempt[]>();

  for (const attempt of input.attempts) {
    if (
      !memberUserIds.has(attempt.user_id) ||
      !displayNameByUserId.has(attempt.user_id) ||
      !attempt.leaderboard_eligible ||
      !attempt.daily_challenge_id ||
      attempt.duration_ms === null
    ) {
      continue;
    }

    const attempts = attemptsByUserId.get(attempt.user_id) ?? [];
    attempts.push(attempt);
    attemptsByUserId.set(attempt.user_id, attempts);
  }

  const entries: LeaderboardEntry[] = [];

  for (const [userId, attempts] of attemptsByUserId) {
    const totalScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const timedAttempts = attempts.filter((attempt) => attempt.duration_ms !== null);
    const totalDurationMs = timedAttempts.reduce((sum, attempt) => {
      return sum + (attempt.duration_ms ?? 0);
    }, 0);
    const lastPlayedAt = attempts.reduce<string>((latest, attempt) => {
      return attempt.challenge_date > latest ? attempt.challenge_date : latest;
    }, attempts[0]?.challenge_date ?? "");

    entries.push({
      display_name: displayNameByUserId.get(userId) ?? "",
      average_score: Number((totalScore / attempts.length).toFixed(2)),
      average_duration_ms:
        timedAttempts.length === 0 ? null : Math.round(totalDurationMs / timedAttempts.length),
      total_plays: attempts.length,
      last_played_at: lastPlayedAt,
    });
  }

  return sortLeaderboardEntries(entries);
}
