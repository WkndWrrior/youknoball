export const DAILY_QUESTION_REVIEW_RUN_STATUSES = [
  "preparing",
  "running",
  "completed",
  "completed_with_flags",
  "failed",
] as const;

export const DAILY_QUESTION_REVIEW_RUN_KINDS = ["scheduled"] as const;

export const DAILY_QUESTION_REVIEW_EMAIL_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
] as const;

export const DAILY_QUESTION_REVIEW_ITEM_STATUSES = [
  "pending",
  "reviewing",
  "completed",
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

export const DAILY_QUESTION_SOURCE_FETCH_STATUSES = [
  "fetched",
  "failed",
  "blocked",
] as const;

export const DAILY_QUESTION_REVIEW_ERROR_PHASES = [
  "preparing",
  "source_fetch",
  "verification",
  "replacement",
  "email",
] as const;

export const MAX_QUESTION_TEXT_LENGTH = 1000;
export const MAX_QUESTION_OPTION_LENGTH = 500;
export const MAX_QUESTION_SPORT_SLUG_LENGTH = 50;
export const MAX_QUESTION_SPORT_NAME_LENGTH = 100;
export const MAX_QUESTION_SOURCE_NOTES_LENGTH = 4000;

export const MAX_REVIEW_EXPLANATION_LENGTH = 2000;
export const MAX_REVIEW_CONFLICTS = 10;
export const MAX_REVIEW_CONFLICT_LENGTH = 500;
export const MAX_REVIEW_EVIDENCE_ITEMS = 10;
export const MAX_REVIEW_EVIDENCE_URL_LENGTH = 2048;
export const MAX_REVIEW_EVIDENCE_TITLE_LENGTH = 300;
export const MAX_REVIEW_EVIDENCE_EXCERPT_LENGTH = 1500;

export const MAX_SOURCE_FETCH_RESULTS = 20;
export const MAX_SOURCE_FETCH_CONTENT_TYPE_LENGTH = 200;
export const MAX_SOURCE_FETCH_ERROR_CODE_LENGTH = 100;
export const MAX_SOURCE_FETCH_ERROR_MESSAGE_LENGTH = 1000;

export const MAX_REVIEW_RUN_ERRORS = 20;
export const MAX_REVIEW_RUN_ERRORS_BYTES = 20000;
export const MAX_REVIEW_RUN_ERROR_CODE_LENGTH = 100;
export const MAX_REVIEW_RUN_ERROR_MESSAGE_LENGTH = 1000;

export const MAX_REVIEW_EMAIL_ATTEMPTS = 10;
export const MAX_REVIEW_EMAIL_METADATA_BYTES = 4000;
export const MAX_REVIEW_EMAIL_PROVIDER_MESSAGE_ID_LENGTH = 200;
export const MAX_REVIEW_EMAIL_FAILURE_CODE_LENGTH = 100;
export const MAX_REVIEW_EMAIL_FAILURE_MESSAGE_LENGTH = 1000;

export type DailyQuestionReviewRunStatus =
  (typeof DAILY_QUESTION_REVIEW_RUN_STATUSES)[number];
export type DailyQuestionReviewRunKind =
  (typeof DAILY_QUESTION_REVIEW_RUN_KINDS)[number];
export type DailyQuestionReviewEmailStatus =
  (typeof DAILY_QUESTION_REVIEW_EMAIL_STATUSES)[number];
export type DailyQuestionReviewItemStatus =
  (typeof DAILY_QUESTION_REVIEW_ITEM_STATUSES)[number];
export type DailyQuestionReviewVerdict =
  (typeof DAILY_QUESTION_REVIEW_VERDICTS)[number];
export type DailyQuestionReviewResolution =
  (typeof DAILY_QUESTION_REVIEW_RESOLUTIONS)[number];
export type DailyQuestionReviewActionName =
  (typeof DAILY_QUESTION_REVIEW_ACTIONS)[number];
export type DailyQuestionSourceFetchStatus =
  (typeof DAILY_QUESTION_SOURCE_FETCH_STATUSES)[number];
export type DailyQuestionReviewErrorPhase =
  (typeof DAILY_QUESTION_REVIEW_ERROR_PHASES)[number];
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionAnswerOption = "A" | "B" | "C" | "D";

export interface QuestionSnapshotSport {
  slug: string;
  name: string;
}

export interface QuestionSnapshot {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: QuestionAnswerOption;
  sport: QuestionSnapshotSport;
  difficulty: QuestionDifficulty;
  source_notes: string | null;
}

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

export interface DailyQuestionSourceFetchError {
  code: string;
  message: string;
}

export interface DailyQuestionSourceFetchResult {
  sourceUrl: string;
  finalUrl: string | null;
  status: DailyQuestionSourceFetchStatus;
  httpStatus: number | null;
  contentType: string | null;
  attemptedAt: string;
  error: DailyQuestionSourceFetchError | null;
}

export interface DailyQuestionReviewRunError {
  phase: DailyQuestionReviewErrorPhase;
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
  questionId: string | null;
}

export interface DailyQuestionReviewEmailFailure {
  code: string;
  message: string;
  occurredAt: string;
}

export interface DailyQuestionReviewEmailMetadata {
  provider: "resend";
  providerMessageId: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  failure: DailyQuestionReviewEmailFailure | null;
}

export interface DailyQuestionReviewEmailState {
  status: DailyQuestionReviewEmailStatus;
  emailSentAt: string | null;
  metadata: DailyQuestionReviewEmailMetadata;
}

export interface DailyQuestionReplacementCandidate {
  questionId: string;
  eligible: boolean;
  snapshot: QuestionSnapshot;
  finding: DailyQuestionVerificationFinding;
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

function countJsonbFormattingSpaces(value: unknown): number {
  if (Array.isArray(value)) {
    return (
      Math.max(0, value.length - 1) +
      value.reduce(
        (total, item) => total + countJsonbFormattingSpaces(item),
        0,
      )
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    return (
      entries.length +
      Math.max(0, entries.length - 1) +
      entries.reduce(
        (total, [, item]) => total + countJsonbFormattingSpaces(item),
        0,
      )
    );
  }

  return 0;
}

function getJsonbTextByteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  return (
    new TextEncoder().encode(serialized).byteLength +
    countJsonbFormattingSpaces(value)
  );
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

function parseNullableBoundedString(
  value: unknown,
  limit: number,
): string | null | undefined {
  if (value === null) {
    return null;
  }

  const normalized = parseBoundedString(value, limit);
  return normalized ?? undefined;
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

function parseHttpsUrl(value: unknown): string | null {
  const url = parseBoundedString(value, MAX_REVIEW_EVIDENCE_URL_LENGTH);
  if (!url) {
    return null;
  }

  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isReviewVerdict(value: unknown): value is DailyQuestionReviewVerdict {
  return (
    typeof value === "string" &&
    DAILY_QUESTION_REVIEW_VERDICTS.includes(
      value as DailyQuestionReviewVerdict,
    )
  );
}

function isSourceFetchStatus(
  value: unknown,
): value is DailyQuestionSourceFetchStatus {
  return (
    typeof value === "string" &&
    DAILY_QUESTION_SOURCE_FETCH_STATUSES.includes(
      value as DailyQuestionSourceFetchStatus,
    )
  );
}

function isReviewErrorPhase(
  value: unknown,
): value is DailyQuestionReviewErrorPhase {
  return (
    typeof value === "string" &&
    DAILY_QUESTION_REVIEW_ERROR_PHASES.includes(
      value as DailyQuestionReviewErrorPhase,
    )
  );
}

function isReviewEmailStatus(
  value: unknown,
): value is DailyQuestionReviewEmailStatus {
  return (
    typeof value === "string" &&
    DAILY_QUESTION_REVIEW_EMAIL_STATUSES.includes(
      value as DailyQuestionReviewEmailStatus,
    )
  );
}

function isQuestionDifficulty(value: unknown): value is QuestionDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isQuestionAnswerOption(
  value: unknown,
): value is QuestionAnswerOption {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

export function parseQuestionSnapshot(
  value: unknown,
  expectedQuestionId?: string,
): QuestionSnapshot | null {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    (expectedQuestionId !== undefined &&
      (!isUuid(expectedQuestionId) || value.id !== expectedQuestionId)) ||
    !isQuestionAnswerOption(value.correct_option) ||
    !isQuestionDifficulty(value.difficulty) ||
    !isRecord(value.sport)
  ) {
    return null;
  }

  const questionText = parseBoundedString(
    value.question_text,
    MAX_QUESTION_TEXT_LENGTH,
  );
  const optionA = parseBoundedString(value.option_a, MAX_QUESTION_OPTION_LENGTH);
  const optionB = parseBoundedString(value.option_b, MAX_QUESTION_OPTION_LENGTH);
  const optionC = parseBoundedString(value.option_c, MAX_QUESTION_OPTION_LENGTH);
  const optionD = parseBoundedString(value.option_d, MAX_QUESTION_OPTION_LENGTH);
  const sportSlug = parseBoundedString(
    value.sport.slug,
    MAX_QUESTION_SPORT_SLUG_LENGTH,
  );
  const sportName = parseBoundedString(
    value.sport.name,
    MAX_QUESTION_SPORT_NAME_LENGTH,
  );

  let sourceNotes: string | null;
  if (value.source_notes === null) {
    sourceNotes = null;
  } else if (typeof value.source_notes === "string") {
    const normalizedSourceNotes = value.source_notes.trim();
    if (
      !hasAtMostCodePoints(
        normalizedSourceNotes,
        MAX_QUESTION_SOURCE_NOTES_LENGTH,
      )
    ) {
      return null;
    }
    sourceNotes = normalizedSourceNotes || null;
  } else {
    return null;
  }

  if (
    !questionText ||
    !optionA ||
    !optionB ||
    !optionC ||
    !optionD ||
    !sportSlug ||
    !sportName
  ) {
    return null;
  }

  return {
    id: value.id,
    question_text: questionText,
    option_a: optionA,
    option_b: optionB,
    option_c: optionC,
    option_d: optionD,
    correct_option: value.correct_option,
    sport: { slug: sportSlug, name: sportName },
    difficulty: value.difficulty,
    source_notes: sourceNotes,
  };
}

function parseEvidence(value: unknown): DailyQuestionReviewEvidence | null {
  if (!isRecord(value)) {
    return null;
  }

  const url = parseHttpsUrl(value.url);
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
    value.evidence.length > MAX_REVIEW_EVIDENCE_ITEMS ||
    (value.verdict !== "unable_to_verify" && value.evidence.length === 0) ||
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

export function parseReplacementFinding(
  value: unknown,
): DailyQuestionVerificationFinding | null {
  return parseDailyQuestionVerificationFinding(value);
}

export function parseDailyQuestionReplacementCandidate(
  value: unknown,
  originalSnapshotValue: unknown,
): DailyQuestionReplacementCandidate | null {
  if (
    !isRecord(value) ||
    !isUuid(value.questionId) ||
    typeof value.eligible !== "boolean"
  ) {
    return null;
  }

  const originalSnapshot = parseQuestionSnapshot(originalSnapshotValue);
  const snapshot = parseQuestionSnapshot(value.snapshot, value.questionId);
  const finding = parseReplacementFinding(value.finding);

  if (
    !originalSnapshot ||
    !snapshot ||
    !finding ||
    value.questionId === originalSnapshot.id ||
    finding.questionId !== value.questionId ||
    snapshot.difficulty !== originalSnapshot.difficulty ||
    (value.eligible &&
      (finding.verdict !== "passed" || finding.evidence.length === 0))
  ) {
    return null;
  }

  return {
    questionId: value.questionId,
    eligible: value.eligible,
    snapshot,
    finding,
  };
}

function parseSourceFetchError(
  value: unknown,
): DailyQuestionSourceFetchError | null {
  if (!isRecord(value)) {
    return null;
  }

  const code = parseBoundedString(
    value.code,
    MAX_SOURCE_FETCH_ERROR_CODE_LENGTH,
  );
  const message = parseBoundedString(
    value.message,
    MAX_SOURCE_FETCH_ERROR_MESSAGE_LENGTH,
  );

  return code && message ? { code, message } : null;
}

function parseSourceFetchResult(
  value: unknown,
): DailyQuestionSourceFetchResult | null {
  if (
    !isRecord(value) ||
    !isSourceFetchStatus(value.status) ||
    !isIsoTimestamp(value.attemptedAt)
  ) {
    return null;
  }

  const sourceUrl = parseHttpsUrl(value.sourceUrl);
  const finalUrl =
    value.finalUrl === null ? null : parseHttpsUrl(value.finalUrl);
  const contentType = parseNullableBoundedString(
    value.contentType,
    MAX_SOURCE_FETCH_CONTENT_TYPE_LENGTH,
  );
  const httpStatus = value.httpStatus;
  const validHttpStatus =
    httpStatus === null ||
    (typeof httpStatus === "number" &&
      Number.isInteger(httpStatus) &&
      httpStatus >= 100 &&
      httpStatus <= 599);
  const error = value.error === null ? null : parseSourceFetchError(value.error);

  if (
    !sourceUrl ||
    (value.finalUrl !== null && !finalUrl) ||
    contentType === undefined ||
    !validHttpStatus ||
    (value.error !== null && !error)
  ) {
    return null;
  }

  if (
    value.status === "fetched" &&
    (!finalUrl ||
      typeof httpStatus !== "number" ||
      httpStatus < 200 ||
      httpStatus > 399 ||
      error)
  ) {
    return null;
  }

  if (value.status !== "fetched" && !error) {
    return null;
  }

  return {
    sourceUrl,
    finalUrl,
    status: value.status,
    httpStatus,
    contentType,
    attemptedAt: value.attemptedAt,
    error,
  };
}

export function parseDailyQuestionSourceFetchResults(
  value: unknown,
): DailyQuestionSourceFetchResult[] | null {
  if (!Array.isArray(value) || value.length > MAX_SOURCE_FETCH_RESULTS) {
    return null;
  }

  const results = value.map(parseSourceFetchResult);
  if (results.some((result) => result === null)) {
    return null;
  }

  return results as DailyQuestionSourceFetchResult[];
}

function parseReviewRunError(
  value: unknown,
): DailyQuestionReviewRunError | null {
  if (
    !isRecord(value) ||
    !isReviewErrorPhase(value.phase) ||
    typeof value.retryable !== "boolean" ||
    !isIsoTimestamp(value.occurredAt) ||
    (value.questionId !== null && !isUuid(value.questionId))
  ) {
    return null;
  }

  const code = parseBoundedString(
    value.code,
    MAX_REVIEW_RUN_ERROR_CODE_LENGTH,
  );
  const message = parseBoundedString(
    value.message,
    MAX_REVIEW_RUN_ERROR_MESSAGE_LENGTH,
  );

  if (!code || !message) {
    return null;
  }

  return {
    phase: value.phase,
    code,
    message,
    retryable: value.retryable,
    occurredAt: value.occurredAt,
    questionId: value.questionId,
  };
}

export function parseDailyQuestionReviewRunErrors(
  value: unknown,
): DailyQuestionReviewRunError[] | null {
  if (!Array.isArray(value) || value.length > MAX_REVIEW_RUN_ERRORS) {
    return null;
  }

  const errors = value.map(parseReviewRunError);
  if (errors.some((error) => error === null)) {
    return null;
  }

  const parsedErrors = errors as DailyQuestionReviewRunError[];
  return getJsonbTextByteLength(parsedErrors) <= MAX_REVIEW_RUN_ERRORS_BYTES
    ? parsedErrors
    : null;
}

function parseEmailFailure(
  value: unknown,
): DailyQuestionReviewEmailFailure | null {
  if (!isRecord(value) || !isIsoTimestamp(value.occurredAt)) {
    return null;
  }

  const code = parseBoundedString(
    value.code,
    MAX_REVIEW_EMAIL_FAILURE_CODE_LENGTH,
  );
  const message = parseBoundedString(
    value.message,
    MAX_REVIEW_EMAIL_FAILURE_MESSAGE_LENGTH,
  );

  return code && message
    ? { code, message, occurredAt: value.occurredAt }
    : null;
}

export function parseDailyQuestionReviewEmailMetadata(
  value: unknown,
): DailyQuestionReviewEmailMetadata | null {
  if (
    !isRecord(value) ||
    value.provider !== "resend" ||
    typeof value.attempts !== "number" ||
    !Number.isInteger(value.attempts) ||
    value.attempts < 0 ||
    value.attempts > MAX_REVIEW_EMAIL_ATTEMPTS
  ) {
    return null;
  }

  const providerMessageId = parseNullableBoundedString(
    value.providerMessageId,
    MAX_REVIEW_EMAIL_PROVIDER_MESSAGE_ID_LENGTH,
  );
  const lastAttemptAt =
    value.lastAttemptAt === null && "lastAttemptAt" in value
      ? null
      : isIsoTimestamp(value.lastAttemptAt)
        ? value.lastAttemptAt
        : undefined;
  const failure =
    value.failure === null && "failure" in value
      ? null
      : parseEmailFailure(value.failure);

  if (
    providerMessageId === undefined ||
    lastAttemptAt === undefined ||
    failure === null && value.failure !== null ||
    (value.attempts === 0 &&
      (providerMessageId !== null || lastAttemptAt !== null || failure !== null)) ||
    (value.attempts > 0 && lastAttemptAt === null) ||
    (providerMessageId !== null && failure !== null)
  ) {
    return null;
  }

  const metadata: DailyQuestionReviewEmailMetadata = {
    provider: "resend",
    providerMessageId,
    attempts: value.attempts,
    lastAttemptAt,
    failure,
  };

  return getJsonbTextByteLength(metadata) <= MAX_REVIEW_EMAIL_METADATA_BYTES
    ? metadata
    : null;
}

export function parseDailyQuestionReviewEmailState(
  value: unknown,
): DailyQuestionReviewEmailState | null {
  if (!isRecord(value) || !isReviewEmailStatus(value.status)) {
    return null;
  }

  const metadata = parseDailyQuestionReviewEmailMetadata(value.metadata);
  const emailSentAt =
    value.emailSentAt === null && "emailSentAt" in value
      ? null
      : isIsoTimestamp(value.emailSentAt)
        ? value.emailSentAt
        : undefined;

  if (!metadata || emailSentAt === undefined) {
    return null;
  }

  const isPending =
    value.status === "pending" &&
    emailSentAt === null &&
    metadata.attempts === 0 &&
    metadata.lastAttemptAt === null &&
    metadata.providerMessageId === null &&
    metadata.failure === null;
  const isSending =
    value.status === "sending" &&
    emailSentAt === null &&
    metadata.attempts > 0 &&
    metadata.lastAttemptAt !== null &&
    metadata.providerMessageId === null &&
    metadata.failure === null;
  const isSent =
    value.status === "sent" &&
    emailSentAt !== null &&
    metadata.attempts > 0 &&
    metadata.lastAttemptAt !== null &&
    metadata.providerMessageId !== null &&
    metadata.failure === null;
  const isFailed =
    value.status === "failed" &&
    emailSentAt === null &&
    metadata.attempts > 0 &&
    metadata.lastAttemptAt !== null &&
    metadata.providerMessageId === null &&
    metadata.failure !== null;

  if (!isPending && !isSending && !isSent && !isFailed) {
    return null;
  }

  return { status: value.status, emailSentAt, metadata };
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
