import "server-only";

import {
  parseDailyQuestionReplacementCandidate,
  parseDailyQuestionReviewEmailState,
  parseDailyQuestionReviewRunErrors,
  parseDailyQuestionSourceFetchResults,
  parseDailyQuestionVerificationFinding,
  parseQuestionSnapshot,
  type DailyQuestionReplacementCandidate,
  type DailyQuestionReviewEmailState,
  type DailyQuestionReviewItemStatus,
  type DailyQuestionReviewResolution,
  type DailyQuestionReviewRunError,
  type DailyQuestionReviewRunStatus,
  type DailyQuestionSourceFetchResult,
  type DailyQuestionVerificationFinding,
  type QuestionSnapshot,
} from "@/lib/dailyQuestionReview";
import type {
  ChicagoCalendarMonthRange,
  DailyQuestionReviewReservationRequest,
  DailyQuestionReviewUsage,
  PersistedDailyQuestionReviewCost,
} from "@/lib/server/dailyQuestionReviewBudget";
import type { ServerSupabaseClient } from "@/lib/server/supabaseServer";

const RUN_COLUMNS = [
  "id",
  "daily_challenge_id",
  "review_date",
  "challenge_date",
  "status",
  "run_kind",
  "model",
  "verifier_version",
  "started_at",
  "completed_at",
  "input_tokens",
  "cached_input_tokens",
  "cache_write_tokens",
  "output_tokens",
  "search_count",
  "estimated_cost_microdollars",
  "email_status",
  "email_sent_at",
  "email_metadata",
  "errors",
  "created_at",
  "updated_at",
].join(",");

