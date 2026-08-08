import { describe, expect, it } from "vitest";

import {
  DAILY_QUESTION_REVIEW_ACTIONS,
  DAILY_QUESTION_REVIEW_ERROR_PHASES,
  DAILY_QUESTION_REVIEW_ITEM_STATUSES,
  DAILY_QUESTION_REVIEW_RESOLUTIONS,
  DAILY_QUESTION_REVIEW_RUN_STATUSES,
  DAILY_QUESTION_REVIEW_VERDICTS,
  DAILY_QUESTION_SOURCE_FETCH_STATUSES,
  MAX_QUESTION_OPTION_LENGTH,
  MAX_QUESTION_SOURCE_NOTES_LENGTH,
  MAX_QUESTION_TEXT_LENGTH,
  MAX_REVIEW_EMAIL_ATTEMPTS,
  MAX_REVIEW_EMAIL_FAILURE_CODE_LENGTH,
  MAX_REVIEW_EMAIL_FAILURE_MESSAGE_LENGTH,
  MAX_REVIEW_EMAIL_METADATA_BYTES,
  MAX_REVIEW_EMAIL_PROVIDER_MESSAGE_ID_LENGTH,
  MAX_REVIEW_CONFLICT_LENGTH,
  MAX_REVIEW_CONFLICTS,
  MAX_REVIEW_EVIDENCE_EXCERPT_LENGTH,
  MAX_REVIEW_EVIDENCE_ITEMS,
  MAX_REVIEW_EVIDENCE_TITLE_LENGTH,
  MAX_REVIEW_EXPLANATION_LENGTH,
  MAX_REVIEW_RUN_ERROR_CODE_LENGTH,
  MAX_REVIEW_RUN_ERROR_MESSAGE_LENGTH,
  MAX_REVIEW_RUN_ERRORS,
  MAX_REVIEW_RUN_ERRORS_BYTES,
  MAX_SOURCE_FETCH_ERROR_CODE_LENGTH,
  MAX_SOURCE_FETCH_ERROR_MESSAGE_LENGTH,
  MAX_SOURCE_FETCH_RESULTS,
  parseDailyQuestionReviewAction,
  parseDailyQuestionReviewEmailMetadata,
  parseDailyQuestionReplacementCandidate,
  parseDailyQuestionReviewRunErrors,
  parseDailyQuestionSourceFetchResults,
  parseDailyQuestionVerificationFinding,
  parseQuestionSnapshot,
  parseReplacementFinding,
} from "@/lib/dailyQuestionReview";

const QUESTION_ID = "101635c2-dbd2-4384-b954-a8e5bf9594c6";
const REVIEW_ITEM_ID = "14e2c0ff-1cc2-4b0d-9b32-801acfa77883";
const REPLACEMENT_ID = "169f5245-60ed-46cb-9049-541cdd528d86";

