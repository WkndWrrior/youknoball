export const DAILY_QUESTION_REVIEW_RUN_STATUSES = [
  "running",
  "completed",
  "partial",
  "failed",
  "budget_blocked",
] as const;

export const DAILY_QUESTION_REVIEW_RUN_KINDS = ["scheduled"] as const;

export const DAILY_QUESTION_REVIEW_EMAIL_STATUSES = [
  "pending",
  "sent",
  "failed",
] as const;

export const DAILY_QUESTION_REVIEW_VERDICTS = [
  "passed",
  "risk",
  "unable_to_verify",
] as const;

export const DAILY_QUESTION_REVIEW_RESOLUTIONS = [
  "pending",
  "kept",
  "replaced",
] as const;

export const DAILY_QUESTION_REVIEW_ACTIONS = ["keep", "replace"] as const;

export const MAX_REVIEW_EXPLANATION_LENGTH = 2000;
export const MAX_REVIEW_CONFLICTS = 10;
export const MAX_REVIEW_CONFLICT_LENGTH = 500;
export const MAX_REVIEW_EVIDENCE_ITEMS = 10;
export const MAX_REVIEW_EVIDENCE_URL_LENGTH = 2048;
export const MAX_REVIEW_EVIDENCE_TITLE_LENGTH = 300;
export const MAX_REVIEW_EVIDENCE_EXCERPT_LENGTH = 1500;

export type DailyQuestionReviewRunStatus =
  (typeof DAILY_QUESTION_REVIEW_RUN_STATUSES)[number];
export type DailyQuestionReviewRunKind =
  (typeof DAILY_QUESTION_REVIEW_RUN_KINDS)[number];
export type DailyQuestionReviewEmailStatus =
  (typeof DAILY_QUESTION_REVIEW_EMAIL_STATUSES)[number];
export type DailyQuestionReviewVerdict =
  (typeof DAILY_QUESTION_REVIEW_VERDICTS)[number];
export type DailyQuestionReviewResolution =
  (typeof DAILY_QUESTION_REVIEW_RESOLUTIONS)[number];
export type DailyQuestionReviewActionName =
  (typeof DAILY_QUESTION_REVIEW_ACTIONS)[number];

export interface DailyQuestionReviewEvidence {
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
}

export interface DailyQuestionVerificationFinding {
  questionId: string;
  verdict: DailyQuestionReviewVerdict;
  confidence: number;
  explanation: string;
  conflicts: string[];
  evidence: DailyQuestionReviewEvidence[];
  verifiedAt: string;
}

export interface KeepDailyQuestionReviewAction {
  action: "keep";
  reviewItemId: string;
  replacementQuestionId: null;
  requestedAt: string;
}

export interface ReplaceDailyQuestionReviewAction {
  action: "replace";
  reviewItemId: string;
  replacementQuestionId: string;
  requestedAt: string;
}

export type DailyQuestionReviewAction =
  | KeepDailyQuestionReviewAction
  | ReplaceDailyQuestionReviewAction;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasAtMostCodePoints(value: string, limit: number): boolean {
  return Array.from(value).length <= limit;
}

function parseBoundedString(value: unknown, limit: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || !hasAtMostCodePoints(normalized, limit)) {
    return null;
  }

  return normalized;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

function isReviewVerdict(value: unknown): value is DailyQuestionReviewVerdict {
  return (
    typeof value === "string" &&
    DAILY_QUESTION_REVIEW_VERDICTS.includes(
      value as DailyQuestionReviewVerdict,
    )
  );
}

function parseEvidence(value: unknown): DailyQuestionReviewEvidence | null {
  if (!isRecord(value)) {
    return null;
  }

  const url = parseBoundedString(value.url, MAX_REVIEW_EVIDENCE_URL_LENGTH);
  const title = parseBoundedString(
    value.title,
    MAX_REVIEW_EVIDENCE_TITLE_LENGTH,
  );
  const excerpt = parseBoundedString(
    value.excerpt,
    MAX_REVIEW_EVIDENCE_EXCERPT_LENGTH,
  );

  if (!url || !title || !excerpt || !isIsoTimestamp(value.retrievedAt)) {
    return null;
  }

  try {
    if (new URL(url).protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  return {
    url,
    title,
    excerpt,
    retrievedAt: value.retrievedAt,
  };
}

export function parseDailyQuestionVerificationFinding(
  value: unknown,
): DailyQuestionVerificationFinding | null {
  if (
    !isRecord(value) ||
    !isUuid(value.questionId) ||
    !isReviewVerdict(value.verdict) ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !Array.isArray(value.conflicts) ||
    value.conflicts.length > MAX_REVIEW_CONFLICTS ||
    !Array.isArray(value.evidence) ||
    value.evidence.length === 0 ||
    value.evidence.length > MAX_REVIEW_EVIDENCE_ITEMS ||
    !isIsoTimestamp(value.verifiedAt)
  ) {
    return null;
  }

  const explanation = parseBoundedString(
    value.explanation,
    MAX_REVIEW_EXPLANATION_LENGTH,
  );
  const conflicts = value.conflicts.map((conflict) =>
    parseBoundedString(conflict, MAX_REVIEW_CONFLICT_LENGTH),
  );
  const evidence = value.evidence.map(parseEvidence);

  if (
    !explanation ||
    conflicts.some((conflict) => conflict === null) ||
    evidence.some((item) => item === null)
  ) {
    return null;
  }

  return {
    questionId: value.questionId,
    verdict: value.verdict,
    confidence: value.confidence,
    explanation,
    conflicts: conflicts as string[],
    evidence: evidence as DailyQuestionReviewEvidence[],
    verifiedAt: value.verifiedAt,
  };
}

export function parseDailyQuestionReviewAction(
  value: unknown,
): DailyQuestionReviewAction | null {
  if (
    !isRecord(value) ||
    !isUuid(value.reviewItemId) ||
    !isIsoTimestamp(value.requestedAt)
  ) {
    return null;
  }

  if (value.action === "keep") {
    if (
      value.replacementQuestionId !== undefined &&
      value.replacementQuestionId !== null
    ) {
      return null;
    }

    return {
      action: "keep",
      reviewItemId: value.reviewItemId,
      replacementQuestionId: null,
      requestedAt: value.requestedAt,
    };
  }

  if (value.action === "replace" && isUuid(value.replacementQuestionId)) {
    return {
      action: "replace",
      reviewItemId: value.reviewItemId,
      replacementQuestionId: value.replacementQuestionId,
      requestedAt: value.requestedAt,
    };
  }

  return null;
}
