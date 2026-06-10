import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createSportQuizSubmissionId,
  parseSportQuizSubmitResponse,
  promoteRecentQuestionIds,
  writeSportQuizHistory,
} from "@/components/SportQuiz";

const questionIds = ["q1", "q2", "q3", "q4", "q5"];

const validSubmitResponse = {
  saved: true,
  score: 3,
  total: 5,
  results: [
    { question_id: "q1", chosen_option: "A", is_correct: true },
    { question_id: "q2", chosen_option: "B", is_correct: false },
    { question_id: "q3", chosen_option: "C", is_correct: true },
    { question_id: "q4", chosen_option: "D", is_correct: false },
    { question_id: "q5", chosen_option: "A", is_correct: true },
  ],
};

describe("SportQuiz", () => {
  async function readSource() {
    return readFile(
      path.join(process.cwd(), "src/components/SportQuiz.tsx"),
      "utf8",
    );
  }

  it("loads and submits the selected sport quiz through the side-game APIs", async () => {
    const source = await readSource();

    expect(source).toContain('"use client"');
    expect(source).toContain("`/api/sport-quiz/${slug}`");
    expect(source).toContain("`/api/sport-quiz/${slug}/submit`");
    expect(source).toContain("recentQuestionIds");
    expect(source).toContain(
      "JSON.stringify({ answers: payloadAnswers, submissionId })",
    );
    expect(source).toContain("const [submissionId, setSubmissionId]");
    expect(source).toContain("createSportQuizSubmissionId()");
    expect(source).toContain("setSubmissionId(nextSubmissionId)");
    expect(source).toContain("setSubmissionId(null)");
    expect(source).toContain("questions.length !== SPORT_QUIZ_QUESTION_COUNT");
    expect(source).toContain("answeredCount === SPORT_QUIZ_QUESTION_COUNT");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("requestIdRef");
    expect(source).toContain(".abort()");
    expect(source).toContain("return () =>");
    expect(source).toContain("isAbortError");
    expect(source.match(/requestId !== requestIdRef\.current/g)).toHaveLength(5);
    expect(source.match(/isAbortError\((load|submit)Error\)/g)).toHaveLength(2);
  });

  it("creates a validated submission ID for each loaded run", () => {
    expect(
      createSportQuizSubmissionId(
        () => "00000000-0000-4000-8000-000000000001",
      ),
    ).toBe("00000000-0000-4000-8000-000000000001");
    expect(createSportQuizSubmissionId(() => "not-a-uuid")).toBeNull();
    expect(
      createSportQuizSubmissionId(() => {
        throw new Error("crypto unavailable");
      }),
    ).toBeNull();
  });

  it("keeps one submission ID through submit retries and replaces it on reload", async () => {
    const source = await readSource();
    const loadStart = source.indexOf("const loadQuiz = useCallback");
    const submitStart = source.indexOf("async function submitQuiz()");
    const retryStart = source.indexOf("function retry()");
    const createIdIndex = source.indexOf("createSportQuizSubmissionId()", loadStart);
    const submitBodyIndex = source.indexOf(
      "JSON.stringify({ answers: payloadAnswers, submissionId })",
      submitStart,
    );

    expect(createIdIndex).toBeGreaterThan(loadStart);
    expect(createIdIndex).toBeLessThan(submitStart);
    expect(submitBodyIndex).toBeGreaterThan(submitStart);
    expect(source.slice(submitStart, retryStart)).not.toContain(
      "createSportQuizSubmissionId()",
    );
    expect(source.slice(retryStart)).not.toContain("setSubmissionId(");
  });

  it("supports every quiz state and the required player actions", async () => {
    const source = await readSource();

    expect(source).toContain('"loading"');
    expect(source).toContain('"unavailable"');
    expect(source).toContain('"playing"');
    expect(source).toContain('"submitting"');
    expect(source).toContain('"results"');
    expect(source).toContain('"error"');
    expect(source).toContain("Loading your");
    expect(source).toContain("Try Again");
    expect(source).toContain("Submit Answers");
    expect(source).toContain("Play Again");
    expect(source).toContain("Back to categories");
    expect(source).toContain('href="/"');
    expect(source).not.toContain('href="/#categories"');
  });

  it("renders accessible A-D controls and answer-by-answer results", async () => {
    const source = await readSource();

    expect(source).toContain('const optionKeys: AnswerOption[] = ["A", "B", "C", "D"]');
    expect(source).toContain("<fieldset");
    expect(source).toContain("<legend");
    expect(source).toContain('type="radio"');
    expect(source).toContain("name={`sport-quiz-${slug}-${question.id}`}");
    expect(source).toContain("checked={isSelected}");
    expect(source).toContain("onChange={() => selectAnswer(question.id, option)}");
    expect(source).toContain("focus-within:ring-2");
    expect(source).not.toContain("aria-pressed={isSelected}");
    expect(source).toContain("Question {question.slot}");
    expect(source).toContain('questionResult.is_correct ? "Correct" : "Miss"');
    expect(source).toContain("{result.score}/{result.total}");
    expect(source).toContain('className="mt-4 min-h-6"');
    expect(source).toContain("block min-h-6 break-words");
    expect(source).toContain("min-h-14 min-w-0");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("resultSummaryRef");
    expect(source).toContain("resultSummaryRef.current?.focus()");
    expect(source).toContain("tabIndex={-1}");
    expect(source).not.toMatch(/timer/i);
    expect(source).not.toMatch(/leaderboard/i);
    expect(source).not.toMatch(/share/i);
  });

  it("keeps a capped slug-specific local question history for replays", async () => {
    const source = await readSource();

    expect(source).toContain('const SPORT_QUIZ_HISTORY_KEY_PREFIX = "ykb_sport_quiz_recent"');
    expect(source).toContain("`${SPORT_QUIZ_HISTORY_KEY_PREFIX}:${slug}`");
    expect(source).toContain("window.localStorage");
    expect(source).toContain("return window.localStorage;");
    expect(source).toContain("catch");
    expect(source).toContain("MAX_SPORT_QUIZ_RECENT_QUESTION_IDS");
    expect(source).toContain(".slice(");
    expect(source).toContain("-MAX_SPORT_QUIZ_RECENT_QUESTION_IDS");
    expect(source).toContain("new Set");
    expect(source).toContain("void loadQuiz()");
  });

  it("promotes every completed question to the newest history positions", () => {
    const existingQuestionIds = Array.from(
      { length: 25 },
      (_, index) => `question-${index + 1}`,
    );
    const completedQuestionIds = [
      "question-1",
      "question-2",
      "question-26",
      "question-27",
      "question-28",
    ];

    const recentQuestionIds = promoteRecentQuestionIds(
      existingQuestionIds,
      completedQuestionIds,
    );

    expect(recentQuestionIds).toHaveLength(25);
    expect(new Set(recentQuestionIds).size).toBe(25);
    expect(recentQuestionIds.slice(-5)).toEqual(completedQuestionIds);
  });

  it("treats local history writes as best-effort", () => {
    const storage = {
      getItem: () => JSON.stringify(["old-question"]),
      setItem: () => {
        throw new Error("storage quota exceeded");
      },
    };

    expect(
      writeSportQuizHistory(storage, "cfb", questionIds),
    ).toBe(false);
  });

  it("strictly validates a complete submit response for the current run", () => {
    expect(parseSportQuizSubmitResponse(validSubmitResponse, questionIds)).toEqual(
      validSubmitResponse,
    );
  });

  it.each([
    ["wrong total", { ...validSubmitResponse, total: 4 }],
    ["invalid score", { ...validSubmitResponse, score: 6 }],
    ["non-integer score", { ...validSubmitResponse, score: 2.5 }],
    ["score does not match results", { ...validSubmitResponse, score: 2 }],
    [
      "fewer than five results",
      { ...validSubmitResponse, results: validSubmitResponse.results.slice(0, 4) },
    ],
    [
      "wrong question IDs",
      {
        ...validSubmitResponse,
        results: validSubmitResponse.results.map((result, index) =>
          index === 4 ? { ...result, question_id: "other-question" } : result,
        ),
      },
    ],
    [
      "duplicate question IDs",
      {
        ...validSubmitResponse,
        results: validSubmitResponse.results.map((result, index) =>
          index === 4 ? { ...result, question_id: "q1" } : result,
        ),
      },
    ],
    [
      "invalid chosen option",
      {
        ...validSubmitResponse,
        results: validSubmitResponse.results.map((result, index) =>
          index === 4 ? { ...result, chosen_option: "E" } : result,
        ),
      },
    ],
    [
      "invalid correctness value",
      {
        ...validSubmitResponse,
        results: validSubmitResponse.results.map((result, index) =>
          index === 4 ? { ...result, is_correct: "yes" } : result,
        ),
      },
    ],
    ["invalid saved value", { ...validSubmitResponse, saved: "yes" }],
  ])("rejects a submit response with %s", (_description, payload) => {
    expect(parseSportQuizSubmitResponse(payload, questionIds)).toBeNull();
  });

  it("uses the generic retryable error before any history write for invalid responses", async () => {
    const source = await readSource();
    const validationIndex = source.indexOf("parseSportQuizSubmitResponse(");
    const genericErrorIndex = source.indexOf(
      'throw new Error("Unable to score this quiz.")',
      validationIndex,
    );
    const submitCatchIndex = source.indexOf("} catch (submitError)", genericErrorIndex);
    const historyWriteIndex = source.indexOf("writeSportQuizHistory(", validationIndex);

    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(genericErrorIndex).toBeGreaterThan(validationIndex);
    expect(submitCatchIndex).toBeGreaterThan(genericErrorIndex);
    expect(historyWriteIndex).toBeGreaterThan(submitCatchIndex);
    expect(historyWriteIndex).toBeGreaterThan(genericErrorIndex);
  });
});
