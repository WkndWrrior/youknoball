import { type NextRequest, NextResponse } from "next/server";

import {
  getCappedElapsedTimerMs,
  isLeaderboardEligibleDuration,
} from "@/lib/challengeTimer";
import {
  buildShareText,
  gradeAttempt,
  type LeaderboardStatus,
  parseSubmittedAnswers,
} from "@/lib/dailyChallenge";
import {
  createDailyAttempt,
  findDailyAttemptForUserAndDate,
  getChallengeResolutionForDate,
  getDailyAttemptStart,
  getPlayerProfile,
  getPlayerStats,
  type StoredDailyAttempt,
} from "@/lib/server/dailyChallengeRepository";
import {
  createPublicSupabaseServerClient,
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
} from "@/lib/server/supabaseServer";

export const dynamic = "force-dynamic";

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildAttemptPayload(
  storedAttempt: {
    id?: string;
    challenge_date?: string;
    created_at?: string;
    duration_ms?: number | null;
    leaderboard_eligible?: boolean | null;
  },
  graded: ReturnType<typeof gradeAttempt>,
) {
  return {
    id: storedAttempt.id ?? null,
    date: storedAttempt.challenge_date ?? "",
    created_at: storedAttempt.created_at ?? null,
    score: graded.score,
    total: graded.total,
    durationMs: storedAttempt.duration_ms ?? null,
    leaderboardEligible: storedAttempt.leaderboard_eligible !== false,
    results: graded.results,
  };
}

function isDuplicateError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function buildSavedAttemptResponse(
  storedAttempt: StoredDailyAttempt,
  challengeQuestions: Awaited<
    ReturnType<typeof getChallengeResolutionForDate>
  >["questions"],
  sessionClient: ReturnType<typeof createSessionSupabaseServerClient>,
) {
  const graded = gradeAttempt(challengeQuestions, storedAttempt.answers);
  const [stats, profile] = await Promise.all([
    getPlayerStats(sessionClient),
    getPlayerProfile(sessionClient),
  ]);
  const leaderboardStatus = getLeaderboardStatus(storedAttempt, profile);

  return {
    saved: true,
    leaderboardEligible: leaderboardStatus === "eligible",
    leaderboardStatus,
    attempt: buildAttemptPayload(storedAttempt, graded),
    shareText: buildShareText(storedAttempt.challenge_date, graded),
    stats,
  };
}

function getLeaderboardStatus(
  storedAttempt: StoredDailyAttempt,
  profile: { display_name: string | null },
): LeaderboardStatus {
  if (storedAttempt.leaderboard_eligible === false) {
    if (storedAttempt.duration_ms == null) {
      return "timer_unavailable";
    }

    return "timed_out";
  }

  if (!profile.display_name?.trim()) {
    return "needs_display_name";
  }

  return "eligible";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      date?: unknown;
      answers?: unknown;
    };

    const date = typeof body.date === "string" ? body.date : "";
    const answers = parseSubmittedAnswers(body.answers);

    if (!isValidIsoDate(date)) {
      return NextResponse.json(
        { message: "Invalid date. Expected format: YYYY-MM-DD." },
        { status: 400 },
      );
    }

    if (!answers || Object.keys(answers).length !== 5) {
      return NextResponse.json(
        { message: "Please submit answers for all 5 questions." },
        { status: 400 },
      );
    }

    const publicClient = createPublicSupabaseServerClient();
    const challengeResolution = await getChallengeResolutionForDate(
      publicClient,
      date,
    );
    const { questions: challengeQuestions, dailyChallengeId } =
      challengeResolution;

    if (challengeQuestions.length !== 5) {
      return NextResponse.json(
        {
          message: "Today's challenge is not live yet.",
        },
        { status: 409 },
      );
    }

    const questionIds = new Set(challengeQuestions.map((question) => question.id));
    if (Object.keys(answers).some((questionId) => !questionIds.has(questionId))) {
      return NextResponse.json(
        { message: "Some submitted question IDs were not found." },
        { status: 400 },
      );
    }

    const graded = gradeAttempt(challengeQuestions, answers);
    const shareText = buildShareText(date, graded);
    const session = getSupabaseSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({
        message: "Guest attempt scored.",
        saved: false,
        leaderboardEligible: false,
        leaderboardStatus: "casual",
        attempt: buildAttemptPayload(
          {
            challenge_date: date,
            created_at: new Date().toISOString(),
            duration_ms: null,
            leaderboard_eligible: false,
          },
          graded,
        ),
        shareText,
      });
    }

    const sessionClient = createSessionSupabaseServerClient(session.accessToken);
    const existingAttempt = await findDailyAttemptForUserAndDate(sessionClient, {
      userId: session.user.id,
      challengeDate: date,
      dailyChallengeId,
    });

    if (existingAttempt) {
      const savedResponse = await buildSavedAttemptResponse(
        existingAttempt,
        challengeQuestions,
        sessionClient,
      );

      return NextResponse.json(
        {
          message: "You already played today's challenge.",
          ...savedResponse,
        },
        { status: 409 },
      );
    }

    let durationMs: number | null = null;
    try {
      const attemptStart = await getDailyAttemptStart(sessionClient, {
        userId: session.user.id,
        challengeDate: date,
      });
      durationMs = attemptStart
        ? getCappedElapsedTimerMs(attemptStart.started_at, new Date())
        : null;
    } catch {
      durationMs = null;
    }
    const leaderboardEligible = isLeaderboardEligibleDuration(durationMs);

    try {
      const savedAttempt = await createDailyAttempt(sessionClient, {
        userId: session.user.id,
        dailyChallengeId,
        challengeDate: date,
        score: graded.score,
        totalQuestions: graded.total,
        durationMs,
        leaderboardEligible,
        answers,
      });

      const savedResponse = await buildSavedAttemptResponse(
        savedAttempt,
        challengeQuestions,
        sessionClient,
      );

      return NextResponse.json({
        message: "Attempt submitted.",
        ...savedResponse,
      });
    } catch (error) {
      if (!isDuplicateError(error)) {
        throw error;
      }

      const existingAttempt = await findDailyAttemptForUserAndDate(
        sessionClient,
        {
          userId: session.user.id,
          challengeDate: date,
          dailyChallengeId,
        },
      );
      if (!existingAttempt) {
        throw error;
      }

      const savedResponse = await buildSavedAttemptResponse(
        existingAttempt,
        challengeQuestions,
        sessionClient,
      );

      return NextResponse.json(
        {
          message: "You already played today's challenge.",
          ...savedResponse,
        },
        { status: 409 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to submit attempt right now.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
