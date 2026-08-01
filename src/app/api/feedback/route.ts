import { type NextRequest, NextResponse } from "next/server";

import { parseFeedbackPayload } from "@/lib/feedback";
import { sendFeedbackNotification } from "@/lib/server/feedbackNotifications";
import { createFeedbackSubmission } from "@/lib/server/feedbackRepository";
import { getSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const invalidFeedbackResponse = () =>
  NextResponse.json({ message: "Invalid feedback." }, { status: 400 });

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidFeedbackResponse();
  }

  const feedback = parseFeedbackPayload(body);
  if (!feedback) {
    return invalidFeedbackResponse();
  }

  try {
    const session = getSupabaseSessionFromRequest(request);
    const reporterUserId = session?.user.id ?? null;
    const adminClient = supabaseAdmin();
    const savedSubmission = await createFeedbackSubmission(adminClient, {
      ...feedback,
      reporterUserId,
    });

    try {
      await sendFeedbackNotification({
        ...feedback,
        submissionId: savedSubmission.id,
        reporterUserId,
      });
    } catch {
      // Feedback remains accepted when the best-effort notification fails.
    }

    return NextResponse.json({
      message: "Thanks for helping us make You Kno Ball better.",
    });
  } catch {
    return NextResponse.json(
      { message: "Unable to send feedback." },
      { status: 500 },
    );
  }
}
