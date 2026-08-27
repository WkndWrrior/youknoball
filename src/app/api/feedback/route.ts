import { type NextRequest, NextResponse } from "next/server";

import { parseFeedbackPayload } from "@/lib/feedback";
import { sendFeedbackNotification } from "@/lib/server/feedbackNotifications";
import { createFeedbackSubmission } from "@/lib/server/feedbackRepository";
import {
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
} from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const MAX_FEEDBACK_REQUEST_BYTES = 32 * 1024;

const invalidFeedbackResponse = () =>
  NextResponse.json({ message: "Invalid feedback." }, { status: 400 });

const unsupportedMediaTypeResponse = () =>
  NextResponse.json({ message: "Unsupported media type." }, { status: 415 });

const requestBodyTooLargeResponse = () =>
  NextResponse.json({ message: "Request body is too large." }, { status: 413 });

function hasApplicationJsonContentType(request: NextRequest) {
  const contentType = request.headers.get("content-type");

  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

type RequestJsonResult =
  | { status: "ok"; value: unknown }
  | { status: "invalid" }
  | { status: "too_large" };

async function readRequestJson(request: NextRequest): Promise<RequestJsonResult> {
  if (!request.body) {
    return { status: "invalid" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (totalBytes + value.byteLength > MAX_FEEDBACK_REQUEST_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The response remains 413 even when upstream cancellation fails.
        }

        return { status: "too_large" };
      }

      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      status: "ok",
      value: JSON.parse(new TextDecoder().decode(bodyBytes)),
    };
  } catch {
    return { status: "invalid" };
  }
}

async function getVerifiedReporterUserId(request: NextRequest) {
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

    return !error && typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!hasApplicationJsonContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  try {
    const requestJson = await readRequestJson(request);
    if (requestJson.status === "too_large") {
      return requestBodyTooLargeResponse();
    }

    if (requestJson.status === "invalid") {
      return invalidFeedbackResponse();
    }

    const feedback = parseFeedbackPayload(requestJson.value);
    if (!feedback) {
      return invalidFeedbackResponse();
    }

    const reporterUserId = await getVerifiedReporterUserId(request);
    const adminClient = supabaseAdmin();
    const savedSubmission = await createFeedbackSubmission(adminClient, {
      ...feedback,
      reporterUserId,
    });
    const submissionId = savedSubmission?.id;

    if (typeof submissionId === "string") {
      try {
        await sendFeedbackNotification({
          ...feedback,
          submissionId,
          reporterUserId,
        });
      } catch {
        // Feedback remains accepted when the best-effort notification fails.
      }
    }

    return NextResponse.json({
      message: "Thanks for helping us make YouKnoBall better.",
    });
  } catch {
    return NextResponse.json(
      { message: "Unable to send feedback." },
      { status: 500 },
    );
  }
}
