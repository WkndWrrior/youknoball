import { describe, expect, it, vi } from "vitest";

import type {
  DailyQuestionReviewRunError,
  DailyQuestionSourceFetchResult,
  DailyQuestionVerificationFinding,
} from "@/lib/dailyQuestionReview";
import type { ServerSupabaseClient } from "@/lib/server/supabaseServer";
import {
  acquireDailyQuestionReviewReservation,
  claimDailyQuestionReviewEmail,
  claimDailyQuestionReviewBudgetEmail,
  claimOldestDailyQuestionReviewBudgetEmail,
  completeDailyQuestionReviewRun,
  heartbeatDailyQuestionReviewRun,
  listCurrentMonthDailyQuestionReviewCosts,
  loadActiveDailyQuestionReviewReservation,
  loadDailyQuestionReviewByRunId,
  loadDailyQuestionReviewResolutions,
  loadLatestDailyQuestionReview,
  loadOldestRecoverableDailyQuestionReview,
  markDailyQuestionReviewEmailFailed,
  markDailyQuestionReviewEmailSent,
  markDailyQuestionReviewBudgetEmailFailed,
  markDailyQuestionReviewBudgetEmailSent,
  reconcileDailyQuestionReviewReservation,
  recordDailyQuestionReviewBudgetBlock,
  startOrObserveDailyQuestionReviewRun,
  upsertDailyQuestionReviewItem,
} from "@/lib/server/dailyQuestionReviewRepository";

type QueryResult<T> = { data: T; error: unknown };

