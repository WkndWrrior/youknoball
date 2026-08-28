import { createDailyReviewResolveHandler } from "@/app/api/admin/daily-review/[date]/resolve/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = createDailyReviewResolveHandler();
