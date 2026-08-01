import type { FeedbackType } from "@/lib/feedback";
import type { ServerSupabaseClient } from "@/lib/server/supabaseServer";

type CreateFeedbackSubmissionInput = {
  reporterUserId: string | null;
  feedbackType: FeedbackType;
  message: string;
  contactEmail: string | null;
  sourcePath: string | null;
};

export async function createFeedbackSubmission(
  client: ServerSupabaseClient,
  input: CreateFeedbackSubmissionInput,
) {
  const { data, error } = await client
    .from("feedback_submissions")
    .insert({
      reporter_user_id: input.reporterUserId,
      feedback_type: input.feedbackType,
      message: input.message,
      contact_email: input.contactEmail,
      source_path: input.sourcePath,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
