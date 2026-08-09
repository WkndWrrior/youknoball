import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DAILY_REVIEW_MAX_INPUT_TOKENS_PER_REQUEST,
  DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION,
  DAILY_REVIEW_MAX_OUTPUT_TOKENS_PER_REQUEST,
  DAILY_REVIEW_MAX_QUESTIONS_PER_RUN,
  DAILY_REVIEW_MAX_REQUEST_RESERVATION_MICRODOLLARS,
  DAILY_REVIEW_MAX_REQUEST_USAGE,
  DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS,
  DAILY_REVIEW_MAX_WEB_SEARCH_CALLS_PER_RESPONSE,
  DAILY_REVIEW_PRICING,
  checkDailyQuestionReviewBudget,
  estimateDailyQuestionReviewCostMicrodollars,
  getChicagoCalendarMonthRange,
  getDailyQuestionReviewMaxRunReservationMicrodollars,
  getDailyQuestionReviewMonthlyBudgetCents,
  runWithDailyQuestionReviewBudgetPreflight,
  sumCurrentMonthReviewSpendMicrodollars,
} from "@/lib/server/dailyQuestionReviewBudget";

const ORIGINAL_BUDGET = process.env.DAILY_REVIEW_MONTHLY_BUDGET_CENTS;
const ORIGINAL_TIME_ZONE = process.env.TZ;

afterEach(() => {
  vi.restoreAllMocks();

  if (ORIGINAL_BUDGET === undefined) {
    delete process.env.DAILY_REVIEW_MONTHLY_BUDGET_CENTS;
  } else {
    process.env.DAILY_REVIEW_MONTHLY_BUDGET_CENTS = ORIGINAL_BUDGET;
  }

  if (ORIGINAL_TIME_ZONE === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TIME_ZONE;
  }
});

