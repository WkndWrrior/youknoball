const CHICAGO_TIME_ZONE = "America/Chicago";
const MICRODOLLARS_PER_CENT = 10_000;
const TOKEN_PRICE_DENOMINATOR = 1_000_000;
const SEARCH_PRICE_SCALE = 1_000;

export const DEFAULT_DAILY_REVIEW_MONTHLY_BUDGET_CENTS = 1_000;
export const MAX_DAILY_REVIEW_MONTHLY_BUDGET_CENTS = 1_000_000;

export const DAILY_REVIEW_PRICING = {
  version: "2026-08-08",
  verifierVersion: "nightly-question-verifier-v1",
  models: {
    "gpt-5.6-terra": {
      uncachedInputMicrodollarsPerMillionTokens: 2_500_000,
      cachedInputMicrodollarsPerMillionTokens: 250_000,
      cacheWriteInputMicrodollarsPerMillionTokens: 3_125_000,
      outputMicrodollarsPerMillionTokens: 15_000_000,
      webSearchMicrodollarsPerThousandCalls: 10_000_000,
    },
  },
} as const;

export type DailyReviewPricedModel = keyof typeof DAILY_REVIEW_PRICING.models;

export interface DailyQuestionReviewUsage {
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  webSearchCalls?: number;
}

// Includes headroom beyond the verifier's 32,000-byte prompt cap for
// instructions, schema, tool metadata, and conservative tokenization.
export const DAILY_REVIEW_MAX_INPUT_TOKENS_PER_REQUEST = 40_000;
export const DAILY_REVIEW_MAX_OUTPUT_TOKENS_PER_REQUEST = 1_800;
export const DAILY_REVIEW_MAX_WEB_SEARCH_CALLS_PER_RESPONSE = 10;

export const DAILY_REVIEW_MAX_REQUEST_USAGE = {
  inputTokens: DAILY_REVIEW_MAX_INPUT_TOKENS_PER_REQUEST,
  cachedInputTokens: 0,
  cacheWriteTokens: DAILY_REVIEW_MAX_INPUT_TOKENS_PER_REQUEST,
  outputTokens: DAILY_REVIEW_MAX_OUTPUT_TOKENS_PER_REQUEST,
  webSearchCalls: DAILY_REVIEW_MAX_WEB_SEARCH_CALLS_PER_RESPONSE,
} as const;

export const DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION = 2;
export const DAILY_REVIEW_MAX_QUESTIONS_PER_RUN = 5;
export const DAILY_REVIEW_MAX_VERIFICATIONS_PER_SLOT = 2;

const COST_BEARING_RUN_STATUSES = new Set([
  "running",
  "completed",
  "completed_with_flags",
  "failed",
]);

const CHICAGO_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CHICAGO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface PersistedDailyQuestionReviewCost {
  id: string;
  status: string;
  occurredAt: string;
  estimatedCostMicrodollars: number;
}

export type DailyQuestionReviewBudgetReason =
  | "within_budget"
  | "unsupported_model"
  | "monthly_budget_exceeded"
  | "reservation_exceeds_remaining"
  | "invalid_current_time"
  | "invalid_reservation"
  | "atomic_reservation_denied"
  | "atomic_reservation_invalid";

export interface DailyQuestionReviewBudgetResult {
  allowed: boolean;
  spentMicrodollars: number;
  limitMicrodollars: number;
  remainingMicrodollars: number;
  reservedMicrodollars: number;
  reason: DailyQuestionReviewBudgetReason;
}

export interface ChicagoCalendarMonthRange {
  startInclusive: string;
  endExclusive: string;
}

export interface DailyQuestionReviewReservationRequest {
  model: string;
  modelDerivedReservationMicrodollars: number;
  requiredReservationMicrodollars: number;
  monthRange: ChicagoCalendarMonthRange;
  spentMicrodollars: number;
  limitMicrodollars: number;
  remainingMicrodollars: number;
}

