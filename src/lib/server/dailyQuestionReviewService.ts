import "server-only";

import { randomUUID } from "node:crypto";

import type {
  DailyQuestionReplacementCandidate,
  DailyQuestionReviewRunError,
  DailyQuestionSourceFetchResult,
  QuestionSnapshot,
} from "@/lib/dailyQuestionReview";
import {
  prepareDailyChallengeDraftForDate,
  selectDailyChallengeReplacementForDraft,
  type PreparedDailyChallengeDraft,
} from "@/lib/server/dailyChallengeRepository";
import {
  DAILY_REVIEW_PRICING,
  DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION,
  DAILY_REVIEW_MAX_REQUEST_RESERVATION_MICRODOLLARS,
  checkDailyQuestionReviewBudget,
  estimateDailyQuestionReviewCostMicrodollars,
  getChicagoCalendarMonthRange,
  runWithDailyQuestionReviewBudgetPreflight,
  type ChicagoCalendarMonthRange,
  type DailyQuestionReviewBudgetResult,
  type DailyQuestionReviewReservationRequest,
  type PersistedDailyQuestionReviewCost,
} from "@/lib/server/dailyQuestionReviewBudget";
import {
  acquireDailyQuestionReviewReservation,
  claimExistingDailyQuestionReviewRun,
  claimDailyQuestionReviewEmail,
  completeDailyQuestionReviewRun,
  listCurrentMonthDailyQuestionReviewCosts,
  loadDailyQuestionReviewByDate,
  loadDailyQuestionReviewByRunId,
  heartbeatDailyQuestionReviewRun,
  markDailyQuestionReviewEmailFailed,
  markDailyQuestionReviewEmailSent,
  reconcileDailyQuestionReviewReservation,
  recordDailyQuestionReviewBudgetBlock,
  startOrObserveDailyQuestionReviewRun,
  upsertDailyQuestionReviewItem,
  type DailyQuestionReviewItemRecord,
  type DailyQuestionReviewRunRecord,
} from "@/lib/server/dailyQuestionReviewRepository";
import {
  collectSavedSourceEvidence,
  type SourceEvidenceResult,
} from "@/lib/server/dailyQuestionSourceFetcher";
import {
  OpenAiQuestionVerifierError,
  verifyQuestionWithOpenAi,
  type OpenAiQuestionVerifierInput,
  type OpenAiQuestionVerifierResult,
} from "@/lib/server/openAiQuestionVerifier";
import {
  sendDailyQuestionReviewBudgetBlockNotification,
  sendDailyQuestionReviewNotification,
} from "@/lib/server/dailyQuestionReviewNotifications";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_REVIEW_CONCURRENCY = 2;
const REVIEW_RUN_LEASE_MS = 15 * 60 * 1000;
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_VERIFIER_VERSION = DAILY_REVIEW_PRICING.verifierVersion;
const MAX_VERIFICATION_RESERVATION_MICRODOLLARS =
  DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION *
  DAILY_REVIEW_MAX_REQUEST_RESERVATION_MICRODOLLARS;

type ItemSaveInput = Parameters<typeof upsertDailyQuestionReviewItem>[1];
type CompleteRunInput = Parameters<typeof completeDailyQuestionReviewRun>[1];

export interface DailyQuestionReviewEvidenceCollection {
  savedEvidence: SourceEvidenceResult[];
  sourceFetchResults: DailyQuestionSourceFetchResult[];
}

