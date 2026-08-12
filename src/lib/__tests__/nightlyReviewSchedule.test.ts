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
    ["summer", "2026-08-13T00:20:00.000Z", "2026-08-13"],
    ["winter", "2026-12-08T01:20:00.000Z", "2026-12-08"],
  ])("accepts the %s UTC window during the 7 PM Central hour", (_label, timestamp, challengeDate) => {
    expect(getNightlyReviewSchedule(new Date(timestamp))).toEqual({
      shouldRun: true,
      challengeDate,
    });
  });

  it.each([
    ["summer", "2026-08-13T01:20:00.000Z", "2026-08-13"],
    ["winter", "2026-12-08T02:20:00.000Z", "2026-12-08"],
  ])("accepts the %s UTC window during the 8 PM Central hour", (_label, timestamp, challengeDate) => {
    expect(getNightlyReviewSchedule(new Date(timestamp))).toEqual({
      shouldRun: true,
      challengeDate,
    });
  });

  it.each([
    ["5 PM in summer", "2026-08-08T22:20:00.000Z"],
    ["9 PM in summer", "2026-08-09T02:20:00.000Z"],
    ["5 PM in winter", "2026-12-07T23:20:00.000Z"],
    ["9 PM in winter", "2026-12-08T03:20:00.000Z"],
  ])("rejects %s", (_label, timestamp) => {
    expect(getNightlyReviewSchedule(new Date(timestamp)).shouldRun).toBe(false);
  });

  it.each([
    ["summer 9 PM window", "2026-08-09T02:20:00.000Z"],
    ["winter 5 PM window", "2026-12-07T23:20:00.000Z"],
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

  it("advances from February 28 to leap day", () => {
    expect(
      getNightlyReviewSchedule(new Date("2028-02-29T00:20:00.000Z")),
    ).toEqual({
      shouldRun: true,
      challengeDate: "2028-02-29",
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
