import "server-only";

import { randomUUID } from "node:crypto";

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
  DailyQuestionReviewReservationContext,
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
  "claim_token",
  "heartbeat_at",
  "lease_expires_at",
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
  "replacement_attempted",
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
  replacementAttempted: boolean;
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
    !isUuid(value.claim_token) ||
    !isTimestamp(value.heartbeat_at) ||
    !isTimestamp(value.lease_expires_at) ||
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
    typeof value.replacement_attempted !== "boolean" ||
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
  if (
    value.review_status === "completed" ||
    (value.review_status === "failed" && value.verdict !== null)
  ) {
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
    replacementAttempted: value.replacement_attempted,
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
    leaseExpiresAt: string;
  },
): Promise<{
  created: boolean;
  claimed: boolean;
  claimToken: string | null;
  run: DailyQuestionReviewRunRecord;
}> {
  const claimToken = randomUUID();
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
      claim_token: claimToken,
      heartbeat_at: input.startedAt,
      lease_expires_at: input.leaseExpiresAt,
    })
    .select(RUN_COLUMNS)
    .single();

  if (!error) {
    const run = requireRun(data);
    return { created: true, claimed: true, claimToken, run };
  }
  if (!isUniqueConflict(error)) throw error;

  const existing = await claimExistingDailyQuestionReviewRun(client, {
    reviewDate: input.reviewDate,
    challengeDate: input.challengeDate,
    claimedAt: input.startedAt,
    leaseExpiresAt: input.leaseExpiresAt,
  });
  if (!existing.run) {
    throw new Error("Conflicting daily review run could not be loaded.");
  }
  return { created: false, ...existing, run: existing.run };
}

export async function claimExistingDailyQuestionReviewRun(
  client: ServerSupabaseClient,
  input: {
    reviewDate: string;
    challengeDate: string;
    claimedAt: string;
    leaseExpiresAt: string;
  },
): Promise<{
  claimed: boolean;
  claimToken: string | null;
  run: DailyQuestionReviewRunRecord | null;
}> {
  const { data, error } = await client.rpc("claim_daily_question_review_run", {
    p_review_date: input.reviewDate,
    p_challenge_date: input.challengeDate,
    p_claimed_at: input.claimedAt,
    p_lease_expires_at: input.leaseExpiresAt,
  });
  throwIfError(error);
  if (!isRecord(data) || typeof data.outcome !== "string") {
    throw new Error("Daily review claim returned invalid data.");
  }
  if (data.outcome === "missing") {
    return { claimed: false, claimToken: null, run: null };
  }
  if (
    (data.outcome !== "claimed" && data.outcome !== "observed") ||
    !isUuid(data.run_id) ||
    (data.outcome === "claimed" && !isUuid(data.claim_token))
  ) {
    throw new Error("Daily review claim returned invalid data.");
  }

  const runResult = await client
    .from("daily_question_review_runs")
    .select(RUN_COLUMNS)
    .eq("id", data.run_id)
    .maybeSingle();
  throwIfError(runResult.error);
  const run = requireRun(runResult.data);
  return {
    claimed: data.outcome === "claimed",
    claimToken: data.outcome === "claimed" ? data.claim_token as string : null,
    run,
  };
}

export async function heartbeatDailyQuestionReviewRun(
  client: ServerSupabaseClient,
  input: {
    runId: string;
    claimToken: string;
    heartbeatAt: string;
    leaseExpiresAt: string;
  },
): Promise<boolean> {
  const { data, error } = await client.rpc("heartbeat_daily_question_review_run", {
    p_run_id: input.runId,
    p_claim_token: input.claimToken,
    p_heartbeat_at: input.heartbeatAt,
    p_lease_expires_at: input.leaseExpiresAt,
  });
  throwIfError(error);
  if (!isRecord(data) || typeof data.renewed !== "boolean") {
    throw new Error("Daily review heartbeat returned invalid data.");
  }
  return data.renewed;
}