export interface DailyQuestionReviewReservationContext {
  reservationId: string;
  acquiredNow: boolean;
  model: string;
  modelDerivedReservationMicrodollars: number;
  requiredReservationMicrodollars: number;
  reservedMicrodollars: number;
  monthRange: ChicagoCalendarMonthRange;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function requireUsageCounter(value: number | undefined, field: string): number {
  const normalized = value ?? 0;

  if (!isNonnegativeSafeInteger(normalized)) {
    throw new RangeError(`${field} must be a nonnegative safe integer.`);
  }

  return normalized;
}

function checkedMultiply(left: number, right: number, field: string): number {
  if (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left)) {
    throw new RangeError(`${field} exceeds safe integer accounting.`);
  }

  return left * right;
}

function checkedAdd(left: number, right: number, field: string): number {
  if (right > Number.MAX_SAFE_INTEGER - left) {
    throw new RangeError(`${field} exceeds safe integer accounting.`);
  }

  return left + right;
}

function integerCeilDivide(numerator: number, denominator: number): number {
  const quotient = Math.floor(numerator / denominator);

  return numerator % denominator === 0 ? quotient : quotient + 1;
}

function isDailyReviewPricedModel(
  model: string,
): model is DailyReviewPricedModel {
  return Object.prototype.hasOwnProperty.call(DAILY_REVIEW_PRICING.models, model);
}

export function estimateDailyQuestionReviewCostMicrodollars(
  usage: DailyQuestionReviewUsage,
): number {
  if (!isDailyReviewPricedModel(usage.model)) {
    throw new RangeError(`No approved pricing for model ${usage.model}.`);
  }

  const pricing = DAILY_REVIEW_PRICING.models[usage.model];
  const inputTokens = requireUsageCounter(usage.inputTokens, "inputTokens");
  const cachedInputTokens = requireUsageCounter(
    usage.cachedInputTokens,
    "cachedInputTokens",
  );
  const cacheWriteTokens = requireUsageCounter(
    usage.cacheWriteTokens,
    "cacheWriteTokens",
  );
  const outputTokens = requireUsageCounter(usage.outputTokens, "outputTokens");
  const webSearchCalls = requireUsageCounter(
    usage.webSearchCalls,
    "webSearchCalls",
  );

  const categorizedInputTokens = checkedAdd(
    cachedInputTokens,
    cacheWriteTokens,
    "Categorized input token count",
  );

  if (categorizedInputTokens > inputTokens) {
    throw new RangeError(
      "cachedInputTokens plus cacheWriteTokens cannot exceed inputTokens.",
    );
  }

  const uncachedInputTokens = inputTokens - categorizedInputTokens;
  const uncachedInputCostNumerator = checkedMultiply(
    uncachedInputTokens,
    pricing.uncachedInputMicrodollarsPerMillionTokens,
    "Uncached input cost",
  );
  const cachedInputCostNumerator = checkedMultiply(
    cachedInputTokens,
    pricing.cachedInputMicrodollarsPerMillionTokens,
    "Cached input cost",
  );
  const cacheWriteCostNumerator = checkedMultiply(
    cacheWriteTokens,
    pricing.cacheWriteInputMicrodollarsPerMillionTokens,
    "Cache-write input cost",
  );
  const outputCostNumerator = checkedMultiply(
    outputTokens,
    pricing.outputMicrodollarsPerMillionTokens,
    "Output cost",
  );
  const searchCostNumerator = checkedMultiply(
    checkedMultiply(
      webSearchCalls,
      pricing.webSearchMicrodollarsPerThousandCalls,
      "Web search cost",
    ),
    SEARCH_PRICE_SCALE,
    "Web search cost",
  );
  const inputCostNumerator = checkedAdd(
    checkedAdd(
      uncachedInputCostNumerator,
      cachedInputCostNumerator,
      "Input cost",
    ),
    cacheWriteCostNumerator,
    "Input cost",
  );
  const tokenCostNumerator = checkedAdd(
    inputCostNumerator,
    outputCostNumerator,
    "Token cost",
  );
  const totalCostNumerator = checkedAdd(
    tokenCostNumerator,
    searchCostNumerator,
    "Estimated review cost",
  );

  return integerCeilDivide(totalCostNumerator, TOKEN_PRICE_DENOMINATOR);
}

export const DAILY_REVIEW_MAX_REQUEST_RESERVATION_MICRODOLLARS =
  estimateDailyQuestionReviewCostMicrodollars({
    model: "gpt-5.6-terra",
    ...DAILY_REVIEW_MAX_REQUEST_USAGE,
  });