const ITEM_COLUMNS = [
  "id",
  "run_id",
  "daily_challenge_id",
  "slot",
  "question_id",
  "question_snapshot",
  "review_status",
  "verdict",
  "confidence",
  "explanation",
  "conflicts",
  "source_fetch_results",
  "evidence",
  "verified_at",
  "replacement_question_id",
  "replacement_eligible",
  "replacement_question_snapshot",
  "replacement_finding",
  "resolution",
  "resolved_by",
  "resolved_at",
  "application_metadata",
  "applied_at",
  "created_at",
  "updated_at",
].join(",");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RUN_STATUSES = new Set<DailyQuestionReviewRunStatus>([
  "preparing",
  "running",
  "completed",
  "completed_with_flags",
  "failed",
]);
const ITEM_STATUSES = new Set<DailyQuestionReviewItemStatus>([
  "pending",
  "reviewing",
  "completed",
  "failed",
]);
const RESOLUTIONS = new Set<DailyQuestionReviewResolution>([
  "pending",
  "kept",
  "replaced",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function throwIfError(error: unknown): void {
  if (error) throw error;
}

function isUniqueConflict(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

export interface DailyQuestionReviewRunRecord {
  id: string;
  dailyChallengeId: string;
  reviewDate: string;
  challengeDate: string;
  status: DailyQuestionReviewRunStatus;
  runKind: "scheduled";
  model: string;
  verifierVersion: string;
  startedAt: string | null;
  completedAt: string | null;
  usage: DailyQuestionReviewUsage & { webSearchCalls: number };
  estimatedCostMicrodollars: number;
  email: DailyQuestionReviewEmailState;
  errors: DailyQuestionReviewRunError[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyQuestionReviewItemRecord {
  id: string;
  runId: string;
  dailyChallengeId: string;
  slot: number;
  question: QuestionSnapshot;
  reviewStatus: DailyQuestionReviewItemStatus;
  sourceFetchResults: DailyQuestionSourceFetchResult[];
  finding: DailyQuestionVerificationFinding | null;
  replacement: DailyQuestionReplacementCandidate | null;
  resolution: DailyQuestionReviewResolution;
  resolvedBy: string | null;
  resolvedAt: string | null;
  applicationMetadata: Record<string, unknown>;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseRun(value: unknown): DailyQuestionReviewRunRecord | null {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isUuid(value.daily_challenge_id) ||
    typeof value.review_date !== "string" ||
    !DATE_PATTERN.test(value.review_date) ||
    typeof value.challenge_date !== "string" ||
    !DATE_PATTERN.test(value.challenge_date) ||
    typeof value.status !== "string" ||
    !RUN_STATUSES.has(value.status as DailyQuestionReviewRunStatus) ||
    value.run_kind !== "scheduled" ||
    typeof value.model !== "string" ||
    !value.model.trim() ||
    typeof value.verifier_version !== "string" ||
    !value.verifier_version.trim() ||
    !isNullableTimestamp(value.started_at) ||
    !isNullableTimestamp(value.completed_at) ||
    !isNonnegativeInteger(value.input_tokens) ||
    !isNonnegativeInteger(value.cached_input_tokens) ||
    !isNonnegativeInteger(value.cache_write_tokens) ||
    !isNonnegativeInteger(value.output_tokens) ||
    !isNonnegativeInteger(value.search_count) ||
    !isNonnegativeInteger(value.estimated_cost_microdollars) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  const email = parseDailyQuestionReviewEmailState({
    status: value.email_status,
    emailSentAt: value.email_sent_at,
    metadata: value.email_metadata,
  });
  const errors = parseDailyQuestionReviewRunErrors(value.errors);
  if (!email || !errors) return null;

  return {
    id: value.id,
    dailyChallengeId: value.daily_challenge_id,
    reviewDate: value.review_date,
    challengeDate: value.challenge_date,
    status: value.status as DailyQuestionReviewRunStatus,
    runKind: "scheduled",
    model: value.model.trim(),
    verifierVersion: value.verifier_version.trim(),
    startedAt: value.started_at,
    completedAt: value.completed_at,
    usage: {
      model: value.model.trim(),
      inputTokens: value.input_tokens,
      cachedInputTokens: value.cached_input_tokens,
      cacheWriteTokens: value.cache_write_tokens,
      outputTokens: value.output_tokens,
      webSearchCalls: value.search_count,
    },
    estimatedCostMicrodollars: value.estimated_cost_microdollars,
    email,
    errors,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function parseItem(value: unknown): DailyQuestionReviewItemRecord | null {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isUuid(value.run_id) ||
    !isUuid(value.daily_challenge_id) ||
    !isUuid(value.question_id) ||
    typeof value.slot !== "number" ||
    !Number.isInteger(value.slot) ||
    value.slot < 1 ||
    value.slot > 5 ||
    typeof value.review_status !== "string" ||
    !ITEM_STATUSES.has(value.review_status as DailyQuestionReviewItemStatus) ||
    typeof value.resolution !== "string" ||
    !RESOLUTIONS.has(value.resolution as DailyQuestionReviewResolution) ||
    (value.resolved_by !== null && !isUuid(value.resolved_by)) ||
    !isNullableTimestamp(value.resolved_at) ||
    !isNullableTimestamp(value.applied_at) ||
    !isRecord(value.application_metadata) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  const question = parseQuestionSnapshot(value.question_snapshot, value.question_id);
  const sourceFetchResults = parseDailyQuestionSourceFetchResults(
    value.source_fetch_results,
  );
  if (!question || !sourceFetchResults) return null;

  let finding: DailyQuestionVerificationFinding | null = null;
  if (value.review_status === "completed") {
    finding = parseDailyQuestionVerificationFinding({
      questionId: value.question_id,
      verdict: value.verdict,
      confidence: value.confidence,
      explanation: value.explanation,
      conflicts: value.conflicts,
      evidence: value.evidence,
      verifiedAt: value.verified_at,
    });
    if (!finding) return null;
  }

  const hasReplacement = value.replacement_question_id !== null;
  const replacement = hasReplacement
    ? parseDailyQuestionReplacementCandidate(
        {
          questionId: value.replacement_question_id,
          eligible: value.replacement_eligible,
          snapshot: value.replacement_question_snapshot,
          finding: value.replacement_finding,
        },
        question,
      )
    : null;
  if (hasReplacement && !replacement) return null;

  return {
    id: value.id,
    runId: value.run_id,
    dailyChallengeId: value.daily_challenge_id,
    slot: value.slot,
    question,
    reviewStatus: value.review_status as DailyQuestionReviewItemStatus,
    sourceFetchResults,
    finding,
    replacement,
    resolution: value.resolution as DailyQuestionReviewResolution,
    resolvedBy: value.resolved_by as string | null,
    resolvedAt: value.resolved_at,
    applicationMetadata: value.application_metadata,
    appliedAt: value.applied_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function requireRun(value: unknown): DailyQuestionReviewRunRecord {
  const run = parseRun(value);
  if (!run) throw new Error("Daily question review run data is invalid.");
  return run;
}

function requireItem(value: unknown): DailyQuestionReviewItemRecord {
  const item = parseItem(value);
  if (!item) throw new Error("Daily question review item data is invalid.");
  return item;
}

export async function startOrObserveDailyQuestionReviewRun(
  client: ServerSupabaseClient,
  input: {
    dailyChallengeId: string;
    reviewDate: string;
    challengeDate: string;
    model: string;
    verifierVersion: string;
    startedAt: string;
  },
): Promise<{ created: boolean; claimed: boolean; run: DailyQuestionReviewRunRecord }> {
  const { data, error } = await client
    .from("daily_question_review_runs")
    .insert({
      daily_challenge_id: input.dailyChallengeId,
      review_date: input.reviewDate,
      challenge_date: input.challengeDate,
      status: "running",
      run_kind: "scheduled",
      model: input.model,
      verifier_version: input.verifierVersion,
      started_at: input.startedAt,
    })
    .select(RUN_COLUMNS)
    .single();

  if (!error) return { created: true, claimed: true, run: requireRun(data) };
  if (!isUniqueConflict(error)) throw error;

  const existingResult = await client
    .from("daily_question_review_runs")
    .select(RUN_COLUMNS)
    .eq("challenge_date", input.challengeDate)
    .eq("run_kind", "scheduled")
    .maybeSingle();
  throwIfError(existingResult.error);
  let existing = parseRun(existingResult.data);
  if (!existing) {
    const reviewDateResult = await client
      .from("daily_question_review_runs")
      .select(RUN_COLUMNS)
      .eq("review_date", input.reviewDate)
      .eq("run_kind", "scheduled")
      .maybeSingle();
    throwIfError(reviewDateResult.error);
    existing = requireRun(reviewDateResult.data);
  }
  if (existing.status !== "failed") {
    return { created: false, claimed: false, run: existing };
  }

  const claimResult = await client
    .from("daily_question_review_runs")
    .update({ status: "running", completed_at: null })
    .eq("id", existing.id)
    .eq("status", "failed")
    .select(RUN_COLUMNS)
    .maybeSingle();
  throwIfError(claimResult.error);
  const claimed = parseRun(claimResult.data);
  return claimed
    ? { created: false, claimed: true, run: claimed }
    : { created: false, claimed: false, run: existing };
}

export async function upsertDailyQuestionReviewItem(
  client: ServerSupabaseClient,
  input: {
    runId: string;
    dailyChallengeId: string;
    slot: number;
    question: QuestionSnapshot;
    reviewStatus: DailyQuestionReviewItemStatus;
    sourceFetchResults: DailyQuestionSourceFetchResult[];
    finding: DailyQuestionVerificationFinding | null;
    replacement: DailyQuestionReplacementCandidate | null;
  },
): Promise<DailyQuestionReviewItemRecord> {
  const finding = input.finding;
  const replacement = input.replacement;
  const { data, error } = await client
    .from("daily_question_review_items")
    .upsert(
      {
        run_id: input.runId,
        daily_challenge_id: input.dailyChallengeId,
        slot: input.slot,
        question_id: input.question.id,
        question_snapshot: input.question,
        review_status: input.reviewStatus,
        verdict: finding?.verdict ?? null,
        confidence: finding?.confidence ?? null,
        explanation: finding?.explanation ?? null,
        conflicts: finding?.conflicts ?? [],
        source_fetch_results: input.sourceFetchResults,
        evidence: finding?.evidence ?? [],
        verified_at: finding?.verifiedAt ?? null,
        replacement_question_id: replacement?.questionId ?? null,
        replacement_eligible: replacement?.eligible ?? false,
        replacement_question_snapshot: replacement?.snapshot ?? null,
        replacement_finding: replacement?.finding ?? null,
      },
      { onConflict: "run_id,slot" },
    )
    .select(ITEM_COLUMNS)
    .single();
  throwIfError(error);
  return requireItem(data);
}

export async function completeDailyQuestionReviewRun(
  client: ServerSupabaseClient,
  input: {
    runId: string;
    status: Extract<DailyQuestionReviewRunStatus, "completed" | "completed_with_flags" | "failed">;
    completedAt: string;
    usage: Required<Omit<DailyQuestionReviewUsage, "model">> & { webSearchCalls: number };
    estimatedCostMicrodollars: number;
    errors: DailyQuestionReviewRunError[];
  },
): Promise<DailyQuestionReviewRunRecord> {
  const { data, error } = await client
    .from("daily_question_review_runs")
    .update({
      status: input.status,
      completed_at: input.completedAt,
      input_tokens: input.usage.inputTokens,
      cached_input_tokens: input.usage.cachedInputTokens,
      cache_write_tokens: input.usage.cacheWriteTokens,
      output_tokens: input.usage.outputTokens,
      search_count: input.usage.webSearchCalls,
      estimated_cost_microdollars: input.estimatedCostMicrodollars,
      estimated_cost_usd: input.estimatedCostMicrodollars / 1_000_000,
      errors: input.errors,
    })
    .eq("id", input.runId)
    .select(RUN_COLUMNS)
    .single();
  throwIfError(error);
  return requireRun(data);
}

export async function listCurrentMonthDailyQuestionReviewCosts(
  client: ServerSupabaseClient,
  range: ChicagoCalendarMonthRange,
): Promise<PersistedDailyQuestionReviewCost[]> {
  const { data, error } = await client
    .from("daily_question_review_runs")
    .select("id,status,completed_at,estimated_cost_microdollars")
    .in("status", ["completed", "completed_with_flags", "failed"])
    .gte("completed_at", range.startInclusive)
    .lt("completed_at", range.endExclusive);
  throwIfError(error);

  return (Array.isArray(data) ? data : []).flatMap((value) => {
    if (
      !isRecord(value) ||
      !isUuid(value.id) ||
      typeof value.status !== "string" ||
      !RUN_STATUSES.has(value.status as DailyQuestionReviewRunStatus) ||
      !isTimestamp(value.completed_at) ||
      !isNonnegativeInteger(value.estimated_cost_microdollars)
    ) {
      return [];
    }
    return [{
      id: value.id,
      status: value.status,
      occurredAt: value.completed_at,
      estimatedCostMicrodollars: value.estimated_cost_microdollars,
    }];
  });
}

export async function loadLatestDailyQuestionReview(
  client: ServerSupabaseClient,
): Promise<{ run: DailyQuestionReviewRunRecord; items: DailyQuestionReviewItemRecord[] } | null> {
  const runResult = await client
    .from("daily_question_review_runs")
    .select(RUN_COLUMNS)
    .order("review_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(runResult.error);
  if (runResult.data === null) return null;
  const run = requireRun(runResult.data);

  const itemResult = await client
    .from("daily_question_review_items")
    .select(ITEM_COLUMNS)
    .eq("run_id", run.id)
    .order("slot", { ascending: true });
  throwIfError(itemResult.error);
  const items = (Array.isArray(itemResult.data) ? itemResult.data : [])
    .map(parseItem)
    .filter((item): item is DailyQuestionReviewItemRecord => item !== null);
  return { run, items };
}

export async function loadDailyQuestionReviewByRunId(
  client: ServerSupabaseClient,
  runId: string,
): Promise<{ run: DailyQuestionReviewRunRecord; items: DailyQuestionReviewItemRecord[] } | null> {
  const runResult = await client
    .from("daily_question_review_runs")
    .select(RUN_COLUMNS)
    .eq("id", runId)
    .maybeSingle();
  throwIfError(runResult.error);
  if (runResult.data === null) return null;
  const run = requireRun(runResult.data);

  const itemResult = await client
    .from("daily_question_review_items")
    .select(ITEM_COLUMNS)
    .eq("run_id", run.id)
    .order("slot", { ascending: true });
  throwIfError(itemResult.error);
  const items = (Array.isArray(itemResult.data) ? itemResult.data : [])
    .map(parseItem)
    .filter((item): item is DailyQuestionReviewItemRecord => item !== null);
  return { run, items };
}

export async function loadDailyQuestionReviewResolutions(
  client: ServerSupabaseClient,
  runId: string,
): Promise<DailyQuestionReviewItemRecord[]> {
  const { data, error } = await client
    .from("daily_question_review_items")
    .select(ITEM_COLUMNS)
    .eq("run_id", runId)
    .neq("resolution", "pending")
    .order("slot", { ascending: true });
  throwIfError(error);
  return (Array.isArray(data) ? data : [])
    .map(parseItem)
    .filter((item): item is DailyQuestionReviewItemRecord => item !== null);
}

export async function acquireDailyQuestionReviewReservation(
  client: ServerSupabaseClient,
  request: DailyQuestionReviewReservationRequest,
  context: { reviewDate: string; challengeDate: string; now: string },
) {
  const { data, error } = await client.rpc(
    "acquire_daily_question_review_reservation",
    {
      p_review_date: context.reviewDate,
      p_challenge_date: context.challengeDate,
      p_model: request.model,
      p_model_derived_reservation_microdollars:
        request.modelDerivedReservationMicrodollars,
      p_required_reservation_microdollars:
        request.requiredReservationMicrodollars,
      p_month_start: request.monthRange.startInclusive,
      p_month_end: request.monthRange.endExclusive,
      p_limit_microdollars: request.limitMicrodollars,
      p_now: context.now,
    },
  );
  throwIfError(error);
  if (!isRecord(data) || typeof data.acquired !== "boolean") {
    throw new Error("Reservation acquisition returned invalid data.");
  }
  if (!data.acquired) return { acquired: false };
  if (
    typeof data.created !== "boolean" ||
    !isUuid(data.reservation_id) ||
    !isNonnegativeInteger(data.reserved_microdollars)
  ) {
    throw new Error("Reservation acquisition returned invalid data.");
  }
  return {
    acquired: true,
    created: data.created,
    reservationId: data.reservation_id,
    reservedMicrodollars: data.reserved_microdollars,
  };
}

export async function recordDailyQuestionReviewBudgetBlock(
  client: ServerSupabaseClient,
  input: {
    reviewDate: string;
    challengeDate: string;
    model: string;
    reservedMicrodollars: number;
    monthRange: ChicagoCalendarMonthRange;
    attemptedAt: string;
    reason: string;
  },
): Promise<void> {
  const { error } = await client
    .from("daily_question_review_reservations")
    .insert({
      review_date: input.reviewDate,
      challenge_date: input.challengeDate,
      run_kind: "scheduled",
      model: input.model,
      status: "denied",
      reserved_microdollars: input.reservedMicrodollars,
      actual_microdollars: 0,
      month_start: input.monthRange.startInclusive,
      month_end: input.monthRange.endExclusive,
      acquired_at: input.attemptedAt,
      reconciled_at: input.attemptedAt,
      denial_reason: input.reason.slice(0, 100),
    });
  if (error && !isUniqueConflict(error)) throw error;
}

export async function reconcileDailyQuestionReviewReservation(
  client: ServerSupabaseClient,
  input: { reservationId: string; actualMicrodollars: number; reconciledAt: string },
) {
  const { data, error } = await client.rpc(
    "reconcile_daily_question_review_reservation",
    {
      p_reservation_id: input.reservationId,
      p_actual_microdollars: input.actualMicrodollars,
      p_reconciled_at: input.reconciledAt,
    },
  );
  throwIfError(error);
  if (
    !isRecord(data) ||
    (data.outcome !== "reconciled" && data.outcome !== "released") ||
    !isNonnegativeInteger(data.actual_microdollars)
  ) {
    throw new Error("Reservation reconciliation returned invalid data.");
  }
  return {
    outcome: data.outcome,
    actualMicrodollars: data.actual_microdollars,
  };
}

export async function claimDailyQuestionReviewEmail(
  client: ServerSupabaseClient,
  runId: string,
  attemptedAt: string,
) {
  const { data, error } = await client.rpc("claim_daily_question_review_email", {
    p_run_id: runId,
    p_attempted_at: attemptedAt,
  });
  throwIfError(error);
  if (
    !isRecord(data) ||
    typeof data.claimed !== "boolean" ||
    !isNonnegativeInteger(data.attempts)
  ) {
    throw new Error("Email claim returned invalid data.");
  }
  return { claimed: data.claimed, attempts: data.attempts };
}

export async function markDailyQuestionReviewEmailSent(
  client: ServerSupabaseClient,
  runId: string,
  input: { sentAt: string; providerMessageId: string; attempts: number },
): Promise<DailyQuestionReviewRunRecord> {
  const { data, error } = await client
    .from("daily_question_review_runs")
    .update({
      email_status: "sent",
      email_sent_at: input.sentAt,
      email_metadata: {
        provider: "resend",
        providerMessageId: input.providerMessageId,
        attempts: input.attempts,
        lastAttemptAt: input.sentAt,
        failure: null,
      },
    })
    .eq("id", runId)
    .eq("email_status", "sending")
    .select(RUN_COLUMNS)
    .single();
  throwIfError(error);
  return requireRun(data);
}

export async function markDailyQuestionReviewEmailFailed(
  client: ServerSupabaseClient,
  runId: string,
  input: { attemptedAt: string; attempts: number; code: string; message: string },
): Promise<DailyQuestionReviewRunRecord> {
  const { data, error } = await client
    .from("daily_question_review_runs")
    .update({
      email_status: "failed",
      email_sent_at: null,
      email_metadata: {
        provider: "resend",
        providerMessageId: null,
        attempts: input.attempts,
        lastAttemptAt: input.attemptedAt,
        failure: {
          code: input.code,
          message: input.message,
          occurredAt: input.attemptedAt,
        },
      },
    })
    .eq("id", runId)
    .eq("email_status", "sending")
    .select(RUN_COLUMNS)
    .single();
  throwIfError(error);
  return requireRun(data);
}
