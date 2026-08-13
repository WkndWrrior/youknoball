import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getNightlyReviewSchedule } from "@/lib/date";
import { runNightlyQuestionReview } from "@/lib/server/dailyQuestionReviewService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type ReviewRunner = (input: {
  challengeDate: string;
  now: Date;
  unitLimit: 1;
  deadline: Date;
  siteUrlFallback?: string;
}) => Promise<{ kind: string }>;

function configuredSecret() {
  const value = process.env.CRON_SECRET;
  if (!value || value !== value.trim() || /\s/.test(value)) return null;
  return value;
}

function authorized(request: Request, secret: string) {
  const match = /^Bearer ([^\s]+)$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match) return false;
  const actual = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(actual, expected);
}

function productionSiteFallback(value: string | undefined) {
  const hostname = value?.trim();
  if (
    !hostname ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
      hostname,
    )
  ) {
    return undefined;
  }
  return `https://${hostname}`;
}

export function createDailyQuestionReviewCronHandler(options: {
  now?: () => Date;
  runReview?: ReviewRunner;
  productionUrl?: () => string | undefined;
} = {}) {
  const now = options.now ?? (() => new Date());
  const runReview = options.runReview ?? runNightlyQuestionReview;
  const productionUrl =
    options.productionUrl ?? (() => process.env.VERCEL_PROJECT_PRODUCTION_URL);

  return async function GET(request: Request) {
    const secret = configuredSecret();
    if (!secret) {
      return NextResponse.json(
        { message: "Cron is not configured." },
        { status: 503 },
      );
    }
    if (!authorized(request, secret)) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    try {
      const currentTime = now();
      const schedule = getNightlyReviewSchedule(currentTime);
      if (!schedule.shouldRun) return new NextResponse(null, { status: 204 });

      const result = await runReview({
        challengeDate: schedule.challengeDate,
        now: currentTime,
        unitLimit: 1,
        deadline: new Date(currentTime.getTime() + 240_000),
        siteUrlFallback: productionSiteFallback(productionUrl()),
      });
      return NextResponse.json({
        challengeDate: schedule.challengeDate,
        status: result.kind,
      });
    } catch {
      return NextResponse.json(
        { message: "Nightly review failed." },
        { status: 500 },
      );
    }
  };
}

export const GET = createDailyQuestionReviewCronHandler();
export const POST = GET;