export function getDailyQuestionReviewMaxRunReservationMicrodollars(
  model: string,
): number | null {
  if (!isDailyReviewPricedModel(model)) {
    return null;
  }

  const requestReservation = estimateDailyQuestionReviewCostMicrodollars({
    model,
    ...DAILY_REVIEW_MAX_REQUEST_USAGE,
  });
  const maxCallsPerRun = checkedMultiply(
    checkedMultiply(
      DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION,
      DAILY_REVIEW_MAX_VERIFICATIONS_PER_SLOT,
      "Maximum review calls per slot",
    ),
    DAILY_REVIEW_MAX_QUESTIONS_PER_RUN,
    "Maximum review calls per run",
  );

  return checkedMultiply(
    requestReservation,
    maxCallsPerRun,
    "Maximum review reservation",
  );
}

const TERRA_MAX_RUN_RESERVATION_MICRODOLLARS =
  getDailyQuestionReviewMaxRunReservationMicrodollars("gpt-5.6-terra");

if (TERRA_MAX_RUN_RESERVATION_MICRODOLLARS === null) {
  throw new Error("The default daily review model must have approved pricing.");
}

export const DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS =
  TERRA_MAX_RUN_RESERVATION_MICRODOLLARS;

function getChicagoDateTimeParts(date: Date) {
  const parts = CHICAGO_DATE_TIME_FORMATTER.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function getChicagoMidnightUtc(year: number, month: number): Date {
  const desiredLocalTimestamp = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  const initialCandidate = new Date(Date.UTC(year, month - 1, 1, 6, 0, 0, 0));
  const actualLocal = getChicagoDateTimeParts(initialCandidate);
  const actualLocalTimestamp = Date.UTC(
    actualLocal.year,
    actualLocal.month - 1,
    actualLocal.day,
    actualLocal.hour,
    actualLocal.minute,
    actualLocal.second,
    0,
  );
  const correctedCandidate = new Date(
    initialCandidate.getTime() + desiredLocalTimestamp - actualLocalTimestamp,
  );
  const correctedLocal = getChicagoDateTimeParts(correctedCandidate);

  if (
    correctedLocal.year !== year ||
    correctedLocal.month !== month ||
    correctedLocal.day !== 1 ||
    correctedLocal.hour !== 0 ||
    correctedLocal.minute !== 0 ||
    correctedLocal.second !== 0
  ) {
    throw new RangeError("Unable to resolve the Central calendar boundary.");
  }

  return correctedCandidate;
}

export function getChicagoCalendarMonthRange(
  now: Date,
): ChicagoCalendarMonthRange {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RangeError("Budget accounting requires a valid current time.");
  }

  const chicagoNow = getChicagoDateTimeParts(now);
  const nextMonth = chicagoNow.month === 12 ? 1 : chicagoNow.month + 1;
  const nextMonthYear =
    chicagoNow.month === 12 ? chicagoNow.year + 1 : chicagoNow.year;

  return {
    startInclusive: getChicagoMidnightUtc(
      chicagoNow.year,
      chicagoNow.month,
    ).toISOString(),
    endExclusive: getChicagoMidnightUtc(nextMonthYear, nextMonth).toISOString(),
  };
}

export function getDailyQuestionReviewMonthlyBudgetCents(
  rawValue: unknown = process.env.DAILY_REVIEW_MONTHLY_BUDGET_CENTS,
): number {
  if (typeof rawValue !== "string" || !/^\d+$/.test(rawValue)) {
    return DEFAULT_DAILY_REVIEW_MONTHLY_BUDGET_CENTS;
  }

  const parsed = Number(rawValue);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    parsed > MAX_DAILY_REVIEW_MONTHLY_BUDGET_CENTS
  ) {
    return DEFAULT_DAILY_REVIEW_MONTHLY_BUDGET_CENTS;
  }

  return parsed;
}

const EXPLICIT_OFFSET_ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  const daysByMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return daysByMonth[month - 1] ?? 0;
}

