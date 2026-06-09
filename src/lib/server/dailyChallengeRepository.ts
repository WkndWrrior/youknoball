import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import {
  sportsCategories,
  type SportCategoryPerformance,
  type SportCategorySlug,
} from "@/lib/categories";
import type {
  AnswerOption,
  DailyChallengeQuestion,
  QuestionSnapshot,
  SubmittedAnswers,
} from "@/lib/dailyChallenge";
import { sortLeaderboardEntries, type LeaderboardEntry } from "@/lib/leaderboard";
import {
  generateDailyChallengeQuestions,
  type GeneratedDailyChallengeQuestion,
} from "@/lib/server/dailyChallengeGenerator";
import type { ServerSupabaseClient } from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type StoredDailyAttempt = {
  id: string;
  daily_challenge_id: string | null;
  challenge_date: string;
  created_at: string;
  score: number;
  total_questions: number;
  duration_ms?: number | null;
  leaderboard_eligible?: boolean | null;
  answers: SubmittedAnswers;
};

export type StoredDailyAttemptStart = {
  id: string;
  user_id: string;
  daily_challenge_id: string | null;
  challenge_date: string;
  started_at: string;
};

export type PlayerStats = {
  averageScore: number;
  totalPlays: number;
  lastPlayedAt: string | null;
};

export type PlayerProfile = {
  display_name: string | null;
};

const QUESTION_COLUMNS = [
  "id",
  "slot",
  "sport",
  "difficulty",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option",
].join(",");

const CANONICAL_CHALLENGE_COLUMNS = [
  "id",
  "challenge_date",
  "status",
  "generation_method",
  "rules_version",
  "generated_at",
  "published_at",
  "created_at",
].join(",");

const REUSABLE_QUESTION_COLUMNS = [
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
  "sport:sports(id,slug,name,is_active,sort_order,created_at)",
].join(",");

const RECENT_HISTORY_CHALLENGE_LIMIT = 30;
const GENERATED_CHALLENGE_STATUS = "published";
const GENERATED_CHALLENGE_METHOD = "auto";
const GENERATED_CHALLENGE_RULES_VERSION = "v1";
const GENERATED_CHALLENGE_STALE_AFTER_MS = 2 * 60 * 1000;

type CanonicalChallengeReadState =
  | {
      kind: "ready";
      challengeId: string;
      questions: DailyChallengeQuestion[];
    }
  | {
      kind: "missing";
    }
  | {
      kind: "unavailable";
    }
  | {
      kind: "bridge_fallback";
    }
  | {
      kind: "retryable_generated";
      challengeId: string;
    };

type CanonicalChallengeRow = {
  id: string;
  status: string;
  generated_at: string | null;
  published_at: string | null;
};

type CanonicalChallengeItemRow = {
  slot: number;
  question_snapshot: QuestionSnapshot;
};

type PlayerStatsAttemptRow = {
  score: number;
  challenge_date: string;
};

type PlayerSportPerformanceAttemptRow = {
  daily_challenge_id: string;
  challenge_date: string;
  answers: Record<string, unknown>;
};

type PlayerSportPerformanceItemRow = {
  daily_challenge_id: string;
  question_id: string;
  question_snapshot: QuestionSnapshot;
};

type PlayerSportQuizAttemptRow = {
  sport_id: string;
  score: number;
  total_questions: number;
  created_at: string;
};

type PlayerSportRow = {
  id: string;
  slug: SportCategorySlug;
};

const DAILY_ATTEMPT_COLUMNS =
  "id,daily_challenge_id,challenge_date,created_at,score,total_questions,duration_ms,leaderboard_eligible,answers";

const DAILY_ATTEMPT_START_COLUMNS =
  "id,user_id,daily_challenge_id,challenge_date,started_at";

const supportedSportCategorySlugs = new Set<SportCategorySlug>(
  sportsCategories.map((category) => category.slug),
);

function throwIfError(error: PostgrestError | null, message: string) {
  if (error) {
    throw Object.assign(new Error(message), {
      cause: error,
      code: error.code,
    });
  }
}

