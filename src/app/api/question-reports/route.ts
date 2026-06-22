import { type NextRequest, NextResponse } from "next/server";

import { parseQuestionReportPayload } from "@/lib/questionReports";
import { createQuestionReport } from "@/lib/server/questionReportsRepository";
import { getSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const report = parseQuestionReportPayload(body);

    if (!report) {
      return NextResponse.json(
        { message: "Invalid question report." },
        { status: 400 },
      );
    }

    const session = getSupabaseSessionFromRequest(request);

    await createQuestionReport(supabaseAdmin(), {
      ...report,
      reporterUserId: session?.user.id ?? null,
    });

    return NextResponse.json({
      message: "Thanks. We'll review this question.",
    });
  } catch {
    return NextResponse.json(
      { message: "Unable to report this question." },
      { status: 500 },
    );
  }
}
