import { type NextRequest, NextResponse } from "next/server";

import { getCategoryBySlug, type SportCategorySlug } from "@/lib/categories";
import { getSportQuizForPlayer } from "@/lib/server/sportQuizRepository";
import {
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
} from "@/lib/server/supabaseServer";
import type { SportQuizReadyResponse } from "@/lib/sportQuiz";

export const dynamic = "force-dynamic";

const RETRYABLE_UNAVAILABLE_RESPONSE = {
  status: "unavailable" as const,
  message: "Unable to load this sport quiz right now. Please try again.",
};

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

function toSafeReadyResponse(response: SportQuizReadyResponse): SportQuizReadyResponse {
  return {
    status: "ready",
    sport: {
      slug: response.sport.slug,
      name: response.sport.name,
    },
    questions: response.questions.map((question) => ({
      id: question.id,
      slot: question.slot,
      sport: question.sport,
      difficulty: question.difficulty,
      question_text: question.question_text,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d,
    })),
  };
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

  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const userId = await getVerifiedUserId(request);
    const response = await getSportQuizForPlayer({
      slug,
      userId,
      clientRecentQuestionIds: isRecord(body) ? body.recentQuestionIds : undefined,
    });

    return NextResponse.json(
      response.status === "ready" ? toSafeReadyResponse(response) : response,
    );
  } catch {
    return NextResponse.json(RETRYABLE_UNAVAILABLE_RESPONSE, { status: 200 });
  }
}