function isDuplicateError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function isAnswerOption(value: unknown): value is AnswerOption {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type ServeableChallengeForDate = {
  dailyChallengeId: string | null;
  questions: DailyChallengeQuestion[];
};

function isCanonicalStoreUnavailableError(error: PostgrestError | null) {
  return Boolean(error);
}

function isSportQuizStoreUnavailableError(error: PostgrestError | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function isConflictError(error: PostgrestError | null) {
  return Boolean(error && error.code === "23505");
}

function isStaleGeneratedAt(generatedAt: string | null) {
  if (!generatedAt) {
    return false;
  }

  const generatedTime = Date.parse(generatedAt);
  if (Number.isNaN(generatedTime)) {
    return false;
  }

  return Date.now() - generatedTime >= GENERATED_CHALLENGE_STALE_AFTER_MS;
}

function normalizeCanonicalChallenge(
  value: unknown,
): CanonicalChallengeRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.id === "string" &&
    typeof value.status === "string" &&
    (typeof value.generated_at === "string" || value.generated_at === null) &&
    (typeof value.published_at === "string" || value.published_at === null)
    ? {
        id: value.id,
        status: value.status,
        generated_at: value.generated_at,
        published_at: value.published_at,
      }
    : null;
}

function isGenerationInProgressChallenge(challenge: {
  status: string;
  generated_at: string | null;
  published_at: string | null;
}) {
  return challenge.status === "generated" && challenge.published_at === null;
}

function toChallengeQuestion(
  snapshot: QuestionSnapshot,
  slot: number,
): DailyChallengeQuestion {
  return {
    id: String(snapshot.id),
    slot,
    sport: snapshot.sport.name,
    difficulty: slot <= 3 ? "starter" : "pro",
    question_text: snapshot.question_text,
    option_a: snapshot.option_a,
    option_b: snapshot.option_b,
    option_c: snapshot.option_c,
    option_d: snapshot.option_d,
    correct_option: snapshot.correct_option,
  };
}

function normalizeCanonicalChallengeItem(
  value: unknown,
): CanonicalChallengeItemRow | null {
  if (!isRecord(value) || typeof value.slot !== "number") {
    return null;
  }

  return hasCanonicalSnapshotShape(value.question_snapshot)
    ? {
        slot: value.slot,
        question_snapshot: value.question_snapshot,
      }
    : null;
}

function normalizeReusableQuestionCandidate(
  value: unknown,
): QuestionSnapshot | null {
  if (!hasQuestionSnapshotShape(value) || !isRecord(value)) {
    return null;
  }

  return value.status === "ready" && value.eligible_for_daily === true
    ? {
        id: value.id,
        sport: value.sport,
        difficulty: value.difficulty,
        question_text: value.question_text,
        option_a: value.option_a,
        option_b: value.option_b,
        option_c: value.option_c,
        option_d: value.option_d,
        correct_option: value.correct_option,
        status: value.status,
        eligible_for_daily: value.eligible_for_daily,
        eligible_for_sport_quiz: value.eligible_for_sport_quiz,
        authoring_method: value.authoring_method,
        source_notes: value.source_notes,
        reviewed_at: value.reviewed_at,
        created_at: value.created_at,
        updated_at: value.updated_at,
      }
    : null;
}

function normalizePlayerStatsAttempt(
  value: unknown,
): PlayerStatsAttemptRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.score === "number" &&
    typeof value.challenge_date === "string"
    ? {
        score: value.score,
        challenge_date: value.challenge_date,
      }
    : null;
}

function normalizePlayerSportPerformanceAttempt(
  value: unknown,
): PlayerSportPerformanceAttemptRow | null {
  if (!isRecord(value) || !isRecord(value.answers)) {
    return null;
  }

  return typeof value.daily_challenge_id === "string" &&
    typeof value.challenge_date === "string"
    ? {
        daily_challenge_id: value.daily_challenge_id,
        challenge_date: value.challenge_date,
        answers: value.answers,
      }
    : null;
}

function normalizePlayerSportPerformanceItem(
  value: unknown,
): PlayerSportPerformanceItemRow | null {
  if (
    !isRecord(value) ||
    typeof value.daily_challenge_id !== "string" ||
    typeof value.question_id !== "string" ||
    !hasCanonicalSnapshotShape(value.question_snapshot)
  ) {
    return null;
  }

  return {
    daily_challenge_id: value.daily_challenge_id,
    question_id: value.question_id,
    question_snapshot: value.question_snapshot,
  };
}

function normalizePlayerSportQuizAttempt(
  value: unknown,
): PlayerSportQuizAttemptRow | null {
  if (
    !isRecord(value) ||
    typeof value.sport_id !== "string" ||
    value.sport_id.trim().length === 0 ||
    typeof value.score !== "number" ||
    typeof value.total_questions !== "number" ||
    !Number.isInteger(value.score) ||
    !Number.isInteger(value.total_questions) ||
    value.score < 0 ||
    value.total_questions <= 0 ||
    value.score > value.total_questions ||
    typeof value.created_at !== "string" ||
    Number.isNaN(Date.parse(value.created_at))
  ) {
    return null;
  }

  return {
    sport_id: value.sport_id,
    score: value.score,
    total_questions: value.total_questions,
    created_at: value.created_at,
  };
}

function normalizePlayerSport(value: unknown): PlayerSportRow | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0
  ) {
    return null;
  }

  const slug = toSupportedSportCategorySlug(value.slug);
  return slug ? { id: value.id, slug } : null;
}

