import { describe, expect, it } from "vitest";

import { getNightlyReviewSchedule } from "@/lib/date";

describe("getNightlyReviewSchedule", () => {
  it("accepts the summer UTC window during the 6 PM Central hour", () => {
    expect(
      getNightlyReviewSchedule(new Date("2026-08-08T23:20:00.000Z")),
    ).toEqual({
      shouldRun: true,
      challengeDate: "2026-08-09",
    });
  });

  it("accepts the winter UTC window during the 6 PM Central hour", () => {
    expect(
      getNightlyReviewSchedule(new Date("2026-12-08T00:20:00.000Z")),
    ).toEqual({
      shouldRun: true,
      challengeDate: "2026-12-08",
    });
  });

  it.each([
    ["summer standard-time window", "2026-08-09T00:20:00.000Z"],
    ["winter daylight-time window", "2026-12-07T23:20:00.000Z"],
  ])("rejects the non-matching %s", (_label, timestamp) => {
    expect(getNightlyReviewSchedule(new Date(timestamp)).shouldRun).toBe(false);
  });

  it.each([
    ["just before DST starts", "2026-03-08T00:20:00.000Z", "2026-03-08"],
    ["after DST starts", "2026-03-08T23:20:00.000Z", "2026-03-09"],
    ["just before DST ends", "2026-10-31T23:20:00.000Z", "2026-11-01"],
    ["after DST ends", "2026-11-02T00:20:00.000Z", "2026-11-02"],
  ])(
    "uses the Central calendar date %s",
    (_label, timestamp, challengeDate) => {
      expect(getNightlyReviewSchedule(new Date(timestamp))).toEqual({
        shouldRun: true,
        challengeDate,
      });
    },
  );

  it.each([
    ["month", "2026-08-31T23:20:00.000Z", "2026-09-01"],
    ["year", "2027-01-01T00:20:00.000Z", "2027-01-01"],
  ])("advances safely across a %s rollover", (_label, timestamp, challengeDate) => {
    expect(getNightlyReviewSchedule(new Date(timestamp))).toEqual({
      shouldRun: true,
      challengeDate,
    });
  });

  it("rejects an invalid Date with a clear error", () => {
    expect(() => getNightlyReviewSchedule(new Date("not-a-date"))).toThrow(
      new RangeError("Nightly review schedule requires a valid Date."),
    );
  });

  it("does not depend on the process machine timezone", () => {
    const originalTimeZone = process.env.TZ;

    try {
      process.env.TZ = "Asia/Tokyo";

      expect(
        getNightlyReviewSchedule(new Date("2026-08-08T23:20:00.000Z")),
      ).toEqual({
        shouldRun: true,
        challengeDate: "2026-08-09",
      });
    } finally {
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });
});
