import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getChallengeForDate,
  getChallengeResolutionForDate,
  getPlayerSportCategoryPerformance,
  getServeableChallengeForDate,
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
) {
  const tableCallCounts = new Map<string, number>();

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
  };
}

const canonicalRows = [
  {
    id: "canonical_1",
    slot: 1,
    question_snapshot: {
      id: "question_1",
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
      id: "question_2",
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
      id: "question_3",
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
      id: "question_4",
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
      id: "question_5",
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
      { slug: "nba", answeredCount: 1, correctCount: 1, lastAnsweredAt: "2026-05-01" },
      { slug: "nfl", answeredCount: 2, correctCount: 1, lastAnsweredAt: "2026-05-02" },
    ]);
    expect(attemptsQuery.select).toHaveBeenCalledWith(
      "daily_challenge_id,challenge_date,answers",
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
        ],
        error: null,
      }),
      sports: createThenableQuery({
        data: [
          { id: "sport_cfb", slug: "cfb" },
          { id: "sport_mlb", slug: "mlb" },
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
          { id: "sport_unsupported", slug: "mlb" },
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

  it("preserves daily performance when the side-game attempt table is unavailable", async () => {
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
        error: { code: "42P01", message: "relation does not exist" },
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

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toEqual([
      {
        id: "question_1",
        slot: 1,
        sport: "NBA",
        difficulty: "starter",
        question_text: "Canonical question 1",
        option_a: "A1",
        option_b: "B1",
        option_c: "C1",
        option_d: "D1",
        correct_option: "B",
      },
      {
        id: "question_2",
        slot: 2,
        sport: "NFL",
        difficulty: "starter",
        question_text: "Canonical question 2",
        option_a: "A2",
        option_b: "B2",
        option_c: "C2",
        option_d: "D2",
        correct_option: "C",
      },
      {
        id: "question_3",
        slot: 3,
        sport: "NHL",
        difficulty: "starter",
        question_text: "Canonical question 3",
        option_a: "A3",
        option_b: "B3",
        option_c: "C3",
        option_d: "D3",
        correct_option: "A",
      },
      {
        id: "question_4",
        slot: 4,
        sport: "CBB",
        difficulty: "pro",
        question_text: "Canonical question 4",
        option_a: "A4",
        option_b: "B4",
        option_c: "C4",
        option_d: "D4",
        correct_option: "D",
      },
      {
        id: "question_5",
        slot: 5,
        sport: "MLB",
        difficulty: "pro",
        question_text: "Canonical question 5",
        option_a: "A5",
        option_b: "B5",
        option_c: "C5",
        option_d: "D5",
        correct_option: "A",
      },
    ]);

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
    const staleDeleteQuery = createThenableQuery({
      data: null,
      error: null,
    });
    const insertQuery = createThenableQuery({
      data: {
        id: "generated_challenge_2",
        challenge_date: "2026-04-01",
        status: "generated",
        generation_method: "auto",
        rules_version: "v1",
        generated_at: "2026-04-01T00:00:00Z",
        published_at: null,
        created_at: "2026-04-01T00:00:00Z",
      },
      error: null,
    });
    const updateQuery = createThenableQuery({
      data: {
        id: "generated_challenge_2",
        challenge_date: "2026-04-01",
        status: "published",
        generation_method: "auto",
        rules_version: "v1",
        generated_at: "2026-04-01T00:00:00Z",
        published_at: "2026-04-01T00:00:00Z",
        created_at: "2026-04-01T00:00:00Z",
      },
      error: null,
    });
    const itemsInsertQuery = createThenableQuery({
      data: null,
      error: null,
    });
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
        staleDeleteQuery,
        createThenableQuery({
          data: [],
          error: null,
        }),
        insertQuery,
        updateQuery,
      ],
      daily_challenge_items: [
        createThenableQuery({
          data: [],
          error: null,
        }),
        itemsInsertQuery,
      ],
      questions: createThenableQuery({
        data: reusableQuestionRows,
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: [],
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

    expect(staleDeleteQuery.delete).toHaveBeenCalledWith();
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge_date: "2026-04-01",
        status: "generated",
      }),
    );
    expect(itemsInsertQuery.insert).toHaveBeenCalledTimes(1);
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "published",
        published_at: expect.any(String),
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
    const conflictQuery = createThenableQuery({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
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
        conflictQuery,
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

    expect(conflictQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge_date: "2026-04-01",
      }),
    );
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
  });

  it("re-reads a top-level retryable canonical row after a post-conflict stale reread", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const conflictQuery = createThenableQuery({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
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
          data: [],
          error: null,
        }),
        conflictQuery,
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

    expect(conflictQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge_date: "2026-04-02",
      }),
    );
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
  });

  it("generates and persists a canonical challenge when the date is missing", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));

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
            id: "generated_challenge_1",
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
            id: "generated_challenge_1",
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
      daily_challenge_items: createThenableQuery({
        data: null,
        error: null,
      }),
      questions: createThenableQuery({
        data: reusableQuestionRows,
        error: null,
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyRows,
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

    expect(generateDailyChallengeQuestions).toHaveBeenCalledWith({
      candidates: reusableQuestionRows,
      recentQuestionIds: [],
    });
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenges");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_items");
    expect(adminClient.from).toHaveBeenCalledWith("questions");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("publishes a generated challenge only after the five items are inserted", async () => {
    const generatedQuestions = reusableQuestionRows.map((question, index) => ({
      ...question,
      slot: index + 1,
    }));
    const insertQuery = createThenableQuery({
      data: {
        id: "generated_challenge_1",
        challenge_date: "2026-04-01",
        status: "generated",
        generation_method: "auto",
        rules_version: "v1",
        generated_at: "2026-04-01T00:00:00Z",
        published_at: null,
        created_at: "2026-04-01T00:00:00Z",
      },
      error: null,
    });
    const updateQuery = createThenableQuery({
      data: {
        id: "generated_challenge_1",
        challenge_date: "2026-04-01",
        status: "published",
        generation_method: "auto",
        rules_version: "v1",
        generated_at: "2026-04-01T00:00:00Z",
        published_at: "2026-04-01T00:00:00Z",
        created_at: "2026-04-01T00:00:00Z",
      },
      error: null,
    });
    const itemsInsertQuery = createThenableQuery({
      data: null,
      error: null,
    });
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
        insertQuery,
        updateQuery,
      ],
      daily_challenge_items: itemsInsertQuery,
      questions: createThenableQuery({
        data: reusableQuestionRows,
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
    generateDailyChallengeQuestions.mockReturnValue(generatedQuestions);

    await expect(getChallengeForDate(client as never, "2026-04-01")).resolves.toHaveLength(5);

    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge_date: "2026-04-01",
        status: "generated",
        published_at: null,
      }),
    );
    expect(itemsInsertQuery.insert).toHaveBeenCalledTimes(1);
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "published",
        published_at: expect.any(String),
      }),
    );
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