function toSupportedSportCategorySlug(value: unknown): SportCategorySlug | null {
  if (typeof value !== "string") {
    return null;
  }

  const slug = value.trim().toLowerCase() as SportCategorySlug;
  return supportedSportCategorySlugs.has(slug) ? slug : null;
}

function isLaterAnsweredAt(candidate: string, current: string | null) {
  if (current === null) {
    return true;
  }

  const candidateTime = Date.parse(candidate);
  const currentTime = Date.parse(current);
  if (!Number.isNaN(candidateTime) && !Number.isNaN(currentTime)) {
    return candidateTime > currentTime;
  }

  return candidate > current;
}

function hasCanonicalSnapshotShape(value: unknown): value is QuestionSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  const sport = snapshot.sport;

  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.question_text === "string" &&
    typeof snapshot.option_a === "string" &&
    typeof snapshot.option_b === "string" &&
    typeof snapshot.option_c === "string" &&
    typeof snapshot.option_d === "string" &&
    isAnswerOption(snapshot.correct_option) &&
    Boolean(sport) &&
    typeof sport === "object" &&
    typeof (sport as Record<string, unknown>).name === "string"
  );
}

async function getCanonicalChallengeForDate(
  challengeDate: string,
): Promise<CanonicalChallengeReadState> {
  const adminClient = supabaseAdmin();
  const { data: challenge, error: challengeError } = await adminClient
    .from("daily_challenges")
    .select(CANONICAL_CHALLENGE_COLUMNS)
    .eq("challenge_date", challengeDate)
    .maybeSingle();

  if (isCanonicalStoreUnavailableError(challengeError)) {
    return { kind: "bridge_fallback" };
  }

  const canonicalChallenge = normalizeCanonicalChallenge(challenge);
  if (!canonicalChallenge) {
    return { kind: "missing" };
  }

  if (isGenerationInProgressChallenge(canonicalChallenge)) {
    const { data: items, error: itemError } = await adminClient
      .from("daily_challenge_items")
      .select("slot,question_snapshot")
      .eq("daily_challenge_id", canonicalChallenge.id)
      .order("slot", { ascending: true });

    if (isCanonicalStoreUnavailableError(itemError)) {
      return { kind: "bridge_fallback" };
    }

    const canonicalRows = (Array.isArray(items) ? items : [])
      .map(normalizeCanonicalChallengeItem)
      .filter((item): item is CanonicalChallengeItemRow => item !== null);

    if (canonicalRows.length === 5) {
      const uniqueSlots = new Set(canonicalRows.map((item) => item.slot));
      if (uniqueSlots.size === 5) {
        return {
          kind: "ready",
          challengeId: canonicalChallenge.id,
          questions: canonicalRows
            .slice()
            .sort((left, right) => left.slot - right.slot)
            .map((item) => toChallengeQuestion(item.question_snapshot, item.slot)),
        };
      }
    }

    return isStaleGeneratedAt(canonicalChallenge.generated_at)
      ? {
          kind: "retryable_generated",
          challengeId: canonicalChallenge.id,
        }
      : { kind: "bridge_fallback" };
  }

  if (canonicalChallenge.status !== "published" || !canonicalChallenge.published_at) {
    return { kind: "unavailable" };
  }

  const { data: items, error: itemError } = await adminClient
    .from("daily_challenge_items")
    .select("slot,question_snapshot")
    .eq("daily_challenge_id", canonicalChallenge.id)
    .order("slot", { ascending: true });

  if (isCanonicalStoreUnavailableError(itemError)) {
    return { kind: "bridge_fallback" };
  }

  const canonicalRows = (Array.isArray(items) ? items : [])
    .map(normalizeCanonicalChallengeItem)
    .filter((item): item is CanonicalChallengeItemRow => item !== null);

  if (canonicalRows.length !== 5) {
    return { kind: "unavailable" };
  }

  const uniqueSlots = new Set(canonicalRows.map((item) => item.slot));
  if (uniqueSlots.size !== 5) {
    return { kind: "unavailable" };
  }

  return {
    kind: "ready",
    challengeId: canonicalChallenge.id,
    questions: canonicalRows
      .slice()
      .sort((left, right) => left.slot - right.slot)
      .map((item) => toChallengeQuestion(item.question_snapshot, item.slot)),
  };
}

function hasQuestionSnapshotShape(value: unknown): value is QuestionSnapshot {
  return hasCanonicalSnapshotShape(value);
}

function toGeneratedChallengeQuestions(
  generatedQuestions: GeneratedDailyChallengeQuestion[],
) {
  return generatedQuestions.map((question) =>
    toChallengeQuestion(question, question.slot),
  );
}

