import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDailyQuestionReviewCronHandler } from "@/app/api/cron/daily-question-review/route";

const summerNow = new Date("2026-08-12T23:10:00.000Z");

function request(authorization?: string) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://youknoball.com/api/cron/daily-question-review", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/daily-question-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "a-long-random-cron-secret");
  });

  it("fails closed when CRON_SECRET is missing or blank", async () => {
    const runReview = vi.fn();
    vi.stubEnv("CRON_SECRET", "   ");
    const response = await createDailyQuestionReviewCronHandler({
      now: () => summerNow,
      runReview,
    })(request("Bearer a-long-random-cron-secret"));

    expect(response.status).toBe(503);
    expect(runReview).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("a-long-random-cron-secret");
  });

  it.each([undefined, "", "Basic abc", "Bearer", "Bearer wrong-secret"])(
    "rejects missing or malformed authorization: %s",
    async (authorization) => {
      const runReview = vi.fn();
      const response = await createDailyQuestionReviewCronHandler({
        now: () => summerNow,
        runReview,
      })(request(authorization));

      expect(response.status).toBe(401);
      expect(runReview).not.toHaveBeenCalled();
      expect(await response.text()).not.toContain("wrong-secret");
    },
  );

  it("returns 204 outside the 6-7 PM Central window", async () => {
    const runReview = vi.fn();
    const response = await createDailyQuestionReviewCronHandler({
      now: () => new Date("2026-08-13T01:10:00.000Z"),
      runReview,
    })(request("Bearer a-long-random-cron-secret"));

    expect(response.status).toBe(204);
    expect(runReview).not.toHaveBeenCalled();
  });

  it("runs tomorrow's review during the Central window", async () => {
    const runReview = vi.fn(async () => ({ kind: "in_progress" as const }));
    const response = await createDailyQuestionReviewCronHandler({
      now: () => summerNow,
      runReview,
      productionUrl: () => "youknoball.vercel.app",
    })(request("Bearer a-long-random-cron-secret"));

    expect(response.status).toBe(200);
    expect(runReview).toHaveBeenCalledWith({
      challengeDate: "2026-08-13",
      now: summerNow,
      unitLimit: 1,
      deadline: new Date("2026-08-12T23:14:00.000Z"),
      siteUrlFallback: "https://youknoball.vercel.app",
    });
    await expect(response.json()).resolves.toEqual({
      challengeDate: "2026-08-13",
      status: "in_progress",
    });
  });

  it("does not trust a malformed Vercel production hostname", async () => {
    const runReview = vi.fn(async () => ({ kind: "observed" as const }));
    await createDailyQuestionReviewCronHandler({
      now: () => summerNow,
      runReview,
      productionUrl: () => "user:pass@example.com/path",
    })(request("Bearer a-long-random-cron-secret"));

    expect(runReview).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrlFallback: undefined }),
    );
  });

  it("returns a controlled error without leaking secrets or dependency details", async () => {
    const runReview = vi.fn(async () => {
      throw new Error("database failed with a-long-random-cron-secret");
    });
    const response = await createDailyQuestionReviewCronHandler({
      now: () => summerNow,
      runReview,
    })(request("Bearer a-long-random-cron-secret"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Nightly review failed." });
  });

  it("configures 36 distinct once-daily Hobby schedules at five-minute offsets", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const expected = [23, 0, 1].flatMap((hour) =>
      Array.from({ length: 12 }, (_, index) => ({
        path: "/api/cron/daily-question-review",
        schedule: `${index * 5} ${hour} * * *`,
      })),
    );
    expect(config.crons).toEqual(expected);
    expect(new Set(config.crons.map((cron: { schedule: string }) => cron.schedule)).size)
      .toBe(36);
    expect(config.crons.every((cron: { schedule: string }) =>
      /^\d{1,2} (?:23|0|1) \* \* \*$/.test(cron.schedule),
    )).toBe(true);
  });
});