describe("daily review pricing", () => {
  it("publishes a versioned gpt-5.6-terra verifier pricing table", () => {
    expect(DAILY_REVIEW_PRICING).toEqual({
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
    });
  });

  it.each([
    ["one uncached input token", { inputTokens: 1 }, 3],
    ["one cached input token", { inputTokens: 1, cachedInputTokens: 1 }, 1],
    ["one cache-write token", { inputTokens: 1, cacheWriteTokens: 1 }, 4],
    ["one output token", { outputTokens: 1 }, 15],
    ["one web search", { webSearchCalls: 1 }, 10_000],
  ])("rounds up the exact cost of %s", (_label, usage, expected) => {
    expect(
      estimateDailyQuestionReviewCostMicrodollars({
        model: "gpt-5.6-terra",
        ...usage,
      }),
    ).toBe(expected);
  });

  it("does not double count cached or cache-write input tokens", () => {
    expect(
      estimateDailyQuestionReviewCostMicrodollars({
        model: "gpt-5.6-terra",
        inputTokens: 5,
        cachedInputTokens: 1,
        cacheWriteTokens: 1,
      }),
    ).toBe(11);
  });

  it("rounds a combined call up once without undercounting", () => {
    expect(
      estimateDailyQuestionReviewCostMicrodollars({
        model: "gpt-5.6-terra",
        inputTokens: 2,
        cachedInputTokens: 1,
        outputTokens: 1,
        webSearchCalls: 1,
      }),
    ).toBe(10_018);
  });

  it("defaults omitted usage counters to zero", () => {
    expect(
      estimateDailyQuestionReviewCostMicrodollars({
        model: "gpt-5.6-terra",
      }),
    ).toBe(0);
  });

  it.each([
    ["negative", { inputTokens: -1 }],
    ["fractional", { outputTokens: 1.5 }],
    ["nonfinite", { webSearchCalls: Number.POSITIVE_INFINITY }],
    ["unsafe", { inputTokens: Number.MAX_SAFE_INTEGER + 1 }],
    ["cached greater than total", { inputTokens: 2, cachedInputTokens: 3 }],
    ["cache write greater than total", { inputTokens: 2, cacheWriteTokens: 3 }],
    [
      "cached and cache write sum greater than total",
      { inputTokens: 3, cachedInputTokens: 2, cacheWriteTokens: 2 },
    ],
  ])("rejects %s usage", (_label, usage) => {
    expect(() =>
      estimateDailyQuestionReviewCostMicrodollars({
        model: "gpt-5.6-terra",
        ...usage,
      }),
    ).toThrow(RangeError);
  });

  it("fails closed for an unknown model", () => {
    expect(() =>
      estimateDailyQuestionReviewCostMicrodollars({
        model: "gpt-5.6-terra-latest",
        inputTokens: 1,
      }),
    ).toThrow(new RangeError("No approved pricing for model gpt-5.6-terra-latest."));
  });

  it.each([
    ["input multiplication", { inputTokens: Number.MAX_SAFE_INTEGER }],
    [
      "cache-write multiplication",
      {
        inputTokens: Number.MAX_SAFE_INTEGER,
        cacheWriteTokens: Number.MAX_SAFE_INTEGER,
      },
    ],
    ["output multiplication", { outputTokens: Number.MAX_SAFE_INTEGER }],
    ["search multiplication", { webSearchCalls: Number.MAX_SAFE_INTEGER }],
    [
      "aggregate addition",
      {
        inputTokens: 1_803_000_000,
        outputTokens: 300_000_000,
        webSearchCalls: 1,
      },
    ],
  ])("fails closed on %s overflow", (_label, usage) => {
    expect(() =>
      estimateDailyQuestionReviewCostMicrodollars({
        model: "gpt-5.6-terra",
        ...usage,
      }),
    ).toThrow(RangeError);
  });

  it("exports a conservative five-question, two-call maximum reservation", () => {
    const maxRequestCost = estimateDailyQuestionReviewCostMicrodollars({
      model: "gpt-5.6-terra",
      ...DAILY_REVIEW_MAX_REQUEST_USAGE,
    });

    expect(DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION).toBe(2);
    expect(DAILY_REVIEW_MAX_QUESTIONS_PER_RUN).toBe(5);
    expect(DAILY_REVIEW_MAX_INPUT_TOKENS_PER_REQUEST).toBe(40_000);
    expect(DAILY_REVIEW_MAX_OUTPUT_TOKENS_PER_REQUEST).toBe(1_800);
    expect(DAILY_REVIEW_MAX_WEB_SEARCH_CALLS_PER_RESPONSE).toBe(10);
    expect(DAILY_REVIEW_MAX_REQUEST_USAGE).toEqual({
      inputTokens: 40_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 40_000,
      outputTokens: 1_800,
      webSearchCalls: 10,
    });
    expect(DAILY_REVIEW_MAX_REQUEST_RESERVATION_MICRODOLLARS).toBe(252_000);
    expect(
      getDailyQuestionReviewMaxRunReservationMicrodollars("gpt-5.6-terra"),
    ).toBe(2_520_000);
    expect(DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS).toBe(
      maxRequestCost *
        DAILY_REVIEW_MAX_MODEL_CALLS_PER_QUESTION *
        DAILY_REVIEW_MAX_QUESTIONS_PER_RUN,
    );
    expect(Number.isSafeInteger(DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS)).toBe(
      true,
    );
    expect(DAILY_REVIEW_MAX_RUN_RESERVATION_MICRODOLLARS).toBeLessThan(
      10_000_000,
    );
  });

  it("does not derive a reservation for an unpriced model", () => {
    expect(
      getDailyQuestionReviewMaxRunReservationMicrodollars(
        "gpt-5.6-terra-latest",
      ),
    ).toBeNull();
  });
});

