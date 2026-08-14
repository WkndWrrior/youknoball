export const leaderboardTimerLimitMs = 90 * 1000;
export const leaderboardTimerMinimumMs = 5 * 1000;

export function getAttemptDurationMs(startedAt: string, now = new Date()) {
  const startedAtMs = new Date(startedAt).getTime();
  const nowMs = now.getTime();

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) {
    return 0;
  }

  return Math.max(0, nowMs - startedAtMs);
}

export function getRemainingTimerMs(
  startedAt: string,
  now = new Date(),
  limitMs = leaderboardTimerLimitMs,
) {
  return Math.max(0, limitMs - getAttemptDurationMs(startedAt, now));
}

export function getCappedElapsedTimerMs(
  startedAt: string,
  now = new Date(),
  limitMs = leaderboardTimerLimitMs,
) {
  return Math.min(limitMs, getAttemptDurationMs(startedAt, now));
}

export function isLeaderboardEligibleDuration(durationMs: number | null) {
  return (
    durationMs !== null &&
    durationMs >= leaderboardTimerMinimumMs &&
    durationMs <= leaderboardTimerLimitMs
  );
}

export function formatTimer(durationMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
