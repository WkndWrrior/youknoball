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
  DAILY_QUESTION_REVIEW_INVOCATION_MS,
  DAILY_QUESTION_REVIEW_MIN_UNIT_REMAINING_MS,
  MAX_DAILY_QUESTION_VERIFICATION_UNIT_DURATION_MS,
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
    replacementAttempted: false,
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
  reservationRunCostBaselineMicrodollars?: number;
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
  const appliedUsageEvents = new Set<string>();
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
      runCostBaselineMicrodollars:
        options.reservationRunCostBaselineMicrodollars ?? 0,
    })),
    reconcileReservation: vi.fn(async (input) => ({
      outcome: input.actualMicrodollars === 0 ? "released" : "reconciled",
      actualMicrodollars: input.actualMicrodollars,
    })),
    recordBudgetBlock: vi.fn(async () => ({ created: true })),
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
    loadExisting: vi.fn(async () => options.existingRun
      ? {
          run,
          items: Array.from(items.values()).sort((left, right) => left.slot - right.slot),
        }
      : null),
    loadOldestRecoverable: vi.fn(async () => null),
    claimOldestBudgetBlockEmail: vi.fn(async () => ({
      claimed: false as const,
      reservationId: null,
      challengeDate: null,
      reason: null,
      reservedMicrodollars: 0,
      remainingMicrodollars: 0,
      attempts: 0,
    })),
    loadActiveReservation: vi.fn(async () => null),
    saveItem: vi.fn(async (input) => {
      const stored = {
        ...makeStoredItem(input.slot, input.reviewStatus),
        question: input.question,
        sourceFetchResults: input.sourceFetchResults,
        finding: input.finding,
        replacement: input.replacement,
        replacementAttempted:
          input.replacementAttempted ?? input.replacement !== null,
      } as DailyQuestionReviewItemRecord;
      items.set(input.slot, stored);
      run = {
        ...run,
        errors: input.runErrors,
      } as DailyQuestionReviewRunRecord;
      const usageApplied = Boolean(
        input.usageEvent && !appliedUsageEvents.has(input.usageEvent.id),
      );
      if (input.usageEvent && usageApplied) {
        appliedUsageEvents.add(input.usageEvent.id);
        run = {
          ...run,
          usage: {
            model: run.usage.model,
            inputTokens: (run.usage.inputTokens ?? 0) + input.usageEvent.inputTokens,
            cachedInputTokens:
              (run.usage.cachedInputTokens ?? 0) + input.usageEvent.cachedInputTokens,
            cacheWriteTokens:
              (run.usage.cacheWriteTokens ?? 0) + input.usageEvent.cacheWriteTokens,
            outputTokens: (run.usage.outputTokens ?? 0) + input.usageEvent.outputTokens,
            webSearchCalls: run.usage.webSearchCalls + input.usageEvent.webSearchCalls,
          },
          estimatedCostMicrodollars:
            run.estimatedCostMicrodollars + input.usageEvent.estimatedCostMicrodollars,
        } as DailyQuestionReviewRunRecord;
      }
      return { item: stored, run, usageApplied };
    }),
    completeRun: vi.fn(async (input) => {
      run = {
        ...run,
        status: input.status,
        completedAt: input.completedAt,
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
    sendBudgetBlockEmail: vi.fn(async () => ({ providerMessageId: "budget-email-1" })),
    claimBudgetBlockEmail: vi.fn(async () => ({
      claimed: true,
      reservationId: uuid(501),
      attempts: 1,
    })),
    markBudgetBlockEmailSent: vi.fn(async () => undefined),
    markBudgetBlockEmailFailed: vi.fn(async () => undefined),
    markEmailSent: vi.fn(async () => undefined),
    markEmailFailed: vi.fn(async () => undefined),
  };

  return { dependencies, items, getRun: () => run };
}

function enableResumableInvocations(
  context: ReturnType<typeof createDependencies>,
  runExists = false,
) {
  let reservationCalls = runExists ? 1 : 0;
  const originalStart = context.dependencies.startOrObserve;
  context.dependencies.acquireReservation = vi.fn(async () => ({
    acquired: true,
    created: reservationCalls++ === 0,
    reservationId: uuid(500),
    reservedMicrodollars: DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
    runCostBaselineMicrodollars: 0,
  }));
  context.dependencies.startOrObserve = vi.fn(async (input) => {
    runExists = true;
    return originalStart(input);
  });
  context.dependencies.loadExisting = vi.fn(async () =>
    runExists
      ? {
          run: context.getRun(),
          items: Array.from(context.items.values()).sort(
            (left, right) => left.slot - right.slot,
          ),
        }
      : null,
  );
  context.dependencies.claimExisting = vi.fn(async () => ({
    claimed: true,
    claimToken: uuid(601),
    run: context.getRun(),
  }));
}

async function runUntilTerminal(
  context: ReturnType<typeof createDependencies>,
  runExists = false,
) {
  enableResumableInvocations(context, runExists);
  for (let invocation = 0; invocation < 11; invocation += 1) {
    const result = await runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    });
    if (result.kind !== "in_progress") return result;
  }
  throw new Error("Nightly review did not reach a terminal state.");
}