function withoutSlot(question: GeneratedDailyChallengeQuestion): QuestionSnapshot {
  const { slot, ...snapshot } = question;
  void slot;
  return snapshot;
}

async function loadLegacyChallengeForDate(challengeDate: string) {
  const adminClient = supabaseAdmin();

  const { data, error } = await adminClient
    .from("daily_challenge_questions")
    .select(QUESTION_COLUMNS)
    .eq("challenge_date", challengeDate)
    .order("slot", { ascending: true });

  throwIfError(error, "Unable to load the daily challenge.");

  const rows = (data ?? []) as unknown as DailyChallengeQuestion[];

  return rows.map((question) => ({
    ...question,
    id: String(question.id),
  }));
}

async function loadRecentQuestionIds(adminClient: ReturnType<typeof supabaseAdmin>) {
  const { data: recentChallenges, error: recentChallengesError } = await adminClient
    .from("daily_challenges")
    .select("id,challenge_date")
    .eq("status", GENERATED_CHALLENGE_STATUS)
    .order("challenge_date", { ascending: false })
    .limit(RECENT_HISTORY_CHALLENGE_LIMIT);

  if (isCanonicalStoreUnavailableError(recentChallengesError)) {
    return { kind: "bridge_fallback" as const };
  }

  const challengeIds = (recentChallenges ?? [])
    .map((challenge) => {
      if (
        typeof challenge === "object" &&
        challenge !== null &&
        "id" in challenge &&
        typeof (challenge as { id?: unknown }).id === "string"
      ) {
        return (challenge as { id: string }).id;
      }

      return null;
    })
    .filter((challengeId): challengeId is string => Boolean(challengeId));

  if (challengeIds.length === 0) {
    return { kind: "ready" as const, recentQuestionIds: [] as string[] };
  }

  const { data: recentItems, error: recentItemsError } = await adminClient
    .from("daily_challenge_items")
    .select("daily_challenge_id,question_id,slot")
    .in("daily_challenge_id", challengeIds)
    .order("slot", { ascending: true });

  if (isCanonicalStoreUnavailableError(recentItemsError)) {
    return { kind: "bridge_fallback" as const };
  }

  const challengeRank = new Map<string, number>();
  challengeIds.forEach((challengeId, index) => {
    challengeRank.set(challengeId, index);
  });

  const sortedRecentItems = (recentItems ?? [])
    .filter((item) => {
      return (
        typeof item === "object" &&
        item !== null &&
        "daily_challenge_id" in item &&
        "question_id" in item &&
        typeof (item as { daily_challenge_id?: unknown }).daily_challenge_id === "string" &&
        typeof (item as { question_id?: unknown }).question_id === "string"
      );
    })
    .map((item) => item as { daily_challenge_id: string; question_id: string; slot: number })
    .sort((left, right) => {
      const challengeOrder =
        (challengeRank.get(left.daily_challenge_id) ?? Number.MAX_SAFE_INTEGER) -
        (challengeRank.get(right.daily_challenge_id) ?? Number.MAX_SAFE_INTEGER);
      if (challengeOrder !== 0) {
        return challengeOrder;
      }

      return left.slot - right.slot;
    });

  const recentQuestionIds: string[] = [];
  const seen = new Set<string>();
  for (const item of sortedRecentItems) {
    if (!seen.has(item.question_id)) {
      seen.add(item.question_id);
      recentQuestionIds.push(item.question_id);
    }
  }

  return { kind: "ready" as const, recentQuestionIds };
}

async function loadReusableQuestionCandidates(
  adminClient: ReturnType<typeof supabaseAdmin>,
) {
  const { data, error } = await adminClient
    .from("questions")
    .select(REUSABLE_QUESTION_COLUMNS)
    .eq("status", "ready")
    .eq("eligible_for_daily", true)
    .order("updated_at", { ascending: false });

  if (isCanonicalStoreUnavailableError(error)) {
    return { kind: "bridge_fallback" as const };
  }

  const candidates = (Array.isArray(data) ? data : [])
    .map(normalizeReusableQuestionCandidate)
    .filter((row): row is QuestionSnapshot => row !== null);

  return { kind: "ready" as const, candidates };
}

