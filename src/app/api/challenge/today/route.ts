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
  getVerifiedSupabaseSessionFromRequest,
} from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    const auth = request
      ? await getVerifiedSupabaseSessionFromRequest(request)
      : null;
    if (auth) {
      try {
        const attemptStart = await getOrCreateDailyAttemptStart(supabaseAdmin(), {
          userId: auth.user.id,
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
