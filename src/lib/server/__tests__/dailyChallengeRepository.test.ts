import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getChallengeForDate,
  getChallengeResolutionForDate,
  getPlayerSportCategoryPerformance,
  getServeableChallengeForDate,
  prepareDailyChallengeDraftForDate,
  resolveCanonicalChallengeIdForDate,
} from "@/lib/server/dailyChallengeRepository";

type QueryResult<T> = {
  data: T;
  error: unknown;
};

const { supabaseAdmin, generateDailyChallengeQuestions } = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  generateDailyChallengeQuestions: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

vi.mock("@/lib/server/dailyChallengeGenerator", () => ({
  generateDailyChallengeQuestions,
}));

function createThenableQuery<T>(result: QueryResult<T>) {
  const query: Record<string, unknown> = {};

  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.delete = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  query.then = (resolve: (value: QueryResult<T>) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);

  return query;
}

function createClientMock(
  queries: Record<
    string,
    ReturnType<typeof createThenableQuery> | Array<ReturnType<typeof createThenableQuery>>
  >,
  rpcResults: Record<
    string,
    ReturnType<typeof createThenableQuery> | Array<ReturnType<typeof createThenableQuery>>
  > = {},
) {
  const tableCallCounts = new Map<string, number>();
  const rpcCallCounts = new Map<string, number>();

  return {
    from: vi.fn((table: string) => {
      const queryConfig = queries[table];
      const callCount = tableCallCounts.get(table) ?? 0;
      tableCallCounts.set(table, callCount + 1);

      const query = Array.isArray(queryConfig)
        ? queryConfig[callCount]
        : queryConfig;

      if (!query) {
        throw new Error(`Unexpected table: ${table}`);
      }

      return query;
    }),
    rpc: vi.fn((name: string) => {
      const resultConfig = rpcResults[name];
      const callCount = rpcCallCounts.get(name) ?? 0;
      rpcCallCounts.set(name, callCount + 1);
      const result = Array.isArray(resultConfig)
        ? resultConfig[callCount]
        : resultConfig;
      if (!result) {
        throw new Error(`Unexpected RPC: ${name}`);
      }
      return result;
    }),
  };
}

const QUESTION_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
] as const;

const canonicalRows = [
  {
    id: "canonical_1",
    slot: 1,
    question_snapshot: {
      id: QUESTION_IDS[0],
      difficulty: "easy",
      question_text: "Canonical question 1",
      option_a: "A1",
      option_b: "B1",
      option_c: "C1",
      option_d: "D1",
      correct_option: "B",
      sport: {
        id: "sport_1",
        slug: "nba",
        name: "NBA",
        is_active: true,
        sort_order: 10,
        created_at: "2026-04-01T00:00:00Z",
      },
    },
  },
  {
    id: "canonical_2",
    slot: 2,
    question_snapshot: {
      id: QUESTION_IDS[1],
      difficulty: "medium",
      question_text: "Canonical question 2",
      option_a: "A2",
      option_b: "B2",
      option_c: "C2",
      option_d: "D2",
      correct_option: "C",
      sport: {
        id: "sport_2",
        slug: "nfl",
        name: "NFL",
        is_active: true,
        sort_order: 20,
        created_at: "2026-04-01T00:00:00Z",
      },
    },
  },
  {
    id: "canonical_3",
    slot: 3,
    question_snapshot: {
      id: QUESTION_IDS[2],
      difficulty: "hard",
      question_text: "Canonical question 3",
      option_a: "A3",
      option_b: "B3",
      option_c: "C3",
      option_d: "D3",
      correct_option: "A",
      sport: {
        id: "sport_3",
        slug: "nhl",
        name: "NHL",
        is_active: true,
        sort_order: 30,
        created_at: "2026-04-01T00:00:00Z",
      },
    },
  },
  {
    id: "canonical_4",
    slot: 4,
    question_snapshot: {
      id: QUESTION_IDS[3],
      difficulty: "easy",
      question_text: "Canonical question 4",
      option_a: "A4",
      option_b: "B4",
      option_c: "C4",
      option_d: "D4",
      correct_option: "D",
      sport: {
        id: "sport_4",
        slug: "cbb",
        name: "CBB",
        is_active: true,
        sort_order: 40,
        created_at: "2026-04-01T00:00:00Z",
      },
    },
  },
  {
    id: "canonical_5",
    slot: 5,
    question_snapshot: {
      id: QUESTION_IDS[4],
      difficulty: "medium",
      question_text: "Canonical question 5",
      option_a: "A5",
      option_b: "B5",
      option_c: "C5",
      option_d: "D5",
      correct_option: "A",
      sport: {
        id: "sport_5",
        slug: "mlb",
        name: "MLB",
        is_active: true,
        sort_order: 50,
        created_at: "2026-04-01T00:00:00Z",
      },
    },
  },
];

const legacyRows = [
  {
    id: "legacy_1",
    slot: 1,
    sport: "NBA",
    difficulty: "starter" as const,
    question_text: "Legacy question 1",
    option_a: "L1A",
    option_b: "L1B",
    option_c: "L1C",
    option_d: "L1D",
    correct_option: "A" as const,
  },
];

const reusableQuestionRows = canonicalRows.map((row) => {
  const snapshot = row.question_snapshot;

  return {
    ...snapshot,
    status: "ready",
    eligible_for_daily: true,
    eligible_for_sport_quiz: true,
    authoring_method: "manual",
    source_notes: null,
    reviewed_at: "2026-04-01T00:00:00Z",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  };
});

const canonicalQuestions = canonicalRows.map((row) => {
  const snapshot = row.question_snapshot;

  return {
    id: String(snapshot.id),
    slot: row.slot,
    sport: snapshot.sport.name,
    difficulty: row.slot <= 3 ? "starter" : "pro",
    question_text: snapshot.question_text,
    option_a: snapshot.option_a,
    option_b: snapshot.option_b,
    option_c: snapshot.option_c,
    option_d: snapshot.option_d,
    correct_option: snapshot.correct_option,
  };
});

const completeDraftRows = reusableQuestionRows.map((question, index) => ({
  slot: index + 1,
  question_id: question.id,
  question_snapshot: question,
}));

