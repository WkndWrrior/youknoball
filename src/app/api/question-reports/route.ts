import { type NextRequest, NextResponse } from "next/server";

import { parseQuestionReportPayload } from "@/lib/questionReports";
import { sendQuestionReportNotification } from "@/lib/server/questionReportNotifications";
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
    const reporterUserId = session?.user.id ?? null;
    const adminClient = supabaseAdmin();

    const savedReport = await createQuestionReport(adminClient, {
      ...report,
      reporterUserId,
    });

    try {
      await sendQuestionReportNotification(adminClient, {
        ...report,
        reportId:
          savedReport && typeof savedReport.id === "string" ? savedReport.id : null,
        reporterUserId,
      });
    } catch {
      // Reporting should not fail for players just because notification email failed.
    }

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