function parseExplicitOffsetIsoTimestamp(value: string): string | null {
  const match = EXPLICIT_OFFSET_ISO_TIMESTAMP_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === "Z" ? 0 : Number(match[9]);
  const offsetMinute = match[7] === "Z" ? 0 : Number(match[10]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return null;
  }

  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function parsePersistedCostRecord(
  value: unknown,
): PersistedDailyQuestionReviewCost | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.status !== "string" ||
    !COST_BEARING_RUN_STATUSES.has(value.status) ||
    typeof value.occurredAt !== "string" ||
    !isNonnegativeSafeInteger(value.estimatedCostMicrodollars)
  ) {
    return null;
  }

  const occurredAt = parseExplicitOffsetIsoTimestamp(value.occurredAt);

  if (!occurredAt) {
    return null;
  }

  return {
    id: value.id,
    status: value.status,
    occurredAt,
    estimatedCostMicrodollars: value.estimatedCostMicrodollars,
  };
}

function saturatingSafeIntegerAdd(left: number, right: number): number {
  if (right > Number.MAX_SAFE_INTEGER - left) {
    return Number.MAX_SAFE_INTEGER;
  }

  return left + right;
}

export function sumCurrentMonthReviewSpendMicrodollars(
  records: readonly unknown[],
  now: Date = new Date(),
): number {
  const range = getChicagoCalendarMonthRange(now);
  const startTimestamp = Date.parse(range.startInclusive);
  const endTimestamp = Date.parse(range.endExclusive);
  const greatestCostByRunId = new Map<string, number>();

  for (const value of records) {
    const record = parsePersistedCostRecord(value);

    if (!record) {
      continue;
    }

    const occurredAt = Date.parse(record.occurredAt);

    if (occurredAt < startTimestamp || occurredAt >= endTimestamp) {
      continue;
    }

    greatestCostByRunId.set(
      record.id,
      Math.max(
        greatestCostByRunId.get(record.id) ?? 0,
        record.estimatedCostMicrodollars,
      ),
    );
  }

  let total = 0;

  for (const cost of greatestCostByRunId.values()) {
    total = saturatingSafeIntegerAdd(total, cost);
  }

  return total;
}

function normalizeBudgetCents(value: number | undefined): number {
  if (value === undefined) {
    return getDailyQuestionReviewMonthlyBudgetCents();
  }

  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_DAILY_REVIEW_MONTHLY_BUDGET_CENTS
  ) {
    return DEFAULT_DAILY_REVIEW_MONTHLY_BUDGET_CENTS;
  }

  return value;
}

export function checkDailyQuestionReviewBudget(options: {
  model: string;
  records: readonly unknown[];
  now?: Date;
  monthlyBudgetCents?: number;
  reservedMicrodollars?: number;
}): DailyQuestionReviewBudgetResult {
  const limitMicrodollars =
    normalizeBudgetCents(options.monthlyBudgetCents) * MICRODOLLARS_PER_CENT;
  const modelReservationMicrodollars =
    getDailyQuestionReviewMaxRunReservationMicrodollars(options.model);

  if (modelReservationMicrodollars === null) {
    return {
      allowed: false,
      spentMicrodollars: 0,
      limitMicrodollars,
      remainingMicrodollars: limitMicrodollars,
      reservedMicrodollars: 0,
      reason: "unsupported_model",
    };
  }

  const reservedMicrodollars =
    options.reservedMicrodollars ?? modelReservationMicrodollars;
  const now = options.now ?? new Date();

  if (!isNonnegativeSafeInteger(reservedMicrodollars)) {
    return {
      allowed: false,
      spentMicrodollars: 0,
      limitMicrodollars,
      remainingMicrodollars: limitMicrodollars,
      reservedMicrodollars: 0,
      reason: "invalid_reservation",
    };
  }

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return {
      allowed: false,
      spentMicrodollars: 0,
      limitMicrodollars,
      remainingMicrodollars: limitMicrodollars,
      reservedMicrodollars,
      reason: "invalid_current_time",
    };
  }

  const spentMicrodollars = sumCurrentMonthReviewSpendMicrodollars(
    options.records,
    now,
  );
  const remainingMicrodollars = Math.max(
    limitMicrodollars - spentMicrodollars,
    0,
  );

  if (spentMicrodollars > limitMicrodollars) {
    return {
      allowed: false,
      spentMicrodollars,
      limitMicrodollars,
      remainingMicrodollars,
      reservedMicrodollars,
      reason: "monthly_budget_exceeded",
    };
  }

  if (reservedMicrodollars > remainingMicrodollars) {
    return {
      allowed: false,
      spentMicrodollars,
      limitMicrodollars,
      remainingMicrodollars,
      reservedMicrodollars,
      reason: "reservation_exceeds_remaining",
    };
  }

  return {
    allowed: true,
    spentMicrodollars,
    limitMicrodollars,
    remainingMicrodollars,
    reservedMicrodollars,
    reason: "within_budget",
  };
}