const preparedQuestions = reusableQuestionRows.map((question, index) => ({
  id: question.id,
  slot: index + 1,
  question_text: question.question_text,
  option_a: question.option_a,
  option_b: question.option_b,
  option_c: question.option_c,
  option_d: question.option_d,
  correct_option: question.correct_option,
  sport: {
    slug: question.sport.slug,
    name: question.sport.name,
  },
  difficulty: question.difficulty,
  source_notes: question.source_notes,
}));

describe("prepareDailyChallengeDraftForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateDailyChallengeQuestions.mockReset();
  });

  it("persists five generated snapshots without publishing the draft", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const challengeReadQuery = createThenableQuery({ data: null, error: null });
    const recentChallengesQuery = createThenableQuery({ data: [], error: null });
    const questionQuery = createThenableQuery({
      data: reusableQuestionRows,
      error: null,
    });
    const prepareRpc = createThenableQuery({
      data: { outcome: "created", challenge_id: "generated_challenge_1" },
      error: null,
    });
    const adminClient = createClientMock({
      daily_challenges: [challengeReadQuery, recentChallengesQuery],
      questions: questionQuery,
    }, {
      prepare_daily_challenge_draft: prepareRpc,
    });

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(prepareDailyChallengeDraftForDate("2026-04-02")).resolves.toEqual({
      challengeId: "generated_challenge_1",
      challengeDate: "2026-04-02",
      questionIds: generatedQuestions.map((question) => question.id),
      questions: preparedQuestions,
    });

    expect(generateDailyChallengeQuestions).toHaveBeenCalledWith({
      candidates: reusableQuestionRows,
      recentQuestionIds: [],
    });
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "prepare_daily_challenge_draft",
      {
        p_challenge_date: "2026-04-02",
        p_generated_at: expect.any(String),
        p_generation_method: "auto",
        p_items: generatedQuestions.map(({ slot, ...question }) => ({
          slot,
          question_id: question.id,
          question_snapshot: question,
        })),
        p_rules_version: "v1",
      },
    );
    expect(challengeReadQuery.insert).not.toHaveBeenCalled();
    expect(recentChallengesQuery.insert).not.toHaveBeenCalled();
    expect(questionQuery.insert).not.toHaveBeenCalled();
    expect(adminClient.from).not.toHaveBeenCalledWith("daily_challenge_items");
    expect(adminClient.rpc).not.toHaveBeenCalledWith(
      "publish_daily_challenge",
      expect.anything(),
    );
  });

  it("resolves two concurrent preparations to one complete canonical draft without timing", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const tableQueries = {
      daily_challenges: [
        createThenableQuery({ data: null, error: null }),
        createThenableQuery({ data: null, error: null }),
        createThenableQuery({ data: [], error: null }),
        createThenableQuery({ data: [], error: null }),
        createThenableQuery({
          data: {
            id: "winner_challenge",
            status: "generated",
            generated_at: "2026-04-01T23:00:00Z",
            published_at: null,
          },
          error: null,
        }),
      ],
      daily_challenge_items: createThenableQuery({
        data: completeDraftRows,
        error: null,
      }),
      questions: [
        createThenableQuery({ data: reusableQuestionRows, error: null }),
        createThenableQuery({ data: reusableQuestionRows, error: null }),
      ],
    };
    const prepareRpcs = [
      createThenableQuery({
        data: { outcome: "created", challenge_id: "winner_challenge" },
        error: null,
      }),
      createThenableQuery({
        data: { outcome: "existing", challenge_id: "winner_challenge" },
        error: null,
      }),
    ];
    const adminClient = createClientMock(tableQueries, {
      prepare_daily_challenge_draft: prepareRpcs,
    });

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    const [first, second] = await Promise.all([
      prepareDailyChallengeDraftForDate("2026-04-02"),
      prepareDailyChallengeDraftForDate("2026-04-02"),
    ]);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      challengeId: "winner_challenge",
      questionIds: [...QUESTION_IDS],
    });
    expect(adminClient.rpc).toHaveBeenCalledTimes(2);
    for (const queryConfig of Object.values(tableQueries).flat()) {
      expect(queryConfig.insert).not.toHaveBeenCalled();
    }
  });

  it("keeps a stale draft when atomic cleanup observes it became complete", async () => {
    const staleGeneratedAt = "2026-04-01T00:00:00Z";
    const staleRow = {
      id: "stale_generated_1",
      status: "generated",
      generated_at: staleGeneratedAt,
      published_at: null,
    };
    const staleChallengeRead = createThenableQuery({ data: staleRow, error: null });
    const completedChallengeRead = createThenableQuery({
      data: staleRow,
      error: null,
    });
    const staleItemsRead = createThenableQuery({ data: [], error: null });
    const completedItemsRead = createThenableQuery({
      data: completeDraftRows,
      error: null,
    });
    const adminClient = createClientMock({
      daily_challenges: [staleChallengeRead, completedChallengeRead],
      daily_challenge_items: [staleItemsRead, completedItemsRead],
    }, {
      cleanup_stale_daily_challenge: createThenableQuery({
        data: { outcome: "complete", challenge_id: "stale_generated_1" },
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(prepareDailyChallengeDraftForDate("2026-04-02")).resolves.toMatchObject({
      challengeId: "stale_generated_1",
      questionIds: [...QUESTION_IDS],
    });
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "cleanup_stale_daily_challenge",
      {
        p_challenge_date: "2026-04-02",
        p_challenge_id: "stale_generated_1",
        p_generated_at: staleGeneratedAt,
      },
    );
    expect(generateDailyChallengeQuestions).not.toHaveBeenCalled();
    for (const query of [
      staleChallengeRead,
      completedChallengeRead,
      staleItemsRead,
      completedItemsRead,
    ]) {
      expect(query.delete).not.toHaveBeenCalled();
    }
  });

  it("returns the same complete draft when the same date is prepared twice", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const generatedRow = {
      id: "generated_challenge_1",
      challenge_date: "2026-04-02",
      status: "generated",
      generation_method: "auto",
      rules_version: "v1",
      generated_at: "2026-04-01T23:00:00Z",
      published_at: null,
      created_at: "2026-04-01T23:00:00Z",
    };
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({ data: null, error: null }),
        createThenableQuery({ data: [], error: null }),
        createThenableQuery({ data: generatedRow, error: null }),
      ],
      daily_challenge_items: createThenableQuery({
        data: completeDraftRows,
        error: null,
      }),
      questions: createThenableQuery({ data: reusableQuestionRows, error: null }),
    }, {
      prepare_daily_challenge_draft: createThenableQuery({
        data: { outcome: "created", challenge_id: "generated_challenge_1" },
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    const first = await prepareDailyChallengeDraftForDate("2026-04-02");
    const second = await prepareDailyChallengeDraftForDate("2026-04-02");

    expect(second).toEqual(first);
    expect(generateDailyChallengeQuestions).toHaveBeenCalledTimes(1);
    expect(adminClient.rpc).toHaveBeenCalledTimes(1);
  });

  it("cleans up an incomplete stale draft and prepares a fresh unpublished draft", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({
          data: {
            id: "stale_generated_1",
            status: "generated",
            generated_at: "2026-04-01T00:00:00Z",
            published_at: null,
          },
          error: null,
        }),
        createThenableQuery({ data: [], error: null }),
      ],
      daily_challenge_items: createThenableQuery({ data: [], error: null }),
      questions: createThenableQuery({ data: reusableQuestionRows, error: null }),
    }, {
      cleanup_stale_daily_challenge: createThenableQuery({
        data: { outcome: "deleted", challenge_id: "stale_generated_1" },
        error: null,
      }),
      prepare_daily_challenge_draft: createThenableQuery({
        data: { outcome: "created", challenge_id: "generated_challenge_2" },
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(prepareDailyChallengeDraftForDate("2026-04-02")).resolves.toMatchObject({
      challengeId: "generated_challenge_2",
      challengeDate: "2026-04-02",
      questionIds: generatedQuestions.map((question) => question.id),
    });

    expect(adminClient.rpc).toHaveBeenNthCalledWith(
      1,
      "cleanup_stale_daily_challenge",
      expect.anything(),
    );
    expect(adminClient.rpc).toHaveBeenNthCalledWith(
      2,
      "prepare_daily_challenge_draft",
      expect.anything(),
    );
  });

  it("re-reads and returns the canonical complete draft after the atomic RPC finds it", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({ data: null, error: null }),
        createThenableQuery({ data: [], error: null }),
        createThenableQuery({
          data: {
            id: "canonical_challenge",
            status: "generated",
            generated_at: "2026-04-01T23:00:00Z",
            published_at: null,
          },
          error: null,
        }),
      ],
      daily_challenge_items: createThenableQuery({
        data: completeDraftRows,
        error: null,
      }),
      questions: createThenableQuery({ data: reusableQuestionRows, error: null }),
    }, {
      prepare_daily_challenge_draft: createThenableQuery({
        data: { outcome: "existing", challenge_id: "canonical_challenge" },
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(prepareDailyChallengeDraftForDate("2026-04-02")).resolves.toMatchObject({
      challengeId: "canonical_challenge",
      challengeDate: "2026-04-02",
      questionIds: reusableQuestionRows.map((question) => question.id),
    });

    expect(adminClient.rpc).toHaveBeenCalledWith(
      "prepare_daily_challenge_draft",
      expect.anything(),
    );
  });

  it("rejects a draft item whose relational question id differs from its snapshot", async () => {
    const mismatchedRows = completeDraftRows.map((row, index) =>
      index === 0 ? { ...row, question_id: QUESTION_IDS[1] } : row,
    );
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "generated_challenge_1",
          status: "generated",
          generated_at: new Date().toISOString(),
          published_at: null,
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: mismatchedRows,
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(prepareDailyChallengeDraftForDate("2026-04-02")).rejects.toThrow(
      "Unable to prepare",
    );
  });

  it("rejects empty and malformed verification snapshots", async () => {
    const malformedRows = completeDraftRows.map((row, index) =>
      index === 0
        ? {
            ...row,
            question_snapshot: {
              ...row.question_snapshot,
              id: "not-a-uuid",
              question_text: "   ",
            },
          }
        : row,
    );
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "generated_challenge_1",
          status: "generated",
          generated_at: new Date().toISOString(),
          published_at: null,
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: malformedRows,
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(prepareDailyChallengeDraftForDate("2026-04-02")).rejects.toThrow(
      "Unable to prepare",
    );
  });

  it("rejects malformed challenge dates before reading the database", async () => {
    await expect(prepareDailyChallengeDraftForDate("04/02/2026")).rejects.toThrow(
      "Invalid challenge date",
    );
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects impossible calendar dates in preparation and public resolution", async () => {
    const client = createClientMock({});

    await expect(prepareDailyChallengeDraftForDate("2026-02-30")).rejects.toThrow(
      "Invalid challenge date",
    );
    await expect(
      getChallengeResolutionForDate(client as never, "2026-02-30"),
    ).rejects.toThrow("Invalid challenge date");
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });
});

describe("draft publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("promotes a complete generated draft before serving it publicly", async () => {
    const publishRpc = createThenableQuery({ data: "published", error: null });
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "generated_challenge_1",
          status: "generated",
          generated_at: "2026-04-01T23:00:00Z",
          published_at: null,
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: completeDraftRows,
        error: null,
      }),
    }, {
      publish_daily_challenge: publishRpc,
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(
      getChallengeResolutionForDate(client as never, "2026-04-02"),
    ).resolves.toEqual({
      dailyChallengeId: "generated_challenge_1",
      questions: canonicalQuestions,
    });

    expect(adminClient.rpc).toHaveBeenCalledWith("publish_daily_challenge", {
      p_challenge_id: "generated_challenge_1",
      p_challenge_date: "2026-04-02",
      p_published_at: expect.any(String),
    });
  });

  it("never serves a draft that the publication RPC reports as incomplete", async () => {
    const publishRpc = createThenableQuery({ data: "incomplete", error: null });
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "generated_challenge_1",
          status: "generated",
          generated_at: "2026-04-01T23:00:00Z",
          published_at: null,
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: completeDraftRows,
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({ data: [], error: null }),
    }, {
      publish_daily_challenge: publishRpc,
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(
      getChallengeResolutionForDate(client as never, "2026-04-02"),
    ).resolves.toEqual({ dailyChallengeId: null, questions: [] });
  });

  it("re-reads the canonical challenge when publication loses a race", async () => {
    const publishRpc = createThenableQuery({ data: "conflict", error: null });
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({
          data: {
            id: "generated_challenge_1",
            status: "generated",
            generated_at: "2026-04-01T23:00:00Z",
            published_at: null,
          },
          error: null,
        }),
        createThenableQuery({
          data: {
            id: "generated_challenge_1",
            status: "published",
            generated_at: "2026-04-01T23:00:00Z",
            published_at: "2026-04-02T05:00:00Z",
          },
          error: null,
        }),
      ],
      daily_challenge_items: [
        createThenableQuery({ data: completeDraftRows, error: null }),
        createThenableQuery({ data: canonicalRows, error: null }),
      ],
    }, {
      publish_daily_challenge: publishRpc,
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(
      getChallengeResolutionForDate(client as never, "2026-04-02"),
    ).resolves.toEqual({
      dailyChallengeId: "generated_challenge_1",
      questions: canonicalQuestions,
    });
  });

  it("does not delete a stale draft after another request publishes it", async () => {
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({
          data: {
            id: "generated_challenge_1",
            status: "generated",
            generated_at: "2026-04-01T00:00:00Z",
            published_at: null,
          },
          error: null,
        }),
        createThenableQuery({
          data: {
            id: "generated_challenge_1",
            status: "published",
            generated_at: "2026-04-01T00:00:00Z",
            published_at: "2026-04-02T05:00:00Z",
          },
          error: null,
        }),
      ],
      daily_challenge_items: [
        createThenableQuery({ data: [], error: null }),
        createThenableQuery({ data: canonicalRows, error: null }),
      ],
      daily_challenge_questions: createThenableQuery({ data: [], error: null }),
    }, {
      cleanup_stale_daily_challenge: createThenableQuery({
        data: { outcome: "conflict", challenge_id: "generated_challenge_1" },
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(
      getChallengeResolutionForDate(client as never, "2026-04-02"),
    ).resolves.toEqual({
      dailyChallengeId: "generated_challenge_1",
      questions: canonicalQuestions,
    });

    expect(adminClient.rpc).toHaveBeenCalledWith(
      "cleanup_stale_daily_challenge",
      expect.objectContaining({ p_challenge_id: "generated_challenge_1" }),
    );
  });
});