export interface DailyQuestionReviewServiceDependencies {
  model: string;
  verifierVersion: string;
  listMonthlyCosts: (
    range: ChicagoCalendarMonthRange,
  ) => Promise<PersistedDailyQuestionReviewCost[]>;
  acquireReservation: (
    request: DailyQuestionReviewReservationRequest,
  ) => Promise<unknown>;
  reconcileReservation: (input: {
    reservationId: string;
    actualMicrodollars: number;
    reconciledAt: string;
  }) => Promise<unknown>;
  recordBudgetBlock: (input: {
    reviewDate: string;
    challengeDate: string;
    model: string;
    reservedMicrodollars: number;
    monthRange: ChicagoCalendarMonthRange;
    attemptedAt: string;
    reason: string;
  }) => Promise<{ created: boolean }>;
  prepareDraft: (challengeDate: string) => Promise<PreparedDailyChallengeDraft>;
  startOrObserve: (
    input: Parameters<typeof startOrObserveDailyQuestionReviewRun>[1],
  ) => ReturnType<typeof startOrObserveDailyQuestionReviewRun>;
  claimExisting: (input: {
    reviewDate: string;
    challengeDate: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }) => ReturnType<typeof claimExistingDailyQuestionReviewRun>;
  heartbeatRun: (input: {
    runId: string;
    claimToken: string;
    heartbeatAt: string;
    leaseExpiresAt: string;
  }) => Promise<boolean>;
  currentTime: () => Date;
  loadReview: (runId: string) => Promise<{
    run: DailyQuestionReviewRunRecord;
    items: DailyQuestionReviewItemRecord[];
  } | null>;
  loadExisting: (challengeDate: string) => Promise<{
    run: DailyQuestionReviewRunRecord;
    items: DailyQuestionReviewItemRecord[];
  } | null>;
  saveItem: (input: ItemSaveInput) => ReturnType<typeof upsertDailyQuestionReviewItem>;
  completeRun: (input: CompleteRunInput) => Promise<DailyQuestionReviewRunRecord>;
  collectEvidence: (
    question: QuestionSnapshot,
  ) => Promise<DailyQuestionReviewEvidenceCollection>;
  verifyQuestion: (
    input: OpenAiQuestionVerifierInput,
  ) => Promise<OpenAiQuestionVerifierResult>;
  selectReplacement: (input: {
    draft: PreparedDailyChallengeDraft;
    flaggedSlot: number;
    selection: PreparedDailyChallengeDraft["questions"];
    excludedQuestionIds: readonly string[];
  }) => Promise<QuestionSnapshot | null>;
  claimEmail: (
    runId: string,
    attemptedAt: string,
  ) => Promise<{ claimed: boolean; attempts: number }>;
  sendReviewEmail:
    | ((input: {
        run: DailyQuestionReviewRunRecord;
        items: DailyQuestionReviewItemRecord[];
      }) => Promise<{ providerMessageId: string }>)
    | null;
  sendBudgetBlockEmail:
    | ((input: {
        challengeDate: string;
        reason: string;
        reservedMicrodollars: number;
        remainingMicrodollars: number;
      }) => Promise<void>)
    | null;
  markEmailSent: (
    runId: string,
    input: { sentAt: string; providerMessageId: string; attempts: number },
  ) => Promise<unknown>;
  markEmailFailed: (
    runId: string,
    input: {
      attemptedAt: string;
      attempts: number;
      code: string;
      message: string;
    },
  ) => Promise<unknown>;
}

export type NightlyQuestionReviewResult =
  | { kind: "budget_blocked"; budget: DailyQuestionReviewBudgetResult }
  | {
      kind: "observed";
      budget: DailyQuestionReviewBudgetResult;
      run: DailyQuestionReviewRunRecord | null;
    }
  | {
      kind: "completed";
      budget: DailyQuestionReviewBudgetResult;
      run: DailyQuestionReviewRunRecord;
    };

type UsageTotals = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  webSearchCalls: number;
};

function emptyUsage(): UsageTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    webSearchCalls: 0,
  };
}

function resultUsage(result: OpenAiQuestionVerifierResult): UsageTotals {
  return {
    ...result.usage,
    webSearchCalls: result.webSearchCalls,
  };
}

function errorUsage(error: unknown): UsageTotals {
  if (!(error instanceof OpenAiQuestionVerifierError)) return emptyUsage();
  return {
    ...error.accounting.usage,
    webSearchCalls: error.accounting.webSearchCalls,
  };
}

function costUsage(model: string, usage: UsageTotals): number {
  return estimateDailyQuestionReviewCostMicrodollars({
    model,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    outputTokens: usage.outputTokens,
    webSearchCalls: usage.webSearchCalls,
  });
}

