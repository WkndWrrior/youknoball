export type AnswerOption = "A" | "B" | "C" | "D";

export type DifficultyTier = "starter" | "pro";

export type QuestionDifficulty = "easy" | "medium" | "hard";

export type QuestionStatus = "draft" | "ready" | "retired";

export type AuthoringMethod = "manual" | "ai_assisted";

export type DailyChallengeStatus = "generated" | "published" | "archived";

export type GenerationMethod = "manual" | "semi_auto" | "auto";

export type SportRecord = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type QuestionRecord = {
  id: string;
  sport_id: string;
  difficulty: QuestionDifficulty;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: AnswerOption;
  status: QuestionStatus;
  eligible_for_daily: boolean;
  eligible_for_sport_quiz: boolean;
  authoring_method: AuthoringMethod;
  source_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionSnapshot = Omit<QuestionRecord, "sport_id"> & {
  sport: SportRecord;
};

export type DailyChallengeItemRecord = {
  id: string;
  daily_challenge_id: string;
  slot: number;
  question_id: string;
  question_snapshot: QuestionSnapshot;
  created_at: string;
};

export type DailyChallengeRecord = {
  id: string;
  challenge_date: string;
  status: DailyChallengeStatus;
  generation_method: GenerationMethod;
  rules_version: string;
  generated_at: string | null;
  published_at: string | null;
  created_at: string;
  items: DailyChallengeItemRecord[];
};

export type DailyChallengeQuestion = {
  id: string;
  slot: number;
  sport: string;
  difficulty: DifficultyTier;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: AnswerOption;
};

export type DailyChallengeQuestionForPlayer = Omit<
  DailyChallengeQuestion,
  "correct_option"
>;

export type SubmittedAnswers = Record<string, AnswerOption>;

export type PendingGuestAttemptClaim = {
  date: string;
  answers: SubmittedAnswers;
};

export type QuestionResult = {
  question_id: string;
  chosen_option: AnswerOption;
  is_correct: boolean;
};

export type DailyChallengeReadyResponse = {
  status: "ready";
  date: string;
  questions: DailyChallengeQuestionForPlayer[];
};

export type DailyChallengeUnavailableResponse = {
  status: "unavailable";
  date: string;
  message: string;
};

export type DailyChallengeTimer = {
  startedAt: string;
  durationLimitMs: number;
  remainingMs: number;
};

export type DailyChallengeResponse =
  | (DailyChallengeReadyResponse & { timer?: DailyChallengeTimer | null })
  | DailyChallengeUnavailableResponse;

export type GradedAttempt = {
  score: number;
  total: number;
  results: QuestionResult[];
};

export type AttemptPayload = {
  id: string | null;
  date: string;
  created_at: string | null;
  score: number;
  total: number;
  durationMs: number | null;
  leaderboardEligible: boolean;
  results: QuestionResult[];
};

export type LeaderboardStatus =
  | "eligible"
  | "needs_display_name"
  | "timer_unavailable"
  | "timed_out"
  | "casual";

export type PlayerStatsSummary = {
  averageScore: number;
  totalPlays: number;
  lastPlayedAt: string | null;
};

export type AttemptSubmitResponse = {
  message: string;
  saved: boolean;
  leaderboardEligible: boolean;
  leaderboardStatus: LeaderboardStatus;
  attempt: AttemptPayload;
  shareText: string;
  stats?: PlayerStatsSummary;
};

export const storedAttemptKeyPrefix = "ykb_daily_attempt";
export const pendingGuestAttemptClaimStorageKey = "ykb_pending_guest_attempt_claim";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeAnswerOption(value: unknown): AnswerOption | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "A" ||
    normalized === "B" ||
    normalized === "C" ||
    normalized === "D"
  ) {
    return normalized;
  }

  return null;
}

export function parseSubmittedAnswers(raw: unknown): SubmittedAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const parsed: SubmittedAnswers = {};

  for (const [questionId, value] of Object.entries(raw)) {
    const normalized = normalizeAnswerOption(value);
    if (!questionId || !normalized) {
      return null;
    }

    parsed[questionId] = normalized;
  }

  return parsed;
}

export function toPlayerQuestion(
  question: DailyChallengeQuestion,
): DailyChallengeQuestionForPlayer {
  return {
    id: question.id,
    slot: question.slot,
    sport: question.sport,
    difficulty: question.difficulty,
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
  };
}

export function createQuestionSnapshot(
  question: QuestionRecord,
  sport: SportRecord,
): QuestionSnapshot {
  const { sport_id, ...snapshot } = question;
  void sport_id;

  return {
    ...snapshot,
    sport,
  };
}

export function gradeAttempt(
  questions: DailyChallengeQuestion[],
  answers: SubmittedAnswers,
): GradedAttempt {
  const orderedQuestions = [...questions].sort((left, right) => left.slot - right.slot);
  const results = orderedQuestions.map((question) => {
    const chosenOption = answers[question.id];

    return {
      question_id: question.id,
      chosen_option: chosenOption,
      is_correct: chosenOption === question.correct_option,
    };
  });

  const score = results.reduce((total, result) => {
    return result.is_correct ? total + 1 : total;
  }, 0);

  return {
    score,
    total: orderedQuestions.length,
    results,
  };
}

export function buildShareText(date: string, gradedAttempt: GradedAttempt) {
  const emojiBar = gradedAttempt.results
    .map((result) => (result.is_correct ? "🟩" : "⬜"))
    .join("");

  return [
    `YouKnoBall Daily Challenge ${date}`,
    `${gradedAttempt.score}/${gradedAttempt.total}`,
    emojiBar,
  ].join("\n");
}

export function getStoredAttemptKey(date: string) {
  return `${storedAttemptKeyPrefix}:${date}`;
}

export function readPendingGuestAttemptClaim(storage: StorageLike | null) {
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(pendingGuestAttemptClaimStorageKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as {
      date?: unknown;
      answers?: unknown;
    };
    const date = typeof parsed.date === "string" ? parsed.date : "";
    const answers = parseSubmittedAnswers(parsed.answers);

    if (!isValidIsoDate(date) || !answers || Object.keys(answers).length !== 5) {
      return null;
    }

    return {
      date,
      answers,
    } satisfies PendingGuestAttemptClaim;
  } catch {
    return null;
  }
}

export function writePendingGuestAttemptClaim(
  storage: StorageLike | null,
  claim: PendingGuestAttemptClaim,
) {
  if (!storage) {
    return;
  }

  storage.setItem(pendingGuestAttemptClaimStorageKey, JSON.stringify(claim));
}

export function clearPendingGuestAttemptClaim(storage: StorageLike | null) {
  if (!storage) {
    return;
  }

  storage.removeItem(pendingGuestAttemptClaimStorageKey);
}

export function shouldAutoClaimPendingGuestAttempt(args: {
  userId: string | null;
  challengeDate: string | null;
  pendingClaim: PendingGuestAttemptClaim | null;
  hasSavedResult: boolean;
  claimInFlight: boolean;
}) {
  return Boolean(
    args.userId &&
      args.challengeDate &&
      args.pendingClaim &&
      args.pendingClaim.date === args.challengeDate &&
      !args.hasSavedResult &&
      !args.claimInFlight,
  );
}
