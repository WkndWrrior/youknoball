import { describe, expect, it } from "vitest";

import {
  DAILY_QUESTION_REVIEW_ACTIONS,
  DAILY_QUESTION_REVIEW_RESOLUTIONS,
  DAILY_QUESTION_REVIEW_RUN_STATUSES,
  DAILY_QUESTION_REVIEW_VERDICTS,
  MAX_REVIEW_CONFLICT_LENGTH,
  MAX_REVIEW_CONFLICTS,
  MAX_REVIEW_EVIDENCE_EXCERPT_LENGTH,
  MAX_REVIEW_EVIDENCE_ITEMS,
  MAX_REVIEW_EVIDENCE_TITLE_LENGTH,
  MAX_REVIEW_EXPLANATION_LENGTH,
  parseDailyQuestionReviewAction,
  parseDailyQuestionVerificationFinding,
} from "@/lib/dailyQuestionReview";

const QUESTION_ID = "101635c2-dbd2-4384-b954-a8e5bf9594c6";
const REVIEW_ITEM_ID = "14e2c0ff-1cc2-4b0d-9b32-801acfa77883";
const REPLACEMENT_ID = "169f5245-60ed-46cb-9049-541cdd528d86";

const validEvidence = {
  url: "https://www.espn.com/college-football/story/_/id/12345/example",
  title: "An authoritative game record",
  excerpt: "The official record supports the expected answer.",
  retrievedAt: "2026-08-08T23:00:00.000Z",
};

const validFinding = {
  questionId: QUESTION_ID,
  verdict: "risk",
  confidence: 0.825,
  explanation: "Two approved sources disagree about the stated record.",
  conflicts: ["The NCAA record book lists a different total."],
  evidence: [validEvidence],
  verifiedAt: "2026-08-08T23:01:00.000Z",
};

describe("daily question verification findings", () => {
  it("exports the exact review domain values", () => {
    expect(DAILY_QUESTION_REVIEW_RUN_STATUSES).toEqual([
      "running",
      "completed",
      "partial",
      "failed",
      "budget_blocked",
    ]);
    expect(DAILY_QUESTION_REVIEW_VERDICTS).toEqual([
      "passed",
      "risk",
      "unable_to_verify",
    ]);
    expect(DAILY_QUESTION_REVIEW_RESOLUTIONS).toEqual([
      "pending",
      "kept",
      "replaced",
    ]);
    expect(DAILY_QUESTION_REVIEW_ACTIONS).toEqual(["keep", "replace"]);
  });

  it("normalizes a complete structured model finding", () => {
    expect(parseDailyQuestionVerificationFinding(validFinding)).toEqual(
      validFinding,
    );
  });

  it.each(["passed", "risk", "unable_to_verify"] as const)(
    "accepts the %s verdict",
    (verdict) => {
      expect(
        parseDailyQuestionVerificationFinding({ ...validFinding, verdict }),
      ).toMatchObject({ verdict });
    },
  );

  it("trims bounded user-facing strings", () => {
    expect(
      parseDailyQuestionVerificationFinding({
        ...validFinding,
        explanation: "  Evidence supports the answer.  ",
        conflicts: ["  A historical database disagrees.  "],
        evidence: [
          {
            ...validEvidence,
            title: "  Official result  ",
            excerpt: "  The final score was 24-17.  ",
          },
        ],
      }),
    ).toMatchObject({
      explanation: "Evidence supports the answer.",
      conflicts: ["A historical database disagrees."],
      evidence: [
        {
          title: "Official result",
          excerpt: "The final score was 24-17.",
        },
      ],
    });
  });

  it.each([
    ["a non-object", "risk"],
    ["an invalid question UUID", { ...validFinding, questionId: "question-1" }],
    ["a missing verdict", { ...validFinding, verdict: undefined }],
    ["an unknown verdict", { ...validFinding, verdict: "probably" }],
    ["a confidence below zero", { ...validFinding, confidence: -0.001 }],
    ["a confidence above one", { ...validFinding, confidence: 1.001 }],
    ["a non-finite confidence", { ...validFinding, confidence: Infinity }],
    ["a blank explanation", { ...validFinding, explanation: "   " }],
    [
      "an overlong explanation",
      { ...validFinding, explanation: "x".repeat(MAX_REVIEW_EXPLANATION_LENGTH + 1) },
    ],
    ["a non-array conflict list", { ...validFinding, conflicts: "none" }],
    [
      "too many conflicts",
      {
        ...validFinding,
        conflicts: Array.from({ length: MAX_REVIEW_CONFLICTS + 1 }, () => "conflict"),
      },
    ],
    ["a blank conflict", { ...validFinding, conflicts: [" "] }],
    [
      "an overlong conflict",
      { ...validFinding, conflicts: ["x".repeat(MAX_REVIEW_CONFLICT_LENGTH + 1)] },
    ],
    ["a non-array evidence value", { ...validFinding, evidence: {} }],
    ["an empty evidence list", { ...validFinding, evidence: [] }],
    [
      "too much evidence",
      {
        ...validFinding,
        evidence: Array.from({ length: MAX_REVIEW_EVIDENCE_ITEMS + 1 }, () => validEvidence),
      },
    ],
    [
      "a non-HTTPS evidence URL",
      { ...validFinding, evidence: [{ ...validEvidence, url: "http://espn.com/story" }] },
    ],
    [
      "an invalid evidence URL",
      { ...validFinding, evidence: [{ ...validEvidence, url: "not a url" }] },
    ],
    [
      "an overlong evidence title",
      {
        ...validFinding,
        evidence: [
          { ...validEvidence, title: "x".repeat(MAX_REVIEW_EVIDENCE_TITLE_LENGTH + 1) },
        ],
      },
    ],
    [
      "an overlong evidence excerpt",
      {
        ...validFinding,
        evidence: [
          {
            ...validEvidence,
            excerpt: "x".repeat(MAX_REVIEW_EVIDENCE_EXCERPT_LENGTH + 1),
          },
        ],
      },
    ],
    [
      "an invalid evidence retrieval date",
      { ...validFinding, evidence: [{ ...validEvidence, retrievedAt: "last night" }] },
    ],
    ["an invalid verification date", { ...validFinding, verifiedAt: "2026-13-40" }],
  ])("returns null for %s", (_description, input) => {
    expect(parseDailyQuestionVerificationFinding(input)).toBeNull();
  });

  it("accepts values at every configured boundary", () => {
    const parsed = parseDailyQuestionVerificationFinding({
      ...validFinding,
      confidence: 1,
      explanation: "🏀".repeat(MAX_REVIEW_EXPLANATION_LENGTH),
      conflicts: Array.from(
        { length: MAX_REVIEW_CONFLICTS },
        () => "x".repeat(MAX_REVIEW_CONFLICT_LENGTH),
      ),
      evidence: Array.from({ length: MAX_REVIEW_EVIDENCE_ITEMS }, () => ({
        ...validEvidence,
        title: "x".repeat(MAX_REVIEW_EVIDENCE_TITLE_LENGTH),
        excerpt: "🏀".repeat(MAX_REVIEW_EVIDENCE_EXCERPT_LENGTH),
      })),
    });

    expect(parsed).not.toBeNull();
  });
});

