import { describe, expect, it } from "vitest";

import type { QuestionSnapshot } from "@/lib/dailyChallenge";
import {
  DAILY_CHALLENGE_SLOT_DIFFICULTIES,
  FIVE_QUESTION_DIFFICULTY_MIX,
  generateDailyChallengeQuestions,
} from "@/lib/server/dailyChallengeGenerator";
import { generateSportQuizQuestions } from "@/lib/server/sportQuizGenerator";

function makeQuestion(
  id: string,
  difficulty: QuestionSnapshot["difficulty"],
): QuestionSnapshot {
  return {
    id,
    difficulty,
    question_text: `${id} text`,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "A",
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

const minimumBank = [
  makeQuestion("easy-1", "easy"),
  makeQuestion("easy-2", "easy"),
  makeQuestion("medium-1", "medium"),
  makeQuestion("hard-1", "hard"),
  makeQuestion("hard-2", "hard"),
];

describe("shared five-question difficulty mix", () => {
  it("is canonical for sport quizzes and daily challenges", () => {
    expect(FIVE_QUESTION_DIFFICULTY_MIX).toEqual([
      "easy",
      "easy",
      "medium",
      "hard",
      "hard",
    ]);
    expect(DAILY_CHALLENGE_SLOT_DIFFICULTIES).toBe(FIVE_QUESTION_DIFFICULTY_MIX);

    const dailyQuestions = generateDailyChallengeQuestions({
      candidates: minimumBank,
    });
    expect(dailyQuestions?.map((question) => question.difficulty)).toEqual(
      FIVE_QUESTION_DIFFICULTY_MIX,
    );
  });
});

describe("generateSportQuizQuestions", () => {
  it("returns five unique questions in the exact canonical mix", () => {
    const result = generateSportQuizQuestions({
      candidates: minimumBank,
      random: () => 0,
    });

    expect(result?.map((question) => question.difficulty)).toEqual(
      FIVE_QUESTION_DIFFICULTY_MIX,
    );
    expect(result?.map((question) => question.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(result?.map((question) => question.id)).size).toBe(5);
  });

  it("prefers fresh questions when each difficulty has enough fresh candidates", () => {
    const recentQuestionIds = minimumBank.map((question) => question.id);
    const freshBank = minimumBank.map((question) => ({
      ...question,
      id: `fresh-${question.id}`,
    }));

    const result = generateSportQuizQuestions({
      candidates: [...minimumBank, ...freshBank],
      recentQuestionIds,
      random: () => 0,
    });

    expect(result?.every((question) => question.id.startsWith("fresh-"))).toBe(
      true,
    );
  });

  it("reuses recent questions only when needed to fill the run", () => {
    const result = generateSportQuizQuestions({
      candidates: minimumBank,
      recentQuestionIds: ["easy-1", "medium-1", "hard-1"],
      random: () => 0,
    });

    expect(result).toHaveLength(5);
    expect(result?.map((question) => question.id)).toEqual(
      expect.arrayContaining(["easy-1", "medium-1", "hard-1"]),
    );
  });

  it.each([
    [minimumBank.filter((question) => question.id !== "easy-2")],
    [minimumBank.filter((question) => question.id !== "medium-1")],
    [minimumBank.filter((question) => question.id !== "hard-2")],
  ])("returns null when a difficulty cannot fill its slots", (candidates) => {
    expect(
      generateSportQuizQuestions({
        candidates,
        random: () => 0,
      }),
    ).toBeNull();
  });

  it("uses the injected random function to deterministically vary selection", () => {
    const candidates = [
      ...minimumBank,
      makeQuestion("easy-3", "easy"),
      makeQuestion("medium-2", "medium"),
      makeQuestion("hard-3", "hard"),
    ];

    const lowRandom = generateSportQuizQuestions({
      candidates,
      random: () => 0,
    });
    const highRandom = generateSportQuizQuestions({
      candidates,
      random: () => 0.999,
    });

    expect(lowRandom?.map((question) => question.id)).not.toEqual(
      highRandom?.map((question) => question.id),
    );
    expect(
      generateSportQuizQuestions({ candidates, random: () => 0 })?.map(
        (question) => question.id,
      ),
    ).toEqual(lowRandom?.map((question) => question.id));
  });
});