export async function upsertDailyQuestionReviewItem(
  client: ServerSupabaseClient,
  input: {
    runId: string;
    claimToken: string;
    heartbeatAt: string;
    leaseExpiresAt: string;
    dailyChallengeId: string;
    slot: number;
    question: QuestionSnapshot;
    reviewStatus: DailyQuestionReviewItemStatus;
    sourceFetchResults: DailyQuestionSourceFetchResult[];
    finding: DailyQuestionVerificationFinding | null;
    replacement: DailyQuestionReplacementCandidate | null;
    replacementAttempted?: boolean;
    runErrors: DailyQuestionReviewRunError[];
    usageEvent: null | {
      id: string;
      phase: "primary" | "replacement";
      inputTokens: number;
      cachedInputTokens: number;
      cacheWriteTokens: number;
      outputTokens: number;
      webSearchCalls: number;
      estimatedCostMicrodollars: number;
    };
  },
): Promise<{
  item: DailyQuestionReviewItemRecord;
  run: DailyQuestionReviewRunRecord;
  usageApplied: boolean;
}> {
  const finding = input.finding;
  const replacement = input.replacement;
  const usage = input.usageEvent;
  const { data, error } = await client.rpc(
    "persist_daily_question_review_progress",
    {
      p_run_id: input.runId,
      p_claim_token: input.claimToken,
      p_heartbeat_at: input.heartbeatAt,
      p_lease_expires_at: input.leaseExpiresAt,
      p_daily_challenge_id: input.dailyChallengeId,
      p_slot: input.slot,
      p_question_id: input.question.id,
      p_question_snapshot: input.question,
      p_review_status: input.reviewStatus,
      p_source_fetch_results: input.sourceFetchResults,
      p_verdict: finding?.verdict ?? null,
      p_confidence: finding?.confidence ?? null,
      p_explanation: finding?.explanation ?? null,
      p_conflicts: finding?.conflicts ?? [],
      p_evidence: finding?.evidence ?? [],
      p_verified_at: finding?.verifiedAt ?? null,
      p_replacement_attempted:
        input.replacementAttempted ?? replacement !== null,
      p_replacement_question_id: replacement?.questionId ?? null,
      p_replacement_eligible: replacement?.eligible ?? false,
      p_replacement_question_snapshot: replacement?.snapshot ?? null,
      p_replacement_finding: replacement?.finding ?? null,
      p_run_errors: input.runErrors,
      p_usage_event_id: usage?.id ?? null,
      p_usage_phase: usage?.phase ?? null,
      p_input_tokens: usage?.inputTokens ?? 0,
      p_cached_input_tokens: usage?.cachedInputTokens ?? 0,
      p_cache_write_tokens: usage?.cacheWriteTokens ?? 0,
      p_output_tokens: usage?.outputTokens ?? 0,
      p_search_count: usage?.webSearchCalls ?? 0,
      p_estimated_cost_microdollars: usage?.estimatedCostMicrodollars ?? 0,
    },
  );
  throwIfError(error);
  if (isRecord(data) && data.outcome === "lost_lease") {
    throw new Error("Daily review lease ownership was lost.");
  }
  if (
    !isRecord(data) ||
    data.outcome !== "persisted" ||
    typeof data.usage_applied !== "boolean"
  ) {
    throw new Error("Daily review progress persistence returned invalid data.");
  }
  return {
    item: requireItem(data.item),
    run: requireRun(data.run),
    usageApplied: data.usage_applied,
  };
}