export async function runWithDailyQuestionReviewBudgetPreflight<T>(options: {
  model: string;
  records: readonly unknown[];
  /** Must atomically persist and claim this reservation before returning. */
  acquireReservation: (
    request: DailyQuestionReviewReservationRequest,
  ) => Promise<unknown>;
  operation: (
    reservation: DailyQuestionReviewReservationContext,
  ) => Promise<T> | T;
  now?: Date;
  monthlyBudgetCents?: number;
  reservedMicrodollars?: number;
}): Promise<{
  budget: DailyQuestionReviewBudgetResult;
  value: T | null;
}> {
  const modelReservationMicrodollars =
    getDailyQuestionReviewMaxRunReservationMicrodollars(options.model);
  const requestedReservationMicrodollars = options.reservedMicrodollars;
  const effectiveReservationMicrodollars =
    modelReservationMicrodollars !== null &&
    (requestedReservationMicrodollars === undefined ||
      isNonnegativeSafeInteger(requestedReservationMicrodollars))
      ? Math.max(
          modelReservationMicrodollars,
          requestedReservationMicrodollars ?? 0,
        )
      : requestedReservationMicrodollars;
  const now = options.now ?? new Date();
  const budget = checkDailyQuestionReviewBudget({
    ...options,
    now,
    reservedMicrodollars: effectiveReservationMicrodollars,
  });

  if (!budget.allowed) {
    return { budget, value: null };
  }

  if (modelReservationMicrodollars === null) {
    return {
      budget: {
        ...budget,
        allowed: false,
        reason: "unsupported_model",
      },
      value: null,
    };
  }

  const requiredReservationMicrodollars = budget.reservedMicrodollars;
  const monthRange = getChicagoCalendarMonthRange(now);
  const reservationRequest: DailyQuestionReviewReservationRequest = {
    model: options.model,
    modelDerivedReservationMicrodollars: modelReservationMicrodollars,
    requiredReservationMicrodollars,
    monthRange,
    spentMicrodollars: budget.spentMicrodollars,
    limitMicrodollars: budget.limitMicrodollars,
    remainingMicrodollars: budget.remainingMicrodollars,
  };
  let acquisition: unknown;

  try {
    acquisition = await options.acquireReservation(reservationRequest);
  } catch {
    return {
      budget: {
        ...budget,
        allowed: false,
        reason: "atomic_reservation_denied",
      },
      value: null,
    };
  }

  if (isRecord(acquisition) && acquisition.acquired === false) {
    return {
      budget: {
        ...budget,
        allowed: false,
        reason: "atomic_reservation_denied",
      },
      value: null,
    };
  }

  if (
    !isRecord(acquisition) ||
    acquisition.acquired !== true ||
    typeof acquisition.reservationId !== "string" ||
    acquisition.reservationId.trim().length === 0 ||
    !isNonnegativeSafeInteger(acquisition.reservedMicrodollars) ||
    acquisition.reservedMicrodollars !== requiredReservationMicrodollars
  ) {
    return {
      budget: {
        ...budget,
        allowed: false,
        reason: "atomic_reservation_invalid",
      },
      value: null,
    };
  }

  const reservationContext: DailyQuestionReviewReservationContext = {
    reservationId: acquisition.reservationId.trim(),
    acquiredNow: acquisition.created !== false,
    model: options.model,
    modelDerivedReservationMicrodollars: modelReservationMicrodollars,
    requiredReservationMicrodollars,
    reservedMicrodollars: acquisition.reservedMicrodollars,
    monthRange,
  };

  return {
    budget,
    value: await options.operation(reservationContext),
  };
}

export const DAILY_REVIEW_DEFAULT_MONTHLY_LIMIT_MICRODOLLARS =
  DEFAULT_DAILY_REVIEW_MONTHLY_BUDGET_CENTS * MICRODOLLARS_PER_CENT;
