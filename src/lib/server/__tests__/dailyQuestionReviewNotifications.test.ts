import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DailyQuestionReviewItemRecord,
  DailyQuestionReviewRunRecord,
} from "@/lib/server/dailyQuestionReviewRepository";
import {
  sendDailyQuestionReviewBudgetBlockNotification,
  sendDailyQuestionReviewNotification,
} from "@/lib/server/dailyQuestionReviewNotifications";

const fetchMock = vi.fn();

function run(overrides: Partial<DailyQuestionReviewRunRecord> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    dailyChallengeId: "00000000-0000-4000-8000-000000000200",
    reviewDate: "2026-08-12",
    challengeDate: "2026-08-13",
    status: "completed",
    runKind: "scheduled",
    model: "gpt-5.6-terra",
    verifierVersion: "nightly-question-verifier-v1",
    startedAt: "2026-08-12T23:00:00.000Z",
    claimToken: null,
    heartbeatAt: "2026-08-12T23:00:00.000Z",
    leaseExpiresAt: "2026-08-12T23:15:00.000Z",
    completedAt: "2026-08-12T23:01:00.000Z",
    usage: {
      model: "gpt-5.6-terra",
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 50,
      webSearchCalls: 1,
    },
    estimatedCostMicrodollars: 12_345,
    email: {
      status: "pending",
      emailSentAt: null,
      metadata: {
        provider: "resend",
        providerMessageId: null,
        attempts: 0,
        lastAttemptAt: null,
        failure: null,
      },
    },
    errors: [],
    createdAt: "2026-08-12T23:00:00.000Z",
    updatedAt: "2026-08-12T23:01:00.000Z",
    ...overrides,
  } as DailyQuestionReviewRunRecord;
}

function item(
  slot: number,
  verdict: "passed" | "risk" | "unable_to_verify" = "passed",
  replacement = false,
) {
  const questionId = `00000000-0000-4000-8000-${slot.toString().padStart(12, "0")}`;
  return {
    id: `00000000-0000-4000-8001-${slot.toString().padStart(12, "0")}`,
    runId: "00000000-0000-4000-8000-000000000100",
    dailyChallengeId: "00000000-0000-4000-8000-000000000200",
    slot,
    question: {
      id: questionId,
      question_text: `Question ${slot}?`,
      option_a: "A",
      option_b: "B",
      option_c: "C",
      option_d: "D",
      correct_option: "A",
      sport: { slug: "nba", name: "NBA" },
      difficulty: slot < 3 ? "easy" : slot === 3 ? "medium" : "hard",
      source_notes: "https://www.nba.com/source",
    },
    reviewStatus: "completed",
    sourceFetchResults: [],
    finding: {
      questionId,
      verdict,
      confidence: verdict === "passed" ? 0.98 : 0.6,
      explanation:
        verdict === "passed" ? "Official records support the answer." : "This needs owner review.",
      conflicts: verdict === "risk" ? ["A source conflicts with the answer."] : [],
      evidence:
        verdict === "unable_to_verify"
          ? []
          : [
              {
                url: "https://www.nba.com/evidence",
                title: "NBA record",
                excerpt: "Official evidence.",
                retrievedAt: "2026-08-12T23:00:00.000Z",
              },
              {
                url: "javascript:alert(1)",
                title: "Unsafe",
                excerpt: "Do not include this link.",
                retrievedAt: "2026-08-12T23:00:00.000Z",
              },
            ],
      verifiedAt: "2026-08-12T23:00:00.000Z",
    },
    replacement: replacement
      ? {
          questionId: "00000000-0000-4000-8000-000000000099",
          eligible: true,
          snapshot: {
            id: "00000000-0000-4000-8000-000000000099",
            question_text: "Verified replacement?",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "A",
            sport: { slug: "nfl", name: "NFL" },
            difficulty: "medium",
            source_notes: "https://www.nfl.com/source",
          },
          finding: {
            questionId: "00000000-0000-4000-8000-000000000099",
            verdict: "passed",
            confidence: 0.96,
            explanation: "Verified replacement.",
            conflicts: [],
            evidence: [
              {
                url: "https://www.nfl.com/evidence",
                title: "NFL record",
                excerpt: "Official evidence.",
                retrievedAt: "2026-08-12T23:00:00.000Z",
              },
            ],
            verifiedAt: "2026-08-12T23:00:00.000Z",
          },
        }
      : null,
    replacementAttempted: replacement,
    resolution: "pending",
    resolvedBy: null,
    resolvedAt: null,
    applicationMetadata: {},
    appliedAt: null,
    createdAt: "2026-08-12T23:00:00.000Z",
    updatedAt: "2026-08-12T23:01:00.000Z",
  } as DailyQuestionReviewItemRecord;
}

