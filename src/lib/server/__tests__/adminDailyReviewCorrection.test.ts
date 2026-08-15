import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  verifyAndCorrectAdminDailyReviewAnswer,
  type AdminDailyReviewCorrectionDependencies,
} from "@/lib/server/adminDailyReviewCorrection";

const challengeDate = "2026-08-15";
const reviewItemId = "00000000-0000-4000-8000-000000000010";
const questionId = "00000000-0000-4000-8000-000000000020";
const userId = "00000000-0000-4000-8000-000000000001";

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
    run: { id: "00000000-0000-4000-8000-000000000100" },
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
    expect(deps.verifyQuestion).not.toHaveBeenCalled();
    expect(deps.correctAnswer).not.toHaveBeenCalled();
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
      newCorrectOption: "B",
      finding: passedFinding,
      resolvedBy: userId,
    });
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
    });
  });

  it("maps a repository missing outcome safely", async () => {
    const deps = dependencies();
    vi.mocked(deps.correctAnswer).mockResolvedValue({ outcome: "missing" });

    await expect(verifyAndCorrectAdminDailyReviewAnswer(input, deps)).resolves.toEqual({
      outcome: "missing",
    });
  });
});
