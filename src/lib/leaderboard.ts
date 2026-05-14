export type LeaderboardEntry = {
  display_name: string;
  average_score: number;
  average_duration_ms: number | null;
  total_plays: number;
  last_played_at: string;
};

function comparableDurationMs(value: number | null) {
  return value ?? Number.MAX_SAFE_INTEGER;
}

export function sortLeaderboardEntries<T extends LeaderboardEntry>(rows: T[]) {
  return [...rows].sort((left, right) => {
    if (right.average_score !== left.average_score) {
      return right.average_score - left.average_score;
    }

    const durationDelta =
      comparableDurationMs(left.average_duration_ms) -
      comparableDurationMs(right.average_duration_ms);
    if (durationDelta !== 0) {
      return durationDelta;
    }

    if (right.total_plays !== left.total_plays) {
      return right.total_plays - left.total_plays;
    }

    return (
      new Date(right.last_played_at).getTime() -
      new Date(left.last_played_at).getTime()
    );
  });
}
