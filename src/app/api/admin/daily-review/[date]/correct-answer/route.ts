import { createDailyReviewCorrectAnswerHandler } from "@/app/api/admin/daily-review/[date]/correct-answer/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = createDailyReviewCorrectAnswerHandler();