function makeUsageEvent(
  phase: "primary" | "replacement",
  model: string,
  usage: UsageTotals,
): NonNullable<ItemSaveInput["usageEvent"]> {
  return {
    id: randomUUID(),
    phase,
    ...usage,
    estimatedCostMicrodollars: costUsage(model, usage),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.slice(0, 1_000)
    : "Unknown nightly review failure";
}

function makeRunError(
  phase: DailyQuestionReviewRunError["phase"],
  code: string,
  error: unknown,
  occurredAt: string,
  questionId: string | null,
): DailyQuestionReviewRunError {
  return {
    phase,
    code: code.slice(0, 100),
    message: errorMessage(error),
    retryable:
      error instanceof OpenAiQuestionVerifierError ? error.retryable : false,
    occurredAt,
    questionId,
  };
}

const CHICAGO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getReviewDate(now: Date): string {
  const parts = CHICAGO_DATE_FORMATTER.formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function validateInput(challengeDate: string, now: Date): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(challengeDate)) {
    throw new RangeError("Invalid challenge date.");
  }
  const parsed = new Date(`${challengeDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== challengeDate ||
    !(now instanceof Date) ||
    Number.isNaN(now.getTime())
  ) {
    throw new RangeError("Invalid nightly review input.");
  }
}

function getLeaseWindow(at: Date): { heartbeatAt: string; leaseExpiresAt: string } {
  const heartbeatAt = at.toISOString();
  return {
    heartbeatAt,
    leaseExpiresAt: new Date(at.getTime() + REVIEW_RUN_LEASE_MS).toISOString(),
  };
}

function mapSourceResults(
  results: SourceEvidenceResult[],
  attemptedAt: string,
): DailyQuestionSourceFetchResult[] {
  return results.map((result) => {
    if (result.status === "fetched") {
      return {
        sourceUrl: result.requestedUrl,
        finalUrl: result.finalUrl,
        status: "fetched" as const,
        httpStatus: 200,
        contentType: result.contentType,
        attemptedAt,
        error: null,
      };
    }
    const blocked = result.status === "rejected";
    const detail =
      "reason" in result
        ? result.reason
        : "error" in result
          ? result.error
          : result.status;
    return {
      sourceUrl: result.requestedUrl,
      finalUrl: result.finalUrl || null,
      status: blocked ? ("blocked" as const) : ("failed" as const),
      httpStatus: "httpStatus" in result ? result.httpStatus : null,
      contentType: "contentType" in result ? result.contentType : null,
      attemptedAt,
      error: { code: result.status, message: String(detail).slice(0, 1_000) },
    };
  });
}

function createDefaultDependencies(context: {
  reviewDate: string;
  challengeDate: string;
  now: string;
  siteUrlFallback?: string;
}): DailyQuestionReviewServiceDependencies {
  const client = supabaseAdmin();
  return {
    model: process.env.DAILY_REVIEW_OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    verifierVersion: DEFAULT_VERIFIER_VERSION,
    listMonthlyCosts: (range) =>
      listCurrentMonthDailyQuestionReviewCosts(client, range),
    acquireReservation: (request) =>
      acquireDailyQuestionReviewReservation(client, request, context),
    reconcileReservation: (input) =>
      reconcileDailyQuestionReviewReservation(client, input),
    recordBudgetBlock: (input) =>
      recordDailyQuestionReviewBudgetBlock(client, input),
    prepareDraft: prepareDailyChallengeDraftForDate,
    startOrObserve: (input) =>
      startOrObserveDailyQuestionReviewRun(client, input),
    claimExisting: (input) =>
      claimExistingDailyQuestionReviewRun(client, input),
    heartbeatRun: (input) => heartbeatDailyQuestionReviewRun(client, input),
    currentTime: () => new Date(),
    loadReview: (runId) => loadDailyQuestionReviewByRunId(client, runId),
    loadExisting: (challengeDate) => loadDailyQuestionReviewByDate(client, challengeDate),
    saveItem: (input) => upsertDailyQuestionReviewItem(client, input),
    completeRun: (input) => completeDailyQuestionReviewRun(client, input),
    collectEvidence: async (question) => {
      const attemptedAt = new Date().toISOString();
      const savedEvidence = await collectSavedSourceEvidence(question.source_notes);
      return {
        savedEvidence,
        sourceFetchResults: mapSourceResults(savedEvidence, attemptedAt),
      };
    },
    verifyQuestion: verifyQuestionWithOpenAi,
    selectReplacement: selectDailyChallengeReplacementForDraft,
    claimEmail: (runId, attemptedAt) =>
      claimDailyQuestionReviewEmail(client, runId, attemptedAt),
    sendReviewEmail: async (input) => {
      const result = await sendDailyQuestionReviewNotification({
        ...input,
        siteUrlFallback: context.siteUrlFallback,
      });
      if (!result.sent) {
        throw new Error(
          result.reason === "not_configured"
            ? "Nightly review email is not configured."
            : "Nightly review email was already sent.",
        );
      }
      return { providerMessageId: result.providerMessageId };
    },
    sendBudgetBlockEmail: async (input) => {
      await sendDailyQuestionReviewBudgetBlockNotification({
        ...input,
        siteUrlFallback: context.siteUrlFallback,
      });
    },
    markEmailSent: (runId, input) =>
      markDailyQuestionReviewEmailSent(client, runId, input),
    markEmailFailed: (runId, input) =>
      markDailyQuestionReviewEmailFailed(client, runId, input),
  };
}

async function runWorkers<T>(
  values: readonly T[],
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const value = values[nextIndex];
      nextIndex += 1;
      await operation(value);
    }
  }
  const workerCount = Math.min(MAX_REVIEW_CONCURRENCY, values.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
}

async function attemptReviewEmail(
  deps: DailyQuestionReviewServiceDependencies,
  run: DailyQuestionReviewRunRecord,
  items: DailyQuestionReviewItemRecord[],
  attemptedAt: string,
): Promise<void> {
  if (!deps.sendReviewEmail || run.email.status === "sent") return;
  const emailClaim = await deps.claimEmail(run.id, attemptedAt);
  if (!emailClaim.claimed) return;
  try {
    const sent = await deps.sendReviewEmail({ run, items });
    await deps.markEmailSent(run.id, {
      sentAt: attemptedAt,
      providerMessageId: sent.providerMessageId,
      attempts: emailClaim.attempts,
    });
  } catch (error) {
    await deps.markEmailFailed(run.id, {
      attemptedAt,
      attempts: emailClaim.attempts,
      code: "email_failed",
      message: errorMessage(error),
    });
  }
}

export async function runNightlyQuestionReview({
  challengeDate,
  now,
  dependencies,
  siteUrlFallback,
}: {
  challengeDate: string;
  now: Date;
  dependencies?: DailyQuestionReviewServiceDependencies;
  siteUrlFallback?: string;
}): Promise<NightlyQuestionReviewResult> {
  validateInput(challengeDate, now);
  const occurredAt = now.toISOString();
  const reviewDate = getReviewDate(now);
  if (reviewDate >= challengeDate) {
    throw new RangeError("Nightly review date must precede the challenge date.");
  }
  const deps =
    dependencies ??
    createDefaultDependencies({
      reviewDate,
      challengeDate,
      now: occurredAt,
      siteUrlFallback,
    });
  const monthRange = getChicagoCalendarMonthRange(now);
  const records = await deps.listMonthlyCosts(monthRange);
  const existingReview = await deps.loadExisting(challengeDate);
  if (
    existingReview &&
    ["completed", "completed_with_flags", "failed"].includes(existingReview.run.status)
  ) {
    await attemptReviewEmail(
      deps,
      existingReview.run,
      existingReview.items,
      occurredAt,
    );
    if (
      existingReview.run.status === "completed" ||
      existingReview.run.status === "completed_with_flags"
    ) {
      return {
        kind: "observed",
        budget: checkDailyQuestionReviewBudget({
          model: deps.model,
          records,
          now,
        }),
        run: existingReview.run,
      };
    }
  }

  const preflight = await runWithDailyQuestionReviewBudgetPreflight({
    model: deps.model,
    records,
    now,
    acquireReservation: deps.acquireReservation,
    operation: async (reservation) => {
      let releaseUnboundReservation = reservation.acquiredNow;
      try {
        const initialLease = getLeaseWindow(now);
        let claimedRun: DailyQuestionReviewRunRecord;
        let claimToken: string;
        let draft: PreparedDailyChallengeDraft;
        if (!reservation.acquiredNow) {
          const existing = await deps.claimExisting({
            reviewDate,
            challengeDate,
            claimedAt: initialLease.heartbeatAt,
            leaseExpiresAt: initialLease.leaseExpiresAt,
          });
          if (!existing.run) {
            draft = await deps.prepareDraft(challengeDate);
            const started = await deps.startOrObserve({
              dailyChallengeId: draft.challengeId,
              reviewDate,
              challengeDate,
              model: deps.model,
              verifierVersion: deps.verifierVersion,
              startedAt: initialLease.heartbeatAt,
              leaseExpiresAt: initialLease.leaseExpiresAt,
            });
            if (!started.claimed || !started.claimToken) {
              return { kind: "observed" as const, run: started.run };
            }
            claimedRun = started.run;
            claimToken = started.claimToken;
            releaseUnboundReservation = false;
          } else if (!existing.claimed || !existing.claimToken) {
            return { kind: "observed" as const, run: existing.run };
          } else {
            claimedRun = existing.run;
            claimToken = existing.claimToken;
            releaseUnboundReservation = false;
            draft = await deps.prepareDraft(challengeDate);
          }
        } else {
          draft = await deps.prepareDraft(challengeDate);
          const started = await deps.startOrObserve({
            dailyChallengeId: draft.challengeId,
            reviewDate,
            challengeDate,
            model: deps.model,
            verifierVersion: deps.verifierVersion,
            startedAt: initialLease.heartbeatAt,
            leaseExpiresAt: initialLease.leaseExpiresAt,
          });
          if (!started.claimed || !started.claimToken) {
            return { kind: "observed" as const, run: started.run };
          }
          claimedRun = started.run;
          claimToken = started.claimToken;
          releaseUnboundReservation = false;
        }

        const assertLease = async () => {
          const lease = getLeaseWindow(deps.currentTime());
          const renewed = await deps.heartbeatRun({
            runId: claimedRun.id,
            claimToken,
            heartbeatAt: lease.heartbeatAt,
            leaseExpiresAt: lease.leaseExpiresAt,
          });
          if (!renewed) {
            throw new Error("Daily review run lease is no longer owned by this invocation.");
          }
        };

        const loaded = await deps.loadReview(claimedRun.id);
        if (!loaded) throw new Error("Claimed review run could not be loaded.");
        let persistedRun = loaded.run;
        const itemsBySlot = new Map(
          loaded.items.map((item) => [item.slot, item]),
        );
        const saveProgress = async (
          input: Omit<ItemSaveInput, "runId" | "claimToken" | "heartbeatAt" | "leaseExpiresAt">,
        ) => {
          const lease = getLeaseWindow(deps.currentTime());
          const saved = await deps.saveItem({
            ...input,
            runId: loaded.run.id,
            claimToken,
            heartbeatAt: lease.heartbeatAt,
            leaseExpiresAt: lease.leaseExpiresAt,
          });
          itemsBySlot.set(saved.item.slot, saved.item);
          if (
            saved.run.estimatedCostMicrodollars >=
            persistedRun.estimatedCostMicrodollars
          ) {
            persistedRun = saved.run;
          }
          return saved.item;
        };
        const runErrors = [...loaded.run.errors];
        const pendingQuestions = draft.questions.filter((question) => {
          return itemsBySlot.get(question.slot)?.reviewStatus !== "completed";
        });

        await runWorkers(pendingQuestions, async (question) => {
          await assertLease();
          let evidence: DailyQuestionReviewEvidenceCollection;
          try {
            evidence = await deps.collectEvidence(question);
          } catch (error) {
            runErrors.push(
              makeRunError(
                "source_fetch",
                "source_fetch_failed",
                error,
                occurredAt,
                question.id,
              ),
            );
            try {
              await saveProgress({
                dailyChallengeId: draft.challengeId,
                slot: question.slot,
                question,
                reviewStatus: "failed",
                sourceFetchResults: [],
                finding: null,
                replacement: null,
                usageEvent: null,
              });
            } catch (persistError) {
              runErrors.push(
                makeRunError(
                  "preparing",
                  "database_item_persist_failed",
                  persistError,
                  occurredAt,
                  question.id,
                ),
              );
            }
            return;
          }

          let verification: OpenAiQuestionVerifierResult;
          try {
            verification = await deps.verifyQuestion({
              question,
              savedEvidence: evidence.savedEvidence,
            });
          } catch (error) {
            const chargedUsage = errorUsage(error);
            runErrors.push(
              makeRunError(
                "verification",
                error instanceof OpenAiQuestionVerifierError
                  ? error.code
                  : "verification_failed",
                error,
                occurredAt,
                question.id,
              ),
            );
            try {
              await saveProgress({
                dailyChallengeId: draft.challengeId,
                slot: question.slot,
                question,
                reviewStatus: "failed",
                sourceFetchResults: evidence.sourceFetchResults,
                finding: null,
                replacement: null,
                usageEvent: makeUsageEvent("primary", deps.model, chargedUsage),
              });
            } catch (persistError) {
              runErrors.push(
                makeRunError(
                  "preparing",
                  "database_item_persist_failed",
                  persistError,
                  occurredAt,
                  question.id,
                ),
              );
            }
            return;
          }

          try {
            await saveProgress({
              dailyChallengeId: draft.challengeId,
              slot: question.slot,
              question,
              reviewStatus: "completed",
              sourceFetchResults: evidence.sourceFetchResults,
              finding: verification.finding,
              replacement: null,
              usageEvent: makeUsageEvent(
                "primary",
                deps.model,
                resultUsage(verification),
              ),
            });
          } catch (error) {
            runErrors.push(
              makeRunError(
                "preparing",
                "database_item_persist_failed",
                error,
                occurredAt,
                question.id,
              ),
            );
          }
        });

        const flaggedQuestions = draft.questions.filter((question) => {
          const item = itemsBySlot.get(question.slot);
          return (
            item?.reviewStatus === "completed" &&
            item.finding?.verdict !== "passed" &&
            item.replacement === null
          );
        });
        let replacementSelection = draft.questions.map((question) => {
          const existingReplacement = itemsBySlot.get(question.slot)?.replacement;
          return existingReplacement?.eligible
            ? { ...existingReplacement.snapshot, slot: question.slot }
            : question;
        }) as PreparedDailyChallengeDraft["questions"];
        const attemptedReplacementIds = new Set(
          Array.from(itemsBySlot.values()).flatMap((item) =>
            item.replacement ? [item.replacement.questionId] : [],
          ),
        );
        for (const question of flaggedQuestions) {
          try {
            await assertLease();
            const candidate = await deps.selectReplacement({
              draft,
              flaggedSlot: question.slot,
              selection: replacementSelection,
              excludedQuestionIds: Array.from(attemptedReplacementIds),
            });
            if (!candidate) continue;

            if (
              persistedRun.estimatedCostMicrodollars +
                MAX_VERIFICATION_RESERVATION_MICRODOLLARS >
              reservation.reservedMicrodollars
            ) {
              runErrors.push({
                phase: "replacement",
                code: "replacement_reservation_unavailable",
                message: "The remaining run reservation cannot safely cover replacement verification.",
                retryable: false,
                occurredAt,
                questionId: question.id,
              });
              continue;
            }

            if (replacementSelection.some((selected) => selected.id === candidate.id)) {
              throw new Error("Replacement selector returned a duplicate question.");
            }
            if (attemptedReplacementIds.has(candidate.id)) {
              throw new Error("Replacement selector returned an attempted question.");
            }
            attemptedReplacementIds.add(candidate.id);

            const candidateEvidence = await deps.collectEvidence(candidate);
            let candidateVerification: OpenAiQuestionVerifierResult;
            try {
              candidateVerification = await deps.verifyQuestion({
                question: candidate,
                savedEvidence: candidateEvidence.savedEvidence,
              });
            } catch (error) {
              const primaryItem = itemsBySlot.get(question.slot);
              if (primaryItem?.finding) {
                await saveProgress({
                  dailyChallengeId: draft.challengeId,
                  slot: question.slot,
                  question: primaryItem.question,
                  reviewStatus: "completed",
                  sourceFetchResults: primaryItem.sourceFetchResults,
                  finding: primaryItem.finding,
                  replacement: null,
                  usageEvent: makeUsageEvent(
                    "replacement",
                    deps.model,
                    errorUsage(error),
                  ),
                });
              }
              throw error;
            }
            const replacementCandidate: DailyQuestionReplacementCandidate = {
              questionId: candidate.id,
              snapshot: candidate,
              finding: candidateVerification.finding,
              eligible:
                candidateVerification.finding.verdict === "passed" &&
                candidateVerification.finding.evidence.length > 0,
            };
            const primaryItem = itemsBySlot.get(question.slot);
            if (!primaryItem?.finding) {
              throw new Error("Persisted primary finding is unavailable.");
            }
            await saveProgress({
              dailyChallengeId: draft.challengeId,
              slot: question.slot,
              question: primaryItem.question,
              reviewStatus: "completed",
              sourceFetchResults: primaryItem.sourceFetchResults,
              finding: primaryItem.finding,
              replacement: replacementCandidate,
              usageEvent: makeUsageEvent(
                "replacement",
                deps.model,
                resultUsage(candidateVerification),
              ),
            });
            if (replacementCandidate.eligible) {
              replacementSelection = replacementSelection.map((selected) =>
                selected.slot === question.slot
                  ? { ...candidate, slot: question.slot }
                  : selected,
              ) as PreparedDailyChallengeDraft["questions"];
            }
          } catch (error) {
            runErrors.push(
              makeRunError(
                "replacement",
                error instanceof OpenAiQuestionVerifierError
                  ? error.code
                  : "replacement_failed",
                error,
                occurredAt,
                question.id,
              ),
            );
          }
        }

        const finalItems = Array.from(itemsBySlot.values()).sort(
          (left, right) => left.slot - right.slot,
        );
        const allCompleted =
          finalItems.length === 5 &&
          finalItems.every((item) => item.reviewStatus === "completed");
        const hasFlags = finalItems.some(
          (item) => item.finding?.verdict !== "passed",
        );
        const status = !allCompleted
          ? "failed"
          : hasFlags
            ? "completed_with_flags"
            : "completed";
        runErrors.sort((left, right) => {
          const questionOrder = (left.questionId ?? "").localeCompare(
            right.questionId ?? "",
          );
          return questionOrder || left.phase.localeCompare(right.phase);
        });
        await assertLease();
        const finalRun = await deps.completeRun({
          runId: loaded.run.id,
          claimToken,
          reservationId: reservation.reservationId,
          status,
          completedAt: occurredAt,
          errors: runErrors.slice(0, 20),
        });

        await attemptReviewEmail(deps, finalRun, finalItems, occurredAt);

        return { kind: "completed" as const, run: finalRun };
      } finally {
        if (releaseUnboundReservation) {
          await deps.reconcileReservation({
            reservationId: reservation.reservationId,
            actualMicrodollars: 0,
            reconciledAt: occurredAt,
          });
        }
      }
    },
  });

  if (!preflight.budget.allowed || preflight.value === null) {
    const atomicDenial = preflight.budget.reason === "atomic_reservation_denied";
    const created = atomicDenial
      ? preflight.budget.denialCreated === true
      : (await deps.recordBudgetBlock({
          reviewDate,
          challengeDate,
          model: deps.model,
          reservedMicrodollars: preflight.budget.reservedMicrodollars,
          monthRange,
          attemptedAt: occurredAt,
          reason: preflight.budget.reason,
        })).created;
    if (created && deps.sendBudgetBlockEmail) {
      await deps.sendBudgetBlockEmail({
        challengeDate,
        reason: preflight.budget.reason,
        reservedMicrodollars: preflight.budget.reservedMicrodollars,
        remainingMicrodollars: preflight.budget.remainingMicrodollars,
      });
    }
    return { kind: "budget_blocked", budget: preflight.budget };
  }
  return { ...preflight.value, budget: preflight.budget };
}