const validSnapshot = {
  id: QUESTION_ID,
  question_text: "Who won the 1985 NCAA men's basketball championship?",
  option_a: "Georgetown",
  option_b: "Villanova",
  option_c: "St. John's",
  option_d: "Memphis State",
  correct_option: "B",
  sport: { slug: "cbb", name: "College Basketball" },
  difficulty: "medium",
  source_notes: "NCAA championship archive.",
};

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
      "preparing",
      "running",
      "completed",
      "completed_with_flags",
      "failed",
    ]);
    expect(DAILY_QUESTION_REVIEW_ITEM_STATUSES).toEqual([
      "pending",
      "reviewing",
      "completed",
      "failed",
    ]);
    expect(DAILY_QUESTION_SOURCE_FETCH_STATUSES).toEqual([
      "fetched",
      "failed",
      "blocked",
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

  it("accepts unable_to_verify without evidence", () => {
    expect(
      parseDailyQuestionVerificationFinding({
        ...validFinding,
        verdict: "unable_to_verify",
        evidence: [],
      }),
    ).toMatchObject({ verdict: "unable_to_verify", evidence: [] });
  });

  it.each(["passed", "risk"] as const)(
    "rejects %s without evidence",
    (verdict) => {
      expect(
        parseDailyQuestionVerificationFinding({
          ...validFinding,
          verdict,
          evidence: [],
        }),
      ).toBeNull();
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

describe("question snapshots", () => {
  it("parses the canonical review snapshot shape", () => {
    expect(parseQuestionSnapshot(validSnapshot)).toEqual(validSnapshot);
  });

  it("enforces an expected snapshot question id", () => {
    expect(parseQuestionSnapshot(validSnapshot, QUESTION_ID)).toEqual(
      validSnapshot,
    );
    expect(parseQuestionSnapshot(validSnapshot, REPLACEMENT_ID)).toBeNull();
  });

  it("normalizes snapshot text and nullable source notes", () => {
    expect(
      parseQuestionSnapshot({
        ...validSnapshot,
        question_text: `  ${validSnapshot.question_text}  `,
        option_a: "  Georgetown  ",
        sport: { slug: "  cbb  ", name: "  College Basketball  " },
        source_notes: "   ",
      }),
    ).toEqual({
      ...validSnapshot,
      option_a: "Georgetown",
      sport: { slug: "cbb", name: "College Basketball" },
      source_notes: null,
    });

    expect(
      parseQuestionSnapshot({ ...validSnapshot, source_notes: null }),
    ).toMatchObject({ source_notes: null });
  });

  it("accepts snapshot strings at their Unicode code-point limits", () => {
    expect(
      parseQuestionSnapshot({
        ...validSnapshot,
        question_text: "🏀".repeat(MAX_QUESTION_TEXT_LENGTH),
        option_a: "🏀".repeat(MAX_QUESTION_OPTION_LENGTH),
        source_notes: "🏀".repeat(MAX_QUESTION_SOURCE_NOTES_LENGTH),
      }),
    ).not.toBeNull();
  });

  it.each([
    ["a non-object", []],
    ["an invalid id", { ...validSnapshot, id: "question-1" }],
    ["a missing question", { ...validSnapshot, question_text: undefined }],
    ["a blank question", { ...validSnapshot, question_text: " " }],
    [
      "an overlong question",
      { ...validSnapshot, question_text: "x".repeat(MAX_QUESTION_TEXT_LENGTH + 1) },
    ],
    ["a missing choice", { ...validSnapshot, option_d: undefined }],
    ["a blank choice", { ...validSnapshot, option_b: " " }],
    [
      "an overlong choice",
      { ...validSnapshot, option_c: "x".repeat(MAX_QUESTION_OPTION_LENGTH + 1) },
    ],
    ["an invalid correct option", { ...validSnapshot, correct_option: "E" }],
    ["an invalid difficulty", { ...validSnapshot, difficulty: "expert" }],
    ["a non-object sport", { ...validSnapshot, sport: "cbb" }],
    ["a blank sport slug", { ...validSnapshot, sport: { slug: " ", name: "CBB" } }],
    ["a missing sport name", { ...validSnapshot, sport: { slug: "cbb" } }],
    ["non-string source notes", { ...validSnapshot, source_notes: {} }],
    [
      "overlong source notes",
      {
        ...validSnapshot,
        source_notes: "x".repeat(MAX_QUESTION_SOURCE_NOTES_LENGTH + 1),
      },
    ],
  ])("rejects %s", (_description, input) => {
    expect(parseQuestionSnapshot(input)).toBeNull();
  });
});

describe("source fetch results", () => {
  const fetchedResult = {
    sourceUrl: "https://www.ncaa.com/history/basketball-men/d1",
    finalUrl: "https://www.ncaa.com/history/basketball-men/d1",
    status: "fetched",
    httpStatus: 200,
    contentType: "text/html; charset=utf-8",
    attemptedAt: "2026-08-08T23:00:00.000Z",
    error: null,
  };

  const failedResult = {
    sourceUrl: "https://www.espn.com/example",
    finalUrl: null,
    status: "failed",
    httpStatus: 503,
    contentType: null,
    attemptedAt: "2026-08-08T23:00:01.000Z",
    error: { code: "upstream_unavailable", message: "Source returned 503." },
  };

  it("parses fetched, failed, and blocked source outcomes", () => {
    const blockedResult = {
      ...failedResult,
      status: "blocked",
      httpStatus: null,
      error: { code: "domain_not_allowed", message: "Domain is not approved." },
    };

    expect(
      parseDailyQuestionSourceFetchResults([
        fetchedResult,
        failedResult,
        blockedResult,
      ]),
    ).toEqual([fetchedResult, failedResult, blockedResult]);
  });

  it("accepts an empty source-result collection", () => {
    expect(parseDailyQuestionSourceFetchResults([])).toEqual([]);
  });

  it("accepts source-result collections at configured boundaries", () => {
    expect(
      parseDailyQuestionSourceFetchResults(
        Array.from({ length: MAX_SOURCE_FETCH_RESULTS }, () => ({
          ...failedResult,
          error: {
            code: "x".repeat(MAX_SOURCE_FETCH_ERROR_CODE_LENGTH),
            message: "🏀".repeat(MAX_SOURCE_FETCH_ERROR_MESSAGE_LENGTH),
          },
        })),
      ),
    ).not.toBeNull();
  });

  it.each([
    ["a non-array", {}],
    [
      "too many results",
      Array.from({ length: MAX_SOURCE_FETCH_RESULTS + 1 }, () => fetchedResult),
    ],
    ["a non-object result", ["failed"]],
    ["a non-HTTPS source URL", [{ ...fetchedResult, sourceUrl: "http://ncaa.com" }]],
    ["an invalid final URL", [{ ...fetchedResult, finalUrl: "not-a-url" }]],
    ["an unknown status", [{ ...fetchedResult, status: "redirected" }]],
    ["an invalid HTTP status", [{ ...fetchedResult, httpStatus: 99 }]],
    ["a fractional HTTP status", [{ ...fetchedResult, httpStatus: 200.5 }]],
    ["an invalid attempt time", [{ ...fetchedResult, attemptedAt: "today" }]],
    ["a fetched result without a final URL", [{ ...fetchedResult, finalUrl: null }]],
    [
      "a fetched result with an error",
      [{ ...fetchedResult, error: { code: "warning", message: "Unexpected." } }],
    ],
    ["a failed result without an error", [{ ...failedResult, error: null }]],
    [
      "an overlong error code",
      [
        {
          ...failedResult,
          error: {
            ...failedResult.error,
            code: "x".repeat(MAX_SOURCE_FETCH_ERROR_CODE_LENGTH + 1),
          },
        },
      ],
    ],
    [
      "an overlong error message",
      [
        {
          ...failedResult,
          error: {
            ...failedResult.error,
            message: "x".repeat(MAX_SOURCE_FETCH_ERROR_MESSAGE_LENGTH + 1),
          },
        },
      ],
    ],
  ])("rejects %s", (_description, input) => {
    expect(parseDailyQuestionSourceFetchResults(input)).toBeNull();
  });
});

describe("structured run errors", () => {
  const validRunError = {
    phase: "verification",
    code: "model_response_invalid",
    message: "The model response did not match the required schema.",
    retryable: true,
    occurredAt: "2026-08-08T23:05:00.000Z",
    questionId: QUESTION_ID,
  };

  it("exports the supported error phases", () => {
    expect(DAILY_QUESTION_REVIEW_ERROR_PHASES).toEqual([
      "preparing",
      "source_fetch",
      "verification",
      "replacement",
      "email",
    ]);
  });

  it("parses structured run errors", () => {
    expect(
      parseDailyQuestionReviewRunErrors([
        validRunError,
        { ...validRunError, phase: "email", questionId: null },
      ]),
    ).toEqual([
      validRunError,
      { ...validRunError, phase: "email", questionId: null },
    ]);
  });

  it("accepts run errors at configured boundaries", () => {
    expect(
      parseDailyQuestionReviewRunErrors(
        Array.from({ length: MAX_REVIEW_RUN_ERRORS }, () => ({
          ...validRunError,
          code: "boundary",
          message: "A bounded error.",
        })),
      ),
    ).not.toBeNull();
    expect(
      parseDailyQuestionReviewRunErrors([
        {
          ...validRunError,
          code: "x".repeat(MAX_REVIEW_RUN_ERROR_CODE_LENGTH),
          message: "🏀".repeat(MAX_REVIEW_RUN_ERROR_MESSAGE_LENGTH),
        },
      ]),
    ).not.toBeNull();
  });

  it("rejects errors whose UTF-8 JSON representation exceeds the SQL cap", () => {
    const errors = Array.from({ length: MAX_REVIEW_RUN_ERRORS }, () => ({
      ...validRunError,
      message: "🏀".repeat(MAX_REVIEW_RUN_ERROR_MESSAGE_LENGTH),
    }));

    expect(new TextEncoder().encode(JSON.stringify(errors)).byteLength).toBeGreaterThan(
      MAX_REVIEW_RUN_ERRORS_BYTES,
    );
    expect(parseDailyQuestionReviewRunErrors(errors)).toBeNull();
  });

  it.each([
    ["a non-array", null],
    [
      "too many errors",
      Array.from({ length: MAX_REVIEW_RUN_ERRORS + 1 }, () => validRunError),
    ],
    ["an unsupported phase", [{ ...validRunError, phase: "publishing" }]],
    ["a blank code", [{ ...validRunError, code: " " }]],
    [
      "an overlong code",
      [{ ...validRunError, code: "x".repeat(MAX_REVIEW_RUN_ERROR_CODE_LENGTH + 1) }],
    ],
    [
      "an overlong message",
      [
        {
          ...validRunError,
          message: "x".repeat(MAX_REVIEW_RUN_ERROR_MESSAGE_LENGTH + 1),
        },
      ],
    ],
    ["a non-boolean retryable value", [{ ...validRunError, retryable: "yes" }]],
    ["an invalid occurrence time", [{ ...validRunError, occurredAt: "now" }]],
    ["an invalid optional question id", [{ ...validRunError, questionId: "q1" }]],
  ])("rejects %s", (_description, input) => {
    expect(parseDailyQuestionReviewRunErrors(input)).toBeNull();
  });
});

describe("email delivery metadata", () => {
  const pendingMetadata = {
    provider: "resend",
    providerMessageId: null,
    attempts: 0,
    lastAttemptAt: null,
    failure: null,
  };

  it("parses pending, delivered, and failed delivery metadata", () => {
    const delivered = {
      ...pendingMetadata,
      providerMessageId: "4f44a6f7-message",
      attempts: 1,
      lastAttemptAt: "2026-08-08T23:10:00.000Z",
    };
    const failed = {
      ...pendingMetadata,
      attempts: 2,
      lastAttemptAt: "2026-08-08T23:12:00.000Z",
      failure: {
        code: "provider_rejected",
        message: "Resend rejected the request.",
        occurredAt: "2026-08-08T23:12:00.000Z",
      },
    };

    expect(parseDailyQuestionReviewEmailMetadata(pendingMetadata)).toEqual(
      pendingMetadata,
    );
    expect(parseDailyQuestionReviewEmailMetadata(delivered)).toEqual(delivered);
    expect(parseDailyQuestionReviewEmailMetadata(failed)).toEqual(failed);
  });

  it("accepts email metadata at configured boundaries", () => {
    expect(
      parseDailyQuestionReviewEmailMetadata({
        provider: "resend",
        providerMessageId: "x".repeat(
          MAX_REVIEW_EMAIL_PROVIDER_MESSAGE_ID_LENGTH,
        ),
        attempts: MAX_REVIEW_EMAIL_ATTEMPTS,
        lastAttemptAt: "2026-08-08T23:10:00.000Z",
        failure: null,
      }),
    ).not.toBeNull();
    expect(
      parseDailyQuestionReviewEmailMetadata({
        provider: "resend",
        providerMessageId: null,
        attempts: 1,
        lastAttemptAt: "2026-08-08T23:10:00.000Z",
        failure: {
          code: "x".repeat(MAX_REVIEW_EMAIL_FAILURE_CODE_LENGTH),
          message: "x".repeat(MAX_REVIEW_EMAIL_FAILURE_MESSAGE_LENGTH),
          occurredAt: "2026-08-08T23:10:00.000Z",
        },
      }),
    ).not.toBeNull();
  });

  it("rejects email metadata whose UTF-8 JSON representation exceeds the SQL cap", () => {
    const metadata = {
      provider: "resend",
      providerMessageId: null,
      attempts: 1,
      lastAttemptAt: "2026-08-08T23:10:00.000Z",
      failure: {
        code: "provider_rejected",
        message: "🏀".repeat(MAX_REVIEW_EMAIL_FAILURE_MESSAGE_LENGTH),
        occurredAt: "2026-08-08T23:10:00.000Z",
      },
    };

    expect(
      new TextEncoder().encode(JSON.stringify(metadata)).byteLength,
    ).toBeGreaterThan(MAX_REVIEW_EMAIL_METADATA_BYTES);
    expect(parseDailyQuestionReviewEmailMetadata(metadata)).toBeNull();
  });

  it.each([
    ["a non-object", []],
    ["an unsupported provider", { ...pendingMetadata, provider: "smtp" }],
    ["a negative attempt count", { ...pendingMetadata, attempts: -1 }],
    ["a fractional attempt count", { ...pendingMetadata, attempts: 1.5 }],
    [
      "too many attempts",
      { ...pendingMetadata, attempts: MAX_REVIEW_EMAIL_ATTEMPTS + 1 },
    ],
    [
      "an overlong provider message id",
      {
        ...pendingMetadata,
        providerMessageId: "x".repeat(
          MAX_REVIEW_EMAIL_PROVIDER_MESSAGE_ID_LENGTH + 1,
        ),
      },
    ],
    [
      "an attempt count without a timestamp",
      { ...pendingMetadata, attempts: 1 },
    ],
    [
      "a timestamp without an attempt",
      {
        ...pendingMetadata,
        lastAttemptAt: "2026-08-08T23:10:00.000Z",
      },
    ],
    [
      "an invalid attempt timestamp",
      { ...pendingMetadata, attempts: 1, lastAttemptAt: "tonight" },
    ],
    [
      "a failure without an attempt",
      {
        ...pendingMetadata,
        failure: {
          code: "provider_rejected",
          message: "Rejected.",
          occurredAt: "2026-08-08T23:10:00.000Z",
        },
      },
    ],
    [
      "an overlong failure code",
      {
        ...pendingMetadata,
        attempts: 1,
        lastAttemptAt: "2026-08-08T23:10:00.000Z",
        failure: {
          code: "x".repeat(MAX_REVIEW_EMAIL_FAILURE_CODE_LENGTH + 1),
          message: "Rejected.",
          occurredAt: "2026-08-08T23:10:00.000Z",
        },
      },
    ],
    [
      "an overlong failure message",
      {
        ...pendingMetadata,
        attempts: 1,
        lastAttemptAt: "2026-08-08T23:10:00.000Z",
        failure: {
          code: "provider_rejected",
          message: "x".repeat(MAX_REVIEW_EMAIL_FAILURE_MESSAGE_LENGTH + 1),
          occurredAt: "2026-08-08T23:10:00.000Z",
        },
      },
    ],
  ])("rejects %s", (_description, input) => {
    expect(parseDailyQuestionReviewEmailMetadata(input)).toBeNull();
  });
});

describe("replacement findings", () => {
  it("parses a complete replacement finding", () => {
    const replacementFinding = {
      ...validFinding,
      questionId: REPLACEMENT_ID,
      verdict: "passed",
      conflicts: [],
    };

    expect(parseReplacementFinding(replacementFinding)).toEqual(
      replacementFinding,
    );
  });

  it("rejects an invalid replacement finding", () => {
    expect(
      parseReplacementFinding({
        ...validFinding,
        questionId: REPLACEMENT_ID,
        verdict: "passed",
        evidence: [],
      }),
    ).toBeNull();
  });
});

describe("replacement candidates", () => {
  const replacementSnapshot = {
    ...validSnapshot,
    id: REPLACEMENT_ID,
    question_text: "Which team won the 1983 NCAA men's title?",
  };
  const passedFinding = {
    ...validFinding,
    questionId: REPLACEMENT_ID,
    verdict: "passed",
    conflicts: [],
  };
  const validCandidate = {
    questionId: REPLACEMENT_ID,
    eligible: true,
    snapshot: replacementSnapshot,
    finding: passedFinding,
  };

  it("parses a same-difficulty preverified replacement", () => {
    expect(
      parseDailyQuestionReplacementCandidate(validCandidate, validSnapshot),
    ).toEqual(validCandidate);
  });

  it("allows an ineligible candidate to retain a risk finding", () => {
    const candidate = {
      ...validCandidate,
      eligible: false,
      finding: { ...passedFinding, verdict: "risk" },
    };

    expect(
      parseDailyQuestionReplacementCandidate(candidate, validSnapshot),
    ).toEqual(candidate);
  });

  it.each([
    [
      "a candidate id that differs from its snapshot",
      { ...validCandidate, snapshot: { ...replacementSnapshot, id: QUESTION_ID } },
    ],
    [
      "a candidate id that differs from its finding",
      { ...validCandidate, finding: { ...passedFinding, questionId: QUESTION_ID } },
    ],
    [
      "a replacement with a different difficulty",
      { ...validCandidate, snapshot: { ...replacementSnapshot, difficulty: "hard" } },
    ],
    [
      "an eligible replacement with a risk finding",
      { ...validCandidate, finding: { ...passedFinding, verdict: "risk" } },
    ],
    [
      "an eligible replacement without evidence",
      { ...validCandidate, finding: { ...passedFinding, evidence: [] } },
    ],
  ])("rejects %s", (_description, candidate) => {
    expect(
      parseDailyQuestionReplacementCandidate(candidate, validSnapshot),
    ).toBeNull();
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
