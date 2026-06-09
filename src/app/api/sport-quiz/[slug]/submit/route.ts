import { type NextRequest, NextResponse } from "next/server";

import { getCategoryBySlug, type SportCategorySlug } from "@/lib/categories";
import {
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
} from "@/lib/server/supabaseServer";
import { submitSportQuizAttempt } from "@/lib/server/sportQuizRepository";
import { parseSportQuizSubmittedAnswers } from "@/lib/sportQuiz";

export const dynamic = "force-dynamic";

function normalizeSupportedSlug(value: unknown): SportCategorySlug | null {
  if (typeof value !== "string") {
    return null;
  }

  return getCategoryBySlug(value.trim().toLowerCase())?.slug ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function getVerifiedUserId(request: NextRequest) {
  const session = getSupabaseSessionFromRequest(request);
  if (!session) {
    return null;
  }

  try {
    const sessionClient = createSessionSupabaseServerClient(session.accessToken);
    const {
      data: { user },
      error,
    } = await sessionClient.auth.getUser();

    return error || !user?.id ? null : user.id;
  } catch {
    return null;
  }
}

function getRepositoryErrorStatus(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message === "Unsupported sport.") {
    return 404;
  }

  if (
    error.message ===
      "A sport quiz submission requires exactly five valid answers." ||
    error.message.startsWith("Invalid sport quiz")
  ) {
    return 400;
  }

  return null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = normalizeSupportedSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ message: "Sport quiz not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Please submit answers for all 5 questions." },
      { status: 400 },
    );
  }

  const answers = parseSportQuizSubmittedAnswers(
    isRecord(body) ? body.answers : undefined,
  );
  if (!answers) {
    return NextResponse.json(
      { message: "Please submit answers for all 5 questions." },
      { status: 400 },
    );
  }

  try {
    const userId = await getVerifiedUserId(request);
    const response = await submitSportQuizAttempt({
      slug,
      userId,
      answers,
    });

    return NextResponse.json(response);
  } catch (error) {
    const status = getRepositoryErrorStatus(error);
    if (status) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Invalid submission." },
        { status },
      );
    }

    return NextResponse.json(
      { message: "Unable to submit this sport quiz right now." },
      { status: 500 },
    );
  }
}
