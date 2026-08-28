import { NextRequest, NextResponse } from "next/server";

import { authorizeDailyReviewRequest } from "@/lib/server/adminAuth";
import {
  verifyAndCorrectAdminDailyReviewAnswer,
  type AdminDailyReviewCorrectionInput,
} from "@/lib/server/adminDailyReviewCorrection";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANSWER_OPTIONS = new Set(["A", "B", "C", "D"]);
const MAX_JSON_BODY_BYTES = 4096;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function createDailyReviewCorrectAnswerHandler(dependencies?: {
  authorize?: (request: NextRequest) => ReturnType<typeof authorizeDailyReviewRequest>;
  correctAnswer?: (
    input: AdminDailyReviewCorrectionInput,
  ) => ReturnType<typeof verifyAndCorrectAdminDailyReviewAnswer>;
}) {
  const authorize = dependencies?.authorize ?? authorizeDailyReviewRequest;
  const correctAnswer =
    dependencies?.correctAnswer ?? verifyAndCorrectAdminDailyReviewAnswer;

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
    const mediaType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      return NextResponse.json({ message: "Invalid review request." }, { status: 415 });
    }
    const contentLength = request.headers.get("content-length");
    if (
      contentLength !== null &&
      /^\d+$/.test(contentLength) &&
      Number(contentLength) > MAX_JSON_BODY_BYTES
    ) {
      return NextResponse.json({ message: "Review request is too large." }, { status: 413 });
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
    if (
      typeof value.reviewItemId !== "string" ||
      !UUID_PATTERN.test(value.reviewItemId) ||
      typeof value.newCorrectOption !== "string" ||
      !ANSWER_OPTIONS.has(value.newCorrectOption)
    ) {
      return NextResponse.json({ message: "Invalid review request." }, { status: 400 });
    }

    try {
      const result = await correctAnswer({
        challengeDate: date,
        reviewItemId: value.reviewItemId,
        newCorrectOption: value.newCorrectOption as "A" | "B" | "C" | "D",
        resolvedBy: auth.userId,
      });
      if (result.outcome === "missing") {
        return NextResponse.json({ message: "Review item not found." }, { status: 404 });
      }
      if (result.outcome === "conflict") {
        return NextResponse.json(
          { ...result, message: "Review can no longer be changed." },
          { status: 409 },
        );
      }
      if (result.outcome === "verification_failed") {
        return NextResponse.json(
          {
            outcome: result.outcome,
            estimatedCostMicrodollars: result.estimatedCostMicrodollars,
            retryable: result.retryable,
            usageUncertain: result.usageUncertain,
          },
          { status: 502 },
        );
      }
      if (result.outcome === "persistence_failed") {
        return NextResponse.json(
          {
            outcome: result.outcome,
            finding: result.finding,
            evidence: result.evidence,
            estimatedCostMicrodollars: result.estimatedCostMicrodollars,
          },
          { status: 500 },
        );
      }
      return NextResponse.json(result);
    } catch {
      return NextResponse.json(
        { message: "Unable to verify the answer correction." },
        { status: 500 },
      );
    }
  };
}