describe("runNightlyQuestionReview", () => {
  it("pins one bounded verification unit below the invocation deadline", () => {
    expect(MAX_DAILY_QUESTION_VERIFICATION_UNIT_DURATION_MS).toBe(111_250);
    expect(DAILY_QUESTION_REVIEW_MIN_UNIT_REMAINING_MS).toBe(125_000);
    expect(DAILY_QUESTION_REVIEW_INVOCATION_MS).toBe(240_000);
  });

  it("processes one primary per invocation and finalizes on the sixth invocation", async () => {
    const context = createDependencies();
    enableResumableInvocations(context);

    for (let invocation = 1; invocation <= 5; invocation += 1) {
      await expect(runNightlyQuestionReview({
        challengeDate: "2026-08-10",
        now,
        unitLimit: 1,
        deadline: new Date(now.getTime() + DAILY_QUESTION_REVIEW_INVOCATION_MS),
        dependencies: context.dependencies,
      })).resolves.toMatchObject({ kind: "in_progress" });
      expect(context.dependencies.verifyQuestion).toHaveBeenCalledTimes(invocation);
      expect(context.items.size).toBe(invocation);
      expect(context.dependencies.completeRun).not.toHaveBeenCalled();
      expect(context.dependencies.reconcileReservation).not.toHaveBeenCalled();
    }

    expect(context.dependencies.startOrObserve).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: "2026-08-09T23:00:00.000Z",
        leaseExpiresAt: "2026-08-09T23:03:00.000Z",
      }),
    );
    expect(context.dependencies.saveItem).toHaveBeenCalledWith(
      expect.objectContaining({
        heartbeatAt: "2026-08-09T23:00:00.000Z",
        leaseExpiresAt: "2026-08-09T23:03:00.000Z",
      }),
    );

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      unitLimit: 1,
      deadline: new Date(now.getTime() + DAILY_QUESTION_REVIEW_INVOCATION_MS),
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "completed" });
    expect(context.dependencies.verifyQuestion).toHaveBeenCalledTimes(5);
    expect(context.dependencies.completeRun).toHaveBeenCalledOnce();
  });

  it("collects primary evidence before persisting a failed placeholder immediately before verification", async () => {
    const context = createDependencies();

    await runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    });

    expect(context.dependencies.saveItem).toHaveBeenCalledTimes(2);
    expect(context.dependencies.saveItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        slot: 1,
        reviewStatus: "failed",
        finding: null,
        replacement: null,
        usageEvent: null,
        runErrors: [expect.objectContaining({
          code: "billable_result_persistence_pending",
          questionId: questionIds[0],
        })],
      }),
    );
    expect(context.dependencies.saveItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ slot: 1, reviewStatus: "completed" }),
    );
    expect(vi.mocked(context.dependencies.collectEvidence).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(context.dependencies.saveItem).mock.invocationCallOrder[0]);
    expect(vi.mocked(context.dependencies.saveItem).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(context.dependencies.verifyQuestion).mock.invocationCallOrder[0]);
    expect(context.getRun().errors).toEqual([]);
  });

  it("persists primary source collection failure as non-billable terminal progress", async () => {
    const existingItems = [2, 3, 4, 5].map((slot) => makeStoredItem(slot, "completed"));
    const context = createDependencies({
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: { claimed: true, claimToken: uuid(601), run: makeRun() },
    });
    enableResumableInvocations(context, true);
    context.dependencies.collectEvidence = vi.fn(async () => {
      throw new Error("source unavailable");
    });
    context.dependencies.selectReplacement = vi.fn(async () => null);

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({
      kind: "completed",
      run: { status: "completed_with_flags" },
    });

    expect(context.dependencies.verifyQuestion).not.toHaveBeenCalled();
    expect(context.dependencies.saveItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "failed" }),
    );
    expect(context.items.get(1)).toMatchObject({
      reviewStatus: "completed",
      finding: { verdict: "unable_to_verify" },
      replacement: null,
      replacementAttempted: true,
    });
  });

  it("does not repeat billed primary work after its final progress save fails", async () => {
    const existingItems = [2, 3, 4, 5].map((slot) => makeStoredItem(slot, "completed"));
    const context = createDependencies({
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: { claimed: true, claimToken: uuid(601), run: makeRun() },
    });
    enableResumableInvocations(context, true);
    const persist = context.dependencies.saveItem;
    context.dependencies.saveItem = vi.fn(async (input) => {
      if (input.reviewStatus === "completed" && input.slot === 1) {
        throw new Error("progress write failed after API success");
      }
      return persist(input);
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "completed", run: { status: "failed" } });

    expect(context.dependencies.verifyQuestion).toHaveBeenCalledOnce();
    expect(context.items.get(1)).toMatchObject({ reviewStatus: "failed" });
    expect(context.getRun().errors).toEqual([
      expect.objectContaining({
        code: "billable_result_persistence_pending",
        questionId: questionIds[0],
      }),
    ]);
    expect(context.dependencies.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("processes five primaries and five replacements without repeats, then finalizes", async () => {
    const verifier = vi.fn(async ({ question }: { question: QuestionSnapshot }) => ({
      finding: makeFinding(
        question,
        questionIds.includes(question.id) ? "risk" : "passed",
      ),
      usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
      webSearchCalls: 0,
      sources: [],
    }));
    const context = createDependencies({ verifier });
    enableResumableInvocations(context);

    for (let invocation = 1; invocation <= 10; invocation += 1) {
      await expect(runNightlyQuestionReview({
        challengeDate: "2026-08-10",
        now,
        dependencies: context.dependencies,
      })).resolves.toMatchObject({ kind: "in_progress" });
      expect(verifier).toHaveBeenCalledTimes(invocation);
    }

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "completed" });
    expect(verifier).toHaveBeenCalledTimes(10);
    expect(new Set(verifier.mock.calls.map(([input]) => input.question.id)).size).toBe(10);
  });

  it("persists primary operational failures as terminal unable findings", async () => {
    const verifier = vi.fn()
      .mockRejectedValueOnce(new OpenAiQuestionVerifierError("timeout", "Timed out", {
        retryable: true,
        accounting: {
          usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
          webSearchCalls: 0,
          sources: [],
        },
      }))
      .mockImplementation(async ({ question }: { question: QuestionSnapshot }) => ({
        finding: makeFinding(question),
        usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
        webSearchCalls: 0,
        sources: [],
      }));
    const context = createDependencies({ verifier });
    enableResumableInvocations(context);

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies: context.dependencies });
    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies: context.dependencies });

    expect(context.items.get(1)).toMatchObject({
      reviewStatus: "completed",
      finding: { verdict: "unable_to_verify" },
    });
    expect(verifier.mock.calls.map(([input]) => input.question.id)).toEqual([
      questionIds[0],
      questionIds[1],
    ]);
    expect(context.getRun().usage).toMatchObject({ inputTokens: 20, outputTokens: 10 });
    expect(context.getRun().errors).toEqual([
      expect.objectContaining({ code: "timeout", questionId: questionIds[0] }),
    ]);
    expect(context.dependencies.saveItem).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: "completed",
        runErrors: [expect.objectContaining({ code: "timeout" })],
      }),
    );
  });

  it("persists unknown primary usage as terminal uncertainty and charges conservatively", async () => {
    const existingItems = [2, 3, 4, 5].map((slot) =>
      makeStoredItem(slot, "completed"),
    );
    const verifier = vi.fn(async () => {
      throw new OpenAiQuestionVerifierError("timeout", "Timed out", {
        retryable: true,
        accounting: {
          usageUncertain: true,
          usage: {
            inputTokens: 40,
            cachedInputTokens: 0,
            cacheWriteTokens: 0,
            outputTokens: 6,
          },
          webSearchCalls: 0,
          sources: [],
        },
      });
    });
    const context = createDependencies({
      verifier,
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: {
        claimed: true,
        claimToken: uuid(601),
        run: makeRun(),
      },
    });
    enableResumableInvocations(context, true);

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({
      kind: "completed",
      run: { status: "failed" },
    });

    expect(verifier).toHaveBeenCalledOnce();
    expect(context.items.get(1)).toMatchObject({
      reviewStatus: "failed",
      finding: { verdict: "unable_to_verify" },
    });
    expect(context.getRun().errors).toEqual([
      expect.objectContaining({
        code: "usage_uncertain",
        questionId: questionIds[0],
      }),
    ]);
    expect(context.dependencies.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("persists replacement operational failures as terminal ineligible outcomes", async () => {
    const flaggedItem = {
      ...makeStoredItem(3, "completed"),
      finding: makeFinding(questions[2], "risk"),
    } as DailyQuestionReviewItemRecord;
    const existingItems = [1, 2, 4, 5].map((slot) => makeStoredItem(slot, "completed"));
    existingItems.push(flaggedItem);
    const verifier = vi.fn(async () => {
      throw new OpenAiQuestionVerifierError("timeout", "Timed out", {
        retryable: true,
        accounting: {
          usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
          webSearchCalls: 0,
          sources: [],
        },
      });
    });
    const context = createDependencies({
      verifier,
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: { claimed: true, claimToken: uuid(601), run: makeRun() },
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    expect(context.items.get(3)?.replacement).toMatchObject({
      eligible: false,
      questionId: replacementId,
      finding: { verdict: "unable_to_verify" },
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "completed" });
    expect(verifier).toHaveBeenCalledOnce();
  });

  it("persists unknown replacement usage without retrying the billed candidate", async () => {
    const flaggedItem = {
      ...makeStoredItem(3, "completed"),
      finding: makeFinding(questions[2], "risk"),
    } as DailyQuestionReviewItemRecord;
    const existingItems = [1, 2, 4, 5].map((slot) =>
      makeStoredItem(slot, "completed"),
    );
    existingItems.push(flaggedItem);
    const verifier = vi.fn(async () => {
      throw new OpenAiQuestionVerifierError("network_error", "Network failed", {
        retryable: true,
        accounting: {
          usageUncertain: true,
          usage: {
            inputTokens: 0,
            cachedInputTokens: 0,
            cacheWriteTokens: 0,
            outputTokens: 0,
          },
          webSearchCalls: 0,
          sources: [],
        },
      });
    });
    const context = createDependencies({
      verifier,
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: {
        claimed: true,
        claimToken: uuid(601),
        run: makeRun(),
      },
    });
    enableResumableInvocations(context, true);

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({
      kind: "completed",
      run: { status: "failed" },
    });

    expect(verifier).toHaveBeenCalledOnce();
    expect(context.items.get(3)).toMatchObject({
      reviewStatus: "failed",
      replacement: {
        eligible: false,
        questionId: replacementId,
        finding: { verdict: "unable_to_verify" },
      },
    });
    expect(context.getRun().errors).toEqual([
      expect.objectContaining({ code: "usage_uncertain" }),
    ]);
  });

  it("collects replacement evidence before persisting a failed placeholder immediately before verification", async () => {
    const flaggedItem = {
      ...makeStoredItem(3, "completed"),
      finding: makeFinding(questions[2], "risk"),
    } as DailyQuestionReviewItemRecord;
    const existingItems = [1, 2, 4, 5].map((slot) => makeStoredItem(slot, "completed"));
    existingItems.push(flaggedItem);
    const context = createDependencies({
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: { claimed: true, claimToken: uuid(601), run: makeRun() },
    });

    await runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    });

    expect(context.dependencies.saveItem).toHaveBeenCalledTimes(2);
    expect(context.dependencies.saveItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        slot: 3,
        reviewStatus: "failed",
        finding: flaggedItem.finding,
        replacement: null,
        replacementAttempted: true,
        usageEvent: null,
        runErrors: [expect.objectContaining({
          code: "billable_result_persistence_pending",
          questionId: replacementId,
        })],
      }),
    );
    expect(vi.mocked(context.dependencies.collectEvidence).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(context.dependencies.saveItem).mock.invocationCallOrder[0]);
    expect(vi.mocked(context.dependencies.saveItem).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(context.dependencies.verifyQuestion).mock.invocationCallOrder[0]);
    expect(context.getRun().errors).toEqual([]);
  });

  it("persists replacement source collection failure as non-billable terminal progress", async () => {
    const flaggedItem = {
      ...makeStoredItem(3, "completed"),
      finding: makeFinding(questions[2], "risk"),
    } as DailyQuestionReviewItemRecord;
    const existingItems = [1, 2, 4, 5].map((slot) => makeStoredItem(slot, "completed"));
    existingItems.push(flaggedItem);
    const context = createDependencies({
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: { claimed: true, claimToken: uuid(601), run: makeRun() },
    });
    enableResumableInvocations(context, true);
    context.dependencies.collectEvidence = vi.fn(async () => {
      throw new Error("replacement source unavailable");
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({
      kind: "completed",
      run: { status: "completed_with_flags" },
    });

    expect(context.dependencies.verifyQuestion).not.toHaveBeenCalled();
    expect(context.dependencies.saveItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "failed" }),
    );
    expect(context.items.get(3)).toMatchObject({
      reviewStatus: "completed",
      replacementAttempted: true,
      replacement: { eligible: false, questionId: replacementId },
    });
  });

  it("does not repeat billed replacement work after its final progress save fails", async () => {
    const flaggedItem = {
      ...makeStoredItem(3, "completed"),
      finding: makeFinding(questions[2], "risk"),
    } as DailyQuestionReviewItemRecord;
    const existingItems = [1, 2, 4, 5].map((slot) => makeStoredItem(slot, "completed"));
    existingItems.push(flaggedItem);
    const context = createDependencies({
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: { claimed: true, claimToken: uuid(601), run: makeRun() },
    });
    enableResumableInvocations(context, true);
    const persist = context.dependencies.saveItem;
    context.dependencies.saveItem = vi.fn(async (input) => {
      if (input.reviewStatus === "completed" && input.replacement !== null) {
        throw new Error("replacement progress write failed after API success");
      }
      return persist(input);
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "completed", run: { status: "failed" } });

    expect(context.dependencies.verifyQuestion).toHaveBeenCalledOnce();
    expect(context.items.get(3)).toMatchObject({
      reviewStatus: "failed",
      finding: { verdict: "risk" },
      replacement: null,
    });
    expect(context.getRun().errors).toEqual([
      expect.objectContaining({
        code: "billable_result_persistence_pending",
        questionId: replacementId,
      }),
    ]);
  });

  it("persists unavailable replacement selection as a non-billable terminal state", async () => {
    const flaggedItem = {
      ...makeStoredItem(3, "completed"),
      finding: makeFinding(questions[2], "risk"),
    } as DailyQuestionReviewItemRecord;
    const existingItems = [1, 2, 4, 5].map((slot) => makeStoredItem(slot, "completed"));
    existingItems.push(flaggedItem);
    const context = createDependencies({
      existingRun: makeRun(),
      existingItems,
      reservationCreated: false,
      claimExistingResult: { claimed: true, claimToken: uuid(601), run: makeRun() },
    });
    enableResumableInvocations(context, true);
    context.dependencies.selectReplacement = vi.fn(async () => null);

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });
    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({
      kind: "completed",
      run: { status: "completed_with_flags" },
    });

    expect(context.dependencies.selectReplacement).toHaveBeenCalledOnce();
    expect(context.dependencies.verifyQuestion).not.toHaveBeenCalled();
    expect(context.items.get(3)).toMatchObject({
      reviewStatus: "completed",
      finding: { verdict: "risk" },
      replacement: null,
      replacementAttempted: true,
    });
    expect(context.getRun().errors).toEqual([
      expect.objectContaining({ code: "replacement_unavailable" }),
    ]);
  });

  it("does no external work when fewer than 125 seconds remain", async () => {
    const context = createDependencies();

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      unitLimit: 1,
      deadline: new Date(now.getTime() + DAILY_QUESTION_REVIEW_MIN_UNIT_REMAINING_MS - 1),
      dependencies: context.dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });

    expect(context.dependencies.collectEvidence).not.toHaveBeenCalled();
    expect(context.dependencies.verifyQuestion).not.toHaveBeenCalled();
    expect(context.dependencies.saveItem).not.toHaveBeenCalled();
    expect(context.dependencies.completeRun).not.toHaveBeenCalled();
    expect(context.dependencies.reconcileReservation).not.toHaveBeenCalled();
  });

  it("gates budget, verifies one unit at a time, verifies only flagged replacements, and emails once", async () => {
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
    const context = createDependencies({ verifier });
    const { dependencies, items, getRun } = context;
    const result = await runUntilTerminal(context);

    expect(result).toMatchObject({ kind: "completed", run: { status: "completed_with_flags" } });
    expect(dependencies.listMonthlyCosts).toHaveBeenCalledBefore(
      dependencies.prepareDraft as ReturnType<typeof vi.fn>,
    );
    expect(dependencies.prepareDraft).toHaveBeenCalledTimes(7);
    expect(verifier).toHaveBeenCalledTimes(6);
    expect(maxActive).toBe(1);
    expect(dependencies.selectReplacement).toHaveBeenCalledTimes(1);
    expect(dependencies.selectReplacement).toHaveBeenCalledWith({
      draft,
      flaggedSlot: 3,
      selection: draft.questions,
      excludedQuestionIds: [],
    });
    expect(dependencies.saveItem).toHaveBeenCalledTimes(12);
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
    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
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
    const context = createDependencies({ verifier });
    const { dependencies, items } = context;
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

    await runUntilTerminal(context);

    expect(seenSelections).toHaveLength(2);
    expect(seenSelections[1]).toContain(easyReplacements[0].id);
    expect([items.get(1)?.replacement?.questionId, items.get(2)?.replacement?.questionId])
      .toEqual([easyReplacements[0].id, easyReplacements[1].id]);
    expect(new Set(Array.from(items.values()).map((item) =>
      item.replacement?.questionId ?? item.question.id,
    )).size).toBe(5);
  });

  it("keeps ineligible replacements out of later composition selection", async () => {
    const failedCandidate = makeQuestion(uuid(91), 0);
    const passedCandidate = makeQuestion(uuid(92), 1);
    const verifier = vi.fn(async ({ question }: { question: QuestionSnapshot }) => ({
      finding: makeFinding(
        question,
        question.id === questionIds[0] ||
          question.id === questionIds[1] ||
          question.id === failedCandidate.id
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
    const context = createDependencies({ verifier });
    const { dependencies, items } = context;
    const seenSelections: string[][] = [];
    dependencies.selectReplacement = vi.fn(async (
      input: Parameters<DailyQuestionReviewServiceDependencies["selectReplacement"]>[0],
    ) => {
      seenSelections.push(input.selection.map((question) => question.id));
      return input.flaggedSlot === 1 ? failedCandidate : passedCandidate;
    });

    await runUntilTerminal(context);

    expect(seenSelections).toHaveLength(2);
    expect(seenSelections[1]).toContain(questionIds[0]);
    expect(seenSelections[1]).not.toContain(failedCandidate.id);
    expect(items.get(1)?.replacement).toMatchObject({
      questionId: failedCandidate.id,
      eligible: false,
    });
    expect(items.get(2)?.replacement).toMatchObject({
      questionId: passedCandidate.id,
      eligible: true,
    });
  });

  it("uses the atomic budget denial claim to send one alert without a second insert", async () => {
    const { dependencies } = createDependencies();
    vi.mocked(dependencies.acquireReservation).mockResolvedValue({
      acquired: false,
      denialCreated: true,
    });

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
    expect(dependencies.recordBudgetBlock).not.toHaveBeenCalled();
    expect(dependencies.sendBudgetBlockEmail).toHaveBeenCalledOnce();
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

  it("retries a failed budget alert and does not duplicate an accepted alert", async () => {
    const { dependencies } = createDependencies();
    vi.mocked(dependencies.acquireReservation).mockResolvedValue({
      acquired: false,
      denialCreated: false,
    });
    vi.mocked(dependencies.claimBudgetBlockEmail)
      .mockResolvedValueOnce({
        claimed: true,
        reservationId: uuid(501),
        attempts: 2,
      })
      .mockResolvedValueOnce({
        claimed: false,
        reservationId: null,
        attempts: 2,
      });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });
    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.sendBudgetBlockEmail).toHaveBeenCalledOnce();
    expect(dependencies.sendBudgetBlockEmail).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: uuid(501) }),
    );
    expect(dependencies.markBudgetBlockEmailSent).toHaveBeenCalledOnce();
    expect(dependencies.recordBudgetBlock).not.toHaveBeenCalled();
  });

  it("persists budget alert delivery failure for a later retry", async () => {
    const { dependencies } = createDependencies();
    const sendBudgetBlockEmail = dependencies.sendBudgetBlockEmail;
    if (!sendBudgetBlockEmail) {
      throw new Error("Expected budget email sender dependency");
    }
    vi.mocked(dependencies.acquireReservation).mockResolvedValue({
      acquired: false,
      denialCreated: false,
    });
    vi.mocked(sendBudgetBlockEmail).mockRejectedValue(
      new Error("email unavailable"),
    );

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.markBudgetBlockEmailFailed).toHaveBeenCalledWith(
      uuid(501),
      expect.objectContaining({
        attempts: 1,
        code: "email_failed",
        message: "email unavailable",
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
    const context = createDependencies({ verifier });
    const { dependencies, items } = context;

    await runUntilTerminal(context);

    expect(verifier).toHaveBeenCalledTimes(10);
    expect(dependencies.selectReplacement).toHaveBeenCalledTimes(5);
    expect(Array.from(items.values()).every((item) => item.replacement !== null)).toBe(true);
    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
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
    const context = createDependencies({ verifier });
    const { dependencies, items, getRun } = context;

    await runUntilTerminal(context);

    expect(items.get(2)).toMatchObject({
      reviewStatus: "completed",
      finding: { verdict: "unable_to_verify" },
      replacement: { eligible: true },
    });
    expect(Array.from(items.values()).filter((item) => item.reviewStatus === "completed")).toHaveLength(5);
    expect(getRun()).toMatchObject({
      status: "completed_with_flags",
      usage: { inputTokens: 60, outputTokens: 30 },
      estimatedCostMicrodollars: 600,
    });
    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
    expect(dependencies.sendReviewEmail).toHaveBeenCalledOnce();
  });

  it("preserves completed findings and records email failure independently", async () => {
    const sendEmail = vi.fn(async () => {
      throw new Error("email unavailable");
    });
    const context = createDependencies({ sendEmail });
    const { dependencies, getRun } = context;

    await expect(
      runUntilTerminal(context),
    ).resolves.toMatchObject({ kind: "completed", run: { status: "completed" } });

    expect(getRun()).toMatchObject({ status: "completed" });
    expect(dependencies.markEmailFailed).toHaveBeenCalledWith(
      uuid(300),
      expect.objectContaining({ code: "email_failed", message: "email unavailable" }),
    );
  });

  it("leaves email pending when Task 8 has not injected a sender", async () => {
    const context = createDependencies();
    const { dependencies } = context;
    dependencies.sendReviewEmail = null;

    await runUntilTerminal(context);

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
      runCostBaselineMicrodollars: 0,
    }));

    const [first, second] = await Promise.all([
      runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies }),
      runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies }),
    ]);

    expect([first.kind, second.kind].sort()).toEqual(["in_progress", "observed"]);
    expect([first, second].find((result) => result.kind === "observed"))
      .toMatchObject({ run: { id: uuid(300) } });
    expect(dependencies.prepareDraft).toHaveBeenCalledOnce();
    expect(dependencies.verifyQuestion).toHaveBeenCalledOnce();
    expect(dependencies.sendReviewEmail).not.toHaveBeenCalled();
    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
  });

  it("does not release a creator reservation when a reuser wins the run start race", async () => {
    const winner = makeRun();
    const { dependencies } = createDependencies();
    vi.mocked(dependencies.startOrObserve).mockResolvedValue({
      created: false,
      claimed: false,
      claimToken: null,
      run: winner,
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    })).resolves.toMatchObject({ kind: "observed", run: { id: winner.id } });

    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
  });

  it("reuses an existing active reservation when no run was created", async () => {
    const { dependencies } = createDependencies({
      reservationCreated: false,
      claimExistingResult: { claimed: false, claimToken: null, run: null },
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    })).resolves.toMatchObject({ kind: "in_progress" });

    expect(dependencies.prepareDraft).toHaveBeenCalledOnce();
    expect(dependencies.startOrObserve).toHaveBeenCalledOnce();
    expect(dependencies.verifyQuestion).toHaveBeenCalledOnce();
  });

  it("observes a completed run and retries its unsent email without reserving budget", async () => {
    const completedRun = makeRun({
      status: "completed",
      completedAt: now.toISOString(),
      email: {
        ...makeRun().email,
        status: "failed",
        metadata: {
          ...makeRun().email.metadata,
          attempts: 1,
          lastAttemptAt: "2026-08-09T22:00:00.000Z",
          failure: {
            code: "email_failed",
            message: "interrupted",
            occurredAt: "2026-08-09T22:00:00.000Z",
          },
        },
      },
    });
    const completedItems = [1, 2, 3, 4, 5].map((slot) =>
      makeStoredItem(slot, "completed"),
    );
    const { dependencies } = createDependencies();
    const loadExisting = vi.fn(async () => ({ run: completedRun, items: completedItems }));
    Object.assign(dependencies, { loadExisting });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    })).resolves.toMatchObject({ kind: "observed", run: { status: "completed" } });

    expect(loadExisting).toHaveBeenCalledWith("2026-08-10");
    expect(dependencies.acquireReservation).not.toHaveBeenCalled();
    expect(dependencies.claimEmail).toHaveBeenCalledWith(completedRun.id, now.toISOString());
    expect(dependencies.sendReviewEmail).toHaveBeenCalledOnce();
  });

  it("recovers the oldest prior terminal email before current-date work", async () => {
    const priorRun = makeRun({
      reviewDate: "2026-08-08",
      challengeDate: "2026-08-09",
      status: "completed_with_flags",
      completedAt: "2026-08-08T23:20:00.000Z",
      email: { ...makeRun().email, status: "failed" },
    });
    const priorItems = [1, 2, 3, 4, 5].map((slot) =>
      makeStoredItem(slot, "completed"),
    );
    const { dependencies } = createDependencies();
    vi.mocked(dependencies.loadOldestRecoverable).mockResolvedValue({
      run: priorRun,
      items: priorItems,
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    })).resolves.toMatchObject({
      kind: "observed",
      run: { challengeDate: "2026-08-09" },
    });

    expect(dependencies.loadExisting).not.toHaveBeenCalled();
    expect(dependencies.acquireReservation).not.toHaveBeenCalled();
    expect(dependencies.sendReviewEmail).toHaveBeenCalledOnce();
  });

  it("recovers one oldest prior budget alert before run recovery or current-date work", async () => {
    const { dependencies } = createDependencies();
    vi.mocked(dependencies.claimOldestBudgetBlockEmail).mockResolvedValue({
      claimed: true,
      reservationId: uuid(502),
      challengeDate: "2026-08-08",
      reason: "monthly_budget_exceeded",
      reservedMicrodollars: 5_040_000,
      remainingMicrodollars: 2_000_000,
      attempts: 3,
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    })).resolves.toMatchObject({ kind: "observed", run: null });

    expect(dependencies.sendBudgetBlockEmail).toHaveBeenCalledOnce();
    expect(dependencies.sendBudgetBlockEmail).toHaveBeenCalledWith({
      notificationId: uuid(502),
      challengeDate: "2026-08-08",
      reason: "monthly_budget_exceeded",
      reservedMicrodollars: 5_040_000,
      remainingMicrodollars: 2_000_000,
    });
    expect(dependencies.markBudgetBlockEmailSent).toHaveBeenCalledWith(
      uuid(502),
      expect.objectContaining({ attempts: 3 }),
    );
    expect(dependencies.loadOldestRecoverable).not.toHaveBeenCalled();
    expect(dependencies.loadExisting).not.toHaveBeenCalled();
    expect(dependencies.acquireReservation).not.toHaveBeenCalled();
    expect(dependencies.verifyQuestion).not.toHaveBeenCalled();
  });

  it("processes one unit from the oldest prior unfinished run before current-date work", async () => {
    const priorRun = makeRun({
      reviewDate: "2026-08-08",
      challengeDate: "2026-08-09",
    });
    const context = createDependencies({
      existingRun: priorRun,
      claimExistingResult: {
        claimed: true,
        claimToken: uuid(601),
        run: priorRun,
      },
    });
    vi.mocked(context.dependencies.loadOldestRecoverable).mockResolvedValue({
      run: priorRun,
      items: [],
    });
    vi.mocked(context.dependencies.loadActiveReservation).mockResolvedValue({
      reservationId: uuid(500),
      acquiredNow: false,
      model: "gpt-5.6-terra",
      modelDerivedReservationMicrodollars:
        DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
      requiredReservationMicrodollars:
        DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
      reservedMicrodollars: DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
      runCostBaselineMicrodollars: 0,
      monthRange: {
        startInclusive: "2026-08-01T05:00:00.000Z",
        endExclusive: "2026-09-01T05:00:00.000Z",
      },
    });
    vi.mocked(context.dependencies.prepareDraft).mockResolvedValue({
      ...draft,
      challengeDate: "2026-08-09",
    });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies: context.dependencies,
    })).resolves.toMatchObject({
      kind: "in_progress",
      run: { challengeDate: "2026-08-09" },
    });

    expect(context.dependencies.acquireReservation).not.toHaveBeenCalled();
    expect(context.dependencies.prepareDraft).toHaveBeenCalledWith("2026-08-09");
    expect(context.dependencies.verifyQuestion).toHaveBeenCalledOnce();
  });

  it("observes a failed terminal run and retries stale-sending mail without reserving budget", async () => {
    const failedRun = makeRun({
      status: "failed",
      completedAt: now.toISOString(),
      email: {
        ...makeRun().email,
        status: "sending",
        metadata: {
          ...makeRun().email.metadata,
          attempts: 1,
          lastAttemptAt: "2026-08-09T22:00:00.000Z",
        },
      },
    });
    const failedItems = [1, 2, 3, 4, 5].map((slot) => makeStoredItem(slot, "completed"));
    const { dependencies } = createDependencies({
      existingRun: failedRun,
      existingItems: failedItems,
      claimExistingResult: { claimed: true, claimToken: uuid(601), run: failedRun },
    });
    const loadExisting = vi.fn(async () => ({ run: failedRun, items: failedItems }));
    Object.assign(dependencies, { loadExisting });

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    })).resolves.toMatchObject({ kind: "observed", run: { status: "failed" } });

    expect(dependencies.sendReviewEmail).toHaveBeenCalled();
    expect(dependencies.claimEmail).toHaveBeenCalledWith(failedRun.id, now.toISOString());
    expect(dependencies.acquireReservation).not.toHaveBeenCalled();
  });

  it("does not claim report email delivery for an in-progress run", async () => {
    const runningRun = makeRun();
    const { dependencies } = createDependencies({
      reservationCreated: false,
      existingRun: runningRun,
      claimExistingResult: { claimed: false, claimToken: null, run: runningRun },
    });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.claimEmail).not.toHaveBeenCalled();
    expect(dependencies.sendReviewEmail).not.toHaveBeenCalled();
  });

  it("atomically reclaims a stale running run, skips failed slots, and resumes pending slots", async () => {
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
    const context = createDependencies({
      reservationCreated: false,
      existingRun: staleRun,
      existingItems,
      claimExistingResult: {
        claimed: true,
        claimToken: uuid(601),
        run: staleRun,
      },
    });
    const { dependencies, getRun } = context;

    await runUntilTerminal(context, true);

    expect(dependencies.claimExisting).toHaveBeenCalledTimes(3);
    expect(dependencies.startOrObserve).not.toHaveBeenCalled();
    expect(dependencies.verifyQuestion).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dependencies.verifyQuestion).mock.calls.map(([input]) => input.question.id))
      .toEqual(questionIds.slice(3));
    expect(dependencies.heartbeatRun).toHaveBeenCalled();
    expect(getRun()).toMatchObject({ status: "failed" });
  });

  it("does not reconcile when token-fenced finalization reports lost ownership", async () => {
    const completedItems = [1, 2, 3, 4, 5].map((slot) =>
      makeStoredItem(slot, "completed"),
    );
    const runningRun = makeRun();
    const { dependencies } = createDependencies({
      reservationCreated: false,
      existingRun: runningRun,
      existingItems: completedItems,
      claimExistingResult: {
        claimed: true,
        claimToken: uuid(601),
        run: runningRun,
      },
    });
    vi.mocked(dependencies.completeRun).mockRejectedValue(
      new Error("Daily review lease ownership was lost."),
    );

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    })).rejects.toThrow("Daily review lease ownership was lost");

    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
    expect(dependencies.sendReviewEmail).not.toHaveBeenCalled();
    expect(dependencies.verifyQuestion).not.toHaveBeenCalled();
    expect(dependencies.completeRun).toHaveBeenCalledOnce();
  });

  it("resumes a running partial run, skips completed and failed slots, and processes pending slots once", async () => {
    const existingRun = makeRun({
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
    const context = createDependencies({ existingRun, existingItems });
    const { dependencies, getRun } = context;

    await runUntilTerminal(context, true);

    expect(dependencies.verifyQuestion).toHaveBeenCalledTimes(2);
    expect(dependencies.saveItem).toHaveBeenCalledTimes(4);
    expect(vi.mocked(dependencies.verifyQuestion).mock.calls.map(([input]) => input.question.id))
      .toEqual(questionIds.slice(3));
    expect(getRun()).toMatchObject({
      status: "failed",
      usage: { inputTokens: 40, outputTokens: 20 },
      estimatedCostMicrodollars: 400,
    });
    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
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
      existingRun: makeRun(),
      existingItems,
    });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.verifyQuestion).toHaveBeenCalledOnce();
    expect(dependencies.selectReplacement).toHaveBeenCalledWith({
      draft,
      flaggedSlot: 3,
      selection: draft.questions,
      excludedQuestionIds: [],
    });
    expect(dependencies.saveItem).toHaveBeenCalledTimes(2);
    expect(items.get(3)).toMatchObject({
      finding: { verdict: "risk" },
      replacement: { eligible: true, questionId: replacementId },
    });
  });

  it("uses current-reservation spend when guarding replacement verification", async () => {
    const historicalCost = 5_000_000;
    const flaggedItem = {
      ...makeStoredItem(3, "completed"),
      finding: makeFinding(questions[2], "risk"),
    } as DailyQuestionReviewItemRecord;
    const existingItems = [1, 2, 4, 5].map((slot) =>
      makeStoredItem(slot, "completed"),
    );
    existingItems.push(flaggedItem);
    const { dependencies } = createDependencies({
      existingRun: makeRun({
        estimatedCostMicrodollars: historicalCost,
      }),
      existingItems,
      reservationRunCostBaselineMicrodollars: historicalCost,
    });

    await runNightlyQuestionReview({ challengeDate: "2026-08-10", now, dependencies });

    expect(dependencies.verifyQuestion).toHaveBeenCalledOnce();
    expect(dependencies.saveItem).toHaveBeenCalledTimes(2);
  });

  it("resumes after a pre-finalization crash without losing or double-counting persisted usage", async () => {
    const { dependencies } = createDependencies();
    let persistedRun = makeRun();
    const persistedItems = new Map<number, DailyQuestionReviewItemRecord>();
    const usageEvents = new Set<string>();
    let acquisition = 0;
    vi.mocked(dependencies.acquireReservation).mockImplementation(async () => ({
      acquired: true,
      created: acquisition++ === 0,
      reservationId: uuid(500),
      reservedMicrodollars: DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
      runCostBaselineMicrodollars: 0,
    }));
    vi.mocked(dependencies.claimExisting).mockImplementation(async () => ({
      claimed: true,
      claimToken: uuid(601),
      run: persistedRun,
    }));
    vi.mocked(dependencies.loadReview).mockImplementation(async () => ({
      run: persistedRun,
      items: Array.from(persistedItems.values()),
    }));
    dependencies.saveItem = vi.fn(async (input) => {
      const stored = {
        ...makeStoredItem(input.slot, input.reviewStatus),
        question: input.question,
        sourceFetchResults: input.sourceFetchResults,
        finding: input.finding,
        replacement: input.replacement,
      } as DailyQuestionReviewItemRecord;
      persistedItems.set(input.slot, stored);
      const event = "usageEvent" in input
        ? (input as typeof input & {
            usageEvent: null | {
              id: string;
              inputTokens: number;
              cachedInputTokens: number;
              cacheWriteTokens: number;
              outputTokens: number;
              webSearchCalls: number;
              estimatedCostMicrodollars: number;
            };
          }).usageEvent
        : null;
      const usageApplied = Boolean(event && !usageEvents.has(event.id));
      if (event && usageApplied) {
        usageEvents.add(event.id);
        persistedRun = makeRun({
          ...persistedRun,
          usage: {
            model: persistedRun.usage.model,
            inputTokens: (persistedRun.usage.inputTokens ?? 0) + event.inputTokens,
            cachedInputTokens: (persistedRun.usage.cachedInputTokens ?? 0) + event.cachedInputTokens,
            cacheWriteTokens: (persistedRun.usage.cacheWriteTokens ?? 0) + event.cacheWriteTokens,
            outputTokens: (persistedRun.usage.outputTokens ?? 0) + event.outputTokens,
            webSearchCalls: persistedRun.usage.webSearchCalls + event.webSearchCalls,
          },
          estimatedCostMicrodollars:
            persistedRun.estimatedCostMicrodollars + event.estimatedCostMicrodollars,
        });
      }
      return { item: stored, run: persistedRun, usageApplied } as never;
    });
    vi.mocked(dependencies.completeRun)
      .mockRejectedValueOnce(new Error("crash before finalization"))
      .mockImplementationOnce(async (input) => {
        persistedRun = makeRun({
          ...persistedRun,
          status: input.status,
          completedAt: input.completedAt,
        });
        return persistedRun;
      });

    for (let invocation = 0; invocation < 5; invocation += 1) {
      await expect(runNightlyQuestionReview({
        challengeDate: "2026-08-10",
        now,
        dependencies,
      })).resolves.toMatchObject({ kind: "in_progress" });
    }
    expect(dependencies.verifyQuestion).toHaveBeenCalledTimes(5);

    await expect(runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    })).rejects.toThrow("crash before finalization");
    expect(dependencies.verifyQuestion).toHaveBeenCalledTimes(5);
    expect(usageEvents.size).toBe(5);

    const resumed = await runNightlyQuestionReview({
      challengeDate: "2026-08-10",
      now,
      dependencies,
    });

    expect(dependencies.verifyQuestion).toHaveBeenCalledTimes(5);
    expect(resumed).toMatchObject({
      kind: "completed",
      run: {
        usage: { inputTokens: 50, outputTokens: 25 },
        estimatedCostMicrodollars: 500,
      },
    });
    expect(usageEvents.size).toBe(5);
    expect(dependencies.reconcileReservation).not.toHaveBeenCalled();
  });
});
