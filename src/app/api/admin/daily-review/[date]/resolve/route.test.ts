import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDailyReviewResolveHandler } from "@/app/api/admin/daily-review/[date]/resolve/route";

const itemId = "00000000-0000-4000-8000-000000000010";
const replacementId = "00000000-0000-4000-8000-000000000099";
const userId = "00000000-0000-4000-8000-000000000001";

function request(body: unknown) {
  return new NextRequest("https://youknoball.com/api/admin/daily-review/2026-08-13/resolve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://youknoball.com",
    },
    body: JSON.stringify(body),
  });
}

const review = {
  run: {
    id: "00000000-0000-4000-8000-000000000100",
    dailyChallengeId: "00000000-0000-4000-8000-000000000200",
    challengeDate: "2026-08-13",
  },
  items: [
    {
      id: itemId,
      slot: 3,
      resolution: "pending",
      replacement: {
        questionId: replacementId,
        eligible: true,
        snapshot: { id: replacementId, difficulty: "medium" },
      },
    },
  ],
};

function dependencies() {
  return {
    authorize: vi.fn(async () => ({ authorized: true as const, userId })),
    loadReview: vi.fn(async () => review as never),
    validateReplacement: vi.fn(async () => true),
    resolve: vi.fn(async () => ({ outcome: "resolved" as const, resolution: "kept" as const })),
  };
}

describe("POST /api/admin/daily-review/[date]/resolve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated and non-allowlisted callers before loading review data", async () => {
    const deps = dependencies();
    deps.authorize.mockResolvedValue({ authorized: false, reason: "forbidden" } as never);
    const response = await createDailyReviewResolveHandler(deps)(
      request({ action: "keep", reviewItemId: itemId }),
      { params: Promise.resolve({ date: "2026-08-13" }) },
    );
    expect(response.status).toBe(403);
    expect(deps.loadReview).not.toHaveBeenCalled();
  });

  it("rejects malformed dates and action payloads", async () => {
    const deps = dependencies();
    const handler = createDailyReviewResolveHandler(deps);
    const badDate = await handler(
      request({ action: "keep", reviewItemId: itemId }),
      { params: Promise.resolve({ date: "2026-02-30" }) },
    );
    const badAction = await handler(
      request({ action: "delete", reviewItemId: itemId }),
      { params: Promise.resolve({ date: "2026-08-13" }) },
    );
    expect(badDate.status).toBe(400);
    expect(badAction.status).toBe(400);
    expect(deps.loadReview).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutation requests", async () => {
    const deps = dependencies();
    const hostile = request({ action: "keep", reviewItemId: itemId });
    hostile.headers.set("origin", "https://example.com");
    const response = await createDailyReviewResolveHandler(deps)(hostile, {
      params: Promise.resolve({ date: "2026-08-13" }),
    });
    expect(response.status).toBe(403);
    expect(deps.loadReview).not.toHaveBeenCalled();
  });

  it("keeps a flagged question through the atomic resolver", async () => {
    const deps = dependencies();
    const response = await createDailyReviewResolveHandler(deps)(
      request({ action: "keep", reviewItemId: itemId }),
      { params: Promise.resolve({ date: "2026-08-13" }) },
    );
    expect(response.status).toBe(200);
    expect(deps.resolve).toHaveBeenCalledWith({
      action: "keep",
      challengeDate: "2026-08-13",
      reviewItemId: itemId,
      replacementQuestionId: null,
      resolvedBy: userId,
    });
    expect(deps.validateReplacement).not.toHaveBeenCalled();
  });

  it("rejects an unstored, ineligible, or composition-invalid replacement", async () => {
    const deps = dependencies();
    deps.validateReplacement.mockResolvedValue(false);
    const response = await createDailyReviewResolveHandler(deps)(
      request({
        action: "replace",
        reviewItemId: itemId,
        replacementQuestionId: replacementId,
      }),
      { params: Promise.resolve({ date: "2026-08-13" }) },
    );
    expect(response.status).toBe(409);
    expect(deps.resolve).not.toHaveBeenCalled();
  });

  it("applies only the stored verified replacement after full-draft validation", async () => {
    const deps = dependencies();
    deps.resolve.mockResolvedValue({ outcome: "resolved", resolution: "replaced" } as never);
    const response = await createDailyReviewResolveHandler(deps)(
      request({
        action: "replace",
        reviewItemId: itemId,
        replacementQuestionId: replacementId,
      }),
      { params: Promise.resolve({ date: "2026-08-13" }) },
    );
    expect(response.status).toBe(200);
    expect(deps.validateReplacement).toHaveBeenCalledWith({
      challengeDate: "2026-08-13",
      flaggedSlot: 3,
      replacement: review.items[0].replacement.snapshot,
    });
    expect(deps.resolve).toHaveBeenCalledWith(expect.objectContaining({
      action: "replace",
      replacementQuestionId: replacementId,
    }));
  });

  it("treats a repeated matching resolution as idempotent", async () => {
    const deps = dependencies();
    deps.resolve.mockResolvedValue({ outcome: "already_resolved", resolution: "kept" } as never);
    const response = await createDailyReviewResolveHandler(deps)(
      request({ action: "keep", reviewItemId: itemId }),
      { params: Promise.resolve({ date: "2026-08-13" }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ outcome: "already_resolved" });
  });
});