describe("Central calendar month boundaries", () => {
  it("uses inclusive start and exclusive next-month UTC instants in daylight time", () => {
    expect(
      getChicagoCalendarMonthRange(new Date("2026-08-31T23:59:59.999Z")),
    ).toEqual({
      startInclusive: "2026-08-01T05:00:00.000Z",
      endExclusive: "2026-09-01T05:00:00.000Z",
    });
  });

  it("uses the exact offsets across a month containing the fall DST transition", () => {
    expect(
      getChicagoCalendarMonthRange(new Date("2026-11-15T12:00:00.000Z")),
    ).toEqual({
      startInclusive: "2026-11-01T05:00:00.000Z",
      endExclusive: "2026-12-01T06:00:00.000Z",
    });
  });

  it("uses the exact offsets across a month containing the spring DST transition", () => {
    expect(
      getChicagoCalendarMonthRange(new Date("2027-03-15T12:00:00.000Z")),
    ).toEqual({
      startInclusive: "2027-03-01T06:00:00.000Z",
      endExclusive: "2027-04-01T05:00:00.000Z",
    });
  });

  it("rolls the next-month boundary across the year", () => {
    expect(
      getChicagoCalendarMonthRange(new Date("2026-12-31T23:00:00.000Z")),
    ).toEqual({
      startInclusive: "2026-12-01T06:00:00.000Z",
      endExclusive: "2027-01-01T06:00:00.000Z",
    });
  });

  it("selects the month using Central time rather than UTC", () => {
    expect(
      getChicagoCalendarMonthRange(new Date("2026-09-01T04:59:59.999Z")),
    ).toEqual({
      startInclusive: "2026-08-01T05:00:00.000Z",
      endExclusive: "2026-09-01T05:00:00.000Z",
    });
  });

  it("does not depend on the process timezone", () => {
    process.env.TZ = "Asia/Tokyo";

    expect(
      getChicagoCalendarMonthRange(new Date("2026-09-01T04:59:59.999Z")),
    ).toEqual({
      startInclusive: "2026-08-01T05:00:00.000Z",
      endExclusive: "2026-09-01T05:00:00.000Z",
    });
  });

  it("rejects an invalid current time", () => {
    expect(() => getChicagoCalendarMonthRange(new Date("invalid"))).toThrow(
      new RangeError("Budget accounting requires a valid current time."),
    );
  });
});

describe("monthly budget configuration", () => {
  it("defaults to 1000 cents", () => {
    delete process.env.DAILY_REVIEW_MONTHLY_BUDGET_CENTS;

    expect(getDailyQuestionReviewMonthlyBudgetCents()).toBe(1_000);
  });

  it("accepts a positive bounded integer", () => {
    process.env.DAILY_REVIEW_MONTHLY_BUDGET_CENTS = "2500";

    expect(getDailyQuestionReviewMonthlyBudgetCents()).toBe(2_500);
  });

  it.each(["", "0", "-1", "1.5", "1000001", "9007199254740992", "nope"])(
    "falls back for malformed or out-of-range value %j",
    (value) => {
      process.env.DAILY_REVIEW_MONTHLY_BUDGET_CENTS = value;

      expect(getDailyQuestionReviewMonthlyBudgetCents()).toBe(1_000);
    },
  );
});