async function persistGeneratedChallenge(
  adminClient: ReturnType<typeof supabaseAdmin>,
  challengeDate: string,
  generatedQuestions: GeneratedDailyChallengeQuestion[],
) {
  const generatedAt = new Date().toISOString();

  const { data: challenge, error: challengeError } = await adminClient
    .from("daily_challenges")
    .insert({
      challenge_date: challengeDate,
      status: "generated",
      generation_method: GENERATED_CHALLENGE_METHOD,
      rules_version: GENERATED_CHALLENGE_RULES_VERSION,
      generated_at: generatedAt,
      published_at: null,
    })
    .select(CANONICAL_CHALLENGE_COLUMNS)
    .single();

  if (isCanonicalStoreUnavailableError(challengeError)) {
    return isConflictError(challengeError)
      ? { kind: "conflict" as const }
      : { kind: "bridge_fallback" as const };
  }

  const canonicalChallenge = normalizeCanonicalChallenge(challenge);
  if (!canonicalChallenge) {
    return { kind: "bridge_fallback" as const };
  }

  const itemRows = generatedQuestions.map((question) => ({
    daily_challenge_id: canonicalChallenge.id,
    slot: question.slot,
    question_id: question.id,
    question_snapshot: withoutSlot(question),
  }));

  const { error: itemError } = await adminClient
    .from("daily_challenge_items")
    .insert(itemRows);

  if (isCanonicalStoreUnavailableError(itemError)) {
    await adminClient
      .from("daily_challenges")
      .delete()
      .eq("id", canonicalChallenge.id);

    return isConflictError(itemError)
      ? { kind: "conflict" as const }
      : { kind: "bridge_fallback" as const };
  }

  const { error: publishError } = await adminClient
    .from("daily_challenges")
    .update({
      status: GENERATED_CHALLENGE_STATUS,
      published_at: generatedAt,
    })
    .eq("id", canonicalChallenge.id);

  if (isCanonicalStoreUnavailableError(publishError)) {
    await adminClient
      .from("daily_challenges")
      .delete()
      .eq("id", canonicalChallenge.id);

    return isConflictError(publishError)
      ? { kind: "conflict" as const }
      : { kind: "bridge_fallback" as const };
  }

  return {
    kind: "ready" as const,
    challengeId: canonicalChallenge.id,
    questions: toGeneratedChallengeQuestions(generatedQuestions),
  };
}

async function generateAndPersistCanonicalChallengeForDate(
  challengeDate: string,
  staleChallengeId?: string,
) {
  const adminClient = supabaseAdmin();

  if (staleChallengeId) {
    const { error: cleanupError } = await adminClient
      .from("daily_challenges")
      .delete()
      .eq("id", staleChallengeId);

    if (isCanonicalStoreUnavailableError(cleanupError)) {
      return isConflictError(cleanupError)
        ? { kind: "conflict" as const }
        : { kind: "bridge_fallback" as const };
    }
  }

  const reusableCandidates = await loadReusableQuestionCandidates(adminClient);
  if (reusableCandidates.kind !== "ready") {
    return reusableCandidates;
  }

  const recentHistory = await loadRecentQuestionIds(adminClient);
  if (recentHistory.kind !== "ready") {
    return recentHistory;
  }

  const generatedQuestions = generateDailyChallengeQuestions({
    candidates: reusableCandidates.candidates,
    recentQuestionIds: recentHistory.recentQuestionIds,
  });

  if (!generatedQuestions) {
    return { kind: "unavailable" as const };
  }

  const persisted = await persistGeneratedChallenge(
    adminClient,
    challengeDate,
    generatedQuestions,
  );

  if (persisted.kind === "conflict") {
    const refreshedChallenge = await getCanonicalChallengeForDate(challengeDate);

    if (refreshedChallenge.kind === "retryable_generated") {
      return getCanonicalChallengeForDate(challengeDate);
    }

    return refreshedChallenge;
  }

  if (persisted.kind === "ready") {
    return persisted;
  }

  return persisted;
}

