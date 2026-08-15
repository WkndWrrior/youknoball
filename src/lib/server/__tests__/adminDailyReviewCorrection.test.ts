import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  verifyAndCorrectAdminDailyReviewAnswer,
  type AdminDailyReviewCorrectionDependencies,
} from "@/lib/server/adminDailyReviewCorrection";
import {
  DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION,
  DAILY_REVIEW_MAX_REQUEST_RESERVATION_MICRODOLLARS,
} from "@/lib/server/dailyQuestionReviewBudget";
import { OpenAiQuestionVerifierError } from "@/lib/server/openAiQuestionVerifier";

const challengeDate = "2026-08-15";
const reviewItemId = "00000000-0000-4000-8000-000000000010";
const questionId = "00000000-0000-4000-8000-000000000020";
const userId = "00000000-0000-4000-8000-000000000001";
const claimToken = "00000000-0000-4000-8000-000000000030";

const question = {
  id: questionId,
  question_text: "Which team won the title?",
  option_a: "Alpha",
  option_b: "Bravo",
  option_c: "Charlie",
  option_d: "Delta",
  correct_option: "A" as const,
  sport: { slug: "nba", name: "NBA" },
  difficulty: "easy" as const,
  source_notes: "https://www.nba.com/example",
};

const passedFinding = {
  questionId,
  verdict: "passed" as const,
  confidence: 0.98,
  explanation: "The approved source directly supports Bravo.",
  conflicts: [],
  evidence: [
    {
      url: "https://www.nba.com/example",
      title: "NBA result",
      excerpt: "Bravo won the title.",
      retrievedAt: "2026-08-15T20:00:00.000Z",
    },
  ],
  verifiedAt: "2026-08-15T20:00:00.000Z",
};

const riskFinding = {
  ...passedFinding,
  verdict: "risk" as const,
  confidence: 0.6,
  explanation: "The available sources conflict.",
};

const savedEvidence = [
  {
    requestedUrl: "https://www.nba.com/example",
    finalUrl: "https://www.nba.com/example",
    redirects: [],
    status: "fetched" as const,
    title: "NBA result",
    excerpt: "Bravo won the title.",
    bytes: 128,
    contentType: "text/html",
  },
];

function review(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      id: "00000000-0000-4000-8000-000000000100",
      status: "completed",
      completedAt: "2026-08-15T18:00:00.000Z",
    },
    items: [
      {
        id: reviewItemId,
        question,
        reviewStatus: "completed",
        resolution: "pending",
        finding: riskFinding,
        ...overrides,
      },
    ],
  };
}

function dependencies(): AdminDailyReviewCorrectionDependencies {
  return {
    model: "gpt-5.6-terra",
    loadReview: vi.fn(async () => review() as never),
    claimAnswer: vi.fn(async () => ({
      outcome: "claimed" as const,
      claimToken,
      claimExpiresAt: "2026-08-15T20:02:00.000Z",
    })),
    releaseClaim: vi.fn(async () => ({ outcome: "released" as const })),
    collectEvidence: vi.fn(async () => savedEvidence),
    verifyQuestion: vi.fn(async () => ({
      finding: passedFinding,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 20,
        cacheWriteTokens: 0,
        outputTokens: 10,
      },
      webSearchCalls: 1,
      sources: [{ url: "https://www.nba.com/example", title: "NBA result" }],
    })),
    estimateCost: vi.fn(() => 4321),
    correctAnswer: vi.fn(async () => ({ outcome: "corrected" as const })),
  };
}

const input = {
  challengeDate,
  reviewItemId,
  newCorrectOption: "B" as const,
  resolvedBy: userId,
};

