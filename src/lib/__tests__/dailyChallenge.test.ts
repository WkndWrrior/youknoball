import { describe, expect, it } from "vitest";

import {
  buildShareText,
  clearPendingGuestAttemptClaim,
  createQuestionSnapshot,
  gradeAttempt,
  readPendingGuestAttemptClaim,
  shouldAutoClaimPendingGuestAttempt,
  type AuthoringMethod,
  type DailyChallengeItemRecord,
  type DailyChallengeStatus,
  type DailyChallengeRecord,
  type GenerationMethod,
  type PendingGuestAttemptClaim,
  type QuestionDifficulty,
  type QuestionRecord,
  type QuestionStatus,
  type SportRecord,
  writePendingGuestAttemptClaim,
} from "@/lib/dailyChallenge";

const challengeQuestions = [
  {
    id: "q1",
    slot: 1,
    sport: "NBA",
    difficulty: "starter" as const,
    question_text: "Question 1",
    option_a: "A1",
    option_b: "B1",
    option_c: "C1",
    option_d: "D1",
    correct_option: "A" as const,
  },
  {
    id: "q2",
    slot: 2,
    sport: "NFL",
    difficulty: "starter" as const,
    question_text: "Question 2",
    option_a: "A2",
    option_b: "B2",
    option_c: "C2",
    option_d: "D2",
    correct_option: "B" as const,
  },
  {
    id: "q3",
    slot: 3,
    sport: "NHL",
    difficulty: "starter" as const,
    question_text: "Question 3",
    option_a: "A3",
    option_b: "B3",
    option_c: "C3",
    option_d: "D3",
    correct_option: "C" as const,
  },
  {
    id: "q4",
    slot: 4,
    sport: "CBB",
    difficulty: "pro" as const,
    question_text: "Question 4",
    option_a: "A4",
    option_b: "B4",
    option_c: "C4",
    option_d: "D4",
    correct_option: "D" as const,
  },
  {
    id: "q5",
    slot: 5,
    sport: "MLB",
    difficulty: "pro" as const,
    question_text: "Question 5",
    option_a: "A5",
    option_b: "B5",
    option_c: "C5",
    option_d: "D5",
    correct_option: "A" as const,
  },
];

describe("gradeAttempt", () => {
  it("grades each question in slot order and totals the score", () => {
    const graded = gradeAttempt(challengeQuestions, {
      q4: "D",
      q2: "C",
      q5: "A",
      q1: "A",
      q3: "C",
    });

    expect(graded.score).toBe(4);
    expect(graded.total).toBe(5);
    expect(graded.results).toEqual([
      { question_id: "q1", chosen_option: "A", is_correct: true },
      { question_id: "q2", chosen_option: "C", is_correct: false },
      { question_id: "q3", chosen_option: "C", is_correct: true },
      { question_id: "q4", chosen_option: "D", is_correct: true },
      { question_id: "q5", chosen_option: "A", is_correct: true },
    ]);
  });
});

describe("buildShareText", () => {
  it("builds the guest/shareable score text from a graded result", () => {
    const graded = gradeAttempt(challengeQuestions, {
      q1: "A",
      q2: "B",
      q3: "D",
      q4: "A",
      q5: "A",
    });

    expect(buildShareText("2026-04-01", graded)).toBe(
      ["YouKnoBall Daily Challenge 2026-04-01", "3/5", "🟩🟩⬜⬜🟩"].join("\n"),
    );
  });
});

