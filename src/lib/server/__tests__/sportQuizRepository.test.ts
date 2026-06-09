import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuestionRecord, QuestionSnapshot, SportRecord } from "@/lib/dailyChallenge";
import type { SportQuizQuestion } from "@/lib/sportQuiz";
import {
  getSportQuizForPlayer,
  submitSportQuizAttempt,
} from "@/lib/server/sportQuizRepository";

type QueryResult<T> = {
  data: T;
  error: unknown;
};

const { generateSportQuizQuestions, supabaseAdmin } = vi.hoisted(() => ({
  generateSportQuizQuestions: vi.fn(),
  supabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/server/sportQuizGenerator", () => ({
  generateSportQuizQuestions,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

function createThenableQuery<T>(result: QueryResult<T>) {
  const query: Record<string, unknown> = {};

  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.delete = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  query.then = (
    resolve: (value: QueryResult<T>) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);

  return query;
}

function createClientMock(
  queries: Record<
    string,
    | ReturnType<typeof createThenableQuery>
    | Array<ReturnType<typeof createThenableQuery>>
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

const cfbSport: SportRecord = {
  id: "sport-cfb",
  slug: "cfb",
  name: "CFB",
  is_active: true,
  sort_order: 40,
  created_at: "2026-06-08T00:00:00Z",
};

const nflSport: SportRecord = {
  ...cfbSport,
  id: "sport-nfl",
  slug: "nfl",
  name: "NFL",
};

function makeQuestion(
  id: string,
  difficulty: QuestionRecord["difficulty"],
  overrides: Partial<QuestionRecord> = {},
): QuestionRecord {
  return {
    id,
    sport_id: cfbSport.id,
    difficulty,
    question_text: `${id} text`,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "A",
    status: "ready",
    eligible_for_daily: true,
    eligible_for_sport_quiz: true,
    authoring_method: "manual",
    source_notes: null,
    reviewed_at: "2026-06-08T00:00:00Z",
    created_at: "2026-06-08T00:00:00Z",
    updated_at: "2026-06-08T00:00:00Z",
    ...overrides,
  };
}

const questionRows = [
  makeQuestion("q1", "easy", { correct_option: "A" }),
  makeQuestion("q2", "easy", { correct_option: "B" }),
  makeQuestion("q3", "medium", { correct_option: "C" }),
  makeQuestion("q4", "hard", { correct_option: "D" }),
  makeQuestion("q5", "hard", { correct_option: "A" }),
];

function toSnapshot(
  question: QuestionRecord,
  sport: SportRecord = cfbSport,
): QuestionSnapshot {
  const { sport_id, ...snapshot } = question;
  void sport_id;
  return { ...snapshot, sport };
}

function generatedQuestions(
  rows: QuestionRecord[] = questionRows,
): SportQuizQuestion[] {
  return rows.map((question, index) => ({
    ...toSnapshot(question),
    slot: index + 1,
  }));
}

const validAnswers = {
  q1: "A",
  q2: "A",
  q3: "C",
  q4: "D",
  q5: "B",
};

function sportQuery(sport: SportRecord | null = cfbSport) {
  return createThenableQuery({ data: sport, error: null });
}

function questionsQuery(rows: QuestionRecord[] = questionRows) {
  return createThenableQuery({ data: rows, error: null });
}

describe("getSportQuizForPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateSportQuizQuestions.mockReset();
  });

  it("loads a supported active sport and only its ready eligible questions", async () => {
    const sport = sportQuery();
    const questions = questionsQuery();
    const client = createClientMock({
      sports: sport,
      questions,
    });
    supabaseAdmin.mockReturnValue(client);
    generateSportQuizQuestions.mockReturnValue(generatedQuestions());

    const result = await getSportQuizForPlayer({
      slug: " CFB ",
      userId: null,
      clientRecentQuestionIds: [],
    });

    expect(sport.eq).toHaveBeenCalledWith("slug", "cfb");
    expect(sport.eq).toHaveBeenCalledWith("is_active", true);
    expect(questions.eq).toHaveBeenCalledWith("sport_id", cfbSport.id);
    expect(questions.eq).toHaveBeenCalledWith("status", "ready");
    expect(questions.eq).toHaveBeenCalledWith("eligible_for_sport_quiz", true);
    expect(generateSportQuizQuestions).toHaveBeenCalledWith({
      candidates: questionRows.map((question) => toSnapshot(question)),
      recentQuestionIds: [],
    });
    expect(result).toMatchObject({
      status: "ready",
      sport: { slug: "cfb", name: "CFB" },
      questions: expect.arrayContaining([
        expect.objectContaining({ id: "q1", sport: "CFB", slot: 1 }),
      ]),
    });
    expect(result).not.toHaveProperty("questions.0.correct_option");
    expect(result).not.toHaveProperty("questions.0.status");
  });

  it("combines recent signed-in history with capped client question IDs", async () => {
    const attempts = createThenableQuery({
      data: [{ id: "attempt-2" }, { id: "attempt-1" }],
      error: null,
    });
    const items = createThenableQuery({
      data: [
        { question_id: "server-recent-1" },
        { question_id: "server-recent-2" },
      ],
      error: null,
    });
    const client = createClientMock({
      sports: sportQuery(),
      questions: questionsQuery(),
      sport_quiz_attempts: attempts,
      sport_quiz_attempt_items: items,
    });
    supabaseAdmin.mockReturnValue(client);
    generateSportQuizQuestions.mockReturnValue(generatedQuestions());

    await getSportQuizForPlayer({
      slug: "cfb",
      userId: "user-1",
      clientRecentQuestionIds: Array.from(
        { length: 30 },
        (_, index) => `client-${index + 1}`,
      ),
    });

    expect(attempts.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(attempts.eq).toHaveBeenCalledWith("sport_id", cfbSport.id);
    expect(attempts.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(items.in).toHaveBeenCalledWith("attempt_id", [
      "attempt-2",
      "attempt-1",
    ]);

    const recentQuestionIds = generateSportQuizQuestions.mock.calls[0][0]
      .recentQuestionIds as string[];
    expect(recentQuestionIds.slice(0, 2)).toEqual([
      "server-recent-1",
      "server-recent-2",
    ]);
    expect(recentQuestionIds.filter((id) => id.startsWith("client-"))).toHaveLength(
      25,
    );
    expect(recentQuestionIds).not.toContain("client-26");
  });

  it("returns unavailable for an unsupported or unknown sport", async () => {
    const client = createClientMock({
      sports: sportQuery(null),
    });
    supabaseAdmin.mockReturnValue(client);

    await expect(
      getSportQuizForPlayer({
        slug: "baseball",
        userId: null,
        clientRecentQuestionIds: [],
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
    expect(client.from).not.toHaveBeenCalled();

    await expect(
      getSportQuizForPlayer({
        slug: "cfb",
        userId: null,
        clientRecentQuestionIds: [],
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
    expect(generateSportQuizQuestions).not.toHaveBeenCalled();
  });

  it("returns unavailable when the question bank cannot fill the mix", async () => {
    const client = createClientMock({
      sports: sportQuery(),
      questions: questionsQuery(questionRows.slice(0, 4)),
    });
    supabaseAdmin.mockReturnValue(client);
    generateSportQuizQuestions.mockReturnValue(null);

    await expect(
      getSportQuizForPlayer({
        slug: "cfb",
        userId: null,
        clientRecentQuestionIds: [],
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
  });
});

describe("submitSportQuizAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateSportQuizQuestions.mockReset();
  });

  it("rejects unsupported slugs and malformed answer sets before loading data", async () => {
    const client = createClientMock({});
    supabaseAdmin.mockReturnValue(client);

    await expect(
      submitSportQuizAttempt({
        slug: "baseball",
        userId: null,
        answers: validAnswers,
      }),
    ).rejects.toThrow("Unsupported sport");
    await expect(
      submitSportQuizAttempt({
        slug: "cfb",
        userId: null,
        answers: { q1: "A" },
      }),
    ).rejects.toThrow("exactly five valid answers");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects missing, duplicate, inactive, ineligible, and cross-sport questions", async () => {
    const invalidSets = [
      questionRows.slice(0, 4),
      [...questionRows.slice(0, 4), questionRows[0]],
      questionRows.map((question, index) =>
        index === 0 ? { ...question, status: "retired" as const } : question,
      ),
      questionRows.map((question, index) =>
        index === 0 ? { ...question, eligible_for_sport_quiz: false } : question,
      ),
      questionRows.map((question, index) =>
        index === 0 ? { ...question, sport_id: nflSport.id } : question,
      ),
    ];

    for (const rows of invalidSets) {
      const client = createClientMock({
        sports: sportQuery(),
        questions: questionsQuery(rows),
      });
      supabaseAdmin.mockReturnValue(client);

      await expect(
        submitSportQuizAttempt({
          slug: "cfb",
          userId: "user-1",
          answers: validAnswers,
        }),
      ).rejects.toThrow("Invalid sport quiz questions");
      expect(client.from).not.toHaveBeenCalledWith("sport_quiz_attempts");
    }
  });

  it("rejects a question set whose difficulty mix is not exact", async () => {
    const wrongMix = questionRows.map((question, index) =>
      index === 2 ? { ...question, difficulty: "easy" as const } : question,
    );
    const client = createClientMock({
      sports: sportQuery(),
      questions: questionsQuery(wrongMix),
    });
    supabaseAdmin.mockReturnValue(client);

    await expect(
      submitSportQuizAttempt({
        slug: "cfb",
        userId: "user-1",
        answers: validAnswers,
      }),
    ).rejects.toThrow("Invalid sport quiz difficulty mix");
  });

  it("grades a verified guest submission without persistence", async () => {
    const client = createClientMock({
      sports: sportQuery(),
      questions: questionsQuery(),
    });
    supabaseAdmin.mockReturnValue(client);

    await expect(
      submitSportQuizAttempt({
        slug: "cfb",
        userId: null,
        answers: validAnswers,
      }),
    ).resolves.toEqual({
      saved: false,
      score: 3,
      total: 5,
      results: [
        { question_id: "q1", chosen_option: "A", is_correct: true },
        { question_id: "q2", chosen_option: "A", is_correct: false },
        { question_id: "q3", chosen_option: "C", is_correct: true },
        { question_id: "q4", chosen_option: "D", is_correct: true },
        { question_id: "q5", chosen_option: "B", is_correct: false },
      ],
    });
    expect(client.from).not.toHaveBeenCalledWith("sport_quiz_attempts");
    expect(client.from).not.toHaveBeenCalledWith("sport_quiz_attempt_items");
  });

  it("persists one attempt and five item rows for a signed-in player", async () => {
    const attemptInsert = createThenableQuery({
      data: { id: "attempt-1" },
      error: null,
    });
    const itemInsert = createThenableQuery({ data: null, error: null });
    const client = createClientMock({
      sports: sportQuery(),
      questions: questionsQuery(),
      sport_quiz_attempts: attemptInsert,
      sport_quiz_attempt_items: itemInsert,
    });
    supabaseAdmin.mockReturnValue(client);

    await expect(
      submitSportQuizAttempt({
        slug: "cfb",
        userId: "user-1",
        answers: validAnswers,
      }),
    ).resolves.toMatchObject({ saved: true, score: 3, total: 5 });

    expect(attemptInsert.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      sport_id: cfbSport.id,
      score: 3,
      total_questions: 5,
    });
    expect(itemInsert.insert).toHaveBeenCalledWith([
      {
        attempt_id: "attempt-1",
        question_id: "q1",
        chosen_option: "A",
        is_correct: true,
      },
      {
        attempt_id: "attempt-1",
        question_id: "q2",
        chosen_option: "A",
        is_correct: false,
      },
      {
        attempt_id: "attempt-1",
        question_id: "q3",
        chosen_option: "C",
        is_correct: true,
      },
      {
        attempt_id: "attempt-1",
        question_id: "q4",
        chosen_option: "D",
        is_correct: true,
      },
      {
        attempt_id: "attempt-1",
        question_id: "q5",
        chosen_option: "B",
        is_correct: false,
      },
    ]);
  });

  it("deletes an incomplete attempt when item insertion fails", async () => {
    const attemptInsert = createThenableQuery({
      data: { id: "attempt-1" },
      error: null,
    });
    const cleanup = createThenableQuery({ data: null, error: null });
    const itemInsert = createThenableQuery({
      data: null,
      error: { code: "23503", message: "item insert failed" },
    });
    const client = createClientMock({
      sports: sportQuery(),
      questions: questionsQuery(),
      sport_quiz_attempts: [attemptInsert, cleanup],
      sport_quiz_attempt_items: itemInsert,
    });
    supabaseAdmin.mockReturnValue(client);

    await expect(
      submitSportQuizAttempt({
        slug: "cfb",
        userId: "user-1",
        answers: validAnswers,
      }),
    ).rejects.toThrow("Unable to save sport quiz attempt items");
    expect(cleanup.delete).toHaveBeenCalledTimes(1);
    expect(cleanup.eq).toHaveBeenCalledWith("id", "attempt-1");
  });
});
