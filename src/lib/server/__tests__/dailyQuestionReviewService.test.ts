import { describe, expect, it, vi } from "vitest";

import type {
  DailyQuestionVerificationFinding,
  QuestionSnapshot,
} from "@/lib/dailyQuestionReview";
import {
  DAILY_REVIEW_MAX_REQUEST_USAGE,
  DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
} from "@/lib/server/dailyQuestionReviewBudget";
import { OpenAiQuestionVerifierError } from "@/lib/server/openAiQuestionVerifier";
import type { PreparedDailyChallengeDraft } from "@/lib/server/dailyChallengeRepository";
import type {
  DailyQuestionReviewItemRecord,
  DailyQuestionReviewRunRecord,
} from "@/lib/server/dailyQuestionReviewRepository";
import {
  runNightlyQuestionReview,
  type DailyQuestionReviewServiceDependencies,
} from "@/lib/server/dailyQuestionReviewService";

function uuid(index: number) {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

const now = new Date("2026-08-09T23:00:00.000Z");
const questionIds = [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)];
const replacementId = uuid(99);

function makeQuestion(id: string, index: number): QuestionSnapshot {
  const difficulties = ["easy", "easy", "medium", "hard", "hard"] as const;
  return {
    id,
    question_text: `Question ${index + 1}?`,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "A",
    sport: { slug: index % 2 === 0 ? "nba" : "nfl", name: index % 2 === 0 ? "NBA" : "NFL" },
    difficulty: difficulties[index] ?? "medium",
    source_notes: "https://www.nba.com/example",
  };
}

const questions = questionIds.map(makeQuestion);
const replacement = makeQuestion(replacementId, 2);
function makeReplacementForSlot(slot: number): QuestionSnapshot {
  return slot === 3
    ? replacement
    : makeQuestion(uuid(90 + slot), slot - 1);
}
const draft: PreparedDailyChallengeDraft = {
  challengeId: uuid(200),
  challengeDate: "2026-08-10",
  questionIds: questionIds as [string, string, string, string, string],
  questions: questions.map((question, index) => ({ ...question, slot: index + 1 })) as PreparedDailyChallengeDraft["questions"],
};

function makeFinding(
  question: QuestionSnapshot,
  verdict: "passed" | "risk" | "unable_to_verify" = "passed",
): DailyQuestionVerificationFinding {
  return {
    questionId: question.id,
    verdict,
    confidence: verdict === "passed" ? 0.98 : 0.6,
    explanation: verdict === "passed" ? "Supported." : "Material risk.",
    conflicts: verdict === "risk" ? ["Conflicting record"] : [],
    evidence:
      verdict === "unable_to_verify"
        ? []
        : [{
            url: "https://www.nba.com/example",
            title: "Official record",
            excerpt: "The official record supports this finding.",
            retrievedAt: now.toISOString(),
          }],
    verifiedAt: now.toISOString(),
  };
}

function makeRun(overrides: Record<string, unknown> = {}): DailyQuestionReviewRunRecord {
  return {
    id: uuid(300),
    dailyChallengeId: draft.challengeId,
    reviewDate: "2026-08-09",
    challengeDate: draft.challengeDate,
    status: "running",
    runKind: "scheduled",
    model: "gpt-5.6-terra",
    verifierVersion: "nightly-question-verifier-v1",
    startedAt: now.toISOString(),
    claimToken: uuid(600),
    heartbeatAt: now.toISOString(),
    leaseExpiresAt: "2026-08-09T23:15:00.000Z",
    completedAt: null,
    usage: {
      model: "gpt-5.6-terra",
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      webSearchCalls: 0,
    },
    estimatedCostMicrodollars: 0,
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
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  } as DailyQuestionReviewRunRecord;
}

function makeStoredItem(
  slot: number,
  reviewStatus: "pending" | "failed" | "completed" = "pending",
): DailyQuestionReviewItemRecord {
  const question = questions[slot - 1];
  return {
    id: uuid(400 + slot),
    runId: uuid(300),
    dailyChallengeId: draft.challengeId,
    slot,
    question,
    reviewStatus,
    sourceFetchResults: [],
    finding: reviewStatus === "completed" ? makeFinding(question) : null,
    replacement: null,
    resolution: "pending",
    resolvedBy: null,
    resolvedAt: null,
    applicationMetadata: {},
    appliedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  } as DailyQuestionReviewItemRecord;
}

