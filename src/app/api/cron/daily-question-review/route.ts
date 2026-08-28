import { createDailyQuestionReviewCronHandler } from "@/app/api/cron/daily-question-review/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export const GET = createDailyQuestionReviewCronHandler();
export const POST = GET;
