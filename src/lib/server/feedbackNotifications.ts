import type { FeedbackType } from "@/lib/feedback";

type FeedbackNotificationInput = {
  submissionId: string;
  reporterUserId: string | null;
  feedbackType: FeedbackType;
  message: string;
  contactEmail: string | null;
  sourcePath: string | null;
};

type FeedbackNotificationResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" };

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

const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  general: "General",
  bug: "Bug",
  idea: "Idea",
};

const GENERIC_RESEND_ERROR = "Unable to send feedback email.";
const MAX_RESEND_ERROR_LENGTH = 1_000;
const RESEND_TIMEOUT_MS = 5_000;

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

function buildReviewQuery(submissionId: string) {
  const quotedSubmissionId = submissionId.replace(/'/g, "''");

  return `select *
from internal.feedback_review
where id = '${quotedSubmissionId}'
order by created_at desc;`;
}

function quotePlayerMessage(message: string) {
  return message
    .split(/\r\n?|\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function buildFeedbackEmailText(feedback: FeedbackNotificationInput) {
  const feedbackType = FEEDBACK_TYPE_LABELS[feedback.feedbackType];

  return [
    "A player submitted feedback for You Kno Ball.",
    "",
    `Submission ID: ${feedback.submissionId}`,
    `Feedback type: ${feedbackType}`,
    `Reporter user ID: ${feedback.reporterUserId ?? "guest"}`,
    `Contact email: ${feedback.contactEmail ?? "None"}`,
    `Source path: ${feedback.sourcePath ?? "None"}`,
    "",
    "Review query:",
    buildReviewQuery(feedback.submissionId),
    "",
    "Player message:",
    quotePlayerMessage(feedback.message),
  ].join("\n");
}

async function getResendErrorMessage(
  response: Awaited<ReturnType<FetchLike>>,
) {
  if (!response.text) {
    return GENERIC_RESEND_ERROR;
  }

  try {
    const detail = (await response.text()).trim();
    if (!detail || detail.length > MAX_RESEND_ERROR_LENGTH) {
      return GENERIC_RESEND_ERROR;
    }

    return detail;
  } catch {
    return GENERIC_RESEND_ERROR;
  }
}

export async function sendFeedbackNotification(
  feedback: FeedbackNotificationInput,
  fetchImpl: FetchLike = fetch,
): Promise<FeedbackNotificationResult> {
  const config = getEmailConfig();
  if (!config) {
    return { sent: false, reason: "not_configured" };
  }

  const feedbackType = FEEDBACK_TYPE_LABELS[feedback.feedbackType];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject: `Player feedback: ${feedbackType}`,
        text: buildFeedbackEmailText(feedback),
      }),
    });

    if (!response.ok) {
      throw new Error(await getResendErrorMessage(response));
    }

    return { sent: true };
  } finally {
    clearTimeout(timeoutId);
  }
}
