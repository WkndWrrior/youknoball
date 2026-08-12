import "server-only";

import { randomUUID } from "node:crypto";

import type {
  DailyQuestionReplacementCandidate,
  DailyQuestionReviewRunError,
  DailyQuestionSourceFetchResult,
  DailyQuestionVerificationFinding,
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
  type DailyQuestionReviewReservationContext,
  type DailyQuestionReviewReservationRequest,
  type PersistedDailyQuestionReviewCost,
} from "@/lib/server/dailyQuestionReviewBudget";
import {
  acquireDailyQuestionReviewReservation,
  claimExistingDailyQuestionReviewRun,
  claimDailyQuestionReviewEmail,
  claimDailyQuestionReviewBudgetEmail,
  completeDailyQuestionReviewRun,
  listCurrentMonthDailyQuestionReviewCosts,
  loadActiveDailyQuestionReviewReservation,
  loadDailyQuestionReviewByDate,
  loadDailyQuestionReviewByRunId,
  loadOldestRecoverableDailyQuestionReview,
  heartbeatDailyQuestionReviewRun,
  markDailyQuestionReviewEmailFailed,
  markDailyQuestionReviewEmailSent,
  markDailyQuestionReviewBudgetEmailFailed,
  markDailyQuestionReviewBudgetEmailSent,
  reconcileDailyQuestionReviewReservation,
  recordDailyQuestionReviewBudgetBlock,
  startOrObserveDailyQuestionReviewRun,
  upsertDailyQuestionReviewItem,
  type DailyQuestionReviewItemRecord,
  type DailyQuestionReviewRunRecord,
} from "@/lib/server/dailyQuestionReviewRepository";
import {
  MAX_DAILY_QUESTION_SOURCE_COLLECTION_DURATION_MS,
  collectSavedSourceEvidence,
  type SourceEvidenceResult,
} from "@/lib/server/dailyQuestionSourceFetcher";
import {
  MAX_DAILY_QUESTION_VERIFIER_DURATION_MS,
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

const REVIEW_RUN_LEASE_MS = 3 * 60 * 1000;
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_VERIFIER_VERSION = DAILY_REVIEW_PRICING.verifierVersion;
const MAX_VERIFICATION_RESERVATION_MICRODOLLARS =
  DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION *
  DAILY_REVIEW_MAX_REQUEST_RESERVATION_MICRODOLLARS;

export const MAX_DAILY_QUESTION_VERIFICATION_UNIT_DURATION_MS =
  MAX_DAILY_QUESTION_SOURCE_COLLECTION_DURATION_MS +
  MAX_DAILY_QUESTION_VERIFIER_DURATION_MS;
export const DAILY_QUESTION_REVIEW_MIN_UNIT_REMAINING_MS = 125_000;
export const DAILY_QUESTION_REVIEW_INVOCATION_MS = 240_000;

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
  loadOldestRecoverable: (beforeChallengeDate: string) => Promise<{
    run: DailyQuestionReviewRunRecord;
    items: DailyQuestionReviewItemRecord[];
  } | null>;
  loadActiveReservation: (
    challengeDate: string,
  ) => Promise<DailyQuestionReviewReservationContext | null>;
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
        notificationId: string;
        challengeDate: string;
        reason: string;
        reservedMicrodollars: number;
        remainingMicrodollars: number;
      }) => Promise<{ providerMessageId: string }>)
    | null;
  claimBudgetBlockEmail: (
    challengeDate: string,
    attemptedAt: string,
  ) => Promise<{
    claimed: boolean;
    reservationId: string | null;
    attempts: number;
  }>;
  markBudgetBlockEmailSent: (
    reservationId: string,
    input: { sentAt: string; providerMessageId: string; attempts: number },
  ) => Promise<unknown>;
  markBudgetBlockEmailFailed: (
    reservationId: string,
    input: {
      attemptedAt: string;
      attempts: number;
      code: string;
      message: string;
    },
  ) => Promise<unknown>;
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
    }
  | {
      kind: "in_progress";
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

function usageIsUncertain(error: unknown): boolean {
  if (!(error instanceof OpenAiQuestionVerifierError)) return true;
  if (["invalid_input", "missing_api_key", "unsupported_model"].includes(error.code)) {
    return false;
  }
  const usage = errorUsage(error);
  return Object.values(usage).every((value) => value === 0);
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

function beginBillableResultPersistence(
  runErrors: DailyQuestionReviewRunError[],
  phase: "verification" | "replacement",
  occurredAt: string,
  questionId: string,
): () => void {
  const pendingError: DailyQuestionReviewRunError = {
    phase,
    code: "billable_result_persistence_pending",
    message:
      "Billable verification started, but its terminal result has not yet been durably persisted.",
    retryable: false,
    occurredAt,
    questionId,
  };
  runErrors.unshift(pendingError);
  return () => {
    const index = runErrors.indexOf(pendingError);
    if (index >= 0) runErrors.splice(index, 1);
  };
}

function terminalUnableFinding(
  question: QuestionSnapshot,
  error: unknown,
  verifiedAt: string,
): DailyQuestionVerificationFinding {
  return {
    questionId: question.id,
    verdict: "unable_to_verify",
    confidence: 0,
    explanation: `Automated verification could not complete: ${errorMessage(error)}`.slice(0, 1_000),
    conflicts: [],
    evidence: [],
    verifiedAt,
  };
}

function terminalReplacement(
  question: QuestionSnapshot,
  error: unknown,
  verifiedAt: string,
): DailyQuestionReplacementCandidate {
  return {
    questionId: question.id,
    snapshot: question,
    eligible: false,
    finding: terminalUnableFinding(question, error, verifiedAt),
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
    loadOldestRecoverable: (beforeChallengeDate) =>
      loadOldestRecoverableDailyQuestionReview(client, beforeChallengeDate),
    loadActiveReservation: (challengeDate) =>
      loadActiveDailyQuestionReviewReservation(client, challengeDate),
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
      const result = await sendDailyQuestionReviewBudgetBlockNotification({
        ...input,
        siteUrlFallback: context.siteUrlFallback,
      });
      if (!result.sent) {
        throw new Error("Budget-block email is not configured.");
      }
      return { providerMessageId: result.providerMessageId };
    },
    claimBudgetBlockEmail: (challengeDate, attemptedAt) =>
      claimDailyQuestionReviewBudgetEmail(client, challengeDate, attemptedAt),
    markBudgetBlockEmailSent: (reservationId, input) =>
      markDailyQuestionReviewBudgetEmailSent(client, reservationId, input),
    markBudgetBlockEmailFailed: (reservationId, input) =>
      markDailyQuestionReviewBudgetEmailFailed(client, reservationId, input),
    markEmailSent: (runId, input) =>
      markDailyQuestionReviewEmailSent(client, runId, input),
    markEmailFailed: (runId, input) =>
      markDailyQuestionReviewEmailFailed(client, runId, input),
  };
}

async function attemptBudgetBlockEmail(
  deps: DailyQuestionReviewServiceDependencies,
  input: {
    challengeDate: string;
    reason: string;
    reservedMicrodollars: number;
    remainingMicrodollars: number;
  },
  attemptedAt: string,
): Promise<void> {
  if (!deps.sendBudgetBlockEmail) return;
  const claim = await deps.claimBudgetBlockEmail(
    input.challengeDate,
    attemptedAt,
  );
  if (!claim.claimed || !claim.reservationId) return;
  try {
    const sent = await deps.sendBudgetBlockEmail({
      ...input,
      notificationId: claim.reservationId,
    });
    await deps.markBudgetBlockEmailSent(claim.reservationId, {
      sentAt: attemptedAt,
      providerMessageId: sent.providerMessageId,
      attempts: claim.attempts,
    });
  } catch (error) {
    await deps.markBudgetBlockEmailFailed(claim.reservationId, {
      attemptedAt,
      attempts: claim.attempts,
      code: "email_failed",
      message: errorMessage(error),
    });
  }
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
  unitLimit = 1,
  deadline = new Date(now.getTime() + DAILY_QUESTION_REVIEW_INVOCATION_MS),
  dependencies,
  siteUrlFallback,
}: {
  challengeDate: string;
  now: Date;
  unitLimit?: 1;
  deadline?: Date;
  dependencies?: DailyQuestionReviewServiceDependencies;
  siteUrlFallback?: string;
}): Promise<NightlyQuestionReviewResult> {
  validateInput(challengeDate, now);
  if (
    unitLimit !== 1 ||
    !(deadline instanceof Date) ||
    Number.isNaN(deadline.getTime()) ||
    deadline.getTime() <= now.getTime()
  ) {
    throw new RangeError("Invalid nightly review invocation bounds.");
  }
  const occurredAt = now.toISOString();
  const currentReviewDate = getReviewDate(now);
  if (currentReviewDate >= challengeDate) {
    throw new RangeError("Nightly review date must precede the challenge date.");
  }
  const priorReview = dependencies
    ? await dependencies.loadOldestRecoverable(challengeDate)
    : await loadOldestRecoverableDailyQuestionReview(
        supabaseAdmin(),
        challengeDate,
      );
  const reviewDate = priorReview?.run.reviewDate ?? currentReviewDate;
  const targetChallengeDate = priorReview?.run.challengeDate ?? challengeDate;
  const deps =
    dependencies ??
    createDefaultDependencies({
      reviewDate,
      challengeDate: targetChallengeDate,
      now: occurredAt,
      siteUrlFallback,
    });
  const monthRange = getChicagoCalendarMonthRange(now);
  const records = await deps.listMonthlyCosts(monthRange);
  const existingReview =
    priorReview ?? await deps.loadExisting(targetChallengeDate);
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

  const recoveredReservation = priorReview
    ? await deps.loadActiveReservation(targetChallengeDate)
    : null;

  const processReservation = async (
    reservation: DailyQuestionReviewReservationContext,
  ) => {
      let releaseUnboundReservation = reservation.acquiredNow;
      try {
        const initialLease = getLeaseWindow(now);
        let claimedRun: DailyQuestionReviewRunRecord;
        let claimToken: string;
        let draft: PreparedDailyChallengeDraft;
        if (!reservation.acquiredNow) {
          const existing = await deps.claimExisting({
            reviewDate,
            challengeDate: targetChallengeDate,
            claimedAt: initialLease.heartbeatAt,
            leaseExpiresAt: initialLease.leaseExpiresAt,
          });
          if (!existing.run) {
            draft = await deps.prepareDraft(targetChallengeDate);
            const started = await deps.startOrObserve({
              dailyChallengeId: draft.challengeId,
              reviewDate,
              challengeDate: targetChallengeDate,
              model: deps.model,
              verifierVersion: deps.verifierVersion,
              startedAt: initialLease.heartbeatAt,
              leaseExpiresAt: initialLease.leaseExpiresAt,
            });
            releaseUnboundReservation = false;
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
            draft = await deps.prepareDraft(targetChallengeDate);
          }
        } else {
          draft = await deps.prepareDraft(targetChallengeDate);
          const started = await deps.startOrObserve({
            dailyChallengeId: draft.challengeId,
            reviewDate,
            challengeDate: targetChallengeDate,
            model: deps.model,
            verifierVersion: deps.verifierVersion,
            startedAt: initialLease.heartbeatAt,
            leaseExpiresAt: initialLease.leaseExpiresAt,
          });
          releaseUnboundReservation = false;
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
        const runErrors = [...loaded.run.errors];
        const saveProgress = async (
          input: Omit<
            ItemSaveInput,
            "runId" | "claimToken" | "heartbeatAt" | "leaseExpiresAt" | "runErrors"
          >,
        ) => {
          const lease = getLeaseWindow(deps.currentTime());
          const saved = await deps.saveItem({
            ...input,
            runId: loaded.run.id,
            claimToken,
            heartbeatAt: lease.heartbeatAt,
            leaseExpiresAt: lease.leaseExpiresAt,
            runErrors: runErrors.slice(0, 20),
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
        const pendingQuestions = draft.questions.filter((question) => {
          const status = itemsBySlot.get(question.slot)?.reviewStatus;
          return status === undefined || status === "pending" || status === "reviewing";
        });

        if (
          pendingQuestions.length > 0 &&
          deadline.getTime() - deps.currentTime().getTime() <
            DAILY_QUESTION_REVIEW_MIN_UNIT_REMAINING_MS
        ) {
          await assertLease();
          return { kind: "in_progress" as const, run: persistedRun };
        }

        if (pendingQuestions.length > 0) {
          const question = pendingQuestions[0];
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
                reviewStatus: "completed",
                sourceFetchResults: [],
                finding: terminalUnableFinding(question, error, occurredAt),
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
            return { kind: "in_progress" as const, run: persistedRun };
          }

          const clearPendingPersistence = beginBillableResultPersistence(
            runErrors,
            "verification",
            occurredAt,
            question.id,
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
              usageEvent: null,
            });
          } catch (error) {
            clearPendingPersistence();
            throw error;
          }
          let verification: OpenAiQuestionVerifierResult;
          try {
            verification = await deps.verifyQuestion({
              question,
              savedEvidence: evidence.savedEvidence,
            });
          } catch (error) {
            clearPendingPersistence();
            const chargedUsage = errorUsage(error);
            const uncertainUsage = usageIsUncertain(error);
            runErrors.push(
              makeRunError(
                "verification",
                uncertainUsage
                  ? "usage_uncertain"
                  : error instanceof OpenAiQuestionVerifierError
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
                reviewStatus: uncertainUsage ? "failed" : "completed",
                sourceFetchResults: evidence.sourceFetchResults,
                finding: terminalUnableFinding(question, error, occurredAt),
                replacement: null,
                usageEvent: uncertainUsage
                  ? null
                  : makeUsageEvent("primary", deps.model, chargedUsage),
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
            return { kind: "in_progress" as const, run: persistedRun };
          }

          clearPendingPersistence();
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
          return { kind: "in_progress" as const, run: persistedRun };
        }

        const flaggedQuestions = draft.questions.filter((question) => {
          const item = itemsBySlot.get(question.slot);
          return (
            item?.reviewStatus === "completed" &&
            item.finding?.verdict !== "passed" &&
            !item.replacementAttempted
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
        if (
          flaggedQuestions.length > 0 &&
          deadline.getTime() - deps.currentTime().getTime() <
            DAILY_QUESTION_REVIEW_MIN_UNIT_REMAINING_MS
        ) {
          await assertLease();
          return { kind: "in_progress" as const, run: persistedRun };
        }

        for (const question of flaggedQuestions.slice(0, unitLimit)) {
          let placeholderPersisted = false;
          try {
            await assertLease();
            const candidate = await deps.selectReplacement({
              draft,
              flaggedSlot: question.slot,
              selection: replacementSelection,
              excludedQuestionIds: Array.from(attemptedReplacementIds),
            });
            const primaryItem = itemsBySlot.get(question.slot);
            if (!primaryItem?.finding) {
              throw new Error("Persisted primary finding is unavailable.");
            }
            if (!candidate) {
              const unavailableError = new Error(
                "No compliant replacement candidate was available.",
              );
              runErrors.push(
                makeRunError(
                  "replacement",
                  "replacement_unavailable",
                  unavailableError,
                  occurredAt,
                  question.id,
                ),
              );
              await saveProgress({
                dailyChallengeId: draft.challengeId,
                slot: question.slot,
                question: primaryItem.question,
                reviewStatus: "completed",
                sourceFetchResults: primaryItem.sourceFetchResults,
                finding: primaryItem.finding,
                replacement: null,
                replacementAttempted: true,
                usageEvent: null,
              });
              continue;
            }

            const currentReservationCost =
              persistedRun.estimatedCostMicrodollars -
              reservation.runCostBaselineMicrodollars;
            if (
              currentReservationCost < 0 ||
              currentReservationCost + MAX_VERIFICATION_RESERVATION_MICRODOLLARS >
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
              await saveProgress({
                dailyChallengeId: draft.challengeId,
                slot: question.slot,
                question: primaryItem.question,
                reviewStatus: "completed",
                sourceFetchResults: primaryItem.sourceFetchResults,
                finding: primaryItem.finding,
                replacement: terminalReplacement(
                  candidate,
                  new Error("Replacement verification reservation was unavailable."),
                  occurredAt,
                ),
                usageEvent: null,
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

            let candidateEvidence: DailyQuestionReviewEvidenceCollection;
            try {
              candidateEvidence = await deps.collectEvidence(candidate);
            } catch (error) {
              runErrors.push(
                makeRunError(
                  "source_fetch",
                  "replacement_source_fetch_failed",
                  error,
                  occurredAt,
                  candidate.id,
                ),
              );
              await saveProgress({
                dailyChallengeId: draft.challengeId,
                slot: question.slot,
                question: primaryItem.question,
                reviewStatus: "completed",
                sourceFetchResults: primaryItem.sourceFetchResults,
                finding: primaryItem.finding,
                replacement: terminalReplacement(candidate, error, occurredAt),
                usageEvent: null,
              });
              continue;
            }

            const clearPendingPersistence = beginBillableResultPersistence(
              runErrors,
              "replacement",
              occurredAt,
              candidate.id,
            );
            try {
              await saveProgress({
                dailyChallengeId: draft.challengeId,
                slot: question.slot,
                question: primaryItem.question,
                reviewStatus: "failed",
                sourceFetchResults: primaryItem.sourceFetchResults,
                finding: primaryItem.finding,
                replacement: null,
                replacementAttempted: true,
                usageEvent: null,
              });
            } catch (error) {
              clearPendingPersistence();
              throw error;
            }
            placeholderPersisted = true;
            let candidateVerification: OpenAiQuestionVerifierResult;
            try {
              candidateVerification = await deps.verifyQuestion({
                question: candidate,
                savedEvidence: candidateEvidence.savedEvidence,
              });
            } catch (error) {
              clearPendingPersistence();
              const uncertainUsage = usageIsUncertain(error);
              runErrors.push(
                makeRunError(
                  "replacement",
                  uncertainUsage
                    ? "usage_uncertain"
                    : error instanceof OpenAiQuestionVerifierError
                    ? error.code
                    : "replacement_verification_failed",
                  error,
                  occurredAt,
                  candidate.id,
                ),
              );
              await saveProgress({
                dailyChallengeId: draft.challengeId,
                slot: question.slot,
                question: primaryItem.question,
                reviewStatus: uncertainUsage ? "failed" : "completed",
                sourceFetchResults: primaryItem.sourceFetchResults,
                finding: primaryItem.finding,
                replacement: terminalReplacement(candidate, error, occurredAt),
                usageEvent: uncertainUsage
                  ? null
                  : makeUsageEvent(
                      "replacement",
                      deps.model,
                      errorUsage(error),
                    ),
              });
              continue;
            }
            clearPendingPersistence();
            const replacementCandidate: DailyQuestionReplacementCandidate = {
              questionId: candidate.id,
              snapshot: candidate,
              finding: candidateVerification.finding,
              eligible:
                candidateVerification.finding.verdict === "passed" &&
                candidateVerification.finding.evidence.length > 0,
            };
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
            const currentItem = itemsBySlot.get(question.slot);
            if (
              !placeholderPersisted &&
              currentItem?.finding &&
              !currentItem.replacementAttempted
            ) {
              await saveProgress({
                dailyChallengeId: draft.challengeId,
                slot: question.slot,
                question: currentItem.question,
                reviewStatus: "completed",
                sourceFetchResults: currentItem.sourceFetchResults,
                finding: currentItem.finding,
                replacement: null,
                replacementAttempted: true,
                usageEvent: null,
              });
            }
          }
        }

        if (flaggedQuestions.length > 0) {
          return { kind: "in_progress" as const, run: persistedRun };
        }

        const finalItems = Array.from(itemsBySlot.values()).sort(
          (left, right) => left.slot - right.slot,
        );
        const allCompleted =
          finalItems.length === 5 &&
          finalItems.every((item) => item.reviewStatus === "completed");
        const hasFailedItem = finalItems.some(
          (item) => item.reviewStatus === "failed",
        );
        const hasFlags = finalItems.some(
          (item) => item.finding?.verdict !== "passed",
        );
        const status = hasFailedItem || !allCompleted
          ? "failed"
          : hasFlags
            ? "completed_with_flags"
            : "completed";
        await assertLease();
        const finalRun = await deps.completeRun({
          runId: loaded.run.id,
          claimToken,
          reservationId: reservation.reservationId,
          status,
          completedAt: occurredAt,
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
  };
  const preflight = recoveredReservation
    ? {
        budget: checkDailyQuestionReviewBudget({
          model: deps.model,
          records,
          now,
        }),
        value: await processReservation(recoveredReservation),
      }
    : await runWithDailyQuestionReviewBudgetPreflight({
        model: deps.model,
        records,
        now,
        acquireReservation: deps.acquireReservation,
        operation: processReservation,
      });

  if (
    (!preflight.budget.allowed && recoveredReservation === null) ||
    preflight.value === null
  ) {
    const atomicDenial = preflight.budget.reason === "atomic_reservation_denied";
    if (!atomicDenial) {
      await deps.recordBudgetBlock({
        reviewDate,
        challengeDate: targetChallengeDate,
        model: deps.model,
        reservedMicrodollars: preflight.budget.reservedMicrodollars,
        monthRange,
        attemptedAt: occurredAt,
        reason: preflight.budget.reason,
      });
    }
    await attemptBudgetBlockEmail(
      deps,
      {
        challengeDate: targetChallengeDate,
        reason: preflight.budget.reason,
        reservedMicrodollars: preflight.budget.reservedMicrodollars,
        remainingMicrodollars: preflight.budget.remainingMicrodollars,
      },
      occurredAt,
    );
    return { kind: "budget_blocked", budget: preflight.budget };
  }
  return { ...preflight.value, budget: preflight.budget };
}
