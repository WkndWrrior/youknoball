import { type NextRequest, NextResponse } from "next/server";

import {
  getRemainingTimerMs,
  leaderboardTimerLimitMs,
} from "@/lib/challengeTimer";
import { getTodayIsoDate } from "@/lib/date";
import { toPlayerQuestion } from "@/lib/dailyChallenge";
import {
  getChallengeResolutionForDate,
  getOrCreateDailyAttemptStart,
} from "@/lib/server/dailyChallengeRepository";
import {
  createPublicSupabaseServerClient,
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
} from "@/lib/server/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(request?: NextRequest) {
  const date = getTodayIsoDate();

  try {
    const client = createPublicSupabaseServerClient();
    const { questions, dailyChallengeId } = await getChallengeResolutionForDate(
      client,
      date,
    );

    if (questions.length !== 5) {
      return NextResponse.json({
        status: "unavailable" as const,
        date,
        message: "Today's challenge is not live yet. Check back soon.",
      });
    }

    let timer = null;
    const session = request ? getSupabaseSessionFromRequest(request) : null;
    if (session) {
      try {
        const sessionClient = createSessionSupabaseServerClient(session.accessToken);
        const attemptStart = await getOrCreateDailyAttemptStart(sessionClient, {
          userId: session.user.id,
          challengeDate: date,
          dailyChallengeId,
        });

        if (attemptStart) {
          timer = {
            startedAt: attemptStart.started_at,
            durationLimitMs: leaderboardTimerLimitMs,
            remainingMs: getRemainingTimerMs(attemptStart.started_at, new Date()),
          };
        }
      } catch {
        timer = null;
      }
    }

    return NextResponse.json({
      status: "ready" as const,
      date,
      questions: questions.map(toPlayerQuestion),
      timer,
    });
  } catch {
    return NextResponse.json(
      {
        status: "unavailable" as const,
        date,
        message: "Today's challenge is not live yet. Check back soon.",
      },
      { status: 200 },
    );
  }
}
