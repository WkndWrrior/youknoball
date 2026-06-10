import { describe, expect, it } from "vitest";

import {
  gradeSportQuizAttempt,
  parseSportQuizRecentQuestionIds,
  parseSportQuizSubmissionId,
  parseSportQuizSubmittedAnswers,
  toSportQuizPlayerQuestion,
  type SportQuizQuestion,
} from "@/lib/sportQuiz";

function makeQuestion(
  id: string,
  slot: number,
  correctOption: SportQuizQuestion["correct_option"] = "A",
): SportQuizQuestion {
  return {
    id,
    slot,
    difficulty: slot <= 2 ? "easy" : slot === 3 ? "medium" : "hard",
    question_text: `${id} text`,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: correctOption,
    sport: {
      id: "cfb-id",
      slug: "cfb",
      name: "CFB",
      is_active: true,
      sort_order: 40,
      created_at: "2026-06-08T00:00:00Z",
    },
    status: "ready",
    eligible_for_daily: true,
    eligible_for_sport_quiz: true,
    authoring_method: "manual",
    source_notes: null,
    reviewed_at: "2026-06-08T00:00:00Z",
    created_at: "2026-06-08T00:00:00Z",
    updated_at: "2026-06-08T00:00:00Z",
  };
}

const questions = [
  makeQuestion("q1", 1, "A"),
  makeQuestion("q2", 2, "B"),
  makeQuestion("q3", 3, "C"),
  makeQuestion("q4", 4, "D"),
  makeQuestion("q5", 5, "A"),
];

describe("parseSportQuizRecentQuestionIds", () => {
  it("keeps at most 25 distinct non-empty IDs", () => {
    const raw = [
      "q1",
      "q1",
      " ",
      ...Array.from({ length: 30 }, (_, index) => `q${index + 2}`),
    ];

    const parsed = parseSportQuizRecentQuestionIds(raw);

    expect(parsed).toHaveLength(25);
    expect(parsed[0]).toBe("q1");
    expect(new Set(parsed)).toHaveLength(25);
  });

  it.each([null, {}, "q1", [1], ["q1", null]])(
    "rejects malformed recent question IDs: %j",
    (raw) => {
      expect(parseSportQuizRecentQuestionIds(raw)).toEqual([]);
    },
  );
});

describe("parseSportQuizSubmittedAnswers", () => {
  const expectedQuestionIds = questions.map((question) => question.id);

  it("accepts exactly five expected question IDs with normalized A-D answers", () => {
    expect(
      parseSportQuizSubmittedAnswers(
        {
          q1: "a",
          q2: " B ",
          q3: "c",
          q4: "D",
          q5: "a",
        },
        expectedQuestionIds,
      ),
    ).toEqual({
      q1: "A",
      q2: "B",
      q3: "C",
      q4: "D",
      q5: "A",
    });
  });

  it.each([
    null,
    [],
    { q1: "A" },
    { q1: "A", q2: "B", q3: "C", q4: "D", q5: "A", q6: "B" },
    { q1: "A", q2: "B", q3: "C", q4: "D", other: "A" },
    { q1: "A", q2: "B", q3: "C", q4: "D", q5: "E" },
  ])("rejects malformed, incomplete, extra, or unexpected answers: %j", (raw) => {
    expect(parseSportQuizSubmittedAnswers(raw, expectedQuestionIds)).toBeNull();
  });

  it("rejects a whitespace-only question ID without an expected-ID set", () => {
    expect(
      parseSportQuizSubmittedAnswers({
        " ": "A",
        q2: "B",
        q3: "C",
        q4: "D",
        q5: "A",
      }),
    ).toBeNull();
  });
});

describe("parseSportQuizSubmissionId", () => {
  it("accepts a canonical UUID", () => {
    expect(
      parseSportQuizSubmissionId("00000000-0000-4000-8000-000000000001"),
    ).toBe("00000000-0000-4000-8000-000000000001");
  });

  it.each([null, "", "not-a-uuid", " 00000000-0000-4000-8000-000000000001 "])(
    "rejects malformed submission IDs: %j",
    (value) => {
      expect(parseSportQuizSubmissionId(value)).toBeNull();
    },
  );
});

describe("toSportQuizPlayerQuestion", () => {
  it("omits the correct answer and internal question metadata", () => {
    const playerQuestion = toSportQuizPlayerQuestion(questions[0]);

    expect(playerQuestion).toEqual({
      id: "q1",
      slot: 1,
      sport: "CFB",
      difficulty: "easy",
      question_text: "q1 text",
      option_a: "A",
      option_b: "B",
      option_c: "C",
      option_d: "D",
    });
    expect(playerQuestion).not.toHaveProperty("correct_option");
  });
});

describe("gradeSportQuizAttempt", () => {
  it("returns the score, total, and per-question correctness in slot order", () => {
    const graded = gradeSportQuizAttempt([...questions].reverse(), {
      q1: "A",
      q2: "A",
      q3: "C",
      q4: "D",
      q5: "B",
    });

    expect(graded).toEqual({
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
  });

  it.each([
    [{ q1: "A", q2: "B", q4: "D", q5: "A" }, "q3"],
    [{ q1: "A", q2: "B", q3: "E", q4: "D", q5: "A" }, "q3"],
  ])("throws clearly when an answer is missing or invalid", (answers, questionId) => {
    expect(() =>
      gradeSportQuizAttempt(
        questions,
        answers as unknown as Parameters<typeof gradeSportQuizAttempt>[1],
      ),
    ).toThrow(`Missing or invalid answer for question ${questionId}`);
  });
});
