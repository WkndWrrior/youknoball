import "server-only";

import { getCategoryBySlug, type SportCategorySlug } from "@/lib/categories";
import {
  createQuestionSnapshot,
  normalizeAnswerOption,
  type QuestionRecord,
  type SportRecord,
} from "@/lib/dailyChallenge";
import {
  gradeSportQuizAttempt,
  MAX_SPORT_QUIZ_RECENT_QUESTION_IDS,
  parseSportQuizRecentQuestionIds,
  parseSportQuizSubmittedAnswers,
  SPORT_QUIZ_QUESTION_COUNT,
  toSportQuizPlayerQuestion,
  type SportQuizStartResponse,
  type SportQuizSubmitResponse,
} from "@/lib/sportQuiz";
import { FIVE_QUESTION_DIFFICULTY_MIX } from "@/lib/server/dailyChallengeGenerator";
import { generateSportQuizQuestions } from "@/lib/server/sportQuizGenerator";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SPORT_COLUMNS = "id,slug,name,is_active,sort_order,created_at";
const QUESTION_COLUMNS = [
  "id",
  "sport_id",
  "difficulty",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option",
  "status",
  "eligible_for_daily",
  "eligible_for_sport_quiz",
  "authoring_method",
  "source_notes",
  "reviewed_at",
  "created_at",
  "updated_at",
].join(",");
const RECENT_ATTEMPT_LIMIT = 20;
const UNAVAILABLE_MESSAGE = "This sport quiz is not available yet.";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function throwIfError(error: unknown, message: string): asserts error is null {
  if (error) {
    throw Object.assign(new Error(message), { cause: error });
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function normalizeSupportedSlug(value: unknown): SportCategorySlug | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return getCategoryBySlug(normalized)?.slug ?? null;
}

function normalizeSport(value: unknown): SportRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.is_active === "boolean" &&
    typeof value.sort_order === "number" &&
    typeof value.created_at === "string"
    ? {
        id: value.id,
        slug: value.slug,
        name: value.name,
        is_active: value.is_active,
        sort_order: value.sort_order,
        created_at: value.created_at,
      }
    : null;
}