describe("verifyAndCorrectAdminDailyReviewAnswer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns missing without billable work when the review item does not exist", async () => {
    const deps = dependencies();
    vi.mocked(deps.loadReview).mockResolvedValue(null);

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "missing",
    });
    expect(deps.collectEvidence).not.toHaveBeenCalled();
    expect(deps.claimAnswer).not.toHaveBeenCalled();
    expect(deps.verifyQuestion).not.toHaveBeenCalled();
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it.each([
    ["resolved", { resolution: "kept" }],
    ["not_flagged", { finding: passedFinding }],
    ["not_flagged", { finding: null }],
  ])("rejects %s items before source collection or verification", async (reason, itemOverrides) => {
    const deps = dependencies();
    vi.mocked(deps.loadReview).mockResolvedValue(review(itemOverrides) as never);

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "conflict",
      reason,
    });
    expect(deps.collectEvidence).not.toHaveBeenCalled();
    expect(deps.claimAnswer).not.toHaveBeenCalled();
    expect(deps.verifyQuestion).not.toHaveBeenCalled();
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it("rejects an unchanged answer before source collection or verification", async () => {
    const deps = dependencies();

    await expect(
      verifyAndCorrectAdminDailyReviewAnswer(
        { ...input, newCorrectOption: "A" },
        deps,
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "unchanged" });
    expect(deps.collectEvidence).not.toHaveBeenCalled();
    expect(deps.claimAnswer).not.toHaveBeenCalled();
    expect(deps.verifyQuestion).not.toHaveBeenCalled();
    expect(deps.correctAnswer).not.toHaveBeenCalled();
  });

  it("requires a finalized loaded review before attempting a database claim", async () => {
    const deps = dependencies();
    vi.mocked(deps.loadReview).mockResolvedValue({
      ...review(),
      run: { status: "running", completedAt: null },
    } as never);

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "conflict",
      reason: "not_finalized",
    });
    expect(deps.claimAnswer).not.toHaveBeenCalled();
    expect(deps.collectEvidence).not.toHaveBeenCalled();
  });

  it("acquires the database correction claim before source collection", async () => {
    const deps = dependencies();

    await verifyAndCorrectAdminDailyReviewAnswer(input, deps);

    expect(deps.claimAnswer).toHaveBeenCalledWith({
      challengeDate,
      reviewItemId,
      newCorrectOption: "B",
      claimedBy: userId,
    });
    expect(vi.mocked(deps.claimAnswer).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.collectEvidence).mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["busy", "busy"],
    ["conflict", "stale"],
    ["not_draft", "not_draft"],
    ["unchanged", "unchanged"],
  ] as const)("maps a %s database claim without billable work", async (outcome, reason) => {
    const deps = dependencies();
    vi.mocked(deps.claimAnswer).mockResolvedValue({ outcome });

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "conflict",
      reason,
    });
    expect(deps.collectEvidence).not.toHaveBeenCalled();
    expect(deps.verifyQuestion).not.toHaveBeenCalled();
    expect(deps.releaseClaim).not.toHaveBeenCalled();
  });

  it("rejects a published challenge through the database claim before verification", async () => {
    const deps = dependencies();
    vi.mocked(deps.claimAnswer).mockResolvedValue({ outcome: "not_draft" });

    const result = await verifyAndCorrectAdminDailyReviewAnswer(input, deps);

    expect(result).toEqual({ outcome: "conflict", reason: "not_draft" });
    expect(deps.collectEvidence).not.toHaveBeenCalled();
    expect(deps.verifyQuestion).not.toHaveBeenCalled();
  });

  it("verifies a snapshot that differs only in correct_option using saved evidence", async () => {
    const deps = dependencies();

    await verifyAndCorrectAdminDailyReviewAnswer(input, deps);

    expect(deps.collectEvidence).toHaveBeenCalledWith(question.source_notes);
    expect(deps.verifyQuestion).toHaveBeenCalledWith({
      question: { ...question, correct_option: "B" },
      savedEvidence,
    });
    const proposed = vi.mocked(deps.verifyQuestion).mock.calls[0][0].question;
    expect({ ...proposed, correct_option: question.correct_option }).toEqual(question);
  });

  it.each([
    ["risk", riskFinding],
    [
      "unable_to_verify",
      {
        ...riskFinding,
        verdict: "unable_to_verify" as const,
        evidence: [],
      },
    ],
  ])("returns %s verification details without mutating", async (_verdict, finding) => {
    const deps = dependencies();
    vi.mocked(deps.verifyQuestion).mockResolvedValue({
      finding,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 20,
        cacheWriteTokens: 0,
        outputTokens: 10,
      },
      webSearchCalls: 2,
      sources: [],
    });

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "verification_rejected",
      finding,
      evidence: finding.evidence,
      estimatedCostMicrodollars: 4321,
    });
    expect(deps.estimateCost).toHaveBeenCalledWith({
      model: "gpt-5.6-terra",
      inputTokens: 100,
      cachedInputTokens: 20,
      cacheWriteTokens: 0,
      outputTokens: 10,
      webSearchCalls: 2,
    });
    expect(deps.correctAnswer).not.toHaveBeenCalled();
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("does not apply a passed finding without approved evidence", async () => {
    const deps = dependencies();
    const finding = { ...passedFinding, evidence: [] };
    vi.mocked(deps.verifyQuestion).mockResolvedValue({
      finding,
      usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
      webSearchCalls: 1,
      sources: [],
    });

    const result = await verifyAndCorrectAdminDailyReviewAnswer(input, deps);

    expect(result).toMatchObject({ outcome: "verification_rejected", finding, evidence: [] });
    expect(deps.correctAnswer).not.toHaveBeenCalled();
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("applies a passed finding with evidence and returns actual cost details", async () => {
    const deps = dependencies();

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "applied",
      finding: passedFinding,
      evidence: passedFinding.evidence,
      estimatedCostMicrodollars: 4321,
    });
    expect(deps.correctAnswer).toHaveBeenCalledWith({
      challengeDate,
      reviewItemId,
      claimToken,
      newCorrectOption: "B",
      finding: passedFinding,
      resolvedBy: userId,
    });
    expect(deps.releaseClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["conflict", "stale"],
    ["not_draft", "not_draft"],
  ] as const)("maps repository %s to a safe conflict", async (repositoryOutcome, reason) => {
    const deps = dependencies();
    vi.mocked(deps.correctAnswer).mockResolvedValue({ outcome: repositoryOutcome });

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "conflict",
      reason,
      finding: passedFinding,
      evidence: passedFinding.evidence,
      estimatedCostMicrodollars: 4321,
    });
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("maps a repository missing outcome safely", async () => {
    const deps = dependencies();
    vi.mocked(deps.correctAnswer).mockResolvedValue({ outcome: "missing" });

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "missing",
    });
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("accounts for verifier errors and returns only safe failure fields", async () => {
    const deps = dependencies();
    vi.mocked(deps.verifyQuestion).mockRejectedValue(
      new OpenAiQuestionVerifierError("api_error", "OPENAI_API_KEY=secret", {
        retryable: true,
        accounting: {
          usage: {
            inputTokens: 90,
            cachedInputTokens: 10,
            cacheWriteTokens: 0,
            outputTokens: 5,
          },
          webSearchCalls: 2,
          sources: [],
        },
      }),
    );

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "verification_failed",
      estimatedCostMicrodollars: 4321,
      retryable: true,
      usageUncertain: false,
    });
    expect(deps.estimateCost).toHaveBeenCalledWith({
      model: "gpt-5.6-terra",
      inputTokens: 90,
      cachedInputTokens: 10,
      cacheWriteTokens: 0,
      outputTokens: 5,
      webSearchCalls: 2,
    });
    expect(deps.correctAnswer).not.toHaveBeenCalled();
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("uses the conservative reservation floor when verifier accounting is uncertain", async () => {
    const deps = dependencies();
    vi.mocked(deps.verifyQuestion).mockRejectedValue(
      new OpenAiQuestionVerifierError("timeout", "timed out", {
        retryable: true,
        accounting: {
          usageUncertain: true,
          usage: {
            inputTokens: 90,
            cachedInputTokens: 10,
            cacheWriteTokens: 0,
            outputTokens: 5,
          },
          webSearchCalls: 2,
          sources: [],
        },
      }),
    );

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "verification_failed",
      estimatedCostMicrodollars:
        DAILY_REVIEW_MAX_REQUEST_RESERVATION_MICRODOLLARS *
        DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION,
      retryable: true,
      usageUncertain: true,
    });
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("returns paid verification details when correction persistence throws", async () => {
    const deps = dependencies();
    vi.mocked(deps.correctAnswer).mockRejectedValue(
      new Error("database password=secret"),
    );

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "persistence_failed",
      finding: passedFinding,
      evidence: passedFinding.evidence,
      estimatedCostMicrodollars: 4321,
    });
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("does not convert an unknown verifier error into persistence_failed", async () => {
    const deps = dependencies();
    const primary = new Error("unknown verifier failure");
    vi.mocked(deps.verifyQuestion).mockRejectedValue(primary);

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).rejects.toBe(primary);
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("releases the claim on unexpected errors without masking the primary error", async () => {
    const deps = dependencies();
    const primary = new Error("source collection failed");
    vi.mocked(deps.collectEvidence).mockRejectedValue(primary);
    vi.mocked(deps.releaseClaim).mockRejectedValue(new Error("release failed"));

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).rejects.toBe(primary);
    expect(deps.releaseClaim).toHaveBeenCalledWith({ reviewItemId, claimToken });
  });

  it("does not let a release failure replace a verification rejection", async () => {
    const deps = dependencies();
    vi.mocked(deps.verifyQuestion).mockResolvedValue({
      finding: riskFinding,
      usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
      webSearchCalls: 1,
      sources: [],
    });
    vi.mocked(deps.releaseClaim).mockRejectedValue(new Error("release failed"));

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toMatchObject({
      outcome: "verification_rejected",
      finding: riskFinding,
    });
  });
});