describe("new question bank domain model", () => {
  it("exposes the stricter allowed values in the shared types", () => {
    const questionDifficulties = ["easy", "medium", "hard"] as const satisfies readonly QuestionDifficulty[];
    const questionStatuses = ["draft", "ready", "retired"] as const satisfies readonly QuestionStatus[];
    const authoringMethods = ["manual", "ai_assisted"] as const satisfies readonly AuthoringMethod[];
    const dailyChallengeStatuses = ["generated", "published", "archived"] as const satisfies readonly DailyChallengeStatus[];
    const generationMethods = ["manual", "semi_auto", "auto"] as const satisfies readonly GenerationMethod[];

    expect(questionDifficulties).toEqual(["easy", "medium", "hard"]);
    expect(questionStatuses).toEqual(["draft", "ready", "retired"]);
    expect(authoringMethods).toEqual(["manual", "ai_assisted"]);
    expect(dailyChallengeStatuses).toEqual(["generated", "published", "archived"]);
    expect(generationMethods).toEqual(["manual", "semi_auto", "auto"]);
  });

  it("can model reusable questions, future sports, and a canonical daily challenge", () => {
    const sports = [
      {
        id: "sport_cfb",
        slug: "cfb",
        name: "College Football",
        is_active: true,
        sort_order: 40,
        created_at: "2026-04-03T00:00:00Z",
      },
      {
        id: "sport_nba",
        slug: "nba",
        name: "NBA",
        is_active: true,
        sort_order: 10,
        created_at: "2026-04-03T00:00:00Z",
      },
    ] as const satisfies SportRecord[];

    const questions = [
      {
        id: "question_1",
        sport_id: sports[0].id,
        difficulty: "easy",
        question_text: "Which program wins the CFP national title?",
        option_a: "Team A",
        option_b: "Team B",
        option_c: "Team C",
        option_d: "Team D",
        correct_option: "A",
        status: "ready",
        eligible_for_daily: true,
        eligible_for_sport_quiz: true,
        authoring_method: "manual",
        source_notes: "Reusable question for future football coverage",
        reviewed_at: "2026-04-03T00:00:00Z",
        created_at: "2026-04-03T00:00:00Z",
        updated_at: "2026-04-03T00:00:00Z",
      },
    ] as const satisfies QuestionRecord[];

    const dailyChallenge = {
      id: "challenge_1",
      challenge_date: "2026-04-03",
      status: "published",
      generation_method: "auto",
      rules_version: "v1",
      generated_at: "2026-04-03T00:00:00Z",
      published_at: "2026-04-03T00:00:00Z",
      created_at: "2026-04-03T00:00:00Z",
      items: [
        {
          id: "item_1",
          daily_challenge_id: "challenge_1",
          slot: 1,
          question_id: questions[0].id,
          question_snapshot: {
            ...questions[0],
            sport: sports[0],
          },
          created_at: "2026-04-03T00:00:00Z",
        },
      ],
    } as const satisfies DailyChallengeRecord;

    const snapshot = createQuestionSnapshot(questions[0], sports[0]);
    const dailyChallengeItem = {
      ...(dailyChallenge.items[0] as DailyChallengeItemRecord),
      question_snapshot: snapshot,
    };

    expect(sports[0].slug).toBe("cfb");
    expect(questions[0].sport_id).toBe(sports[0].id);
    expect(dailyChallengeItem.question_snapshot.sport.slug).toBe("cfb");
  });
});

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe("pending guest attempt claim storage", () => {
  it("writes, reads, and clears the pending guest claim payload", () => {
    const storage = createStorage();
    const claim: PendingGuestAttemptClaim = {
      date: "2026-04-14",
      answers: {
        q1: "A",
        q2: "B",
        q3: "C",
        q4: "D",
        q5: "A",
      },
    };

    writePendingGuestAttemptClaim(storage, claim);

    expect(readPendingGuestAttemptClaim(storage)).toEqual(claim);

    clearPendingGuestAttemptClaim(storage);

    expect(readPendingGuestAttemptClaim(storage)).toBeNull();
  });

  it("ignores malformed pending guest claim payloads", () => {
    const storage = createStorage();
    storage.setItem(
      "ykb_pending_guest_attempt_claim",
      JSON.stringify({
        date: "2026-04-14",
        answers: {
          q1: "A",
          q2: "B",
          q3: "NOPE",
        },
      }),
    );

    expect(readPendingGuestAttemptClaim(storage)).toBeNull();
  });
});

describe("shouldAutoClaimPendingGuestAttempt", () => {
  it("returns true only for an authenticated player with a current-date pending claim and no saved result", () => {
    expect(
      shouldAutoClaimPendingGuestAttempt({
        userId: "user-123",
        challengeDate: "2026-04-14",
        pendingClaim: {
          date: "2026-04-14",
          answers: {
            q1: "A",
            q2: "B",
            q3: "C",
            q4: "D",
            q5: "A",
          },
        },
        hasSavedResult: false,
        claimInFlight: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoClaimPendingGuestAttempt({
        userId: null,
        challengeDate: "2026-04-14",
        pendingClaim: {
          date: "2026-04-14",
          answers: {
            q1: "A",
            q2: "B",
            q3: "C",
            q4: "D",
            q5: "A",
          },
        },
        hasSavedResult: false,
        claimInFlight: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoClaimPendingGuestAttempt({
        userId: "user-123",
        challengeDate: "2026-04-15",
        pendingClaim: {
          date: "2026-04-14",
          answers: {
            q1: "A",
            q2: "B",
            q3: "C",
            q4: "D",
            q5: "A",
          },
        },
        hasSavedResult: false,
        claimInFlight: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoClaimPendingGuestAttempt({
        userId: "user-123",
        challengeDate: "2026-04-14",
        pendingClaim: {
          date: "2026-04-14",
          answers: {
            q1: "A",
            q2: "B",
            q3: "C",
            q4: "D",
            q5: "A",
          },
        },
        hasSavedResult: true,
        claimInFlight: false,
      }),
    ).toBe(false);
  });
});
