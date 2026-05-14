import Link from "next/link";

import type { LeaderboardEntry } from "@/lib/leaderboard";

type LeaderboardTableProps = {
  entries: LeaderboardEntry[];
  compact?: boolean;
};

const leaderboardGridColumns =
  "grid-cols-[3.25rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem]";

export function LeaderboardTable({
  entries,
  compact = false,
}: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-sm text-white/70">
        No ranked players yet. Be the first score on the board.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5">
      <div className={`grid ${leaderboardGridColumns} gap-3 border-b border-white/10 px-4 py-3 text-[0.7rem] uppercase tracking-[0.3em] text-white/45`}>
        <span>Rank</span>
        <span>Player</span>
        <span className="justify-self-end text-right">Score</span>
        <span className="justify-self-end text-right">Time</span>
        <span className="justify-self-end text-right">Plays</span>
      </div>
      <div>
        {entries.map((entry, index) => (
          <div
            key={`${entry.display_name}-${entry.last_played_at}-${index}`}
            className={`grid ${leaderboardGridColumns} items-center gap-3 px-4 py-4 text-sm text-white/85 odd:bg-white/[0.03]`}
          >
            <span className="font-display text-lg text-white">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{entry.display_name}</p>
              {!compact ? (
                <p className="truncate text-xs text-white/50">
                  Last played {entry.last_played_at}
                </p>
              ) : null}
            </div>
            <span className="justify-self-end text-right font-semibold tabular-nums text-[#ff7a18]">
              {entry.average_score.toFixed(2)}
            </span>
            <span className="justify-self-end text-right tabular-nums">
              {entry.average_duration_ms === null
                ? "--"
                : `${Math.round(entry.average_duration_ms / 1000)}s`}
            </span>
            <span className="justify-self-end text-right tabular-nums">
              {entry.total_plays}
            </span>
          </div>
        ))}
      </div>
      {compact ? (
        <div className="border-t border-white/10 px-4 py-3">
          <Link
            href="/leaderboard"
            className="text-sm font-semibold text-[#ff7a18] transition hover:text-[#ff9a4a]"
          >
            View full leaderboard
          </Link>
        </div>
      ) : null}
    </div>
  );
}