describe("daily question review notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "You Kno Ball <alerts@example.com>");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "owner@example.com, second@example.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://youknoball.com");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-123" }),
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("sends an all-clear report with cost, all five questions, and the admin URL", async () => {
    const result = await sendDailyQuestionReviewNotification(
      { run: run(), items: [1, 2, 3, 4, 5].map((slot) => item(slot)) },
      fetchMock,
    );

    expect(result).toEqual({ sent: true, providerMessageId: "email-123" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      from: "You Kno Ball <alerts@example.com>",
      to: ["owner@example.com", "second@example.com"],
      subject: "Daily 5 review all clear: August 13, 2026",
    });
    expect(body.text).toContain("All five questions passed verification.");
    expect(body.text.match(/Question \d\?/g)).toHaveLength(5);
    expect(body.text).toContain("Estimated cost: $0.012345");
    expect(body.text).toContain("https://youknoball.com/admin/daily-review/2026-08-13");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "idempotency-key": `daily-question-review-${run().id}`,
    });
  });

  it("emphasizes risk, unavailable evidence, safe sources, and verified replacements", async () => {
    await sendDailyQuestionReviewNotification(
      {
        run: run({ status: "completed_with_flags" }),
        items: [item(1, "risk", true), item(2, "unable_to_verify"), item(3), item(4), item(5)],
      },
      fetchMock,
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe("Daily 5 review needs attention: August 13, 2026");
    expect(body.text).toContain("RISK - owner review required");
    expect(body.text).toContain("UNABLE TO VERIFY - adequate evidence was unavailable");
    expect(body.text).toContain("Verified replacement: Verified replacement?");
    expect(body.text).toContain("https://www.nba.com/evidence");
    expect(body.text).not.toContain("javascript:alert");
    expect(body.html).not.toContain("javascript:alert");
  });

  it("uses a safe production fallback when the configured site URL is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await sendDailyQuestionReviewNotification(
      { run: run(), items: [1, 2, 3, 4, 5].map((slot) => item(slot)), siteUrlFallback: "https://preview.vercel.app" },
      fetchMock,
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain("https://preview.vercel.app/admin/daily-review/2026-08-13");
  });

  it("skips sending when configuration is incomplete", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await sendDailyQuestionReviewNotification(
      { run: run(), items: [item(1)] },
      fetchMock,
    );
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips sending when the run was already emailed", async () => {
    const result = await sendDailyQuestionReviewNotification(
      {
        run: run({
          email: {
            status: "sent",
            emailSentAt: "2026-08-12T23:02:00.000Z",
            metadata: {
              provider: "resend",
              providerMessageId: "prior-email",
              attempts: 1,
              lastAttemptAt: "2026-08-12T23:02:00.000Z",
              failure: null,
            },
          },
        }),
        items: [item(1)],
      },
      fetchMock,
    );
    expect(result).toEqual({ sent: false, reason: "already_sent" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds Resend error details", async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => "x".repeat(2_000) });
    await expect(
      sendDailyQuestionReviewNotification({ run: run(), items: [item(1)] }, fetchMock),
    ).rejects.toThrow("Unable to send nightly review email.");
  });

  it("redacts the Resend key from provider errors", async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => "Rejected resend-key" });
    await expect(
      sendDailyQuestionReviewNotification({ run: run(), items: [item(1)] }, fetchMock),
    ).rejects.toThrow("Rejected [REDACTED]");
  });

  it("sends a budget-blocked alert without requiring a draft", async () => {
    const result = await sendDailyQuestionReviewBudgetBlockNotification(
      {
        challengeDate: "2026-08-13",
        reason: "reservation_exceeds_remaining",
        reservedMicrodollars: 5_040_000,
        remainingMicrodollars: 2_000_000,
      },
      fetchMock,
    );
    expect(result).toEqual({ sent: true, providerMessageId: "email-123" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe("Daily 5 review budget blocked: August 13, 2026");
    expect(body.text).toContain("No OpenAI verification calls were made.");
    expect(body.text).toContain("reservation_exceeds_remaining");
  });

  it("aborts a timed-out Resend request", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const pending = sendDailyQuestionReviewNotification(
      { run: run(), items: [item(1)] },
      fetchMock,
    );
    const rejection = expect(pending).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;
    vi.useRealTimers();
  });
});
