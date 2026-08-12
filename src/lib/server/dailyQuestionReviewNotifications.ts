import "server-only";

import type {
  DailyQuestionReviewItemRecord,
  DailyQuestionReviewRunRecord,
} from "@/lib/server/dailyQuestionReviewRepository";

const RESEND_TIMEOUT_MS = 5_000;
const MAX_RESEND_ERROR_LENGTH = 1_000;
const GENERIC_RESEND_ERROR = "Unable to send nightly review email.";

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
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export type DailyQuestionReviewNotificationResult =
  | { sent: true; providerMessageId: string }
  | { sent: false; reason: "not_configured" | "already_sent" };

function recipients(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function verdictLabel(item: DailyQuestionReviewItemRecord) {
  if (item.reviewStatus !== "completed" || !item.finding) {
    return "FAILED - verification did not complete";
  }
  if (item.finding.verdict === "risk") {
    return "RISK - owner review required";
  }
  if (item.finding.verdict === "unable_to_verify") {
    return "UNABLE TO VERIFY - adequate evidence was unavailable";
  }
  return "PASSED";
}

function itemText(item: DailyQuestionReviewItemRecord) {
  const lines = [
    `${item.slot}. ${item.question.sport.name} / ${item.question.difficulty}`,
    verdictLabel(item),
    `Question: ${item.question.question_text}`,
  ];
  if (item.finding) {
    lines.push(`Explanation: ${item.finding.explanation}`);
    for (const conflict of item.finding.conflicts) {
      lines.push(`Conflict: ${conflict}`);
    }
    for (const evidence of item.finding.evidence) {
      const url = safeHttpsUrl(evidence.url);
      if (url) lines.push(`Evidence: ${evidence.title} - ${url}`);
    }
  }
  if (item.replacement?.eligible) {
    lines.push(`Verified replacement: ${item.replacement.snapshot.question_text}`);
  } else if (item.finding?.verdict !== "passed") {
    lines.push("Verified replacement: unavailable");
  }
  return lines.join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMessage(
  run: DailyQuestionReviewRunRecord,
  items: DailyQuestionReviewItemRecord[],
  reviewUrl: string,
) {
  const sortedItems = [...items].sort((left, right) => left.slot - right.slot);
  const allClear =
    run.status === "completed" &&
    sortedItems.length === 5 &&
    sortedItems.every((item) => item.finding?.verdict === "passed");
  const heading = allClear
    ? "All five questions passed verification."
    : "One or more questions need owner review.";
  const errors = run.errors.map(
    (error) => `Job error (${error.phase}/${error.code}): ${error.message}`,
  );
  const text = [
    `You Kno Ball Daily 5 review for ${displayDate(run.challengeDate)}`,
    "",
    heading,
    `Run status: ${run.status}`,
    `Estimated cost: $${(run.estimatedCostMicrodollars / 1_000_000).toFixed(6)}`,
    "",
    ...sortedItems.flatMap((item) => [itemText(item), ""]),
    ...errors,
    errors.length ? "" : "",
    `Review: ${reviewUrl}`,
  ].join("\n");

  return {
    allClear,
    text,
    html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</div>`,
  };
}

async function resendError(
  response: Awaited<ReturnType<FetchLike>>,
  apiKey: string,
) {
  if (!response.text) return GENERIC_RESEND_ERROR;
  try {
    const detail = (await response.text()).trim();
    return detail && detail.length <= MAX_RESEND_ERROR_LENGTH
      ? detail.replaceAll(apiKey, "[REDACTED]")
      : GENERIC_RESEND_ERROR;
  } catch {
    return GENERIC_RESEND_ERROR;
  }
}

export async function sendDailyQuestionReviewNotification(
  input: {
    run: DailyQuestionReviewRunRecord;
    items: DailyQuestionReviewItemRecord[];
    siteUrlFallback?: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<DailyQuestionReviewNotificationResult> {
  if (input.run.email.status === "sent") {
    return { sent: false, reason: "already_sent" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.QUESTION_REPORT_EMAIL_FROM?.trim();
  const to = recipients(process.env.QUESTION_REPORT_EMAIL_TO);
  const siteUrl =
    safeHttpsUrl(process.env.NEXT_PUBLIC_SITE_URL?.trim()) ??
    safeHttpsUrl(input.siteUrlFallback?.trim());
  if (!apiKey || !from || to.length === 0 || !siteUrl) {
    return { sent: false, reason: "not_configured" };
  }

  const reviewUrl = new URL(
    `/admin/daily-review/${encodeURIComponent(input.run.challengeDate)}`,
    siteUrl,
  ).toString();
  const message = buildMessage(input.run, input.items, reviewUrl);
  const date = displayDate(input.run.challengeDate);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to,
        subject: message.allClear
          ? `Daily 5 review all clear: ${date}`
          : `Daily 5 review needs attention: ${date}`,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) throw new Error(await resendError(response, apiKey));

    const payload = response.json ? await response.json() : null;
    const providerMessageId =
      payload && typeof payload === "object" && "id" in payload &&
      typeof payload.id === "string" && payload.id.trim()
        ? payload.id.trim()
        : null;
    if (!providerMessageId) throw new Error("Resend returned an invalid message ID.");
    return { sent: true, providerMessageId };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendDailyQuestionReviewBudgetBlockNotification(
  input: {
    challengeDate: string;
    reason: string;
    reservedMicrodollars: number;
    remainingMicrodollars: number;
    siteUrlFallback?: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<DailyQuestionReviewNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.QUESTION_REPORT_EMAIL_FROM?.trim();
  const to = recipients(process.env.QUESTION_REPORT_EMAIL_TO);
  if (!apiKey || !from || to.length === 0) {
    return { sent: false, reason: "not_configured" };
  }

  const date = displayDate(input.challengeDate);
  const siteUrl =
    safeHttpsUrl(process.env.NEXT_PUBLIC_SITE_URL?.trim()) ??
    safeHttpsUrl(input.siteUrlFallback?.trim());
  const lines = [
    `You Kno Ball Daily 5 review for ${date} was blocked by the monthly budget gate.`,
    "",
    "No OpenAI verification calls were made.",
    `Reason: ${input.reason}`,
    `Required reservation: $${(input.reservedMicrodollars / 1_000_000).toFixed(6)}`,
    `Remaining monthly budget: $${(input.remainingMicrodollars / 1_000_000).toFixed(6)}`,
  ];
  if (siteUrl) {
    lines.push(
      `Review: ${new URL(`/admin/daily-review/${encodeURIComponent(input.challengeDate)}`, siteUrl).toString()}`,
    );
  }
  const text = lines.join("\n");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to,
        subject: `Daily 5 review budget blocked: ${date}`,
        text,
        html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</div>`,
      }),
    });
    if (!response.ok) throw new Error(await resendError(response, apiKey));
    const payload = response.json ? await response.json() : null;
    const providerMessageId =
      payload && typeof payload === "object" && "id" in payload &&
      typeof payload.id === "string" && payload.id.trim()
        ? payload.id.trim()
        : null;
    if (!providerMessageId) throw new Error("Resend returned an invalid message ID.");
    return { sent: true, providerMessageId };
  } finally {
    clearTimeout(timeoutId);
  }
}
