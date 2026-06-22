import type { ServerSupabaseClient } from "@/lib/server/supabaseServer";
import type {
  QuestionReportContext,
  QuestionReportReason,
} from "@/lib/questionReports";

type CreateQuestionReportInput = {
  questionId: string;
  reporterUserId: string | null;
  context: QuestionReportContext;
  reason: QuestionReportReason;
  note: string | null;
};

export async function createQuestionReport(
  client: ServerSupabaseClient,
  input: CreateQuestionReportInput,
) {
  const { data, error } = await client
    .from("question_reports")
    .insert({
      question_id: input.questionId,
      reporter_user_id: input.reporterUserId,
      context: input.context,
      reason: input.reason,
      note: input.note,
    })
    .select("id, question_id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
