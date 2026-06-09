import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

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
    expect(source).toContain("JSON.stringify({ answers: payloadAnswers })");
    expect(source).toContain("questions.length !== SPORT_QUIZ_QUESTION_COUNT");
    expect(source).toContain("answeredCount === SPORT_QUIZ_QUESTION_COUNT");
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
    expect(source).toContain("aria-pressed={isSelected}");
    expect(source).toContain("Question {question.slot}");
    expect(source).toContain('questionResult.is_correct ? "Correct" : "Miss"');
    expect(source).toContain("{result.score}/{result.total}");
    expect(source).not.toMatch(/timer/i);
    expect(source).not.toMatch(/leaderboard/i);
    expect(source).not.toMatch(/share/i);
  });

  it("keeps a capped slug-specific local question history for replays", async () => {
    const source = await readSource();

    expect(source).toContain('const SPORT_QUIZ_HISTORY_KEY_PREFIX = "ykb_sport_quiz_recent"');
    expect(source).toContain("`${SPORT_QUIZ_HISTORY_KEY_PREFIX}:${slug}`");
    expect(source).toContain("window.localStorage");
    expect(source).toContain("MAX_SPORT_QUIZ_RECENT_QUESTION_IDS");
    expect(source).toContain(".slice(-MAX_SPORT_QUIZ_RECENT_QUESTION_IDS)");
    expect(source).toContain("new Set");
    expect(source).toContain("void loadQuiz()");
  });
});