function createThenableQuery<T>(result: QueryResult<T>) {
  const query: Record<string, unknown> = {};
  for (const method of [
    "select",
    "insert",
    "upsert",
    "update",
    "eq",
    "neq",
    "gte",
    "lt",
    "in",
    "order",
    "limit",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (
    resolve: (value: QueryResult<T>) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function createClientMock(
  queries: Record<
    string,
    ReturnType<typeof createThenableQuery> |
      Array<ReturnType<typeof createThenableQuery>>
  > = {},
  rpcResults: Record<string, QueryResult<unknown>> = {},
) {
  const calls = new Map<string, number>();
  const client = {
    from: vi.fn((table: string) => {
      const configured = queries[table];
      const index = calls.get(table) ?? 0;
      calls.set(table, index + 1);
      const query = Array.isArray(configured) ? configured[index] : configured;
      if (!query) throw new Error(`Unexpected table: ${table}`);
      return query;
    }),
    rpc: vi.fn(async (name: string) => {
      const result = rpcResults[name];
      if (!result) throw new Error(`Unexpected RPC: ${name}`);
      return result;
    }),
  } as unknown as ServerSupabaseClient;
  return client;
}

const ids = {
  run: "10000000-0000-4000-8000-000000000001",
  challenge: "20000000-0000-4000-8000-000000000001",
  item: "30000000-0000-4000-8000-000000000001",
  question: "40000000-0000-4000-8000-000000000001",
  replacement: "40000000-0000-4000-8000-000000000002",
  reservation: "50000000-0000-4000-8000-000000000001",
  claim: "60000000-0000-4000-8000-000000000001",
  usageEvent: "70000000-0000-4000-8000-000000000001",
};

const timestamp = "2026-08-09T23:00:00.000Z";
const finding: DailyQuestionVerificationFinding = {
  questionId: ids.question,
  verdict: "passed",
  confidence: 0.98,
  explanation: "The saved source supports the expected answer.",
  conflicts: [],
  evidence: [
    {
      url: "https://www.nba.com/example",
      title: "NBA record",
      excerpt: "The record supports the answer.",
      retrievedAt: timestamp,
    },
  ],
  verifiedAt: timestamp,
};

const snapshot = {
  id: ids.question,
  question_text: "Who holds the record?",
  option_a: "Player A",
  option_b: "Player B",
  option_c: "Player C",
  option_d: "Player D",
  correct_option: "A",
  sport: { slug: "nba", name: "NBA" },
  difficulty: "easy",
  source_notes: "https://www.nba.com/example",
} as const;

const runRow = {
  id: ids.run,
  daily_challenge_id: ids.challenge,
  review_date: "2026-08-09",
  challenge_date: "2026-08-10",
  status: "running",
  run_kind: "scheduled",
  model: "gpt-5.6-terra",
  verifier_version: "nightly-question-verifier-v1",
  started_at: timestamp,
  claim_token: ids.claim,
  heartbeat_at: timestamp,
  lease_expires_at: "2026-08-09T23:15:00.000Z",
  completed_at: null,
  input_tokens: 0,
  cached_input_tokens: 0,
  cache_write_tokens: 0,
  output_tokens: 0,
  search_count: 0,
  estimated_cost_microdollars: 0,
  email_status: "pending",
  email_sent_at: null,
  email_metadata: {
    provider: "resend",
    providerMessageId: null,
    attempts: 0,
    lastAttemptAt: null,
    failure: null,
  },
  errors: [],
  created_at: timestamp,
  updated_at: timestamp,
};

const itemRow = {
  id: ids.item,
  run_id: ids.run,
  daily_challenge_id: ids.challenge,
  slot: 1,
  question_id: ids.question,
  question_snapshot: snapshot,
  review_status: "completed",
  verdict: "passed",
  confidence: 0.98,
  explanation: finding.explanation,
  conflicts: [],
  source_fetch_results: [],
  evidence: finding.evidence,
  verified_at: timestamp,
  replacement_attempted: false,
  replacement_question_id: null,
  replacement_eligible: false,
  replacement_question_snapshot: null,
  replacement_finding: null,
  resolution: "pending",
  resolved_by: null,
  resolved_at: null,
  application_metadata: {},
  applied_at: null,
  created_at: timestamp,
  updated_at: "2026-08-09T23:05:00.000Z",
};

const startInput = {
  dailyChallengeId: ids.challenge,
  reviewDate: "2026-08-09",
  challengeDate: "2026-08-10",
  model: "gpt-5.6-terra",
  verifierVersion: "nightly-question-verifier-v1",
  startedAt: timestamp,
  leaseExpiresAt: "2026-08-09T23:15:00.000Z",
};

describe("startOrObserveDailyQuestionReviewRun", () => {
  it("creates a running scheduled run and reports ownership", async () => {
    const insert = createThenableQuery({ data: runRow, error: null });
    const client = createClientMock({ daily_question_review_runs: insert });

    const result = await startOrObserveDailyQuestionReviewRun(client, startInput);

    expect(result).toMatchObject({ created: true, claimed: true, run: { id: ids.run } });
    expect(result.run).not.toHaveProperty("claimToken");

    expect(insert.insert).toHaveBeenCalledWith({
      daily_challenge_id: ids.challenge,
      review_date: "2026-08-09",
      challenge_date: "2026-08-10",
      status: "running",
      run_kind: "scheduled",
      model: "gpt-5.6-terra",
      verifier_version: "nightly-question-verifier-v1",
      started_at: timestamp,
      claim_token: expect.any(String),
      heartbeat_at: timestamp,
      lease_expires_at: "2026-08-09T23:15:00.000Z",
    });
    expect(insert.select).toHaveBeenCalledWith(expect.stringContaining("estimated_cost_microdollars"));
  });

  it("recovers a unique conflict by loading and observing the existing run", async () => {
    const conflict = createThenableQuery({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const existing = createThenableQuery({ data: runRow, error: null });
    const client = createClientMock(
      { daily_question_review_runs: [conflict, existing] },
      {
        claim_daily_question_review_run: {
          data: { outcome: "observed", run_id: ids.run, claim_token: null },
          error: null,
        },
      },
    );

    await expect(
      startOrObserveDailyQuestionReviewRun(client, startInput),
    ).resolves.toMatchObject({ created: false, claimed: false, run: { id: ids.run } });

    expect(client.rpc).toHaveBeenCalledWith("claim_daily_question_review_run", {
      p_challenge_date: "2026-08-10",
      p_claimed_at: timestamp,
      p_lease_expires_at: "2026-08-09T23:15:00.000Z",
      p_review_date: "2026-08-09",
    });
    expect(existing.eq).toHaveBeenCalledWith("id", ids.run);
  });

  it("recovers a review-date unique conflict when the challenge lookup is empty", async () => {
    const conflict = createThenableQuery({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const reviewDateRun = createThenableQuery({
      data: { ...runRow, challenge_date: "2026-08-11" },
      error: null,
    });
    const client = createClientMock(
      { daily_question_review_runs: [conflict, reviewDateRun] },
      {
        claim_daily_question_review_run: {
          data: { outcome: "observed", run_id: ids.run, claim_token: null },
          error: null,
        },
      },
    );

    await expect(
      startOrObserveDailyQuestionReviewRun(client, startInput),
    ).resolves.toMatchObject({
      created: false,
      claimed: false,
      run: { challengeDate: "2026-08-11" },
    });

    expect(reviewDateRun.eq).toHaveBeenCalledWith("id", ids.run);
  });

  it("atomically claims a failed partial run for a deterministic resume", async () => {
    const conflict = createThenableQuery({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const claimed = createThenableQuery({ data: runRow, error: null });
    const client = createClientMock(
      { daily_question_review_runs: [conflict, claimed] },
      {
        claim_daily_question_review_run: {
          data: { outcome: "claimed", run_id: ids.run, claim_token: ids.claim },
          error: null,
        },
      },
    );

    await expect(
      startOrObserveDailyQuestionReviewRun(client, startInput),
    ).resolves.toMatchObject({ created: false, claimed: true, run: { status: "running" } });

    expect(client.rpc).toHaveBeenCalledWith("claim_daily_question_review_run", {
      p_challenge_date: "2026-08-10",
      p_claimed_at: timestamp,
      p_lease_expires_at: "2026-08-09T23:15:00.000Z",
      p_review_date: "2026-08-09",
    });
  });
});

describe("review item persistence", () => {
  it("atomically fences an item upsert, usage increment, and lease renewal", async () => {
    const runErrors: DailyQuestionReviewRunError[] = [
      {
        phase: "verification",
        code: "timeout",
        message: "Verifier timed out",
        retryable: true,
        occurredAt: timestamp,
        questionId: ids.question,
      },
    ];
    const progressedRun = {
      ...runRow,
      input_tokens: 120,
      cached_input_tokens: 20,
      cache_write_tokens: 10,
      output_tokens: 30,
      search_count: 2,
      estimated_cost_microdollars: 42_000,
    };
    const client = createClientMock({}, {
      persist_daily_question_review_progress: {
        data: {
          outcome: "persisted",
          usage_applied: true,
          item: itemRow,
          run: progressedRun,
        },
        error: null,
      },
    });

    await expect(
      upsertDailyQuestionReviewItem(client, {
        runId: ids.run,
        claimToken: ids.claim,
        heartbeatAt: timestamp,
        leaseExpiresAt: "2026-08-09T23:15:00.000Z",
        dailyChallengeId: ids.challenge,
        slot: 1,
        question: snapshot,
        reviewStatus: "completed",
        sourceFetchResults: [],
        finding,
        replacement: null,
        replacementAttempted: false,
        runErrors,
        usageEvent: {
          id: ids.usageEvent,
          phase: "primary",
          inputTokens: 120,
          cachedInputTokens: 20,
          cacheWriteTokens: 10,
          outputTokens: 30,
          webSearchCalls: 2,
          estimatedCostMicrodollars: 42_000,
        },
      }),
    ).resolves.toMatchObject({
      usageApplied: true,
      item: { reviewStatus: "completed", finding },
      run: { estimatedCostMicrodollars: 42_000 },
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "persist_daily_question_review_progress",
      expect.objectContaining({
        p_run_id: ids.run,
        p_claim_token: ids.claim,
        p_slot: 1,
        p_usage_event_id: ids.usageEvent,
        p_input_tokens: 120,
        p_estimated_cost_microdollars: 42_000,
        p_run_errors: runErrors,
        p_replacement_attempted: false,
      }),
    );
  });

  it("retains a primary finding on a failed replacement placeholder", async () => {
    const failedRow = {
      ...itemRow,
      review_status: "failed",
      replacement_attempted: true,
    };
    const client = createClientMock({}, {
      persist_daily_question_review_progress: {
        data: {
          outcome: "persisted",
          usage_applied: false,
          item: failedRow,
          run: runRow,
        },
        error: null,
      },
    });

    await expect(upsertDailyQuestionReviewItem(client, {
      runId: ids.run,
      claimToken: ids.claim,
      heartbeatAt: timestamp,
      leaseExpiresAt: "2026-08-09T23:15:00.000Z",
      dailyChallengeId: ids.challenge,
      slot: 1,
      question: snapshot,
      reviewStatus: "failed",
      sourceFetchResults: [],
      finding,
      replacement: null,
      replacementAttempted: true,
      runErrors: [],
      usageEvent: null,
    })).resolves.toMatchObject({
      item: { reviewStatus: "failed", finding, replacementAttempted: true },
    });
  });

  it("persists a terminal no-candidate attempt without a replacement row", async () => {
    const noCandidateRow = {
      ...itemRow,
      replacement_attempted: true,
    };
    const client = createClientMock({}, {
      persist_daily_question_review_progress: {
        data: {
          outcome: "persisted",
          usage_applied: false,
          item: noCandidateRow,
          run: runRow,
        },
        error: null,
      },
    });

    await expect(upsertDailyQuestionReviewItem(client, {
      runId: ids.run,
      claimToken: ids.claim,
      heartbeatAt: timestamp,
      leaseExpiresAt: "2026-08-09T23:15:00.000Z",
      dailyChallengeId: ids.challenge,
      slot: 1,
      question: snapshot,
      reviewStatus: "completed",
      sourceFetchResults: [],
      finding,
      replacement: null,
      replacementAttempted: true,
      runErrors: [],
      usageEvent: null,
    })).resolves.toMatchObject({
      item: {
        reviewStatus: "completed",
        replacement: null,
        replacementAttempted: true,
      },
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "persist_daily_question_review_progress",
      expect.objectContaining({ p_replacement_attempted: true }),
    );
  });

  it("persists a failed item without erasing source progress", async () => {
    const failedSourceResults: DailyQuestionSourceFetchResult[] = [
      {
        sourceUrl: "https://www.nba.com/example",
        finalUrl: null,
        status: "failed",
        httpStatus: null,
        contentType: null,
        attemptedAt: timestamp,
        error: { code: "timeout", message: "Timed out" },
      },
    ];
    const failedRow = {
      ...itemRow,
      review_status: "failed",
      verdict: null,
      confidence: null,
      explanation: null,
      evidence: [],
      source_fetch_results: failedSourceResults,
    };
    const client = createClientMock({}, {
      persist_daily_question_review_progress: {
        data: {
          outcome: "persisted",
          usage_applied: false,
          item: failedRow,
          run: runRow,
        },
        error: null,
      },
    });

    await expect(
      upsertDailyQuestionReviewItem(client, {
        runId: ids.run,
        claimToken: ids.claim,
        heartbeatAt: timestamp,
        leaseExpiresAt: "2026-08-09T23:15:00.000Z",
        dailyChallengeId: ids.challenge,
        slot: 1,
        question: snapshot,
        reviewStatus: "failed",
        sourceFetchResults: failedRow.source_fetch_results,
        finding: null,
        replacement: null,
        replacementAttempted: false,
        runErrors: [],
        usageEvent: null,
      }),
    ).resolves.toMatchObject({ item: { reviewStatus: "failed", finding: null } });
  });

  it("rejects a stale owner without writing item progress or usage", async () => {
    const client = createClientMock({}, {
      persist_daily_question_review_progress: {
        data: { outcome: "lost_lease" },
        error: null,
      },
    });

    await expect(upsertDailyQuestionReviewItem(client, {
      runId: ids.run,
      claimToken: ids.claim,
      heartbeatAt: timestamp,
      leaseExpiresAt: "2026-08-09T23:15:00.000Z",
      dailyChallengeId: ids.challenge,
      slot: 1,
      question: snapshot,
      reviewStatus: "completed",
      sourceFetchResults: [],
      finding,
      replacement: null,
      replacementAttempted: false,
      runErrors: [],
      usageEvent: null,
    })).rejects.toThrow("Daily review lease ownership was lost");
  });
});

describe("run accounting and reads", () => {
  it("completes a partial run with exact integer usage, cost, and errors", async () => {
    const runErrors: DailyQuestionReviewRunError[] = [
      {
        phase: "verification",
        code: "timeout",
        message: "Verifier timed out",
        retryable: true,
        occurredAt: timestamp,
        questionId: ids.question,
      },
    ];
    const completedRow = {
      ...runRow,
      status: "failed",
      completed_at: timestamp,
      input_tokens: 120,
      cached_input_tokens: 20,
      cache_write_tokens: 10,
      output_tokens: 30,
      search_count: 2,
      estimated_cost_microdollars: 42_000,
      errors: runErrors,
    };
    const client = createClientMock({}, {
      finalize_daily_question_review_run: {
        data: {
          outcome: "completed",
          run: completedRow,
          actual_microdollars: 42_000,
        },
        error: null,
      },
    });

    await expect(
      completeDailyQuestionReviewRun(client, {
        runId: ids.run,
        claimToken: ids.claim,
        reservationId: ids.reservation,
        status: "failed",
        completedAt: timestamp,
      }),
    ).resolves.toMatchObject({ status: "failed", estimatedCostMicrodollars: 42_000 });

    expect(client.rpc).toHaveBeenCalledWith(
      "finalize_daily_question_review_run",
      expect.objectContaining({
        p_run_id: ids.run,
        p_claim_token: ids.claim,
        p_reservation_id: ids.reservation,
        p_status: "failed",
        p_completed_at: timestamp,
      }),
    );
    expect(client.rpc).not.toHaveBeenCalledWith(
      "finalize_daily_question_review_run",
      expect.objectContaining({ p_errors: expect.anything() }),
    );
  });

  it("rejects stale-owner completion without reconciling the reservation", async () => {
    const client = createClientMock({}, {
      finalize_daily_question_review_run: {
        data: { outcome: "lost_lease" },
        error: null,
      },
    });

    await expect(completeDailyQuestionReviewRun(client, {
      runId: ids.run,
      claimToken: ids.claim,
      reservationId: ids.reservation,
      status: "failed",
      completedAt: timestamp,
    })).rejects.toThrow("Daily review lease ownership was lost");
  });

  it("queries only actual current-month run spend with an explicit projection", async () => {
    const rows = [
      {
        id: ids.run,
        status: "completed",
        completed_at: timestamp,
        estimated_cost_microdollars: 42_000,
      },
      { id: "bad", status: "completed", completed_at: timestamp, estimated_cost_microdollars: -1 },
    ];
    const query = createThenableQuery({ data: rows, error: null });
    const client = createClientMock({ daily_question_review_runs: query });

    await expect(
      listCurrentMonthDailyQuestionReviewCosts(client, {
        startInclusive: "2026-08-01T05:00:00.000Z",
        endExclusive: "2026-09-01T05:00:00.000Z",
      }),
    ).resolves.toEqual([
      {
        id: ids.run,
        status: "completed",
        occurredAt: timestamp,
        estimatedCostMicrodollars: 42_000,
      },
    ]);

    expect(query.select).toHaveBeenCalledWith("id,status,completed_at,estimated_cost_microdollars");
    expect(query.gte).toHaveBeenCalledWith("completed_at", "2026-08-01T05:00:00.000Z");
    expect(query.lt).toHaveBeenCalledWith("completed_at", "2026-09-01T05:00:00.000Z");
  });

  it("loads the latest normalized review and its items", async () => {
    const run = createThenableQuery({ data: runRow, error: null });
    const items = createThenableQuery({ data: [itemRow, { id: "malformed" }], error: null });
    const client = createClientMock({
      daily_question_review_runs: run,
      daily_question_review_items: items,
    });

    await expect(loadLatestDailyQuestionReview(client)).resolves.toMatchObject({
      run: { id: ids.run },
      items: [{ id: ids.item, finding }],
    });
    expect(run.order).toHaveBeenCalledWith("review_date", { ascending: false });
    expect(run.limit).toHaveBeenCalledWith(1);
    expect(items.eq).toHaveBeenCalledWith("run_id", ids.run);
  });

  it("loads an exact run and its progress for safe resume", async () => {
    const run = createThenableQuery({ data: runRow, error: null });
    const items = createThenableQuery({ data: [itemRow], error: null });
    const client = createClientMock({
      daily_question_review_runs: run,
      daily_question_review_items: items,
    });

    await expect(
      loadDailyQuestionReviewByRunId(client, ids.run),
    ).resolves.toMatchObject({ run: { id: ids.run }, items: [{ id: ids.item }] });
    expect(run.eq).toHaveBeenCalledWith("id", ids.run);
    expect(items.eq).toHaveBeenCalledWith("run_id", ids.run);
  });

  it("loads the oldest recoverable prior run selected by SQL", async () => {
    const run = createThenableQuery({ data: runRow, error: null });
    const items = createThenableQuery({ data: [itemRow], error: null });
    const client = createClientMock(
      {
        daily_question_review_runs: run,
        daily_question_review_items: items,
      },
      {
        find_oldest_recoverable_daily_question_review: {
          data: ids.run,
          error: null,
        },
      },
    );

    await expect(
      loadOldestRecoverableDailyQuestionReview(client, "2026-08-11"),
    ).resolves.toMatchObject({ run: { id: ids.run }, items: [{ id: ids.item }] });
    expect(client.rpc).toHaveBeenCalledWith(
      "find_oldest_recoverable_daily_question_review",
      { p_before_challenge_date: "2026-08-11" },
    );
  });

  it("loads an existing active reservation for prior-run recovery", async () => {
    const reservation = createThenableQuery({
      data: {
        id: ids.reservation,
        model: "gpt-5.6-terra",
        reserved_microdollars: 5_040_000,
        run_cost_baseline_microdollars: 200,
        month_start: "2026-08-01T05:00:00.000Z",
        month_end: "2026-09-01T05:00:00.000Z",
      },
      error: null,
    });
    const client = createClientMock({
      daily_question_review_reservations: reservation,
    });

    await expect(
      loadActiveDailyQuestionReviewReservation(client, "2026-08-10"),
    ).resolves.toMatchObject({
      reservationId: ids.reservation,
      acquiredNow: false,
      reservedMicrodollars: 5_040_000,
      runCostBaselineMicrodollars: 200,
    });
    expect(reservation.eq).toHaveBeenCalledWith("challenge_date", "2026-08-10");
    expect(reservation.eq).toHaveBeenCalledWith("status", "active");
  });

  it("loads only completed normalized resolutions", async () => {
    const resolved = {
      ...itemRow,
      resolution: "kept",
      resolved_by: "60000000-0000-4000-8000-000000000001",
      resolved_at: timestamp,
    };
    const query = createThenableQuery({ data: [resolved, { id: "bad" }], error: null });
    const client = createClientMock({ daily_question_review_items: query });

    await expect(loadDailyQuestionReviewResolutions(client, ids.run)).resolves.toEqual([
      expect.objectContaining({ id: ids.item, resolution: "kept" }),
    ]);
    expect(query.neq).toHaveBeenCalledWith("resolution", "pending");
  });
});

describe("reservation and email state", () => {
  it("renews a running lease through the token-fenced heartbeat RPC", async () => {
    const client = createClientMock({}, {
      heartbeat_daily_question_review_run: {
        data: { renewed: true },
        error: null,
      },
    });

    await expect(heartbeatDailyQuestionReviewRun(client, {
      runId: ids.run,
      claimToken: ids.claim,
      heartbeatAt: timestamp,
      leaseExpiresAt: "2026-08-09T23:15:00.000Z",
    })).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith(
      "heartbeat_daily_question_review_run",
      {
        p_run_id: ids.run,
        p_claim_token: ids.claim,
        p_heartbeat_at: timestamp,
        p_lease_expires_at: "2026-08-09T23:15:00.000Z",
      },
    );
  });

  it("acquires the exact worst-case reservation through the atomic RPC", async () => {
    const client = createClientMock({}, {
      acquire_daily_question_review_reservation: {
        data: {
          acquired: true,
          created: true,
          reservation_id: ids.reservation,
          reserved_microdollars: 5_040_000,
          run_cost_baseline_microdollars: 200,
        },
        error: null,
      },
    });

    await expect(
      acquireDailyQuestionReviewReservation(client, {
        model: "gpt-5.6-terra",
        modelDerivedReservationMicrodollars: 5_040_000,
        requiredReservationMicrodollars: 5_040_000,
        monthRange: {
          startInclusive: "2026-08-01T05:00:00.000Z",
          endExclusive: "2026-09-01T05:00:00.000Z",
        },
        spentMicrodollars: 0,
        limitMicrodollars: 10_000_000,
        remainingMicrodollars: 10_000_000,
      }, {
        reviewDate: "2026-08-09",
        challengeDate: "2026-08-10",
        now: timestamp,
      }),
    ).resolves.toEqual({
      acquired: true,
      created: true,
      reservationId: ids.reservation,
      reservedMicrodollars: 5_040_000,
      runCostBaselineMicrodollars: 200,
    });

    expect(client.rpc).toHaveBeenCalledWith("acquire_daily_question_review_reservation", {
      p_challenge_date: "2026-08-10",
      p_limit_microdollars: 10_000_000,
      p_model: "gpt-5.6-terra",
      p_model_derived_reservation_microdollars: 5_040_000,
      p_month_end: "2026-09-01T05:00:00.000Z",
      p_month_start: "2026-08-01T05:00:00.000Z",
      p_now: timestamp,
      p_required_reservation_microdollars: 5_040_000,
      p_review_date: "2026-08-09",
    });
  });

  it("propagates whether an atomic budget denial was created", async () => {
    const client = createClientMock({}, {
      acquire_daily_question_review_reservation: {
        data: {
          acquired: false,
          reason: "monthly_budget_exceeded",
          denial_created: true,
        },
        error: null,
      },
    });

    await expect(
      acquireDailyQuestionReviewReservation(client, {
        model: "gpt-5.6-terra",
        modelDerivedReservationMicrodollars: 5_040_000,
        requiredReservationMicrodollars: 5_040_000,
        monthRange: {
          startInclusive: "2026-08-01T05:00:00.000Z",
          endExclusive: "2026-09-01T05:00:00.000Z",
        },
        spentMicrodollars: 0,
        limitMicrodollars: 10_000_000,
        remainingMicrodollars: 10_000_000,
      }, {
        reviewDate: "2026-08-09",
        challengeDate: "2026-08-10",
        now: timestamp,
      }),
    ).resolves.toEqual({ acquired: false, denialCreated: true });
  });

  it("persists one reportable budget block and tolerates an idempotent conflict", async () => {
    const insert = createThenableQuery({ data: null, error: null });
    const client = createClientMock({
      daily_question_review_reservations: insert,
    });

    await expect(
      recordDailyQuestionReviewBudgetBlock(client, {
        reviewDate: "2026-08-09",
        challengeDate: "2026-08-10",
        model: "gpt-5.6-terra",
        reservedMicrodollars: 5_040_000,
        remainingMicrodollars: 2_000_000,
        monthRange: {
          startInclusive: "2026-08-01T05:00:00.000Z",
          endExclusive: "2026-09-01T05:00:00.000Z",
        },
        attemptedAt: timestamp,
        reason: "monthly_budget_exceeded",
      }),
    ).resolves.toEqual({ created: true });
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      challenge_date: "2026-08-10",
      status: "denied",
      reserved_microdollars: 5_040_000,
      denial_reason: "monthly_budget_exceeded",
    }));

    const conflict = createThenableQuery({
      data: null,
      error: { code: "23505", message: "already recorded" },
    });
    const conflictClient = createClientMock({
      daily_question_review_reservations: conflict,
    });
    await expect(
      recordDailyQuestionReviewBudgetBlock(conflictClient, {
        reviewDate: "2026-08-09",
        challengeDate: "2026-08-10",
        model: "gpt-5.6-terra",
        reservedMicrodollars: 5_040_000,
        remainingMicrodollars: 2_000_000,
        monthRange: {
          startInclusive: "2026-08-01T05:00:00.000Z",
          endExclusive: "2026-09-01T05:00:00.000Z",
        },
        attemptedAt: timestamp,
        reason: "monthly_budget_exceeded",
      }),
    ).resolves.toEqual({ created: false });
  });

  it("persists an unsupported-model budget block with a zero reservation", async () => {
    const insert = createThenableQuery({ data: null, error: null });
    const client = createClientMock({
      daily_question_review_reservations: insert,
    });

    await recordDailyQuestionReviewBudgetBlock(client, {
      reviewDate: "2026-08-09",
      challengeDate: "2026-08-10",
      model: "unsupported-model",
      reservedMicrodollars: 0,
      remainingMicrodollars: 10_000_000,
      monthRange: {
        startInclusive: "2026-08-01T05:00:00.000Z",
        endExclusive: "2026-09-01T05:00:00.000Z",
      },
      attemptedAt: timestamp,
      reason: "unsupported_model",
    });

    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      model: "unsupported-model",
      status: "denied",
      reserved_microdollars: 0,
      denial_reason: "unsupported_model",
    }));
  });

  it("reconciles charged failure usage through an atomic RPC", async () => {
    const client = createClientMock({}, {
      reconcile_daily_question_review_reservation: {
        data: { outcome: "reconciled", actual_microdollars: 84_000 },
        error: null,
      },
    });

    await expect(
      reconcileDailyQuestionReviewReservation(client, {
        reservationId: ids.reservation,
        actualMicrodollars: 84_000,
        reconciledAt: timestamp,
      }),
    ).resolves.toEqual({ outcome: "reconciled", actualMicrodollars: 84_000 });
  });

  it("accepts refusal to release a reservation now bound to a run", async () => {
    const client = createClientMock({}, {
      reconcile_daily_question_review_reservation: {
        data: { outcome: "bound", actual_microdollars: 0 },
        error: null,
      },
    });

    await expect(
      reconcileDailyQuestionReviewReservation(client, {
        reservationId: ids.reservation,
        actualMicrodollars: 0,
        reconciledAt: timestamp,
      }),
    ).resolves.toEqual({ outcome: "bound", actualMicrodollars: 0 });
  });

  it("claims retryable email atomically and persists sent and failed states", async () => {
    const claimClient = createClientMock({}, {
      claim_daily_question_review_email: {
        data: { claimed: true, attempts: 2 },
        error: null,
      },
    });
    await expect(
      claimDailyQuestionReviewEmail(claimClient, ids.run, timestamp),
    ).resolves.toEqual({ claimed: true, attempts: 2 });

    const sentQuery = createThenableQuery({
      data: {
        ...runRow,
        email_status: "sent",
        email_sent_at: timestamp,
        email_metadata: {
          provider: "resend",
          providerMessageId: "message-1",
          attempts: 1,
          lastAttemptAt: timestamp,
          failure: null,
        },
      },
      error: null,
    });
    const sentClient = createClientMock({ daily_question_review_runs: sentQuery });
    await expect(
      markDailyQuestionReviewEmailSent(sentClient, ids.run, {
        sentAt: timestamp,
        providerMessageId: "message-1",
        attempts: 1,
      }),
    ).resolves.toMatchObject({ email: { status: "sent" } });

    const failedQuery = createThenableQuery({
      data: {
        ...runRow,
        email_status: "failed",
        email_metadata: {
          provider: "resend",
          providerMessageId: null,
          attempts: 1,
          lastAttemptAt: timestamp,
          failure: { code: "send_failed", message: "No route", occurredAt: timestamp },
        },
      },
      error: null,
    });
    const failedClient = createClientMock({ daily_question_review_runs: failedQuery });
    await expect(
      markDailyQuestionReviewEmailFailed(failedClient, ids.run, {
        attemptedAt: timestamp,
        attempts: 1,
        code: "send_failed",
        message: "No route",
      }),
    ).resolves.toMatchObject({ email: { status: "failed" } });
  });

  it("claims and records retryable budget-denial email delivery", async () => {
    const claimClient = createClientMock({}, {
      claim_daily_question_review_budget_email: {
        data: {
          claimed: true,
          reservation_id: ids.reservation,
          attempts: 2,
        },
        error: null,
      },
    });
    await expect(
      claimDailyQuestionReviewBudgetEmail(
        claimClient,
        "2026-08-10",
        timestamp,
      ),
    ).resolves.toEqual({
      claimed: true,
      reservationId: ids.reservation,
      attempts: 2,
    });

    const sent = createThenableQuery({ data: null, error: null });
    await expect(
      markDailyQuestionReviewBudgetEmailSent(
        createClientMock({ daily_question_review_reservations: sent }),
        ids.reservation,
        {
          sentAt: timestamp,
          providerMessageId: "message-1",
          attempts: 2,
        },
      ),
    ).resolves.toBeUndefined();
    expect(sent.update).toHaveBeenCalledWith(expect.objectContaining({
      budget_email_status: "sent",
    }));

    const failed = createThenableQuery({ data: null, error: null });
    await expect(
      markDailyQuestionReviewBudgetEmailFailed(
        createClientMock({ daily_question_review_reservations: failed }),
        ids.reservation,
        {
          attemptedAt: timestamp,
          attempts: 2,
          code: "email_failed",
          message: "No route",
        },
      ),
    ).resolves.toBeUndefined();
    expect(failed.update).toHaveBeenCalledWith(expect.objectContaining({
      budget_email_status: "failed",
    }));
  });

  it("atomically claims the oldest retryable prior budget-denial email", async () => {
    const client = createClientMock({}, {
      claim_oldest_daily_question_review_budget_email: {
        data: {
          claimed: true,
          reservation_id: ids.reservation,
          challenge_date: "2026-08-08",
          reason: "monthly_budget_exceeded",
          reserved_microdollars: 5_040_000,
          remaining_microdollars: 2_000_000,
          attempts: 3,
        },
        error: null,
      },
    });

    await expect(
      claimOldestDailyQuestionReviewBudgetEmail(
        client,
        "2026-08-10",
        timestamp,
      ),
    ).resolves.toEqual({
      claimed: true,
      reservationId: ids.reservation,
      challengeDate: "2026-08-08",
      reason: "monthly_budget_exceeded",
      reservedMicrodollars: 5_040_000,
      remainingMicrodollars: 2_000_000,
      attempts: 3,
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "claim_oldest_daily_question_review_budget_email",
      {
        p_before_challenge_date: "2026-08-10",
        p_attempted_at: timestamp,
      },
    );
  });
});