export async function completeDailyQuestionReviewRun(
  client: ServerSupabaseClient,
  input: {
    runId: string;
    claimToken: string;
    reservationId: string;
    status: Extract<DailyQuestionReviewRunStatus, "completed" | "completed_with_flags" | "failed">;
    completedAt: string;
  },
): Promise<DailyQuestionReviewRunRecord> {
  const { data, error } = await client.rpc("finalize_daily_question_review_run", {
    p_run_id: input.runId,
    p_claim_token: input.claimToken,
    p_reservation_id: input.reservationId,
    p_status: input.status,
    p_completed_at: input.completedAt,
  });
  throwIfError(error);
  if (isRecord(data) && data.outcome === "lost_lease") {
    throw new Error("Daily review lease ownership was lost.");
  }
  if (!isRecord(data) || data.outcome !== "completed") {
    throw new Error("Daily review finalization returned invalid data.");
  }
  return requireRun(data.run);
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

export async function loadDailyQuestionReviewByDate(
  client: ServerSupabaseClient,
  challengeDate: string,
) {
  const runResult = await client
    .from("daily_question_review_runs")
    .select(RUN_COLUMNS)
    .eq("challenge_date", challengeDate)
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
  return {
    run,
    items: (Array.isArray(itemResult.data) ? itemResult.data : [])
      .map(parseItem)
      .filter((item): item is DailyQuestionReviewItemRecord => item !== null),
  };
}

export async function loadOldestRecoverableDailyQuestionReview(
  client: ServerSupabaseClient,
  beforeChallengeDate: string,
) {
  const { data, error } = await client.rpc(
    "find_oldest_recoverable_daily_question_review",
    { p_before_challenge_date: beforeChallengeDate },
  );
  throwIfError(error);
  if (data === null) return null;
  if (!isUuid(data)) {
    throw new Error("Recoverable daily review lookup returned invalid data.");
  }
  return loadDailyQuestionReviewByRunId(client, data);
}

export async function loadActiveDailyQuestionReviewReservation(
  client: ServerSupabaseClient,
  challengeDate: string,
): Promise<DailyQuestionReviewReservationContext | null> {
  const { data, error } = await client
    .from("daily_question_review_reservations")
    .select(
      "id,model,reserved_microdollars,run_cost_baseline_microdollars,month_start,month_end",
    )
    .eq("challenge_date", challengeDate)
    .eq("run_kind", "scheduled")
    .eq("status", "active")
    .maybeSingle();
  throwIfError(error);
  if (data === null) return null;
  if (
    !isRecord(data) ||
    !isUuid(data.id) ||
    typeof data.model !== "string" ||
    !data.model.trim() ||
    !isNonnegativeInteger(data.reserved_microdollars) ||
    data.reserved_microdollars === 0 ||
    !isNonnegativeInteger(data.run_cost_baseline_microdollars) ||
    !isTimestamp(data.month_start) ||
    !isTimestamp(data.month_end)
  ) {
    throw new Error("Active daily review reservation data is invalid.");
  }
  return {
    reservationId: data.id,
    acquiredNow: false,
    model: data.model,
    modelDerivedReservationMicrodollars: data.reserved_microdollars,
    requiredReservationMicrodollars: data.reserved_microdollars,
    reservedMicrodollars: data.reserved_microdollars,
    runCostBaselineMicrodollars: data.run_cost_baseline_microdollars,
    monthRange: {
      startInclusive: data.month_start,
      endExclusive: data.month_end,
    },
  };
}

export async function resolveDailyQuestionReviewItem(
  client: ServerSupabaseClient,
  input: {
    action: "keep" | "replace";
    challengeDate: string;
    reviewItemId: string;
    replacementQuestionId: string | null;
    resolvedBy: string;
  },
) {
  const { data, error } = await client.rpc("resolve_daily_question_review_item", {
    p_review_item_id: input.reviewItemId,
    p_challenge_date: input.challengeDate,
    p_action: input.action,
    p_replacement_question_id: input.replacementQuestionId,
    p_resolved_by: input.resolvedBy,
    p_resolved_at: new Date().toISOString(),
  });
  throwIfError(error);
  if (!isRecord(data) || typeof data.outcome !== "string") {
    throw new Error("Daily review resolution returned invalid data.");
  }
  return data;
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
  if (!data.acquired) {
    return {
      acquired: false,
      denialCreated: data.denial_created === true,
    };
  }
  if (
    typeof data.created !== "boolean" ||
    !isUuid(data.reservation_id) ||
    !isNonnegativeInteger(data.reserved_microdollars) ||
    !isNonnegativeInteger(data.run_cost_baseline_microdollars)
  ) {
    throw new Error("Reservation acquisition returned invalid data.");
  }
  return {
    acquired: true,
    created: data.created,
    reservationId: data.reservation_id,
    reservedMicrodollars: data.reserved_microdollars,
    runCostBaselineMicrodollars: data.run_cost_baseline_microdollars,
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
): Promise<{ created: boolean }> {
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
      budget_email_status: "pending",
    });
  if (error) {
    if (isUniqueConflict(error)) return { created: false };
    throw error;
  }
  return { created: true };
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
    (
      data.outcome !== "reconciled" &&
      data.outcome !== "released" &&
      data.outcome !== "bound"
    ) ||
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

export async function claimDailyQuestionReviewBudgetEmail(
  client: ServerSupabaseClient,
  challengeDate: string,
  attemptedAt: string,
) {
  const { data, error } = await client.rpc(
    "claim_daily_question_review_budget_email",
    {
      p_challenge_date: challengeDate,
      p_attempted_at: attemptedAt,
    },
  );
  throwIfError(error);
  if (
    !isRecord(data) ||
    typeof data.claimed !== "boolean" ||
    !isNonnegativeInteger(data.attempts) ||
    (data.reservation_id !== null && !isUuid(data.reservation_id))
  ) {
    throw new Error("Budget email claim returned invalid data.");
  }
  return {
    claimed: data.claimed,
    reservationId: data.reservation_id as string | null,
    attempts: data.attempts,
  };
}

export async function markDailyQuestionReviewBudgetEmailSent(
  client: ServerSupabaseClient,
  reservationId: string,
  input: { sentAt: string; providerMessageId: string; attempts: number },
): Promise<void> {
  const { error } = await client
    .from("daily_question_review_reservations")
    .update({
      budget_email_status: "sent",
      budget_email_metadata: {
        provider: "resend",
        providerMessageId: input.providerMessageId,
        attempts: input.attempts,
        lastAttemptAt: input.sentAt,
        failure: null,
      },
    })
    .eq("id", reservationId)
    .eq("status", "denied")
    .eq("budget_email_status", "sending");
  throwIfError(error);
}

export async function markDailyQuestionReviewBudgetEmailFailed(
  client: ServerSupabaseClient,
  reservationId: string,
  input: { attemptedAt: string; attempts: number; code: string; message: string },
): Promise<void> {
  const { error } = await client
    .from("daily_question_review_reservations")
    .update({
      budget_email_status: "failed",
      budget_email_metadata: {
        provider: "resend",
        providerMessageId: null,
        attempts: input.attempts,
        lastAttemptAt: input.attemptedAt,
        failure: {
          code: input.code.slice(0, 100),
          message: input.message.slice(0, 1_000),
          occurredAt: input.attemptedAt,
        },
      },
    })
    .eq("id", reservationId)
    .eq("status", "denied")
    .eq("budget_email_status", "sending");
  throwIfError(error);
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
