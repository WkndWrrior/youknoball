import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ChallengeQuestion = {
  id: string | number;
  sport: string | null;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  created_at?: string;
};

type ChallengeSource = "scheduled" | "fallback_recent";

const QUESTION_COLUMNS =
  "id,sport,question_text,option_a,option_b,option_c,option_d,created_at";

const SCHEDULED_DATE_COLUMNS = [
  "challenge_date",
  "scheduled_date",
  "scheduled_for",
  "date",
] as const;

const SCHEDULED_TABLES = ["questions", "challenge_questions"] as const;

export const dynamic = "force-dynamic";

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeQuestions(rows: ChallengeQuestion[]) {
  return rows.map(
    ({ id, sport, question_text, option_a, option_b, option_c, option_d }) => ({
      id,
      sport,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
    }),
  );
}

async function getScheduledQuestionsForToday(date: string) {
  const admin = supabaseAdmin();

  for (const table of SCHEDULED_TABLES) {
    for (const dateColumn of SCHEDULED_DATE_COLUMNS) {
      const query = admin
        .from(table)
        .select(QUESTION_COLUMNS)
        .eq(dateColumn, date)
        .order("created_at", { ascending: false })
        .limit(5);

      const { data, error } = await query;
      if (error || !data?.length) {
        continue;
      }

      return data as ChallengeQuestion[];
    }
  }

  return [];
}

async function getFallbackRecentQuestions() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("questions")
    .select(QUESTION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error("Failed to fetch recent questions.");
  }

  return (data ?? []) as ChallengeQuestion[];
}

export async function GET() {
  const date = getTodayIsoDate();

  try {
    const scheduled = await getScheduledQuestionsForToday(date);
    if (scheduled.length > 0) {
      return NextResponse.json({
        date,
        source: "scheduled" as ChallengeSource,
        questions: sanitizeQuestions(scheduled),
      });
    }

    const fallback = await getFallbackRecentQuestions();
    return NextResponse.json({
      date,
      source: "fallback_recent" as ChallengeSource,
      questions: sanitizeQuestions(fallback),
    });
  } catch {
    return NextResponse.json(
      {
        date,
        source: "fallback_recent" as ChallengeSource,
        questions: [],
        error: "Unable to load today's challenge.",
      },
      { status: 500 },
    );
  }
}
