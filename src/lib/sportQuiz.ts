import {
  normalizeAnswerOption,
  type QuestionResult,
  type QuestionSnapshot,
  type SubmittedAnswers,
} from "@/lib/dailyChallenge";

export const MAX_SPORT_QUIZ_RECENT_QUESTION_IDS = 25;
export const SPORT_QUIZ_QUESTION_COUNT = 5;

export type SportQuizQuestion = QuestionSnapshot & {
  slot: number;
};

export type SportQuizPlayerQuestion = {
  id: string;
  slot: number;
  sport: string;
  difficulty: SportQuizQuestion["difficulty"];
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

export type SportQuizReadyResponse = {
  status: "ready";
  sport: {
    slug: string;
    name: string;
  };
  questions: SportQuizPlayerQuestion[];
};

export type SportQuizUnavailableResponse = {
  status: "unavailable";
  message: string;
};

export type SportQuizStartResponse =
  | SportQuizReadyResponse
  | SportQuizUnavailableResponse;

export type SportQuizGradedAttempt = {
  score: number;
  total: number;
  results: QuestionResult[];
};

export type SportQuizSubmitResponse = SportQuizGradedAttempt & {
  saved: boolean;
};

export function parseSportQuizRecentQuestionIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string")) {
    return [];
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const value of raw) {
    const questionId = value.trim();
    if (!questionId || seen.has(questionId)) {
      continue;
    }

    seen.add(questionId);
    ids.push(questionId);

    if (ids.length === MAX_SPORT_QUIZ_RECENT_QUESTION_IDS) {
      break;
    }
  }

  return ids;
}

export function parseSportQuizSubmittedAnswers(
  raw: unknown,
  expectedQuestionIds?: readonly string[],
): SubmittedAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const entries = Object.entries(raw);
  if (entries.length !== SPORT_QUIZ_QUESTION_COUNT) {
    return null;
  }

  const submittedQuestionIds = new Set(entries.map(([questionId]) => questionId));
  if (
    submittedQuestionIds.size !== SPORT_QUIZ_QUESTION_COUNT ||
    [...submittedQuestionIds].some((questionId) => !questionId.trim())
  ) {
    return null;
  }

  if (expectedQuestionIds) {
    const expectedIds = new Set(expectedQuestionIds);
    if (
      expectedIds.size !== SPORT_QUIZ_QUESTION_COUNT ||
      [...submittedQuestionIds].some((questionId) => !expectedIds.has(questionId))
    ) {
      return null;
    }
  }

  const answers: SubmittedAnswers = {};
  for (const [questionId, value] of entries) {
    const answer = normalizeAnswerOption(value);
    if (!answer) {
      return null;
    }

    answers[questionId] = answer;
  }

  return answers;
}

export function toSportQuizPlayerQuestion(
  question: SportQuizQuestion,
): SportQuizPlayerQuestion {
  return {
    id: question.id,
    slot: question.slot,
    sport: question.sport.name,
    difficulty: question.difficulty,
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
  };
}

export function gradeSportQuizAttempt(
  questions: SportQuizQuestion[],
  answers: SubmittedAnswers,
): SportQuizGradedAttempt {
  const orderedQuestions = [...questions].sort((left, right) => left.slot - right.slot);
  const results = orderedQuestions.map((question) => {
    const chosenOption = normalizeAnswerOption(answers?.[question.id]);
    if (!chosenOption) {
      throw new Error(`Missing or invalid answer for question ${question.id}`);
    }

    return {
      question_id: question.id,
      chosen_option: chosenOption,
      is_correct: chosenOption === question.correct_option,
    };
  });

  return {
    score: results.filter((result) => result.is_correct).length,
    total: orderedQuestions.length,
    results,
  };
}
