const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_QUESTION_REPORT_NOTE_LENGTH = 500;

export const QUESTION_REPORT_REASONS = [
  "wrong_answer",
  "unclear_question",
  "typo",
  "other",
] as const;

export const QUESTION_REPORT_CONTEXTS = [
  "daily_challenge",
  "sport_quiz",
  "unknown",
] as const;

export type QuestionReportReason = (typeof QUESTION_REPORT_REASONS)[number];
export type QuestionReportContext = (typeof QUESTION_REPORT_CONTEXTS)[number];

export type ParsedQuestionReportPayload = {
  questionId: string;
  context: QuestionReportContext;
  reason: QuestionReportReason;
  note: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isQuestionReportReason(value: unknown): value is QuestionReportReason {
  return (
    typeof value === "string" &&
    QUESTION_REPORT_REASONS.includes(value as QuestionReportReason)
  );
}

function isQuestionReportContext(value: unknown): value is QuestionReportContext {
  return (
    typeof value === "string" &&
    QUESTION_REPORT_CONTEXTS.includes(value as QuestionReportContext)
  );
}

export function parseQuestionReportPayload(
  raw: unknown,
): ParsedQuestionReportPayload | null {
  if (!isRecord(raw)) {
    return null;
  }

  const questionId = typeof raw.questionId === "string" ? raw.questionId.trim() : "";
  if (!UUID_PATTERN.test(questionId)) {
    return null;
  }

  if (!isQuestionReportReason(raw.reason)) {
    return null;
  }

  const context =
    raw.context === undefined
      ? "unknown"
      : isQuestionReportContext(raw.context)
        ? raw.context
        : null;

  if (!context) {
    return null;
  }

  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > MAX_QUESTION_REPORT_NOTE_LENGTH) {
    return null;
  }

  return {
    questionId,
    context,
    reason: raw.reason,
    note: note || null,
  };
}