function normalizeQuestion(value: unknown): QuestionRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const correctOption = normalizeAnswerOption(value.correct_option);
  if (
    typeof value.id !== "string" ||
    typeof value.sport_id !== "string" ||
    (value.difficulty !== "easy" &&
      value.difficulty !== "medium" &&
      value.difficulty !== "hard") ||
    typeof value.question_text !== "string" ||
    typeof value.option_a !== "string" ||
    typeof value.option_b !== "string" ||
    typeof value.option_c !== "string" ||
    typeof value.option_d !== "string" ||
    !correctOption ||
    (value.status !== "draft" &&
      value.status !== "ready" &&
      value.status !== "retired") ||
    typeof value.eligible_for_daily !== "boolean" ||
    typeof value.eligible_for_sport_quiz !== "boolean" ||
    (value.authoring_method !== "manual" &&
      value.authoring_method !== "ai_assisted") ||
    (typeof value.source_notes !== "string" && value.source_notes !== null) ||
    (typeof value.reviewed_at !== "string" && value.reviewed_at !== null) ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    sport_id: value.sport_id,
    difficulty: value.difficulty,
    question_text: value.question_text,
    option_a: value.option_a,
    option_b: value.option_b,
    option_c: value.option_c,
    option_d: value.option_d,
    correct_option: correctOption,
    status: value.status,
    eligible_for_daily: value.eligible_for_daily,
    eligible_for_sport_quiz: value.eligible_for_sport_quiz,
    authoring_method: value.authoring_method,
    source_notes: value.source_notes,
    reviewed_at: value.reviewed_at,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function unavailableResponse(): SportQuizStartResponse {
  return {
    status: "unavailable",
    message: UNAVAILABLE_MESSAGE,
  };
}

async function loadActiveSport(
  adminClient: ReturnType<typeof supabaseAdmin>,
  slug: SportCategorySlug,
) {
  const { data, error } = await adminClient
    .from("sports")
    .select(SPORT_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  throwIfError(error, "Unable to load sport quiz.");

  const sport = normalizeSport(data);
  return sport?.is_active && sport.slug === slug ? sport : null;
}

async function loadReadyQuestions(
  adminClient: ReturnType<typeof supabaseAdmin>,
  sport: SportRecord,
) {
  const { data, error } = await adminClient
    .from("questions")
    .select(QUESTION_COLUMNS)
    .eq("sport_id", sport.id)
    .eq("status", "ready")
    .eq("eligible_for_sport_quiz", true);

  throwIfError(error, "Unable to load sport quiz questions.");

  return (Array.isArray(data) ? data : [])
    .map(normalizeQuestion)
    .filter(
      (question): question is QuestionRecord =>
        question !== null &&
        question.sport_id === sport.id &&
        question.status === "ready" &&
        question.eligible_for_sport_quiz,
    )
    .map((question) => createQuestionSnapshot(question, sport));
}

function normalizeIds(data: unknown, key: string) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((value) => {
    if (!isRecord(value) || typeof value[key] !== "string") {
      return [];
    }

    return [value[key]];
  });
}

async function loadRecentQuestionIds(
  adminClient: ReturnType<typeof supabaseAdmin>,
  userId: string,
  sportId: string,
) {
  const { data: attemptData, error: attemptError } = await adminClient
    .from("sport_quiz_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("sport_id", sportId)
    .order("created_at", { ascending: false })
    .limit(RECENT_ATTEMPT_LIMIT);

  throwIfError(attemptError, "Unable to load recent sport quiz history.");

  const attemptIds = normalizeIds(attemptData, "id");
  if (attemptIds.length === 0) {
    return [];
  }

  const { data: itemData, error: itemError } = await adminClient
    .from("sport_quiz_attempt_items")
    .select("question_id,created_at")
    .in("attempt_id", attemptIds)
    .order("created_at", { ascending: false })
    .limit(MAX_SPORT_QUIZ_RECENT_QUESTION_IDS);

  throwIfError(itemError, "Unable to load recent sport quiz history.");

  return parseSportQuizRecentQuestionIds(normalizeIds(itemData, "question_id"));
}

function combineRecentQuestionIds(serverIds: string[], clientIds: unknown) {
  const seen = new Set<string>();
  const combined: string[] = [];

  for (const questionId of [
    ...serverIds,
    ...parseSportQuizRecentQuestionIds(clientIds),
  ]) {
    if (!seen.has(questionId)) {
      seen.add(questionId);
      combined.push(questionId);
    }
  }

  return combined;
}

export async function getSportQuizForPlayer(input: {
  slug: unknown;
  userId: string | null;
  clientRecentQuestionIds: unknown;
}): Promise<SportQuizStartResponse> {
  const slug = normalizeSupportedSlug(input.slug);
  if (!slug) {
    return unavailableResponse();
  }

  const adminClient = supabaseAdmin();
  const sport = await loadActiveSport(adminClient, slug);
  if (!sport) {
    return unavailableResponse();
  }

  const candidates = await loadReadyQuestions(adminClient, sport);
  const serverRecentQuestionIds = input.userId
    ? await loadRecentQuestionIds(adminClient, input.userId, sport.id)
    : [];
  const questions = generateSportQuizQuestions({
    candidates,
    recentQuestionIds: combineRecentQuestionIds(
      serverRecentQuestionIds,
      input.clientRecentQuestionIds,
    ),
  });

  if (!questions) {
    return unavailableResponse();
  }

  return {
    status: "ready",
    sport: {
      slug: sport.slug,
      name: sport.name,
    },
    questions: questions.map(toSportQuizPlayerQuestion),
  };
}

function hasExpectedDifficultyMix(questions: QuestionRecord[]) {
  const actual = questions.map((question) => question.difficulty).sort();
  const expected = [...FIVE_QUESTION_DIFFICULTY_MIX].sort();

  return actual.every((difficulty, index) => difficulty === expected[index]);
}

async function loadSubmittedQuestions(
  adminClient: ReturnType<typeof supabaseAdmin>,
  questionIds: string[],
) {
  const { data, error } = await adminClient
    .from("questions")
    .select(QUESTION_COLUMNS)
    .in("id", questionIds);

  throwIfError(error, "Unable to verify sport quiz questions.");

  return (Array.isArray(data) ? data : [])
    .map(normalizeQuestion)
    .filter((question): question is QuestionRecord => question !== null);
}

export async function submitSportQuizAttempt(input: {
  slug: unknown;
  userId: string | null;
  answers: unknown;
}): Promise<SportQuizSubmitResponse> {
  const slug = normalizeSupportedSlug(input.slug);
  if (!slug) {
    throw new Error("Unsupported sport.");
  }

  const answers = parseSportQuizSubmittedAnswers(input.answers);
  if (!answers) {
    throw new Error("A sport quiz submission requires exactly five valid answers.");
  }

  const questionIds = Object.keys(answers);
  if (!questionIds.every(isUuid)) {
    throw new Error("Invalid sport quiz submission.");
  }

  const adminClient = supabaseAdmin();
  const sport = await loadActiveSport(adminClient, slug);
  if (!sport) {
    throw new Error("Unsupported sport.");
  }

  const questions = await loadSubmittedQuestions(adminClient, questionIds);
  const uniqueQuestionIds = new Set(questions.map((question) => question.id));
  const submittedQuestionIds = new Set(questionIds);
  const validQuestions =
    questions.length === SPORT_QUIZ_QUESTION_COUNT &&
    uniqueQuestionIds.size === SPORT_QUIZ_QUESTION_COUNT &&
    questions.every(
      (question) =>
        submittedQuestionIds.has(question.id) &&
        question.sport_id === sport.id &&
        question.status === "ready" &&
        question.eligible_for_sport_quiz,
    );

  if (!validQuestions) {
    throw new Error("Invalid sport quiz questions.");
  }

  if (!hasExpectedDifficultyMix(questions)) {
    throw new Error("Invalid sport quiz difficulty mix.");
  }

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const quizQuestions = questionIds.map((questionId, index) => ({
    ...createQuestionSnapshot(questionById.get(questionId)!, sport),
    slot: index + 1,
  }));
  const graded = gradeSportQuizAttempt(quizQuestions, answers);

  if (!input.userId) {
    return {
      ...graded,
      saved: false,
    };
  }

  const { data: attemptData, error: attemptError } = await adminClient
    .from("sport_quiz_attempts")
    .insert({
      user_id: input.userId,
      sport_id: sport.id,
      score: graded.score,
      total_questions: graded.total,
    })
    .select("id")
    .single();

  throwIfError(attemptError, "Unable to save sport quiz attempt.");

  const attemptId =
    isRecord(attemptData) && isUuid(attemptData.id)
      ? attemptData.id
      : null;
  if (!attemptId) {
    throw new Error("Unable to save sport quiz attempt.");
  }

  const { error: itemError } = await adminClient
    .from("sport_quiz_attempt_items")
    .insert(
      graded.results.map((result) => ({
        attempt_id: attemptId,
        question_id: result.question_id,
        chosen_option: result.chosen_option,
        is_correct: result.is_correct,
      })),
    );

  if (itemError) {
    const { error: cleanupError } = await adminClient
      .from("sport_quiz_attempts")
      .delete()
      .eq("id", attemptId);

    if (cleanupError) {
      throw Object.assign(
        new Error(
          "Unable to clean up incomplete sport quiz attempt; manual cleanup may be required.",
        ),
        {
          cause: cleanupError,
          itemInsertError: itemError,
        },
      );
    }

    throw Object.assign(new Error("Unable to save sport quiz attempt items."), {
      cause: itemError,
    });
  }

  return {
    ...graded,
    saved: true,
  };
}
