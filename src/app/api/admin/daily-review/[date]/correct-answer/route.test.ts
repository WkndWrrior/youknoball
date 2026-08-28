import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDailyReviewCorrectAnswerHandler } from "@/app/api/admin/daily-review/[date]/correct-answer/handler";
import { maxDuration } from "@/app/api/admin/daily-review/[date]/correct-answer/route";

const reviewItemId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000001";

function request(
  body: unknown,
  options: { contentLength?: string; contentType?: string; origin?: string } = {},
) {
  return new NextRequest(
    "https://youknoball.com/api/admin/daily-review/2026-08-15/correct-answer",
    {
      method: "POST",
      headers: {
        "content-type": options.contentType ?? "application/json",
        origin: options.origin ?? "https://youknoball.com",
        ...(options.contentLength ? { "content-length": options.contentLength } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

function dependencies() {
  return {
    authorize: vi.fn(async () => ({ authorized: true as const, userId })),
    correctAnswer: vi.fn(async () => ({
      outcome: "applied" as const,
      finding: {
        questionId: "00000000-0000-4000-8000-000000000020",
        verdict: "passed" as const,
        confidence: 0.99,
        explanation: "Verified.",
        conflicts: [],
        evidence: [{
          url: "https://www.nba.com/example",
          title: "NBA",
          excerpt: "Verified result.",
          retrievedAt: "2026-08-15T20:00:00.000Z",
        }],
        verifiedAt: "2026-08-15T20:00:00.000Z",
      },
      evidence: [{
        url: "https://www.nba.com/example",
        title: "NBA",
        excerpt: "Verified result.",
        retrievedAt: "2026-08-15T20:00:00.000Z",
      }],
      estimatedCostMicrodollars: 1234,
    })),
  };
}

const payload = { reviewItemId, newCorrectOption: "B" };
const context = { params: Promise.resolve({ date: "2026-08-15" }) };

describe("POST /api/admin/daily-review/[date]/correct-answer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the nightly route duration ceiling for the three-minute claim", () => {
    expect(maxDuration).toBe(300);
  });

  it.each([
    ["unauthenticated", 401],
    ["forbidden", 403],
    ["not_configured", 403],
  ] as const)("maps %s authorization failures", async (reason, status) => {
    const deps = dependencies();
    deps.authorize.mockResolvedValue({ authorized: false, reason } as never);

    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload),
      context,
    );

    expect(response.status).toBe(status);
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it("requires exact same-origin requests", async () => {
    const deps = dependencies();
    const handler = createDailyReviewCorrectAnswerHandler(deps);

    const hostile = await handler(
      request(payload, { origin: "https://example.com" }),
      context,
    );
    const absent = request(payload);
    absent.headers.delete("origin");
    const missing = await handler(absent, context);

    expect(hostile.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it("requires application/json", async () => {
    const deps = dependencies();
    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload, { contentType: "text/plain" }),
      context,
    );

    expect(response.status).toBe(415);
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it("accepts application/json media types case-insensitively", async () => {
    const deps = dependencies();
    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload, { contentType: "Application/JSON; Charset=UTF-8" }),
      context,
    );

    expect(response.status).toBe(200);
  });

  it("rejects declared request bodies larger than 4096 bytes", async () => {
    const deps = dependencies();
    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload, { contentLength: "4097" }),
      context,
    );

    expect(response.status).toBe(413);
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it.each([
    [{ date: "2026-02-30" }, payload],
    [{ date: "not-a-date" }, payload],
    [{ date: "2026-08-15" }, { ...payload, reviewItemId: "not-a-uuid" }],
    [{ date: "2026-08-15" }, { ...payload, newCorrectOption: "E" }],
    [{ date: "2026-08-15" }, { reviewItemId }],
  ])("rejects malformed dates and payloads", async (params, body) => {
    const deps = dependencies();
    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(body),
      { params: Promise.resolve(params) },
    );

    expect(response.status).toBe(400);
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const deps = dependencies();
    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request("{"),
      context,
    );

    expect(response.status).toBe(400);
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it("passes the authenticated correction request to the service", async () => {
    const deps = dependencies();
    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload),
      context,
    );

    expect(response.status).toBe(200);
    expect(deps.correctAnswer).toHaveBeenCalledWith({
      challengeDate: "2026-08-15",
      reviewItemId,
      newCorrectOption: "B",
      resolvedBy: userId,
    });
    await expect(response.json()).resolves.toMatchObject({ outcome: "applied" });
  });

  it("returns non-mutating verification rejections as 200", async () => {
    const deps = dependencies();
    deps.correctAnswer.mockResolvedValue({
      outcome: "verification_rejected",
      finding: { verdict: "risk", evidence: [] },
      evidence: [],
      estimatedCostMicrodollars: 1234,
    } as never);

    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "verification_rejected",
      estimatedCostMicrodollars: 1234,
    });
  });

  it.each([
    ["missing", undefined, 404],
    ["conflict", "resolved", 409],
    ["conflict", "not_flagged", 409],
    ["conflict", "unchanged", 409],
    ["conflict", "not_finalized", 409],
    ["conflict", "busy", 409],
    ["conflict", "stale", 409],
    ["conflict", "not_draft", 409],
  ] as const)("maps %s/%s outcomes to %i", async (outcome, reason, status) => {
    const deps = dependencies();
    deps.correctAnswer.mockResolvedValue({ outcome, ...(reason ? { reason } : {}) } as never);

    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload),
      context,
    );

    expect(response.status).toBe(status);
  });

  it("retains safe paid verification details on a stale correction conflict", async () => {
    const deps = dependencies();
    const applied = await deps.correctAnswer();
    deps.correctAnswer.mockResolvedValue({
      ...applied,
      outcome: "conflict",
      reason: "stale",
    } as never);

    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload),
      context,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "conflict",
      reason: "stale",
      finding: applied.finding,
      evidence: applied.evidence,
      estimatedCostMicrodollars: 1234,
    });
  });

  it("returns verifier failures as a safe 502 response", async () => {
    const deps = dependencies();
    deps.correctAnswer.mockResolvedValue({
      outcome: "verification_failed",
      estimatedCostMicrodollars: 8765,
      retryable: true,
      usageUncertain: true,
      internalMessage: "OPENAI_API_KEY=secret",
    } as never);

    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload),
      context,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      outcome: "verification_failed",
      estimatedCostMicrodollars: 8765,
      retryable: true,
      usageUncertain: true,
    });
  });

  it("returns persistence failures as safe 500 responses with paid verification details", async () => {
    const deps = dependencies();
    const applied = await deps.correctAnswer();
    deps.correctAnswer.mockResolvedValue({
      ...applied,
      outcome: "persistence_failed",
      internalMessage: "database password=secret",
    } as never);

    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload),
      context,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      outcome: "persistence_failed",
      finding: applied.finding,
      evidence: applied.evidence,
      estimatedCostMicrodollars: 1234,
    });
  });

  it("does not expose internal service errors", async () => {
    const deps = dependencies();
    deps.correctAnswer.mockRejectedValue(new Error("OPENAI_API_KEY=secret"));

    const response = await createDailyReviewCorrectAnswerHandler(deps)(
      request(payload),
      context,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to verify the answer correction.",
    });
  });
});