function createDependencies(options: {
  verifier?: DailyQuestionReviewServiceDependencies["verifyQuestion"];
  reservationCreated?: boolean;
  existingRun?: ReturnType<typeof makeRun>;
  existingItems?: ReturnType<typeof makeStoredItem>[];
  sendEmail?: DailyQuestionReviewServiceDependencies["sendReviewEmail"];
  claimExistingResult?: {
    claimed: boolean;
    claimToken: string | null;
    run: ReturnType<typeof makeRun> | null;
  };
} = {}) {
  let run = options.existingRun ?? makeRun();
  const items = new Map<number, ReturnType<typeof makeStoredItem>>(
    (options.existingItems ?? []).map((item) => [item.slot, item]),
  );

  const dependencies: DailyQuestionReviewServiceDependencies = {
    model: "gpt-5.6-terra",
    verifierVersion: "nightly-question-verifier-v1",
    listMonthlyCosts: vi.fn(async () => []),
    acquireReservation: vi.fn(async () => ({
      acquired: true,
      created: options.reservationCreated ?? true,
      reservationId: uuid(500),
      reservedMicrodollars: DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
    })),
    reconcileReservation: vi.fn(async (input) => ({
      outcome: input.actualMicrodollars === 0 ? "released" : "reconciled",
      actualMicrodollars: input.actualMicrodollars,
    })),
    recordBudgetBlock: vi.fn(async () => undefined),
    prepareDraft: vi.fn(async () => draft),
    startOrObserve: vi.fn(async () => ({
      created: options.existingRun === undefined,
      claimed: true,
      claimToken: uuid(600),
      run,
    })),
    claimExisting: vi.fn(async () => options.claimExistingResult ?? ({
      claimed: false,
      claimToken: null,
      run,
    })),
    heartbeatRun: vi.fn(async () => true),
    currentTime: vi.fn(() => now),
    loadReview: vi.fn(async () => ({
      run,
      items: Array.from(items.values()).sort((left, right) => left.slot - right.slot),
    })),
    saveItem: vi.fn(async (input) => {
      const stored = {
        ...makeStoredItem(input.slot, input.reviewStatus),
        question: input.question,
        sourceFetchResults: input.sourceFetchResults,
        finding: input.finding,
        replacement: input.replacement,
      } as DailyQuestionReviewItemRecord;
      items.set(input.slot, stored);
      return stored;
    }),
    completeRun: vi.fn(async (input) => {
      run = {
        ...run,
        status: input.status,
        completedAt: input.completedAt,
        usage: { model: "gpt-5.6-terra", ...input.usage },
        estimatedCostMicrodollars: input.estimatedCostMicrodollars,
        errors: input.errors,
      } as DailyQuestionReviewRunRecord;
      return run;
    }),
    collectEvidence: vi.fn(async () => ({
      savedEvidence: [],
      sourceFetchResults: [],
    })),
    verifyQuestion:
      options.verifier ??
      vi.fn(async ({ question }) => ({
        finding: makeFinding(question),
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 5,
        },
        webSearchCalls: 0,
        sources: [],
      })),
    selectReplacement: vi.fn(async ({ flaggedSlot }) =>
      makeReplacementForSlot(flaggedSlot),
    ),
    claimEmail: vi.fn(async () => ({ claimed: true, attempts: 1 })),
    sendReviewEmail:
      options.sendEmail ??
      vi.fn(async () => ({ providerMessageId: "email-1" })),
    markEmailSent: vi.fn(async () => undefined),
    markEmailFailed: vi.fn(async () => undefined),
  };

  return { dependencies, items, getRun: () => run };
}