async function resolveServeableChallengeForDate(
  client: ServerSupabaseClient,
  challengeDate: string,
): Promise<ServeableChallengeForDate> {
  const canonicalChallenge = await getCanonicalChallengeForDate(challengeDate);
  if (canonicalChallenge.kind === "ready") {
    return {
      dailyChallengeId: canonicalChallenge.challengeId,
      questions: canonicalChallenge.questions,
    };
  }

  if (canonicalChallenge.kind === "bridge_fallback") {
    return {
      dailyChallengeId: null,
      questions: await loadLegacyChallengeForDate(challengeDate),
    };
  }

  if (canonicalChallenge.kind === "retryable_generated") {
    const legacyChallenge = await loadLegacyChallengeForDate(challengeDate);
    if (legacyChallenge.length > 0) {
      return {
        dailyChallengeId: null,
        questions: legacyChallenge,
      };
    }

    const generatedChallenge = await generateAndPersistCanonicalChallengeForDate(
      challengeDate,
      canonicalChallenge.challengeId,
    );

    if (generatedChallenge.kind === "ready") {
      return {
        dailyChallengeId: generatedChallenge.challengeId,
        questions: generatedChallenge.questions,
      };
    }

    if (generatedChallenge.kind === "bridge_fallback") {
      return {
        dailyChallengeId: null,
        questions: legacyChallenge,
      };
    }

    if (generatedChallenge.kind === "retryable_generated") {
      const refreshedChallenge = await getCanonicalChallengeForDate(challengeDate);

      if (refreshedChallenge.kind === "ready") {
        return {
          dailyChallengeId: refreshedChallenge.challengeId,
          questions: refreshedChallenge.questions,
        };
      }

      if (refreshedChallenge.kind === "bridge_fallback") {
        return {
          dailyChallengeId: null,
          questions: legacyChallenge,
        };
      }

      const retryLegacyChallenge = await loadLegacyChallengeForDate(challengeDate);
      if (retryLegacyChallenge.length > 0) {
        return {
          dailyChallengeId: null,
          questions: retryLegacyChallenge,
        };
      }
    }

    return { dailyChallengeId: null, questions: [] };
  }

  if (canonicalChallenge.kind === "missing") {
    const generatedChallenge = await generateAndPersistCanonicalChallengeForDate(
      challengeDate,
    );

    if (generatedChallenge.kind === "ready") {
      return {
        dailyChallengeId: generatedChallenge.challengeId,
        questions: generatedChallenge.questions,
      };
    }

    if (generatedChallenge.kind === "bridge_fallback") {
      return {
        dailyChallengeId: null,
        questions: await loadLegacyChallengeForDate(challengeDate),
      };
    }

    if (generatedChallenge.kind === "retryable_generated") {
      const refreshedChallenge = await getCanonicalChallengeForDate(challengeDate);

      if (refreshedChallenge.kind === "ready") {
        return {
          dailyChallengeId: refreshedChallenge.challengeId,
          questions: refreshedChallenge.questions,
        };
      }

      if (refreshedChallenge.kind === "bridge_fallback") {
        return {
          dailyChallengeId: null,
          questions: await loadLegacyChallengeForDate(challengeDate),
        };
      }

      const legacyChallenge = await loadLegacyChallengeForDate(challengeDate);
      if (legacyChallenge.length > 0) {
        return {
          dailyChallengeId: null,
          questions: legacyChallenge,
        };
      }

      return { dailyChallengeId: null, questions: [] };
    }

    const legacyChallenge = await loadLegacyChallengeForDate(challengeDate);
    if (legacyChallenge.length > 0) {
      return {
        dailyChallengeId: null,
        questions: legacyChallenge,
      };
    }

    return { dailyChallengeId: null, questions: [] };
  }

  return { dailyChallengeId: null, questions: [] };
}

export async function getServeableChallengeForDate(
  client: ServerSupabaseClient,
  challengeDate: string,
) {
  return resolveServeableChallengeForDate(client, challengeDate);
}

export async function getChallengeResolutionForDate(
  client: ServerSupabaseClient,
  challengeDate: string,
) {
  return resolveServeableChallengeForDate(client, challengeDate);
}

export async function getChallengeForDate(
  client: ServerSupabaseClient,
  challengeDate: string,
) {
  const resolution = await resolveServeableChallengeForDate(client, challengeDate);
  return resolution.questions;
}

export async function createDailyAttempt(
  client: ServerSupabaseClient,
  input: {
    userId: string;
    challengeDate: string;
    dailyChallengeId?: string | null;
    score: number;
    totalQuestions: number;
    durationMs?: number | null;
    leaderboardEligible?: boolean;
    answers: SubmittedAnswers;
  },
) {
  const { data, error } = await client
    .from("daily_attempts")
    .insert({
      user_id: input.userId,
      daily_challenge_id: input.dailyChallengeId ?? null,
      challenge_date: input.challengeDate,
      score: input.score,
      total_questions: input.totalQuestions,
      duration_ms: input.durationMs ?? null,
      leaderboard_eligible: input.leaderboardEligible ?? false,
      answers: input.answers,
    })
    .select(DAILY_ATTEMPT_COLUMNS)
    .single();

  throwIfError(error, "Unable to save your attempt.");

  return data as unknown as StoredDailyAttempt;
}

export async function findDailyAttemptForUserAndDate(
  client: ServerSupabaseClient,
  input: {
    userId: string;
    challengeDate: string;
    dailyChallengeId?: string | null;
  },
) {
  const selectColumns =
    DAILY_ATTEMPT_COLUMNS;

  if (input.dailyChallengeId) {
    const { data: canonicalData, error: canonicalError } = await client
      .from("daily_attempts")
      .select(selectColumns)
      .eq("user_id", input.userId)
      .eq("daily_challenge_id", input.dailyChallengeId)
      .maybeSingle();

    throwIfError(canonicalError, "Unable to load the saved attempt.");

    if (canonicalData) {
      return canonicalData as unknown as StoredDailyAttempt;
    }
  }

  const { data, error } = await client
    .from("daily_attempts")
    .select(selectColumns)
    .eq("user_id", input.userId)
    .eq("challenge_date", input.challengeDate)
    .maybeSingle();

  throwIfError(error, "Unable to load the saved attempt.");

  return data as unknown as StoredDailyAttempt | null;
}