describe("getPlayerSportCategoryPerformance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateDailyChallengeQuestions.mockReset();
  });

  it("derives signed-in player sport performance from canonical attempts", async () => {
    const attemptsQuery = createThenableQuery({
      data: [
        {
          daily_challenge_id: "challenge_1",
          challenge_date: "2026-05-01",
          answers: {
            question_nba: "A",
            question_nfl: "B",
            question_nhl: "C",
            question_mlb: "A",
          },
        },
        {
          daily_challenge_id: "challenge_2",
          challenge_date: "2026-05-02",
          created_at: "not-a-date",
          answers: {
            question_nfl_2: "A",
          },
        },
      ],
      error: null,
    });
    const itemsQuery = createThenableQuery({
      data: [
        {
          daily_challenge_id: "challenge_1",
          question_id: "question_nba",
          question_snapshot: {
            id: "question_nba",
            question_text: "NBA",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "A",
            sport: { slug: "nba", name: "NBA" },
          },
        },
        {
          daily_challenge_id: "challenge_1",
          question_id: "question_nfl",
          question_snapshot: {
            id: "question_nfl",
            question_text: "NFL",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "C",
            sport: { slug: "nfl", name: "NFL" },
          },
        },
        {
          daily_challenge_id: "challenge_1",
          question_id: "question_mlb",
          question_snapshot: {
            id: "question_mlb",
            question_text: "MLB",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "A",
            sport: { slug: "mlb", name: "MLB" },
          },
        },
        {
          daily_challenge_id: "challenge_2",
          question_id: "question_nfl_2",
          question_snapshot: {
            id: "question_nfl_2",
            question_text: "NFL 2",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "A",
            sport: { slug: "nfl", name: "NFL" },
          },
        },
      ],
      error: null,
    });
    const adminClient = createClientMock({
      daily_attempts: attemptsQuery,
      daily_challenge_items: itemsQuery,
      sport_quiz_attempts: createThenableQuery({
        data: [],
        error: null,
      }),
    });
    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getPlayerSportCategoryPerformance("user_1")).resolves.toEqual([
      { slug: "mlb", answeredCount: 1, correctCount: 1, lastAnsweredAt: "2026-05-01" },
      { slug: "nba", answeredCount: 1, correctCount: 1, lastAnsweredAt: "2026-05-01" },
      { slug: "nfl", answeredCount: 2, correctCount: 1, lastAnsweredAt: "2026-05-02" },
    ]);
    expect(attemptsQuery.select).toHaveBeenCalledWith(
      "daily_challenge_id,challenge_date,created_at,answers",
    );
    expect(attemptsQuery.eq).toHaveBeenCalledWith("user_id", "user_1");
    expect(attemptsQuery.order).toHaveBeenCalledWith("challenge_date", {
      ascending: false,
    });
    expect(attemptsQuery.limit).toHaveBeenCalledWith(50);
    expect(itemsQuery.select).toHaveBeenCalledWith(
      "daily_challenge_id,question_id,question_snapshot",
    );
    expect(itemsQuery.in).toHaveBeenCalledWith("daily_challenge_id", [
      "challenge_1",
      "challenge_2",
    ]);
  });

  it("combines daily and side-game performance for the same sport using the latest timestamp", async () => {
    const sportQuizAttemptsQuery = createThenableQuery({
      data: [
        {
          sport_id: "sport_nba",
          score: 4,
          total_questions: 5,
          created_at: "2026-05-03T12:00:00Z",
        },
      ],
      error: null,
    });
    const sportsQuery = createThenableQuery({
      data: [{ id: "sport_nba", slug: "nba" }],
      error: null,
    });
    const adminClient = createClientMock({
      daily_attempts: createThenableQuery({
        data: [
          {
            daily_challenge_id: "challenge_1",
            challenge_date: "2026-05-01",
            answers: { question_nba: "A" },
          },
        ],
        error: null,
      }),
      sport_quiz_attempts: sportQuizAttemptsQuery,
      daily_challenge_items: createThenableQuery({
        data: [
          {
            daily_challenge_id: "challenge_1",
            question_id: "question_nba",
            question_snapshot: {
              id: "question_nba",
              question_text: "NBA",
              option_a: "A",
              option_b: "B",
              option_c: "C",
              option_d: "D",
              correct_option: "A",
              sport: { slug: "nba", name: "NBA" },
            },
          },
        ],
        error: null,
      }),
      sports: sportsQuery,
    });
    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getPlayerSportCategoryPerformance("user_1")).resolves.toEqual([
      {
        slug: "nba",
        answeredCount: 6,
        correctCount: 5,
        lastAnsweredAt: "2026-05-03T12:00:00Z",
      },
    ]);

    expect(sportQuizAttemptsQuery.select).toHaveBeenCalledWith(
      "sport_id,score,total_questions,created_at",
    );
    expect(sportQuizAttemptsQuery.eq).toHaveBeenCalledWith("user_id", "user_1");
    expect(sportQuizAttemptsQuery.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(sportQuizAttemptsQuery.limit).toHaveBeenCalledWith(100);
    expect(sportsQuery.select).toHaveBeenCalledWith("id,slug");
    expect(sportsQuery.in).toHaveBeenCalledWith("id", ["sport_nba"]);
  });

  it("compares precise daily and side-game timestamps on the same day", async () => {
    const adminClient = createClientMock({
      daily_attempts: createThenableQuery({
        data: [
          {
            daily_challenge_id: "challenge_1",
            challenge_date: "2026-05-03",
            created_at: "2026-05-03T18:00:00Z",
            answers: {
              question_nba: "A",
              question_nfl: "A",
            },
          },
        ],
        error: null,
      }),
      sport_quiz_attempts: createThenableQuery({
        data: [
          {
            sport_id: "sport_nba",
            score: 4,
            total_questions: 5,
            created_at: "2026-05-03T17:00:00Z",
          },
          {
            sport_id: "sport_nfl",
            score: 4,
            total_questions: 5,
            created_at: "2026-05-03T19:00:00Z",
          },
        ],
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: [
          {
            daily_challenge_id: "challenge_1",
            question_id: "question_nba",
            question_snapshot: {
              id: "question_nba",
              question_text: "NBA",
              option_a: "A",
              option_b: "B",
              option_c: "C",
              option_d: "D",
              correct_option: "A",
              sport: { slug: "nba", name: "NBA" },
            },
          },
          {
            daily_challenge_id: "challenge_1",
            question_id: "question_nfl",
            question_snapshot: {
              id: "question_nfl",
              question_text: "NFL",
              option_a: "A",
              option_b: "B",
              option_c: "C",
              option_d: "D",
              correct_option: "A",
              sport: { slug: "nfl", name: "NFL" },
            },
          },
        ],
        error: null,
      }),
      sports: createThenableQuery({
        data: [
          { id: "sport_nba", slug: "nba" },
          { id: "sport_nfl", slug: "nfl" },
        ],
        error: null,
      }),
    });
    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getPlayerSportCategoryPerformance("user_1")).resolves.toEqual([
      {
        slug: "nba",
        answeredCount: 6,
        correctCount: 5,
        lastAnsweredAt: "2026-05-03T18:00:00Z",
      },
      {
        slug: "nfl",
        answeredCount: 6,
        correctCount: 5,
        lastAnsweredAt: "2026-05-03T19:00:00Z",
      },
    ]);
  });

  it("includes side-game-only supported sports and excludes unsupported sports", async () => {
    const adminClient = createClientMock({
      daily_attempts: createThenableQuery({
        data: [],
        error: null,
      }),
      sport_quiz_attempts: createThenableQuery({
        data: [
          {
            sport_id: "sport_cfb",
            score: 3,
            total_questions: 5,
            created_at: "2026-05-04T12:00:00Z",
          },
          {
            sport_id: "sport_mlb",
            score: 5,
            total_questions: 5,
            created_at: "2026-05-05T12:00:00Z",
          },
          {
            sport_id: "sport_wnba",
            score: 5,
            total_questions: 5,
            created_at: "2026-05-06T12:00:00Z",
          },
        ],
        error: null,
      }),
      sports: createThenableQuery({
        data: [
          { id: "sport_cfb", slug: "cfb" },
          { id: "sport_mlb", slug: "mlb" },
          { id: "sport_wnba", slug: "wnba" },
        ],
        error: null,
      }),
    });
    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getPlayerSportCategoryPerformance("user_1")).resolves.toEqual([
      {
        slug: "cfb",
        answeredCount: 5,
        correctCount: 3,
        lastAnsweredAt: "2026-05-04T12:00:00Z",
      },
      {
        slug: "mlb",
        answeredCount: 5,
        correctCount: 5,
        lastAnsweredAt: "2026-05-05T12:00:00Z",
      },
    ]);

    expect(adminClient.from).not.toHaveBeenCalledWith("daily_challenge_items");
  });

  it("uses the chronologically latest side-game timestamp across timezone offsets", async () => {
    const adminClient = createClientMock({
      daily_attempts: createThenableQuery({
        data: [],
        error: null,
      }),
      sport_quiz_attempts: createThenableQuery({
        data: [
          {
            sport_id: "sport_nfl",
            score: 4,
            total_questions: 5,
            created_at: "2026-05-03T01:00:00-05:00",
          },
          {
            sport_id: "sport_nfl",
            score: 2,
            total_questions: 5,
            created_at: "2026-05-03T05:30:00Z",
          },
        ],
        error: null,
      }),
      sports: createThenableQuery({
        data: [{ id: "sport_nfl", slug: "nfl" }],
        error: null,
      }),
    });
    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getPlayerSportCategoryPerformance("user_1")).resolves.toEqual([
      {
        slug: "nfl",
        answeredCount: 10,
        correctCount: 6,
        lastAnsweredAt: "2026-05-03T01:00:00-05:00",
      },
    ]);
  });

  it("excludes malformed side-game attempts and sport rows", async () => {
    const adminClient = createClientMock({
      daily_attempts: createThenableQuery({
        data: [],
        error: null,
      }),
      sport_quiz_attempts: createThenableQuery({
        data: [
          {
            sport_id: "sport_nfl",
            score: 4,
            total_questions: 5,
            created_at: "2026-05-04T12:00:00Z",
          },
          {
            sport_id: "sport_missing_score",
            total_questions: 5,
            created_at: "2026-05-05T12:00:00Z",
          },
          {
            sport_id: "sport_bad_total",
            score: 6,
            total_questions: 5,
            created_at: "2026-05-06T12:00:00Z",
          },
          {
            sport_id: "sport_bad_date",
            score: 1,
            total_questions: 5,
            created_at: "not-a-date",
          },
          {
            sport_id: "",
            score: 1,
            total_questions: 5,
            created_at: "2026-05-06T13:00:00Z",
          },
          {
            sport_id: "sport_unsupported",
            score: 5,
            total_questions: 5,
            created_at: "2026-05-07T12:00:00Z",
          },
          {
            sport_id: "sport_missing_slug",
            score: 5,
            total_questions: 5,
            created_at: "2026-05-08T12:00:00Z",
          },
          null,
        ],
        error: null,
      }),
      sports: createThenableQuery({
        data: [
          { id: "sport_nfl", slug: "nfl" },
          { id: "sport_unsupported", slug: "wnba" },
          { id: "sport_missing_slug" },
        ],
        error: null,
      }),
    });
    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getPlayerSportCategoryPerformance("user_1")).resolves.toEqual([
      {
        slug: "nfl",
        answeredCount: 5,
        correctCount: 4,
        lastAnsweredAt: "2026-05-04T12:00:00Z",
      },
    ]);

    const sportsQuery = adminClient.from.mock.results.find(
      (result) => result.value?.select.mock.calls[0]?.[0] === "id,slug",
    )?.value;
    expect(sportsQuery.in).toHaveBeenCalledWith("id", [
      "sport_nfl",
      "sport_unsupported",
      "sport_missing_slug",
    ]);
  });

  it.each([
    { code: "42P01", message: "relation does not exist" },
    { code: "PGRST205", message: "table is not in the schema cache" },
  ])("preserves daily performance when the side-game attempt table is unavailable ($code)", async ({
    code,
    message,
  }) => {
    const adminClient = createClientMock({
      daily_attempts: createThenableQuery({
        data: [
          {
            daily_challenge_id: "challenge_1",
            challenge_date: "2026-05-01",
            answers: { question_nhl: "B" },
          },
        ],
        error: null,
      }),
      sport_quiz_attempts: createThenableQuery({
        data: null,
        error: { code, message },
      }),
      daily_challenge_items: createThenableQuery({
        data: [
          {
            daily_challenge_id: "challenge_1",
            question_id: "question_nhl",
            question_snapshot: {
              id: "question_nhl",
              question_text: "NHL",
              option_a: "A",
              option_b: "B",
              option_c: "C",
              option_d: "D",
              correct_option: "B",
              sport: { slug: "nhl", name: "NHL" },
            },
          },
        ],
        error: null,
      }),
    });
    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getPlayerSportCategoryPerformance("user_1")).resolves.toEqual([
      {
        slug: "nhl",
        answeredCount: 1,
        correctCount: 1,
        lastAnsweredAt: "2026-05-01",
      },
    ]);

    expect(adminClient.from).not.toHaveBeenCalledWith("sports");
  });
});