describe("runNightlyQuestionReview", () => {
  it("gates budget, verifies five slots with concurrency two, verifies only flagged replacements, and emails once", async () => {
    let active = 0;
    let maxActive = 0;
    const verifier = vi.fn(async ({ question }: { question: QuestionSnapshot }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return {
        finding: makeFinding(question, question.id === questionIds[2] ? "risk" : "passed"),
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 5,
        },
        webSearchCalls: 0,
        sources: [],
      };
    });
    const { dependencies, items, getRun } = createDependencies({ verifier });

    const result = await runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    });

    expect(result).toMatchObject({ kind: "completed", run: { status: "completed_with_flags" } });
    expect(dependencies.listMonthlyCosts).toHaveBeenCalledBefore(
      dependencies.prepareDraft as ReturnType<typeof vi.fn>,
    );
    expect(dependencies.prepareDraft).toHaveBeenCalledOnce();
    expect(verifier).toHaveBeenCalledTimes(6);
    expect(maxActive).toBe(2);
    expect(dependencies.selectReplacement).toHaveBeenCalledTimes(1);
    expect(dependencies.selectReplacement).toHaveBeenCalledWith({
      draft,
      flaggedSlot: 3,
      selection: draft.questions,
    });
    expect(dependencies.saveItem).toHaveBeenCalledTimes(6);
    expect(dependencies.saveItem).toHaveBeenCalledBefore(
      dependencies.selectReplacement as ReturnType<typeof vi.fn>,
    );
    expect(items.get(3)).toMatchObject({
      reviewStatus: "completed",
      finding: { verdict: "risk" },
      replacement: { eligible: true, questionId: replacementId, finding: { verdict: "passed" } },
    });
    expect(getRun()).toMatchObject({
      status: "completed_with_flags",
      usage: { inputTokens: 60, outputTokens: 30 },
      estimatedCostMicrodollars: 600,
    });
    expect(dependencies.reconcileReservation).toHaveBeenCalledWith({
      reservationId: uuid(500),
      actualMicrodollars: 600,
      reconciledAt: now.toISOString(),
    });
    expect(dependencies.sendReviewEmail).toHaveBeenCalledOnce();
    expect(dependencies.markEmailSent).toHaveBeenCalledOnce();
  });

  it("selects multiple same-difficulty replacements against an evolving combined draft", async () => {
    const easyReplacements = [
      makeQuestion(uuid(91), 0),
      makeQuestion(uuid(92), 1),
    ];
    const verifier = vi.fn(async ({ question }: { question: QuestionSnapshot }) => ({
      finding: makeFinding(
        question,
        question.id === questionIds[0] || question.id === questionIds[1]
          ? "risk"
          : "passed",
      ),
      usage: {
        inputTokens: 10,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 5,
      },
      webSearchCalls: 0,
      sources: [],
    }));
    const { dependencies, items } = createDependencies({ verifier });
    const seenSelections: string[][] = [];
    dependencies.selectReplacement = vi.fn(async (
      input: Parameters<DailyQuestionReviewServiceDependencies["selectReplacement"]>[0],
    ) => {
      const selection = input.selection;
      seenSelections.push(selection.map((question) => question.id));
      return easyReplacements.find(
        (candidate) => !selection.some((question) => question.id === candidate.id),
      ) ?? null;
    });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(seenSelections).toHaveLength(2);
    expect(seenSelections[1]).toContain(easyReplacements[0].id);
    expect([items.get(1)?.replacement?.questionId, items.get(2)?.replacement?.questionId])
      .toEqual([easyReplacements[0].id, easyReplacements[1].id]);
    expect(new Set(Array.from(items.values()).map((item) =>
      item.replacement?.questionId ?? item.question.id,
    )).size).toBe(5);
  });

  it("persists an atomic budget denial and makes zero draft, verifier, or email calls", async () => {
    const { dependencies } = createDependencies();
    vi.mocked(dependencies.acquireReservation).mockResolvedValue({ acquired: false });

    const result = await runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    });

    expect(result).toMatchObject({ kind: "budget_blocked", budget: { allowed: false } });
    expect(dependencies.prepareDraft).not.toHaveBeenCalled();
    expect(dependencies.verifyQuestion).not.toHaveBeenCalled();
    expect(dependencies.sendReviewEmail).not.toHaveBeenCalled();
    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
    expect(dependencies.recordBudgetBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeDate: "2026-08-10",
        reservedMicrodollars: DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
      }),
    );
  });

  it("persists unsupported-model budget blocks with zero reservation and no verifier call", async () => {
    const { dependencies } = createDependencies();
    dependencies.model = "unsupported-model";

    const result = await runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    });

    expect(result).toMatchObject({
      kind: "budget_blocked",
      budget: {
        reason: "unsupported_model",
        reservedMicrodollars: 0,
      },
    });
    expect(dependencies.verifyQuestion).not.toHaveBeenCalled();
    expect(dependencies.recordBudgetBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "unsupported_model",
        reservedMicrodollars: 0,
      }),
    );
  });

  it("fits all five required replacements inside the exact worst-case reservation", async () => {
    const verifier = vi.fn(async ({ question }: { question: QuestionSnapshot }) => ({
      finding: makeFinding(question, "risk"),
      usage: {
        inputTokens: DAILY_REVIEW_MAX_REQUEST_USAGE.inputTokens * 2,
        cachedInputTokens: 0,
        cacheWriteTokens: DAILY_REVIEW_MAX_REQUEST_USAGE.cacheWriteTokens * 2,
        outputTokens: DAILY_REVIEW_MAX_REQUEST_USAGE.outputTokens * 2,
      },
      webSearchCalls: DAILY_REVIEW_MAX_REQUEST_USAGE.webSearchCalls * 2,
      sources: [],
    }));
    const { dependencies, items } = createDependencies({ verifier });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(verifier).toHaveBeenCalledTimes(10);
    expect(dependencies.selectReplacement).toHaveBeenCalledTimes(5);
    expect(Array.from(items.values()).every((item) => item.replacement !== null)).toBe(true);
    expect(dependencies.reconcileReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualMicrodollars: DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
      }),
    );
  });

  it("records charged verifier failure usage and preserves the other completed findings", async () => {
    const verifier = vi.fn(async ({ question }: { question: QuestionSnapshot }) => {
      if (question.id === questionIds[1]) {
        throw new OpenAiQuestionVerifierError("timeout", "Timed out", {
          retryable: true,
          accounting: {
            usage: {
              inputTokens: 10,
              cachedInputTokens: 0,
              cacheWriteTokens: 0,
              outputTokens: 5,
            },
            webSearchCalls: 0,
            sources: [],
          },
        });
      }
      return {
        finding: makeFinding(question),
        usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
        webSearchCalls: 0,
        sources: [],
      };
    });
    const { dependencies, items, getRun } = createDependencies({ verifier });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(items.get(2)).toMatchObject({ reviewStatus: "failed", finding: null });
    expect(Array.from(items.values()).filter((item) => item.reviewStatus === "completed")).toHaveLength(4);
    expect(getRun()).toMatchObject({
      status: "failed",
      usage: { inputTokens: 50, outputTokens: 25 },
      estimatedCostMicrodollars: 500,
      errors: [expect.objectContaining({ phase: "verification", code: "timeout", questionId: questionIds[1] })],
    });
    expect(dependencies.reconcileReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualMicrodollars: 500 }),
    );
    expect(dependencies.sendReviewEmail).toHaveBeenCalledOnce();
  });

  it("preserves completed findings and records email failure independently", async () => {
    const sendEmail = vi.fn(async () => {
      throw new Error("email unavailable");
    });
    const { dependencies, getRun } = createDependencies({ sendEmail });

    await expect(
      runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies }),
    ).resolves.toMatchObject({ kind: "completed", run: { status: "completed" } });

    expect(getRun()).toMatchObject({ status: "completed" });
    expect(dependencies.markEmailFailed).toHaveBeenCalledWith(
      uuid(300),
      expect.objectContaining({ code: "email_failed", message: "email unavailable" }),
    );
  });

  it("leaves email pending when Task 8 has not injected a sender", async () => {
    const { dependencies } = createDependencies();
    dependencies.sendReviewEmail = null;

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.claimEmail).not.toHaveBeenCalled();
    expect(dependencies.markEmailSent).not.toHaveBeenCalled();
    expect(dependencies.markEmailFailed).not.toHaveBeenCalled();
  });

  it("lets concurrent duplicate callers observe one active reservation without duplicate work", async () => {
    const { dependencies } = createDependencies();
    let acquisition = 0;
    vi.mocked(dependencies.acquireReservation).mockImplementation(async () => ({
      acquired: true,
      created: acquisition++ === 0,
      reservationId: uuid(500),
      reservedMicrodollars: DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
    }));

    const [first, second] = await Promise.all([
      runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies }),
      runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies }),
    ]);

    expect([first.kind, second.kind].sort()).toEqual(["completed", "observed"]);
    expect([first, second].find((result) => result.kind === "observed"))
      .toMatchObject({ run: { id: uuid(300) } });
    expect(dependencies.prepareDraft).toHaveBeenCalledOnce();
    expect(dependencies.verifyQuestion).toHaveBeenCalledTimes(5);
    expect(dependencies.sendReviewEmail).toHaveBeenCalledOnce();
    expect(dependencies.reconcileReservation).toHaveBeenCalledOnce();
  });

  it("atomically reclaims a stale running run and resumes only unfinished slots", async () => {
    const staleRun = makeRun({
      status: "running",
      heartbeatAt: "2026-08-09T22:30:00.000Z",
      leaseExpiresAt: "2026-08-09T22:45:00.000Z",
    });
    const existingItems = [
      makeStoredItem(1, "completed"),
      makeStoredItem(2, "completed"),
      makeStoredItem(3, "failed"),
      makeStoredItem(4, "pending"),
      makeStoredItem(5, "pending"),
    ];
    const { dependencies, getRun } = createDependencies({
      reservationCreated: false,
      existingRun: staleRun,
      existingItems,
      claimExistingResult: {
        claimed: true,
        claimToken: uuid(601),
        run: staleRun,
      },
    });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.claimExisting).toHaveBeenCalledOnce();
    expect(dependencies.startOrObserve).not.toHaveBeenCalled();
    expect(dependencies.verifyQuestion).toHaveBeenCalledTimes(3);
    expect(dependencies.heartbeatRun).toHaveBeenCalled();
    expect(getRun()).toMatchObject({ status: "completed" });
  });

  it("resumes a failed partial run, skips completed slots, and retries failed or pending slots once", async () => {
    const existingRun = makeRun({
      status: "failed",
      completedAt: now.toISOString(),
      usage: {
        model: "gpt-5.6-terra",
        inputTokens: 20,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 10,
        webSearchCalls: 0,
      },
      estimatedCostMicrodollars: 200,
    });
    const existingItems = [
      makeStoredItem(1, "completed"),
      makeStoredItem(2, "completed"),
      makeStoredItem(3, "failed"),
      makeStoredItem(4, "pending"),
      makeStoredItem(5, "pending"),
    ];
    const { dependencies, getRun } = createDependencies({ existingRun, existingItems });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.verifyQuestion).toHaveBeenCalledTimes(3);
    expect(dependencies.saveItem).toHaveBeenCalledTimes(3);
    expect(getRun()).toMatchObject({
      status: "completed",
      usage: { inputTokens: 50, outputTokens: 25 },
      estimatedCostMicrodollars: 500,
    });
    expect(dependencies.reconcileReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualMicrodollars: 300 }),
    );
  });

  it("resumes replacement verification for a persisted flagged finding", async () => {
    const flaggedItem = {
      ...makeStoredItem(3, "completed"),
      finding: makeFinding(questions[2], "risk"),
    } as DailyQuestionReviewItemRecord;
    const existingItems = [1, 2, 4, 5].map((slot) =>
      makeStoredItem(slot, "completed"),
    );
    existingItems.push(flaggedItem);
    const { dependencies, items } = createDependencies({
      existingRun: makeRun({ status: "failed", completedAt: now.toISOString() }),
      existingItems,
    });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.verifyQuestion).toHaveBeenCalledOnce();
    expect(dependencies.selectReplacement).toHaveBeenCalledWith({
      draft,
      flaggedSlot: 3,
      selection: draft.questions,
    });
    expect(dependencies.saveItem).toHaveBeenCalledOnce();
    expect(items.get(3)).toMatchObject({
      finding: { verdict: "risk" },
      replacement: { eligible: true, questionId: replacementId },
    });
  });
});