export async function getDailyAttemptStart(
  client: ServerSupabaseClient,
  input: {
    userId: string;
    challengeDate: string;
  },
) {
  const { data, error } = await client
    .from("daily_attempt_starts")
    .select(DAILY_ATTEMPT_START_COLUMNS)
    .eq("user_id", input.userId)
    .eq("challenge_date", input.challengeDate)
    .maybeSingle();

  throwIfError(error, "Unable to load attempt timer.");

  return (data ?? null) as unknown as StoredDailyAttemptStart | null;
}

async function createDailyAttemptStart(
  client: ServerSupabaseClient,
  input: {
    userId: string;
    challengeDate: string;
    dailyChallengeId?: string | null;
  },
) {
  const { data, error } = await client
    .from("daily_attempt_starts")
    .insert({
      user_id: input.userId,
      daily_challenge_id: input.dailyChallengeId ?? null,
      challenge_date: input.challengeDate,
    })
    .select(DAILY_ATTEMPT_START_COLUMNS)
    .single();

  if (isDuplicateError(error)) {
    return getDailyAttemptStart(client, input);
  }

  throwIfError(error, "Unable to start attempt timer.");

  return data as unknown as StoredDailyAttemptStart;
}

export async function getOrCreateDailyAttemptStart(
  client: ServerSupabaseClient,
  input: {
    userId: string;
    challengeDate: string;
    dailyChallengeId?: string | null;
  },
) {
  const existingStart = await getDailyAttemptStart(client, input);
  if (existingStart) {
    return existingStart;
  }

  return createDailyAttemptStart(client, input);
}