describe("persisted monthly spend", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("counts cost-bearing run statuses inside the current Central month", () => {
    expect(
      sumCurrentMonthReviewSpendMicrodollars(
        [
          {
            id: "running",
            status: "running",
            occurredAt: "2026-08-01T05:00:00.000Z",
            estimatedCostMicrodollars: 100,
          },
          {
            id: "completed",
            status: "completed",
            occurredAt: "2026-08-10T12:00:00.000Z",
            estimatedCostMicrodollars: 200,
          },
          {
            id: "flagged",
            status: "completed_with_flags",
            occurredAt: "2026-08-11T12:00:00.000Z",
            estimatedCostMicrodollars: 300,
          },
          {
            id: "failed",
            status: "failed",
            occurredAt: "2026-08-31T23:59:59.999Z",
            estimatedCostMicrodollars: 400,
          },
        ],
        now,
      ),
    ).toBe(1_000);
  });

  it("uses inclusive start and exclusive end boundaries", () => {
    expect(
      sumCurrentMonthReviewSpendMicrodollars(
        [
          {
            id: "before",
            status: "completed",
            occurredAt: "2026-08-01T04:59:59.999Z",
            estimatedCostMicrodollars: 1,
          },
          {
            id: "start",
            status: "completed",
            occurredAt: "2026-08-01T05:00:00.000Z",
            estimatedCostMicrodollars: 2,
          },
          {
            id: "end",
            status: "completed",
            occurredAt: "2026-09-01T05:00:00.000Z",
            estimatedCostMicrodollars: 4,
          },
        ],
        now,
      ),
    ).toBe(2);
  });

  it("ignores preparing and malformed records without throwing", () => {
    expect(
      sumCurrentMonthReviewSpendMicrodollars(
        [
          {
            id: "preparing",
            status: "preparing",
            occurredAt: "2026-08-10T12:00:00.000Z",
            estimatedCostMicrodollars: 100,
          },
          {
            id: "bad-status",
            status: "budget_blocked",
            occurredAt: "2026-08-10T12:00:00.000Z",
            estimatedCostMicrodollars: 100,
          },
          {
            id: "negative",
            status: "failed",
            occurredAt: "2026-08-10T12:00:00.000Z",
            estimatedCostMicrodollars: -1,
          },
          {
            id: "fractional",
            status: "failed",
            occurredAt: "2026-08-10T12:00:00.000Z",
            estimatedCostMicrodollars: 1.5,
          },
          {
            id: "infinite",
            status: "failed",
            occurredAt: "2026-08-10T12:00:00.000Z",
            estimatedCostMicrodollars: Number.POSITIVE_INFINITY,
          },
          {
            id: "bad-date",
            status: "failed",
            occurredAt: "not-a-date",
            estimatedCostMicrodollars: 100,
          },
          null,
          "bad",
        ],
        now,
      ),
    ).toBe(0);
  });

  it.each([
    "2026-08-10T12:00:00",
    "2026-08-10 12:00:00Z",
    "2026-02-30T12:00:00.000Z",
    "2026-08-10T24:00:00.000Z",
    "2026-08-10T12:00:00.000+15:00",
    "2026-08-10T12:00:00.000+05:60",
  ])("rejects malformed or timezone-less occurredAt value %s", (occurredAt) => {
    expect(
      sumCurrentMonthReviewSpendMicrodollars(
        [
          {
            id: occurredAt,
            status: "completed",
            occurredAt,
            estimatedCostMicrodollars: 100,
          },
        ],
        now,
      ),
    ).toBe(0);
  });

  it("accepts valid numeric-offset timestamps", () => {
    expect(
      sumCurrentMonthReviewSpendMicrodollars(
        [
          {
            id: "offset",
            status: "completed",
            occurredAt: "2026-08-01T00:00:00.000-05:00",
            estimatedCostMicrodollars: 100,
          },
        ],
        now,
      ),
    ).toBe(100);
  });

  it("filters persisted timestamps independently of the process timezone", () => {
    const records = [
      {
        id: "explicit",
        status: "completed",
        occurredAt: "2026-08-01T05:00:00.000Z",
        estimatedCostMicrodollars: 100,
      },
      {
        id: "timezone-less",
        status: "completed",
        occurredAt: "2026-08-01T05:00:00.000",
        estimatedCostMicrodollars: 900,
      },
    ];

    process.env.TZ = "America/Los_Angeles";
    const losAngelesSpend = sumCurrentMonthReviewSpendMicrodollars(records, now);
    process.env.TZ = "Asia/Tokyo";
    const tokyoSpend = sumCurrentMonthReviewSpendMicrodollars(records, now);

    expect(losAngelesSpend).toBe(100);
    expect(tokyoSpend).toBe(100);
  });

  it("deduplicates run IDs and conservatively uses the greatest valid cost", () => {
    expect(
      sumCurrentMonthReviewSpendMicrodollars(
        [
          {
            id: "same-run",
            status: "running",
            occurredAt: "2026-08-10T12:00:00.000Z",
            estimatedCostMicrodollars: 100,
          },
          {
            id: "same-run",
            status: "completed",
            occurredAt: "2026-08-10T12:05:00.000Z",
            estimatedCostMicrodollars: 175,
          },
        ],
        now,
      ),
    ).toBe(175);
  });

  it("saturates safely rather than overflowing integer accounting", () => {
    expect(
      sumCurrentMonthReviewSpendMicrodollars(
        [
          {
            id: "one",
            status: "completed",
            occurredAt: "2026-08-10T12:00:00.000Z",
            estimatedCostMicrodollars: Number.MAX_SAFE_INTEGER,
          },
          {
            id: "two",
            status: "completed",
            occurredAt: "2026-08-11T12:00:00.000Z",
            estimatedCostMicrodollars: 1,
          },
        ],
        now,
      ),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("budget preflight", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("derives the default reservation from the active priced model", () => {
    expect(
      checkDailyQuestionReviewBudget({
        model: "gpt-5.6-terra",
        now,
        monthlyBudgetCents: 1_000,
        records: [],
      }),
    ).toEqual({
      allowed: true,
      spentMicrodollars: 0,
      limitMicrodollars: 10_000_000,
      remainingMicrodollars: 10_000_000,
      reservedMicrodollars: 2_520_000,
      reason: "within_budget",
    });
  });

  it("allows equality and reports all integer microdollar values", () => {
    const result = checkDailyQuestionReviewBudget({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 100,
      reservedMicrodollars: 250_000,
      records: [
        {
          id: "existing",
          status: "completed",
          occurredAt: "2026-08-10T12:00:00.000Z",
          estimatedCostMicrodollars: 750_000,
        },
      ],
    });

    expect(result).toEqual({
      allowed: true,
      spentMicrodollars: 750_000,
      limitMicrodollars: 1_000_000,
      remainingMicrodollars: 250_000,
      reservedMicrodollars: 250_000,
      reason: "within_budget",
    });
  });

  it("blocks when reservation is one microdollar over remaining budget", () => {
    const result = checkDailyQuestionReviewBudget({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 100,
      reservedMicrodollars: 250_001,
      records: [
        {
          id: "existing",
          status: "completed",
          occurredAt: "2026-08-10T12:00:00.000Z",
          estimatedCostMicrodollars: 750_000,
        },
      ],
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("reservation_exceeds_remaining");
  });

  it("blocks when recorded spend already exceeds the limit", () => {
    const result = checkDailyQuestionReviewBudget({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 100,
      reservedMicrodollars: 0,
      records: [
        {
          id: "existing",
          status: "failed",
          occurredAt: "2026-08-10T12:00:00.000Z",
          estimatedCostMicrodollars: 1_000_001,
        },
      ],
    });

    expect(result).toMatchObject({
      allowed: false,
      remainingMicrodollars: 0,
      reason: "monthly_budget_exceeded",
    });
  });

  it("fails closed for an invalid current time", () => {
    expect(
      checkDailyQuestionReviewBudget({
        model: "gpt-5.6-terra",
        now: new Date("invalid"),
        monthlyBudgetCents: 100,
        reservedMicrodollars: 1,
        records: [],
      }),
    ).toEqual({
      allowed: false,
      spentMicrodollars: 0,
      limitMicrodollars: 1_000_000,
      remainingMicrodollars: 1_000_000,
      reservedMicrodollars: 1,
      reason: "invalid_current_time",
    });
  });

  it("does not invoke the callback when the preflight is blocked", async () => {
    const acquireReservation = vi.fn(async () => ({
      acquired: true,
      reservationId: "should-not-run",
      reservedMicrodollars: 2_520_000,
    }));
    const callback = vi.fn(async () => "called");

    const result = await runWithDailyQuestionReviewBudgetPreflight({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 1,
      reservedMicrodollars: 10_001,
      records: [],
      acquireReservation,
      operation: callback,
    });

    expect(acquireReservation).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      value: null,
      budget: {
        allowed: false,
        reason: "reservation_exceeds_remaining",
      },
    });
  });

  it("invokes the callback once after an allowed preflight", async () => {
    const acquireReservation = vi.fn(async () => ({
      acquired: true,
      reservationId: "reservation-1",
      reservedMicrodollars: 2_520_000,
    }));
    const callback = vi.fn(async () => "verified");

    const result = await runWithDailyQuestionReviewBudgetPreflight({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 1_000,
      reservedMicrodollars: 1,
      records: [],
      acquireReservation,
      operation: callback,
    });

    expect(acquireReservation).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.value).toBe("verified");
    expect(result.budget.allowed).toBe(true);
    expect(result.budget.reservedMicrodollars).toBe(2_520_000);
  });

  it.each([0, 1])(
    "does not let a %i microdollar override under-reserve or invoke the callback",
    async (reservedMicrodollars) => {
      const acquireReservation = vi.fn(async () => ({
        acquired: true,
        reservationId: "should-not-run",
        reservedMicrodollars: 2_520_000,
      }));
      const callback = vi.fn(async () => "called");

      const result = await runWithDailyQuestionReviewBudgetPreflight({
        model: "gpt-5.6-terra",
        now,
        monthlyBudgetCents: 100,
        reservedMicrodollars,
        records: [],
        acquireReservation,
        operation: callback,
      });

      expect(acquireReservation).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        value: null,
        budget: {
          allowed: false,
          reservedMicrodollars: 2_520_000,
          reason: "reservation_exceeds_remaining",
        },
      });
    },
  );

  it("honors a higher caller reservation", async () => {
    const acquireReservation = vi.fn(async () => ({
      acquired: true,
      reservationId: "reservation-higher",
      reservedMicrodollars: 3_000_000,
    }));
    const callback = vi.fn(async () => "verified");

    const result = await runWithDailyQuestionReviewBudgetPreflight({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 1_000,
      reservedMicrodollars: 3_000_000,
      records: [],
      acquireReservation,
      operation: callback,
    });

    expect(acquireReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6-terra",
        modelDerivedReservationMicrodollars: 2_520_000,
        requiredReservationMicrodollars: 3_000_000,
      }),
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.value).toBe("verified");
    expect(result.budget).toMatchObject({
      allowed: true,
      reservedMicrodollars: 3_000_000,
      reason: "within_budget",
    });
  });

  it("blocks an unsupported model before invoking the callback", async () => {
    const acquireReservation = vi.fn(async () => ({
      acquired: true,
      reservationId: "should-not-run",
      reservedMicrodollars: 2_520_000,
    }));
    const callback = vi.fn(async () => "called");

    const result = await runWithDailyQuestionReviewBudgetPreflight({
      model: "gpt-5.6-terra-latest",
      now,
      monthlyBudgetCents: 100,
      reservedMicrodollars: 0,
      records: [],
      acquireReservation,
      operation: callback,
    });

    expect(acquireReservation).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(result).toEqual({
      value: null,
      budget: {
        allowed: false,
        spentMicrodollars: 0,
        limitMicrodollars: 1_000_000,
        remainingMicrodollars: 1_000_000,
        reservedMicrodollars: 0,
        reason: "unsupported_model",
      },
    });
  });

  it("does not invoke work when atomic acquisition is denied", async () => {
    const acquireReservation = vi.fn(async () => ({ acquired: false }));
    const operation = vi.fn(async () => "called");

    const result = await runWithDailyQuestionReviewBudgetPreflight({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 1_000,
      records: [],
      acquireReservation,
      operation,
    });

    expect(acquireReservation).toHaveBeenCalledTimes(1);
    expect(operation).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      value: null,
      budget: {
        allowed: false,
        reservedMicrodollars: 2_520_000,
        reason: "atomic_reservation_denied",
      },
    });
  });

  it.each([
    ["non-object", null],
    [
      "blank reservation ID",
      {
        acquired: true,
        reservationId: "   ",
        reservedMicrodollars: 2_520_000,
      },
    ],
    [
      "lower persisted reservation",
      {
        acquired: true,
        reservationId: "reservation-low",
        reservedMicrodollars: 2_519_999,
      },
    ],
    [
      "fractional persisted reservation",
      {
        acquired: true,
        reservationId: "reservation-fractional",
        reservedMicrodollars: 2_520_000.5,
      },
    ],
  ])("does not invoke work for an invalid atomic acquisition: %s", async (_label, acquisition) => {
    const acquireReservation = vi.fn(async () => acquisition);
    const operation = vi.fn(async () => "called");

    const result = await runWithDailyQuestionReviewBudgetPreflight({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 1_000,
      records: [],
      acquireReservation,
      operation,
    });

    expect(acquireReservation).toHaveBeenCalledTimes(1);
    expect(operation).not.toHaveBeenCalled();
    expect(result.budget).toMatchObject({
      allowed: false,
      reason: "atomic_reservation_invalid",
    });
  });

  it("passes the validated atomic reservation context into work", async () => {
    const acquireReservation = vi.fn(async () => ({
      acquired: true,
      reservationId: "  reservation-valid  ",
      reservedMicrodollars: 2_600_000,
    }));
    const operation = vi.fn(async () => "verified");

    const result = await runWithDailyQuestionReviewBudgetPreflight({
      model: "gpt-5.6-terra",
      now,
      monthlyBudgetCents: 1_000,
      records: [],
      acquireReservation,
      operation,
    });

    expect(acquireReservation).toHaveBeenCalledWith({
      model: "gpt-5.6-terra",
      modelDerivedReservationMicrodollars: 2_520_000,
      requiredReservationMicrodollars: 2_520_000,
      monthRange: {
        startInclusive: "2026-08-01T05:00:00.000Z",
        endExclusive: "2026-09-01T05:00:00.000Z",
      },
      spentMicrodollars: 0,
      limitMicrodollars: 10_000_000,
      remainingMicrodollars: 10_000_000,
    });
    expect(operation).toHaveBeenCalledWith({
      reservationId: "reservation-valid",
      model: "gpt-5.6-terra",
      modelDerivedReservationMicrodollars: 2_520_000,
      requiredReservationMicrodollars: 2_520_000,
      reservedMicrodollars: 2_600_000,
      monthRange: {
        startInclusive: "2026-08-01T05:00:00.000Z",
        endExclusive: "2026-09-01T05:00:00.000Z",
      },
    });
    expect(result.value).toBe("verified");
  });
});
