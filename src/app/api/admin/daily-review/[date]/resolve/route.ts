import { NextRequest, NextResponse } from "next/server";

import { authorizeDailyReviewRequest } from "@/lib/server/adminAuth";
import { validateDailyChallengeReplacementForDraft } from "@/lib/server/dailyChallengeRepository";
import {
  loadDailyQuestionReviewByDate,
  resolveDailyQuestionReviewItem,
} from "@/lib/server/dailyQuestionReviewRepository";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function createDailyReviewResolveHandler(dependencies?: {
  authorize?: (request: NextRequest) => ReturnType<typeof authorizeDailyReviewRequest>;
  loadReview?: (date: string) => ReturnType<typeof loadDailyQuestionReviewByDate>;
  validateReplacement?: typeof validateDailyChallengeReplacementForDraft;
  resolve?: (input: Parameters<typeof resolveDailyQuestionReviewItem>[1]) =>
    ReturnType<typeof resolveDailyQuestionReviewItem>;
}) {
  const authorize = dependencies?.authorize ?? authorizeDailyReviewRequest;
  const loadReview = dependencies?.loadReview ?? ((date: string) =>
    loadDailyQuestionReviewByDate(supabaseAdmin(), date));
  const validateReplacement =
    dependencies?.validateReplacement ?? validateDailyChallengeReplacementForDraft;
  const resolve = dependencies?.resolve ?? ((input) =>
    resolveDailyQuestionReviewItem(supabaseAdmin(), input));

  return async function POST(
    request: NextRequest,
    context: { params: Promise<{ date: string }> },
  ) {
    const auth = await authorize(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { message: auth.reason === "unauthenticated" ? "Unauthorized." : "Forbidden." },
        { status: auth.reason === "unauthenticated" ? 401 : 403 },
      );
    }
    if (request.headers.get("origin") !== request.nextUrl.origin) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }
    if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      return NextResponse.json({ message: "Invalid review request." }, { status: 415 });
    }
    const { date } = await context.params;
    if (!validDate(date)) {
      return NextResponse.json({ message: "Invalid review request." }, { status: 400 });
    }
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid review request." }, { status: 400 });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ message: "Invalid review request." }, { status: 400 });
    }
    const value = payload as Record<string, unknown>;
    const action = value.action;
    const reviewItemId = value.reviewItemId;
    const replacementQuestionId = value.replacementQuestionId;
    if (
      (action !== "keep" && action !== "replace") ||
      typeof reviewItemId !== "string" ||
      !UUID_PATTERN.test(reviewItemId) ||
      (action === "replace" &&
        (typeof replacementQuestionId !== "string" ||
          !UUID_PATTERN.test(replacementQuestionId)))
    ) {
      return NextResponse.json({ message: "Invalid review request." }, { status: 400 });
    }

    const review = await loadReview(date);
    const item = review?.items.find((candidate) => candidate.id === reviewItemId);
    if (!review || !item) {
      return NextResponse.json({ message: "Review item not found." }, { status: 404 });
    }
    if (action === "replace") {
      const storedReplacement = item.replacement;
      let remainsValid = false;
      if (
        storedReplacement?.eligible &&
        storedReplacement.questionId === replacementQuestionId
      ) {
        try {
          remainsValid = await validateReplacement({
            challengeDate: date,
            flaggedSlot: item.slot,
            replacement: storedReplacement.snapshot,
          });
        } catch {
          remainsValid = false;
        }
      }
      if (
        !storedReplacement?.eligible ||
        storedReplacement.questionId !== replacementQuestionId ||
        !remainsValid
      ) {
        return NextResponse.json({ message: "Replacement is no longer valid." }, { status: 409 });
      }
    }

    const result = await resolve({
      action,
      challengeDate: date,
      reviewItemId,
      replacementQuestionId: action === "replace" ? replacementQuestionId as string : null,
      resolvedBy: auth.userId,
    });
    if (result.outcome === "conflict" || result.outcome === "not_draft") {
      return NextResponse.json({ message: "Review can no longer be changed." }, { status: 409 });
    }
    if (result.outcome === "missing") {
      return NextResponse.json({ message: "Review item not found." }, { status: 404 });
    }
    return NextResponse.json(result);
  };
}

export const POST = createDailyReviewResolveHandler();
