import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  buildGroupInvitePath,
  buildGroupInviteUrl,
  buildGroupLeaderboardEntries,
  normalizeGroupInviteCode,
  normalizeLeaderboardGroupName,
} from "@/lib/leaderboardGroups";

describe("leaderboard group helpers", () => {
  it("normalizes group names and rejects unusable values", () => {
    expect(normalizeLeaderboardGroupName("  Saturday   Crew  ")).toEqual({
      value: "Saturday Crew",
      error: null,
    });
    expect(normalizeLeaderboardGroupName("AB")).toEqual({
      value: null,
      error: "Group name must be between 3 and 40 characters.",
    });
    expect(normalizeLeaderboardGroupName("A".repeat(41))).toEqual({
      value: null,
      error: "Group name must be between 3 and 40 characters.",
    });
  });

  it("normalizes invite codes for URLs and API requests", () => {
    expect(normalizeGroupInviteCode(" ab12cd34 ")).toBe("AB12CD34");
    expect(normalizeGroupInviteCode(" a1b2c3d4e5f60718 ")).toBe(
      "A1B2C3D4E5F60718",
    );
    expect(normalizeGroupInviteCode("bad-code")).toBeNull();
    expect(normalizeGroupInviteCode("ABC")).toBeNull();
  });

  it("builds group invite paths and absolute URLs", () => {
    expect(buildGroupInvitePath("AB12CD34")).toBe("/groups/join/AB12CD34");
    expect(buildGroupInviteUrl("https://youknoball.com/", "AB12CD34")).toBe(
      "https://youknoball.com/groups/join/AB12CD34",
    );
  });

  it("builds a sorted leaderboard from group members and eligible timed attempts", () => {
    const entries = buildGroupLeaderboardEntries({
      memberUserIds: ["user-1", "user-2", "user-3"],
      profiles: [
        { id: "user-1", display_name: "Alex" },
        { id: "user-2", display_name: "Blake" },
        { id: "user-3", display_name: "Casey" },
      ],
      attempts: [
        {
          user_id: "user-1",
          score: 5,
          duration_ms: 70_000,
          challenge_date: "2026-05-01",
          leaderboard_eligible: true,
          daily_challenge_id: "challenge-1",
        },
        {
          user_id: "user-1",
          score: 4,
          duration_ms: 60_000,
          challenge_date: "2026-05-02",
          leaderboard_eligible: true,
          daily_challenge_id: "challenge-2",
        },
        {
          user_id: "user-1",
          score: 1,
          duration_ms: null,
          challenge_date: "2026-05-03",
          leaderboard_eligible: true,
          daily_challenge_id: "challenge-3",
        },
        {
          user_id: "user-2",
          score: 4.5,
          duration_ms: 45_000,
          challenge_date: "2026-05-02",
          leaderboard_eligible: true,
          daily_challenge_id: "challenge-2",
        },
        {
          user_id: "user-3",
          score: 5,
          duration_ms: 180_000,
          challenge_date: "2026-05-02",
          leaderboard_eligible: false,
          daily_challenge_id: "challenge-2",
        },
      ],
    });

    expect(entries).toEqual([
      {
        display_name: "Blake",
        average_score: 4.5,
        average_duration_ms: 45_000,
        total_plays: 1,
        last_played_at: "2026-05-02",
      },
      {
        display_name: "Alex",
        average_score: 4.5,
        average_duration_ms: 65_000,
        total_plays: 2,
        last_played_at: "2026-05-02",
      },
    ]);
  });

  it("adds group tables and membership policies in the migration", async () => {
    const migration = await readFile(
      new URL(
        "../../../supabase/migrations/202605020002_leaderboard_groups.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.leaderboard_groups");
    expect(migration).toContain("create table if not exists public.leaderboard_group_members");
    expect(migration).toContain("invite_code text not null unique");
    expect(migration).toContain("role text not null check (role in ('owner', 'member'))");
    expect(migration).toContain("alter table public.leaderboard_groups enable row level security");
  });
});
