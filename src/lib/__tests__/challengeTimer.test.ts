import { describe, expect, it } from "vitest";

import {
  formatTimer,
  getAttemptDurationMs,
  getRemainingTimerMs,
  isLeaderboardEligibleDuration,
  leaderboardTimerLimitMs,
  leaderboardTimerMinimumMs,
} from "@/lib/challengeTimer";

describe("challenge timer", () => {
  it("calculates attempt duration from a server start timestamp", () => {
    expect(
      getAttemptDurationMs(
        "2026-05-02T12:00:00.000Z",
        new Date("2026-05-02T12:01:30.250Z"),
      ),
    ).toBe(90250);
  });

  it("clamps negative durations and remaining time", () => {
    expect(
      getAttemptDurationMs(
        "2026-05-02T12:00:00.000Z",
        new Date("2026-05-02T11:59:59.000Z"),
      ),
    ).toBe(0);
    expect(
      getRemainingTimerMs(
        "2026-05-02T12:00:00.000Z",
        new Date("2026-05-02T12:03:00.000Z"),
      ),
    ).toBe(0);
  });

  it("allows leaderboard attempts only inside the timed window", () => {
    expect(leaderboardTimerMinimumMs).toBe(5_000);
    expect(leaderboardTimerLimitMs).toBe(120_000);
    expect(isLeaderboardEligibleDuration(null)).toBe(false);
    expect(isLeaderboardEligibleDuration(4_999)).toBe(false);
    expect(isLeaderboardEligibleDuration(5_000)).toBe(true);
    expect(isLeaderboardEligibleDuration(120_000)).toBe(true);
    expect(isLeaderboardEligibleDuration(120_001)).toBe(false);
  });

  it("formats remaining time as MM:SS", () => {
    expect(formatTimer(120_000)).toBe("02:00");
    expect(formatTimer(61_000)).toBe("01:01");
    expect(formatTimer(60_001)).toBe("01:01");
    expect(formatTimer(60_000)).toBe("01:00");
    expect(formatTimer(0)).toBe("00:00");
  });
});
