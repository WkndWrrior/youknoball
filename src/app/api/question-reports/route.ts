import { type NextRequest, NextResponse } from "next/server";

import { parseQuestionReportPayload } from "@/lib/questionReports";
import { sendQuestionReportNotification } from "@/lib/server/questionReportNotifications";
import { createQuestionReport } from "@/lib/server/questionReportsRepository";
import { getVerifiedSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const MAX_QUESTION_REPORT_REQUEST_BYTES = 32 * 1024;

function hasApplicationJsonContentType(request: NextRequest) {
  const contentType = request.headers.get("content-type");
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

async function readRequestJson(request: NextRequest) {
  if (!request.body) {
    return { status: "invalid" as const };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (totalBytes + value.byteLength > MAX_QUESTION_REPORT_REQUEST_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The response remains 413 if upstream cancellation fails.
        }
        return { status: "too_large" as const };
      }

      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      status: "ok" as const,
      value: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    };
  } catch {
    return { status: "invalid" as const };
  }
}

export async function POST(request: NextRequest) {
  if (!hasApplicationJsonContentType(request)) {
    return NextResponse.json(
      { message: "Unsupported media type." },
      { status: 415 },
    );
  }

  try {
    const requestJson = await readRequestJson(request);
    if (requestJson.status === "too_large") {
      return NextResponse.json(
        { message: "Request body is too large." },
        { status: 413 },
      );
    }

    if (requestJson.status === "invalid") {
      return NextResponse.json(
        { message: "Invalid question report." },
        { status: 400 },
      );
    }

    const report = parseQuestionReportPayload(requestJson.value);

    if (!report) {
      return NextResponse.json(
        { message: "Invalid question report." },
        { status: 400 },
      );
    }

    const auth = await getVerifiedSupabaseSessionFromRequest(request);
    const reporterUserId = auth?.user.id ?? null;
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
