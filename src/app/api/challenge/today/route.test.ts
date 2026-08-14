import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createPublicSupabaseServerClient = vi.fn();
const createSessionSupabaseServerClient = vi.fn();
const getSupabaseSessionFromRequest = vi.fn();
const supabaseAdmin = vi.fn();

vi.mock("@/lib/server/supabaseServer", () => ({
  createPublicSupabaseServerClient,
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

type QueryResult<T> = {
  data: T;
  error: unknown;
};

function createThenableQuery<T>(result: QueryResult<T>) {
  const query: Record<string, unknown> = {};

  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  query.then = (
    resolve: (value: QueryResult<T>) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);

  return query;
}

function createClientMock(
  queries: Record<string, ReturnType<typeof createThenableQuery>>,
) {
  return {
    from: vi.fn((table: string) => {
      const query = queries[table];

      if (!query) {
        throw new Error(`Unexpected table: ${table}`);
      }

      return query;
    }),
  };
}

function createPublicClientMock() {
  return {
    from: vi.fn((table: string) => {
      throw new Error(`Public client must not read ${table}`);
    }),
  };
}

const fullChallenge = [
  {
    id: "q1",
    slot: 1,
    sport: "NBA",
    difficulty: "starter" as const,
    question_text: "Question 1",
    option_a: "A1",
    option_b: "B1",
    option_c: "C1",
    option_d: "D1",
    correct_option: "A" as const,
  },
  {
    id: "q2",
    slot: 2,
    sport: "NFL",
    difficulty: "starter" as const,
    question_text: "Question 2",
    option_a: "A2",
    option_b: "B2",
    option_c: "C2",
    option_d: "D2",
    correct_option: "B" as const,
  },
  {
    id: "q3",
    slot: 3,
    sport: "NHL",
    difficulty: "starter" as const,
    question_text: "Question 3",
    option_a: "A3",
    option_b: "B3",
    option_c: "C3",
    option_d: "D3",
    correct_option: "C" as const,
  },
  {
    id: "q4",
    slot: 4,
    sport: "CBB",
    difficulty: "pro" as const,
    question_text: "Question 4",
    option_a: "A4",
    option_b: "B4",
    option_c: "C4",
    option_d: "D4",
    correct_option: "D" as const,
  },
  {
    id: "q5",
    slot: 5,
    sport: "MLB",
    difficulty: "pro" as const,
    question_text: "Question 5",
    option_a: "A5",
    option_b: "B5",
    option_c: "C5",
    option_d: "D5",
    correct_option: "A" as const,
  },
];

const legacyChallenge = fullChallenge.map((question) => ({
  ...question,
}));

describe("GET /api/challenge/today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
    getSupabaseSessionFromRequest.mockReturnValue(null);
    createSessionSupabaseServerClient.mockReturnValue({ tag: "session" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's five questions without exposing answers", async () => {
    const publicClient = createPublicClientMock();
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: fullChallenge.map((question) => ({
          id: question.id,
          slot: question.slot,
          question_snapshot: {
            id: question.id,
            difficulty: question.slot <= 3 ? "easy" : "hard",
            question_text: question.question_text,
            option_a: question.option_a,
            option_b: question.option_b,
            option_c: question.option_c,
            option_d: question.option_d,
            correct_option: question.correct_option,
            sport: {
              id: `sport_${question.slot}`,
              slug: question.sport.toLowerCase(),
              name: question.sport,
              is_active: true,
              sort_order: question.slot * 10,
              created_at: "2026-04-01T00:00:00Z",
            },
          },
        })),
        error: null,
      }),
    });

    createPublicSupabaseServerClient.mockReturnValue(publicClient);
    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/api/challenge/today/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(publicClient.from).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      date: "2026-04-01",
      timer: null,
      questions: fullChallenge.map((question) => ({
        id: question.id,
        slot: question.slot,
        sport: question.sport,
        difficulty: question.difficulty,
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
      })),
    });
  });

  it("returns a signed-in player's server-side timer when an attempt start already exists", async () => {
    const publicClient = createPublicClientMock();
    const sessionClient = createClientMock({
      daily_attempt_starts: createThenableQuery({
        data: {
          started_at: "2026-04-01T11:59:30.000Z",
        },
        error: null,
      }),
    });
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: {
          id: "challenge_1",
          challenge_date: "2026-04-01",
          status: "published",
          generation_method: "auto",
          rules_version: "v1",
          generated_at: "2026-04-01T00:00:00Z",
          published_at: "2026-04-01T00:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        error: null,
      }),
      daily_challenge_items: createThenableQuery({
        data: fullChallenge.map((question) => ({
          id: question.id,
          slot: question.slot,
          question_snapshot: {
            id: question.id,
            difficulty: question.slot <= 3 ? "easy" : "hard",
            question_text: question.question_text,
            option_a: question.option_a,
            option_b: question.option_b,
            option_c: question.option_c,
            option_d: question.option_d,
            correct_option: question.correct_option,
            sport: {
              id: `sport_${question.slot}`,
              slug: question.sport.toLowerCase(),
              name: question.sport,
              is_active: true,
              sort_order: question.slot * 10,
              created_at: "2026-04-01T00:00:00Z",
            },
          },
        })),
        error: null,
      }),
    });

    createPublicSupabaseServerClient.mockReturnValue(publicClient);
    createSessionSupabaseServerClient.mockReturnValue(sessionClient);
    getSupabaseSessionFromRequest.mockReturnValue({
      accessToken: "access-token",
      user: { id: "user-123" },
    });
    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/api/challenge/today/route");
    const response = await GET(new Request("http://localhost/api/challenge/today") as never);

    expect(response.status).toBe(200);
    expect(createSessionSupabaseServerClient).toHaveBeenCalledWith("access-token");
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      timer: {
        startedAt: "2026-04-01T11:59:30.000Z",
        durationLimitMs: 90_000,
        remainingMs: 60_000,
      },
    });
  });

  it("loads legacy questions through server-only access when canonical data is unavailable", async () => {
    const publicClient = createPublicClientMock();
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: null,
        error: { message: "service unavailable" },
      }),
      daily_challenge_questions: createThenableQuery({
        data: legacyChallenge,
        error: null,
      }),
    });

    createPublicSupabaseServerClient.mockReturnValue(publicClient);
    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/api/challenge/today/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(publicClient.from).not.toHaveBeenCalledWith("daily_challenge_questions");
    expect(adminClient.from).toHaveBeenCalledWith("daily_challenge_questions");
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      date: "2026-04-01",
      timer: null,
      questions: legacyChallenge.map((question) => ({
        id: question.id,
        slot: question.slot,
        sport: question.sport,
        difficulty: question.difficulty,
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
      })),
    });
  });

  it("returns a clear unavailable state when today's challenge is not seeded", async () => {
    const publicClient = createPublicClientMock();
    const adminClient = createClientMock({
      daily_challenges: createThenableQuery({
        data: [],
        error: null,
      }),
    });

    createPublicSupabaseServerClient.mockReturnValue(publicClient);
    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/api/challenge/today/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      date: "2026-04-01",
      message: "Today's challenge is not live yet. Check back soon.",
    });
  });
});
