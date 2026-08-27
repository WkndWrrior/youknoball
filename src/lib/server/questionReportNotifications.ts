import type { ServerSupabaseClient } from "@/lib/server/supabaseServer";
import type {
  ParsedQuestionReportPayload,
  QuestionReportContext,
  QuestionReportReason,
} from "@/lib/questionReports";
import { getQuestionForReportNotification } from "@/lib/server/questionReportsRepository";

type QuestionReportNotificationInput = ParsedQuestionReportPayload & {
  reportId: string | null;
  reporterUserId: string | null;
};

type QuestionReportNotificationResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "question_not_found" };

type FetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  text?: () => Promise<string>;
}>;

type EmailConfig = {
  apiKey: string;
  from: string;
  to: string[];
};

function getConfiguredRecipients(rawValue: string | undefined) {
  return (rawValue ?? "")
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.QUESTION_REPORT_EMAIL_FROM?.trim();
  const to = getConfiguredRecipients(process.env.QUESTION_REPORT_EMAIL_TO);

  if (!apiKey || !from || to.length === 0) {
    return null;
  }

  return { apiKey, from, to };
}

function labelReason(reason: QuestionReportReason) {
  if (reason === "wrong_answer") return "wrong_answer";
  if (reason === "unclear_question") return "unclear_question";
  if (reason === "typo") return "typo";
  return "other";
}

function labelContext(context: QuestionReportContext) {
  if (context === "daily_challenge") return "daily_challenge";
  if (context === "sport_quiz") return "sport_quiz";
  return "unknown";
}

function buildReviewQuery(reportId: string | null) {
  const reportFilter = reportId
    ? `\nwhere report_id = '${reportId}'`
    : "";

  return `select *
from internal.question_report_review${reportFilter}
order by reported_at desc;`;
}

function buildQuestionReportEmailText(
  report: QuestionReportNotificationInput,
  question: Awaited<ReturnType<typeof getQuestionForReportNotification>>,
) {
  if (!question) {
    return "";
  }

  return [
    "A player reported a YouKnoBall question.",
    "",
    `Report ID: ${report.reportId ?? "unknown"}`,
    `Reason: ${labelReason(report.reason)}`,
    `Context: ${labelContext(report.context)}`,
    `Reporter user ID: ${report.reporterUserId ?? "guest"}`,
    `Note: ${report.note ?? "None"}`,
    "",
    `Sport: ${question.sport}`,
    `Difficulty: ${question.difficulty}`,
    `Question: ${question.question_text}`,
    "",
    `A: ${question.option_a}`,
    `B: ${question.option_b}`,
    `C: ${question.option_c}`,
    `D: ${question.option_d}`,
    "",
    `Correct option: ${question.correct_option}`,
    `Correct answer: ${question.correct_answer}`,
    `Source notes: ${question.source_notes ?? "None"}`,
    "",
    "Review query:",
    buildReviewQuery(report.reportId),
  ].join("\n");
}

export async function sendQuestionReportNotification(
  client: ServerSupabaseClient,
  report: QuestionReportNotificationInput,
  fetchImpl: FetchLike = fetch,
): Promise<QuestionReportNotificationResult> {
  const config = getEmailConfig();
  if (!config) {
    return { sent: false, reason: "not_configured" };
  }

  const question = await getQuestionForReportNotification(client, report.questionId);
  if (!question) {
    return { sent: false, reason: "question_not_found" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let response: Awaited<ReturnType<FetchLike>>;

  try {
    response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject: `Question reported: ${question.sport} ${question.difficulty}`,
        text: buildQuestionReportEmailText(report, question),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = response.text ? await response.text() : "";
    throw new Error(detail || "Unable to send question report email.");
  }

  return { sent: true };
}