describe("getChallengeForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateDailyChallengeQuestions.mockReset();
  });

  it("prefers canonical daily challenge rows when they exist", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: canonicalRows,
        error: null,
      }),
    });
    const client = createClientMock({
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      canonicalQuestions,
    );

    expect(supabaseAdmin).toHaveBeenCalledTimes(1);
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
    expect(client.from).not.toHaveBeenCalledWith("daily_challenge_questions");
  });

  it("treats malformed canonical snapshots as unavailable instead of serving bad data", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: [
          {
            id: "canonical_1",
            slot: 1,
            question_snapshot: {
              id: "question_1",
              question_text: "Malformed question 1",
              option_a: "A1",
              option_c: "C1",
              option_d: "D1",
              correct_option: "A",
              sport: {
                id: "sport_1",
                slug: "nba",
                name: "NBA",
                is_active: true,
                sort_order: 10,
                created_at: "2026-04-01T00:00:00Z",
              },
            },
          },
          {
            id: "canonical_2",
            slot: 2,
            question_snapshot: {
              id: "question_2",
              question_text: "Malformed question 2",
              option_a: "A2",
              option_b: "B2",
              option_c: "C2",
              option_d: "D2",
              correct_option: "B",
              sport: {
                id: "sport_2",
                slug: "nfl",
                name: "NFL",
                is_active: true,
                sort_order: 20,
                created_at: "2026-04-01T00:00:00Z",
              },
            },
          },
          {
            id: "canonical_3",
            slot: 3,
            question_snapshot: {
              id: "question_3",
              question_text: "Malformed question 3",
              option_a: "A3",
              option_b: "B3",
              option_c: "C3",
              option_d: "D3",
              correct_option: "C",
              sport: {
                id: "sport_3",
                slug: "nhl",
                name: "NHL",
                is_active: true,
                sort_order: 30,
                created_at: "2026-04-01T00:00:00Z",
              },
            },
          },
          {
            id: "canonical_4",
            slot: 4,
            question_snapshot: {
              id: "question_4",
              question_text: "Malformed question 4",
              option_a: "A4",
              option_b: "B4",
              option_c: "C4",
              option_d: "D4",
              correct_option: "D",
              sport: {
                id: "sport_4",
                slug: "cbb",
                name: "CBB",
                is_active: true,
                sort_order: 40,
                created_at: "2026-04-01T00:00:00Z",
              },
            },
          },
          {
            id: "canonical_5",
            slot: 5,
            question_snapshot: {
              id: "question_5",
              question_text: "Malformed question 5",
              option_a: "A5",
              option_b: "B5",
              option_c: "C5",
              option_d: "D5",
              correct_option: "A",
              sport: {
                id: "sport_5",
                slug: "mlb",
                name: "MLB",
                is_active: true,
                sort_order: 50,
                created_at: "2026-04-01T00:00:00Z",
              },
            },
          },
        ],
        error: null,
      }),
    });
    const client = createClientMock({
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual([]);

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
    expect(client.from).not.toHaveBeenCalledWith("daily_challenge_questions");
  });

  it("does not fall back to legacy rows when the canonical challenge is archived", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "archived",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: [],
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual([]);

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).not.toHaveBeenCalledWith("daily_challenge_items");
    expect(client.from).not.toHaveBeenCalledWith("daily_challenge_questions");
  });

  it("falls back to legacy questions while a generated canonical row is still unpublished", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "generated",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: null,
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: [],
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });
    const client = createClientMock({
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      legacyRows,
    );

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_questions");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("falls back to legacy questions when the canonical challenge is missing", async () => {
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({
          data: null,
          error: null,
        }),
        createThenableQuery({
          data: [],
          error: null,
        }),
      ],
      questions: createThenableQuery({
        data: [],
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(null);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      legacyRows,
    );
  });

  it("falls back to legacy questions when the canonical challenge read fails", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: null,
        error: { code: "PGRST301", message: "service unavailable" },
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      legacyRows,
    );

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_questions");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("falls back to legacy questions when the canonical item read fails", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: null,
        error: { code: "PGRST301", message: "service unavailable" },
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      legacyRows,
    );

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_questions");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("recovers a stale unpublished generated row with no items by deleting it and retrying generation", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const publishRpc = createThenableQuery({ data: "published", error: null });
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({
          data: {
            id: "stale_generated_1",
            challenge_date: "2026-04-01",
            status: "generated",
            generation_method: "auto",
            rules_version: "v1",
            generated_at: "2026-04-01T00:00:00Z",
            published_at: null,
            created_at: "2026-04-01T00:00:00Z",
          },
          error: null,
        }),
        createThenableQuery({
          data: [],
          error: null,
        }),
      ],
      daily_challenge_items: createThenableQuery({ data: [], error: null }),
      questions: createThenableQuery({
        data: reusableQuestionRows,
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: [],
        error: null,
      }),
    }, {
      cleanup_stale_daily_challenge: createThenableQuery({
        data: { outcome: "deleted", challenge_id: "stale_generated_1" },
        error: null,
      }),
      prepare_daily_challenge_draft: createThenableQuery({
        data: { outcome: "created", challenge_id: "generated_challenge_2" },
        error: null,
      }),
      publish_daily_challenge: publishRpc,
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      generatedQuestions.map((question) => ({
        id: question.id,
        slot: question.slot,
        sport: question.sport.name,
        difficulty: question.slot <= 3 ? "starter" : "pro",
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
        correct_option: question.correct_option,
      })),
    );

    expect(adminClient.rpc).toHaveBeenCalledWith(
      "cleanup_stale_daily_challenge",
      expect.objectContaining({ p_challenge_id: "stale_generated_1" }),
    );
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "prepare_daily_challenge_draft",
      expect.objectContaining({ p_challenge_date: "2026-04-01" }),
    );
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "publish_daily_challenge",
      expect.objectContaining({
        p_challenge_id: "generated_challenge_2",
        p_challenge_date: "2026-04-01",
      }),
    );
  });

  it("does not delete a fresh unpublished generated row while another request may still be publishing", async () => {
    const freshGeneratedAt = new Date().toISOString();
    const dailyChallengesQuery = createThenableQuery({
      data: {
        id: "fresh_generated_1",
        challenge_date: "2026-04-01",
        status: "generated",
        generation_method: "auto",
        rules_version: "v1",
        generated_at: freshGeneratedAt,
        published_at: null,
        created_at: freshGeneratedAt,
      },
      error: null,
    });
    const adminClient = createClientMock({
      daily_challenges: dailyChallengesQuery,
      daily_challenge_items: createThenableQuery({
        data: [],
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: [],
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      [],
    );

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_questions");
    expect(client.from).not.toHaveBeenCalled();
    expect(dailyChallengesQuery.delete).not.toHaveBeenCalled();
  });

  it("retries a post-conflict retryable canonical row before falling back to empty results", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const retryableRows = [
      {
        id: "retryable_generated_1",
        slot: 1,
        question_snapshot: reusableQuestionRows[0],
      },
    ];
    const readyRows = canonicalRows;
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({
          data: null,
          error: null,
        }),
        createThenableQuery({
          data: [],
          error: null,
        }),
        createThenableQuery({
          data: {
            id: "retryable_generated_1",
            challenge_date: "2026-04-01",
            status: "generated",
            generation_method: "auto",
            rules_version: "v1",
            generated_at: "2026-04-01T00:00:00Z",
            published_at: null,
            created_at: "2026-04-01T00:00:00Z",
          },
          error: null,
        }),
        createThenableQuery({
          data: {
            id: "generated_challenge_3",
            challenge_date: "2026-04-01",
            status: "published",
            generation_method: "auto",
            rules_version: "v1",
            generated_at: "2026-04-01T00:00:00Z",
            published_at: "2026-04-01T00:00:00Z",
            created_at: "2026-04-01T00:00:00Z",
          },
          error: null,
        }),
      ],
      daily_challenge_items: [
        createThenableQuery({
          data: retryableRows,
          error: null,
        }),
        createThenableQuery({
          data: readyRows,
          error: null,
        }),
      ],
      questions: createThenableQuery({
        data: reusableQuestionRows,
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: [],
        error: null,
      }),
    }, {
      prepare_daily_challenge_draft: createThenableQuery({
        data: { outcome: "conflict", challenge_id: "retryable_generated_1" },
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      generatedQuestions.map((question) => ({
        id: question.id,
        slot: question.slot,
        sport: question.sport.name,
        difficulty: question.slot <= 3 ? "starter" : "pro",
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
        correct_option: question.correct_option,
      })),
    );

    expect(adminClient.rpc).toHaveBeenCalledWith(
      "prepare_daily_challenge_draft",
      expect.objectContaining({ p_challenge_date: "2026-04-01" }),
    );
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
  });

  it("re-reads a top-level retryable canonical row after a post-conflict stale reread", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const retryableRows = [
      {
        id: "retryable_generated_1",
        slot: 1,
        question_snapshot: reusableQuestionRows[0],
      },
    ];
    const readyRows = canonicalRows;
    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({
          data: {
            id: "stale_generated_2",
            challenge_date: "2026-04-02",
            status: "generated",
            generation_method: "auto",
            rules_version: "v1",
            generated_at: "2026-04-02T00:00:00Z",
            published_at: null,
            created_at: "2026-04-02T00:00:00Z",
          },
          error: null,
        }),
        createThenableQuery({
          data: [],
          error: null,
        }),
        createThenableQuery({
          data: {
            id: "retryable_generated_2",
            challenge_date: "2026-04-02",
            status: "generated",
            generation_method: "auto",
            rules_version: "v1",
            generated_at: "2026-04-02T00:00:00Z",
            published_at: null,
            created_at: "2026-04-02T00:00:00Z",
          },
          error: null,
        }),
        createThenableQuery({
          data: {
            id: "generated_challenge_4",
            challenge_date: "2026-04-02",
            status: "published",
            generation_method: "auto",
            rules_version: "v1",
            generated_at: "2026-04-02T00:00:00Z",
            published_at: "2026-04-02T00:00:00Z",
            created_at: "2026-04-02T00:00:00Z",
          },
          error: null,
        }),
      ],
      daily_challenge_items: [
        createThenableQuery({
          data: [],
          error: null,
        }),
        createThenableQuery({
          data: retryableRows,
          error: null,
        }),
        createThenableQuery({
          data: readyRows,
          error: null,
        }),
      ],
      questions: createThenableQuery({
        data: reusableQuestionRows,
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: [],
        error: null,
      }),
    }, {
      cleanup_stale_daily_challenge: createThenableQuery({
        data: { outcome: "deleted", challenge_id: "stale_generated_2" },
        error: null,
      }),
      prepare_daily_challenge_draft: createThenableQuery({
        data: { outcome: "conflict", challenge_id: "retryable_generated_2" },
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(getChallengeForDate(client as never, "2026-04-02")).resolves.toEqual(
      generatedQuestions.map((question) => ({
        id: question.id,
        slot: question.slot,
        sport: question.sport.name,
        difficulty: question.slot <= 3 ? "starter" : "pro",
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
        correct_option: question.correct_option,
      })),
    );

    expect(adminClient.rpc).toHaveBeenCalledWith(
      "cleanup_stale_daily_challenge",
      expect.objectContaining({ p_challenge_id: "stale_generated_2" }),
    );
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "prepare_daily_challenge_draft",
      expect.objectContaining({ p_challenge_date: "2026-04-02" }),
    );
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
  });

  it("generates and persists a canonical challenge when the date is missing", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const publishRpc = createThenableQuery({ data: "published", error: null });

    const adminClient = createClientMock({
      daily_challenges: [
        createThenableQuery({
          data: null,
          error: null,
        }),
        createThenableQuery({
          data: [],
          error: null,
        }),
      ],
      questions: createThenableQuery({
        data: reusableQuestionRows,
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    }, {
      prepare_daily_challenge_draft: createThenableQuery({
        data: { outcome: "created", challenge_id: "generated_challenge_1" },
        error: null,
      }),
      publish_daily_challenge: publishRpc,
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      generatedQuestions.map((question) => ({
        id: question.id,
        slot: question.slot,
        sport: question.sport.name,
        difficulty: question.slot <= 3 ? "starter" : "pro",
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
        correct_option: question.correct_option,
      })),
    );

    expect(generateDailyChallengeQuestions).toHaveBeenCalledWith({
      candidates: reusableQuestionRows,
      recentQuestionIds: [],
    });
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).not.toHaveBeenCalledWith("daily_challenge_items");
    expect(adminClient.from).toHaveBeenCalledWith("questions");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("publishes only after the atomic draft RPC returns a complete draft", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const initialChallengeQuery = createThenableQuery({ data: null, error: null });
    const recentChallengesQuery = createThenableQuery({ data: [], error: null });
    const questionQuery = createThenableQuery({
      data: reusableQuestionRows,
      error: null,
    });
    const prepareRpc = createThenableQuery({
      data: { outcome: "created", challenge_id: "generated_challenge_1" },
      error: null,
    });
    const publishRpc = createThenableQuery({ data: "published", error: null });
    const adminClient = createClientMock({
      daily_challenges: [initialChallengeQuery, recentChallengesQuery],
      questions: questionQuery,
    }, {
      prepare_daily_challenge_draft: prepareRpc,
      publish_daily_challenge: publishRpc,
    });
    const client = createClientMock({
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toHaveLength(5);

    expect(adminClient.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      adminClient.rpc.mock.invocationCallOrder[1],
    );
    expect(adminClient.rpc).toHaveBeenNthCalledWith(
      1,
      "prepare_daily_challenge_draft",
      expect.anything(),
    );
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "publish_daily_challenge",
      expect.objectContaining({
        p_challenge_id: "generated_challenge_1",
        p_challenge_date: "2026-04-01",
      }),
    );
    expect(initialChallengeQuery.insert).not.toHaveBeenCalled();
    expect(recentChallengesQuery.insert).not.toHaveBeenCalled();
    expect(questionQuery.insert).not.toHaveBeenCalled();
    expect(adminClient.from).not.toHaveBeenCalledWith("daily_challenge_items");
  });

  it("falls back to legacy questions when the canonical item table is missing after a published row is found", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: null,
        error: { code: "42P01", message: "relation does not exist" },
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      legacyRows,
    );

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_questions");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("falls back to legacy questions when the canonical table is missing", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: null,
        error: { code: "42P01", message: "relation does not exist" },
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });
    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      legacyRows,
    );

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_questions");
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("getServeableChallengeForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the canonical questions and id when the published challenge is ready", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: canonicalRows,
        error: null,
      }),
    });
    const client = createClientMock({
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getServeableChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      {
        dailyChallengeId: "challenge_1",
        questions: canonicalQuestions,
      },
    );
  });

  it("returns legacy questions with no canonical id when the canonical store is unavailable", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: null,
        error: { message: "unavailable" },
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });

    const client = createClientMock({});

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(getServeableChallengeForDate(client as never, "2026-04-01")).resolves.toEqual(
      {
        dailyChallengeId: null,
        questions: legacyRows,
      },
    );

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_questions");
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("getChallengeResolutionForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the same canonical id and questions used to serve the challenge", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: canonicalRows,
        error: null,
      }),
    });
    const client = createClientMock({
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(
      getChallengeResolutionForDate(client as never, "2026-04-01"),
    ).resolves.toEqual({
      dailyChallengeId: "challenge_1",
      questions: canonicalQuestions,
    });
  });
});

describe("resolveCanonicalChallengeIdForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the canonical daily challenge id when one exists for the date", async () => {
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
    });

    supabaseAdmin.mockReturnValue(adminClient);

    await expect(resolveCanonicalChallengeIdForDate("2026-04-01")).resolves.toBe(
      "challenge_1",
    );

    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
  });
});