describe("daily question review actions", () => {
  it("parses a keep action", () => {
    expect(
      parseDailyQuestionReviewAction({
        action: "keep",
        reviewItemId: REVIEW_ITEM_ID,
        requestedAt: "2026-08-08T23:30:00.000Z",
      }),
    ).toEqual({
      action: "keep",
      reviewItemId: REVIEW_ITEM_ID,
      replacementQuestionId: null,
      requestedAt: "2026-08-08T23:30:00.000Z",
    });
  });

  it("parses a replace action with its replacement question", () => {
    expect(
      parseDailyQuestionReviewAction({
        action: "replace",
        reviewItemId: REVIEW_ITEM_ID,
        replacementQuestionId: REPLACEMENT_ID,
        requestedAt: "2026-08-08T23:30:00Z",
      }),
    ).toEqual({
      action: "replace",
      reviewItemId: REVIEW_ITEM_ID,
      replacementQuestionId: REPLACEMENT_ID,
      requestedAt: "2026-08-08T23:30:00Z",
    });
  });

  it.each([
    ["a non-object", "keep"],
    ["an unsupported action", { action: "delete", reviewItemId: REVIEW_ITEM_ID }],
    ["an invalid review item UUID", { action: "keep", reviewItemId: "item-1" }],
    [
      "a missing request date",
      { action: "keep", reviewItemId: REVIEW_ITEM_ID },
    ],
    [
      "an invalid request date",
      { action: "keep", reviewItemId: REVIEW_ITEM_ID, requestedAt: "tomorrow" },
    ],
    [
      "a replacement attached to keep",
      {
        action: "keep",
        reviewItemId: REVIEW_ITEM_ID,
        replacementQuestionId: REPLACEMENT_ID,
        requestedAt: "2026-08-08T23:30:00Z",
      },
    ],
    [
      "a replace action without a replacement UUID",
      {
        action: "replace",
        reviewItemId: REVIEW_ITEM_ID,
        requestedAt: "2026-08-08T23:30:00Z",
      },
    ],
    [
      "a replace action with an invalid replacement UUID",
      {
        action: "replace",
        reviewItemId: REVIEW_ITEM_ID,
        replacementQuestionId: "replacement-1",
        requestedAt: "2026-08-08T23:30:00Z",
      },
    ],
  ])("returns null for %s", (_description, input) => {
    expect(parseDailyQuestionReviewAction(input)).toBeNull();
  });
});
