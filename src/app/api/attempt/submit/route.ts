import { type NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AnswerOption = "A" | "B" | "C" | "D";

type AnswersMap = Record<string, AnswerOption>;

type AttemptRow = {
  id: string;
  pid: string;
  challenge_date: string;
  created_at: string;
  score: number;
  answers: unknown;
};

const PID_COOKIE_NAME = "ykb_pid";
const EXPECTED_ANSWER_COUNT = 5;
const QUESTION_SOURCE_TABLES = ["questions", "challenge_questions"] as const;

export const dynamic = "force-dynamic";

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeAnswerOption(value: unknown): AnswerOption | null {
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

  const optionMatch = normalized.match(/OPTION[_\s-]?([ABCD])$/);
  if (optionMatch?.[1]) {
    return optionMatch[1] as AnswerOption;
  }

  return null;
}

function parseAnswersMap(raw: unknown): AnswersMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const parsed: AnswersMap = {};
  for (const [questionId, chosen] of Object.entries(raw)) {
    if (!questionId) {
      return null;
    }

    const normalized = normalizeAnswerOption(chosen);
    if (!normalized) {
      return null;
    }

    parsed[questionId] = normalized;
  }

  return parsed;
}

function getPidFromRequest(request: NextRequest) {
  const existing = request.cookies.get(PID_COOKIE_NAME)?.value?.trim();
  if (existing) {
    return { pid: existing, shouldSetCookie: false };
  }

  return { pid: crypto.randomUUID(), shouldSetCookie: true };
}

function withPidCookie(
  response: NextResponse,
  pid: string,
  shouldSetCookie: boolean,
) {
  if (!shouldSetCookie) {
    return response;
  }

  response.cookies.set(PID_COOKIE_NAME, pid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

async function fetchCorrectOptions(questionIds: string[]) {
  if (questionIds.length === 0) {
    return new Map<string, AnswerOption>();
  }

  const admin = supabaseAdmin();
  const correctByQuestionId = new Map<string, AnswerOption>();

  for (const table of QUESTION_SOURCE_TABLES) {
    const { data, error } = await admin
      .from(table)
      .select("id,correct_option")
      .in("id", questionIds);

    if (error || !data?.length) {
      continue;
    }

    for (const row of data) {
      const questionId = String(row.id);
      const option = normalizeAnswerOption(row.correct_option);

      if (option && !correctByQuestionId.has(questionId)) {
        correctByQuestionId.set(questionId, option);
      }
    }
  }

  return correctByQuestionId;
}

function buildResults(answers: AnswersMap, correctByQuestionId: Map<string, AnswerOption>) {
  const orderedAnswers = Object.entries(answers);
  const results = orderedAnswers.map(([questionId, chosen_option]) => ({
    question_id: questionId,
    chosen_option,
    is_correct: correctByQuestionId.get(questionId) === chosen_option,
  }));

  const score = results.reduce((total, result) => {
    return result.is_correct ? total + 1 : total;
  }, 0);

  return { score, results };
}

async function getExistingAttempt(pid: string, date: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("attempts_anon")
    .select("id,pid,challenge_date,created_at,score,answers")
    .eq("pid", pid)
    .eq("challenge_date", date)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message ||
        "Attempt storage is not configured. Run the attempts_anon migration.",
    );
  }

  return data as AttemptRow | null;
}

function duplicateAttemptResponse(
  existingAttempt: AttemptRow,
  score: number,
  results: Array<{ question_id: string; chosen_option: AnswerOption; is_correct: boolean }>,
) {
  return NextResponse.json(
    {
      message: "You already submitted today's challenge.",
      existing_attempt: {
        id: existingAttempt.id,
        date: existingAttempt.challenge_date,
        created_at: existingAttempt.created_at,
        score,
        total: EXPECTED_ANSWER_COUNT,
        results,
      },
    },
    { status: 409 },
  );
}

export async function POST(request: NextRequest) {
  const { pid, shouldSetCookie } = getPidFromRequest(request);

  try {
    const body = (await request.json()) as {
      date?: unknown;
      answers?: unknown;
    };

    const date = typeof body.date === "string" ? body.date : "";
    const answers = parseAnswersMap(body.answers);

    if (!isValidIsoDate(date)) {
      return withPidCookie(
        NextResponse.json(
          { message: "Invalid date. Expected format: YYYY-MM-DD." },
          { status: 400 },
        ),
        pid,
        shouldSetCookie,
      );
    }

    if (!answers || Object.keys(answers).length !== EXPECTED_ANSWER_COUNT) {
      return withPidCookie(
        NextResponse.json(
          { message: "Please submit answers for all 5 questions." },
          { status: 400 },
        ),
        pid,
        shouldSetCookie,
      );
    }

    const existing = await getExistingAttempt(pid, date);
    if (existing) {
      const existingAnswers = parseAnswersMap(existing.answers) ?? {};
      const correctByQuestionId = await fetchCorrectOptions(
        Object.keys(existingAnswers),
      );
      const { score, results } = buildResults(existingAnswers, correctByQuestionId);

      return withPidCookie(
        duplicateAttemptResponse(existing, score, results),
        pid,
        shouldSetCookie,
      );
    }

    const questionIds = Object.keys(answers);
    const correctByQuestionId = await fetchCorrectOptions(questionIds);
    const missingQuestionIds = questionIds.filter(
      (questionId) => !correctByQuestionId.has(questionId),
    );

    if (missingQuestionIds.length > 0) {
      return withPidCookie(
        NextResponse.json(
          { message: "Some submitted question IDs were not found." },
          { status: 400 },
        ),
        pid,
        shouldSetCookie,
      );
    }

    const { score, results } = buildResults(answers, correctByQuestionId);
    const admin = supabaseAdmin();
    const { data: insertedAttempt, error: insertError } = await admin
      .from("attempts_anon")
      .insert({
        pid,
        challenge_date: date,
        score,
        answers,
      })
      .select("id,pid,challenge_date,created_at,score,answers")
      .single();

    if (insertError) {
      // 23505: unique_violation
      if (insertError.code === "23505") {
        const raceExisting = await getExistingAttempt(pid, date);
        if (raceExisting) {
          const raceAnswers = parseAnswersMap(raceExisting.answers) ?? {};
          const raceCorrectByQuestionId = await fetchCorrectOptions(
            Object.keys(raceAnswers),
          );
          const raceResult = buildResults(raceAnswers, raceCorrectByQuestionId);

          return withPidCookie(
            duplicateAttemptResponse(
              raceExisting,
              raceResult.score,
              raceResult.results,
            ),
            pid,
            shouldSetCookie,
          );
        }
      }
      throw new Error(
        insertError.message ||
          "Attempt storage is not configured. Run the attempts_anon migration.",
      );
    }

    if (!insertedAttempt) {
      throw new Error("Unable to save attempt.");
    }

    const insertedAttemptRow = insertedAttempt as AttemptRow;

    return withPidCookie(
      NextResponse.json({
        message: "Attempt submitted.",
        attempt: {
          id: insertedAttemptRow.id,
          date: insertedAttemptRow.challenge_date,
          created_at: insertedAttemptRow.created_at,
          score,
          total: EXPECTED_ANSWER_COUNT,
          results,
        },
      }),
      pid,
      shouldSetCookie,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to submit attempt right now.";
    return withPidCookie(
      NextResponse.json({ message }, { status: 500 }),
      pid,
      shouldSetCookie,
    );
  }
}
