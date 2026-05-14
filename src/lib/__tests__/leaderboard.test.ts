import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { sortLeaderboardEntries } from "@/lib/leaderboard";
import { getPlayerStats } from "@/lib/server/dailyChallengeRepository";

function buildPlayerStatsClient(
  rows: Array<{
    score: number;
    challenge_date: string;
  }>,
) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: null });
  const from = vi.fn(() => ({ select }));

  return {
    client: { from },
    select,
  };
}

describe("sortLeaderboardEntries", () => {
  it("sorts by average score, average duration, total plays, then most recent play", () => {
    const rows = [
      {
        display_name: "Charlie",
        average_score: 4.8,
        average_duration_ms: 62_000,
        total_plays: 2,
        last_played_at: "2026-03-30",
      },
      {
        display_name: "Alex",
        average_score: 4.8,
        average_duration_ms: 45_000,
        total_plays: 5,
        last_played_at: "2026-03-28",
      },
      {
        display_name: "Blake",
        average_score: 4.8,
        average_duration_ms: 45_000,
        total_plays: 5,
        last_played_at: "2026-03-31",
      },
      {
        display_name: "Casey",
        average_score: 4.8,
        average_duration_ms: null,
        total_plays: 12,
        last_played_at: "2026-04-01",
      },
      {
        display_name: "Drew",
        average_score: 4.2,
        average_duration_ms: 30_000,
        total_plays: 9,
        last_played_at: "2026-03-31",
      },
    ];

    expect(sortLeaderboardEntries(rows).map((row) => row.display_name)).toEqual([
      "Blake",
      "Alex",
      "Charlie",
      "Casey",
      "Drew",
    ]);
  });
});

describe("leaderboard stats", () => {
  it("rebuilds the leaderboard view through canonical daily challenges", async () => {
    const migration = await readFile(
      new URL(
        "../../../supabase/migrations/202604030001_question_bank_refactor.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain(
      "create or replace view public.daily_leaderboard as",
    );
    expect(migration).toContain("join public.daily_challenges");
    expect(migration).toContain("daily_challenge_id");
  });

  it("adds timed leaderboard persistence and filters the public board to eligible attempts", async () => {
    const migration = await readFile(
      new URL(
        "../../../supabase/migrations/202605020001_timed_leaderboard.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.daily_attempt_starts");
    expect(migration).toContain("add column if not exists duration_ms integer");
    expect(migration).toContain(
      "add column if not exists leaderboard_eligible boolean not null default true",
    );
    expect(migration).toContain("drop view if exists public.daily_leaderboard");
    expect(migration).toContain("a.leaderboard_eligible is true");
    expect(migration).toContain("average_duration_ms");
  });

  it("adds a follow-up migration so leaderboard plays count only timed attempts", async () => {
    const migration = await readFile(
      new URL(
        "../../../supabase/migrations/202605050001_leaderboard_timed_attempt_filter.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain("drop view if exists public.daily_leaderboard");
    expect(migration).toContain("create view public.daily_leaderboard as");
    expect(migration).toContain("a.leaderboard_eligible is true");
    expect(migration).toContain("a.duration_ms is not null");
  });

  it("derives player stats directly from daily_attempts challenge dates", async () => {
    const { client, select } = buildPlayerStatsClient([
      {
        score: 5,
        challenge_date: "2026-04-02",
      },
      {
        score: 4,
        challenge_date: "2026-04-01",
      },
    ]);

    await expect(getPlayerStats(client as never)).resolves.toEqual({
      averageScore: 4.5,
      totalPlays: 2,
      lastPlayedAt: "2026-04-02",
    });

    expect(select).toHaveBeenCalledWith(
      "score,challenge_date",
    );
  });
});