export async function resolveCanonicalChallengeIdForDate(challengeDate: string) {
  const adminClient = supabaseAdmin();
  const { data, error } = await adminClient
    .from("daily_challenges")
    .select("id")
    .eq("challenge_date", challengeDate)
    .maybeSingle();

  if (error) {
    return null;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const challenge = data as { id?: unknown };
  return typeof challenge.id === "string" ? challenge.id : null;
}

export async function getPlayerStats(
  client: ServerSupabaseClient,
): Promise<PlayerStats> {
  const { data, error } = await client
    .from("daily_attempts")
    .select("score,challenge_date")

  throwIfError(error, "Unable to load player stats.");

  const attempts = (Array.isArray(data) ? data : [])
    .map(normalizePlayerStatsAttempt)
    .filter((attempt): attempt is PlayerStatsAttemptRow => attempt !== null);

  if (attempts.length === 0) {
    return {
      averageScore: 0,
      totalPlays: 0,
      lastPlayedAt: null,
    };
  }

  const totalScore = attempts.reduce((sum, attempt) => {
    return sum + attempt.score;
  }, 0);
  const lastPlayedAt = attempts.reduce<string | null>((latest, attempt) => {
    const challengeDate = attempt.challenge_date;
    return latest === null || challengeDate > latest ? challengeDate : latest;
  }, null);

  return {
    averageScore: Number((totalScore / attempts.length).toFixed(2)),
    totalPlays: attempts.length,
    lastPlayedAt,
  };
}

export async function getPlayerSportCategoryPerformance(
  userId: string,
): Promise<SportCategoryPerformance[]> {
  const adminClient = supabaseAdmin();
  const [
    { data: attemptData, error: attemptError },
    { data: sportQuizAttemptData, error: sportQuizAttemptError },
  ] = await Promise.all([
    adminClient
      .from("daily_attempts")
      .select("daily_challenge_id,challenge_date,answers")
      .eq("user_id", userId)
      .order("challenge_date", { ascending: false })
      .limit(50),
    adminClient
      .from("sport_quiz_attempts")
      .select("sport_id,score,total_questions,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  throwIfError(attemptError, "Unable to load player sport performance.");

  const attempts = (Array.isArray(attemptData) ? attemptData : [])
    .map(normalizePlayerSportPerformanceAttempt)
    .filter((attempt): attempt is PlayerSportPerformanceAttemptRow => attempt !== null);

  if (
    sportQuizAttemptError &&
    !isSportQuizStoreUnavailableError(sportQuizAttemptError)
  ) {
    throwIfError(
      sportQuizAttemptError,
      "Unable to load player sport performance.",
    );
  }

  const sportQuizAttempts = sportQuizAttemptError
    ? []
    : (Array.isArray(sportQuizAttemptData) ? sportQuizAttemptData : [])
        .map(normalizePlayerSportQuizAttempt)
        .filter(
          (attempt): attempt is PlayerSportQuizAttemptRow => attempt !== null,
        );

  const challengeIds = Array.from(
    new Set(attempts.map((attempt) => attempt.daily_challenge_id)),
  );
  const sportIds = Array.from(
    new Set(sportQuizAttempts.map((attempt) => attempt.sport_id)),
  );
  const [
    { data: itemData, error: itemError },
    { data: sportData, error: sportError },
  ] = await Promise.all([
    challengeIds.length > 0
      ? adminClient
          .from("daily_challenge_items")
          .select("daily_challenge_id,question_id,question_snapshot")
          .in("daily_challenge_id", challengeIds)
      : Promise.resolve({ data: [], error: null }),
    sportIds.length > 0
      ? adminClient.from("sports").select("id,slug").in("id", sportIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  throwIfError(itemError, "Unable to load player sport performance.");
  throwIfError(sportError, "Unable to load player sport performance.");

  const itemsByChallengeId = new Map<string, PlayerSportPerformanceItemRow[]>();
  for (const item of (Array.isArray(itemData) ? itemData : [])
    .map(normalizePlayerSportPerformanceItem)
    .filter((item): item is PlayerSportPerformanceItemRow => item !== null)) {
    const challengeItems = itemsByChallengeId.get(item.daily_challenge_id) ?? [];
    challengeItems.push(item);
    itemsByChallengeId.set(item.daily_challenge_id, challengeItems);
  }

  const sportSlugById = new Map(
    (Array.isArray(sportData) ? sportData : [])
      .map(normalizePlayerSport)
      .filter((sport): sport is PlayerSportRow => sport !== null)
      .map((sport) => [sport.id, sport.slug]),
  );

  const performanceBySlug = new Map<SportCategorySlug, SportCategoryPerformance>();
  for (const attempt of attempts) {
    for (const item of itemsByChallengeId.get(attempt.daily_challenge_id) ?? []) {
      const submittedAnswer = attempt.answers[item.question_id];
      if (!isAnswerOption(submittedAnswer)) {
        continue;
      }

      const sport = item.question_snapshot.sport;
      const slug = toSupportedSportCategorySlug(sport.slug);
      if (!slug) {
        continue;
      }

      const existing = performanceBySlug.get(slug) ?? {
        slug,
        answeredCount: 0,
        correctCount: 0,
        lastAnsweredAt: null,
      };

      existing.answeredCount += 1;
      if (submittedAnswer === item.question_snapshot.correct_option) {
        existing.correctCount += 1;
      }
      if (isLaterAnsweredAt(attempt.challenge_date, existing.lastAnsweredAt)) {
        existing.lastAnsweredAt = attempt.challenge_date;
      }

      performanceBySlug.set(slug, existing);
    }
  }

  for (const attempt of sportQuizAttempts) {
    const slug = sportSlugById.get(attempt.sport_id);
    if (!slug) {
      continue;
    }

    const existing = performanceBySlug.get(slug) ?? {
      slug,
      answeredCount: 0,
      correctCount: 0,
      lastAnsweredAt: null,
    };

    existing.answeredCount += attempt.total_questions;
    existing.correctCount += attempt.score;
    if (isLaterAnsweredAt(attempt.created_at, existing.lastAnsweredAt)) {
      existing.lastAnsweredAt = attempt.created_at;
    }

    performanceBySlug.set(slug, existing);
  }

  return Array.from(performanceBySlug.values()).sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
}

export async function getPlayerProfile(
  client: ServerSupabaseClient,
) {
  const { data, error } = await client
    .from("profiles")
    .select("display_name")
    .maybeSingle();

  throwIfError(error, "Unable to load profile.");

  return (data ?? { display_name: null }) as unknown as PlayerProfile;
}

export async function upsertPlayerDisplayName(
  client: ServerSupabaseClient,
  input: {
    userId: string;
    displayName: string;
  },
) {
  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        id: input.userId,
        display_name: input.displayName,
      },
      { onConflict: "id" },
    )
    .select("display_name")
    .single();

  throwIfError(error, "Unable to save display name.");

  return data as unknown as PlayerProfile;
}

export async function getLeaderboardEntries(
  client: ServerSupabaseClient,
  limit = 10,
) {
  const { data, error } = await client
    .from("daily_leaderboard")
    .select("display_name,average_score,average_duration_ms,total_plays,last_played_at")
    .limit(limit);

  throwIfError(error, "Unable to load leaderboard.");

  const normalizedRows = (data ?? []).map((row) => ({
    display_name: String(row.display_name),
    average_score: Number(row.average_score),
    average_duration_ms:
      row.average_duration_ms === null ? null : Number(row.average_duration_ms),
    total_plays: Number(row.total_plays),
    last_played_at: String(row.last_played_at),
  })) as LeaderboardEntry[];

  return sortLeaderboardEntries(normalizedRows);
}
