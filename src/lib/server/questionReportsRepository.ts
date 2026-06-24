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

function getCorrectAnswer(
  question: {
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: string;
  },
) {
  if (question.correct_option === "A") return question.option_a;
  if (question.correct_option === "B") return question.option_b;
  if (question.correct_option === "C") return question.option_c;
  if (question.correct_option === "D") return question.option_d;
  return "";
}

export async function getQuestionForReportNotification(
  client: ServerSupabaseClient,
  questionId: string,
) {
  const { data, error } = await client
    .from("questions")
    .select(`
      id,
      difficulty,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      source_notes,
      sports (
        slug,
        name
      )
    `)
    .eq("id", questionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const sport = Array.isArray(data.sports) ? data.sports[0] : data.sports;

  return {
    id: String(data.id),
    sport: String(sport?.name ?? sport?.slug ?? "Unknown sport"),
    difficulty: String(data.difficulty),
    question_text: String(data.question_text),
    option_a: String(data.option_a),
    option_b: String(data.option_b),
    option_c: String(data.option_c),
    option_d: String(data.option_d),
    correct_option: String(data.correct_option),
    correct_answer: getCorrectAnswer({
      option_a: String(data.option_a),
      option_b: String(data.option_b),
      option_c: String(data.option_c),
      option_d: String(data.option_d),
      correct_option: String(data.correct_option),
    }),
    source_notes:
      typeof data.source_notes === "string" ? data.source_notes : null,
  };
}
