import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const createSessionSupabaseServerClient = vi.fn();
const createPublicSupabaseServerClient = vi.fn();
const getVerifiedSupabaseSessionFromRequest = vi.fn();
const supabaseAdmin = vi.fn();
const getChallengeResolutionForDate = vi.fn();
const createDailyAttempt = vi.fn();
const findDailyAttemptForUserAndDate = vi.fn();
const getDailyAttemptStart = vi.fn();
const getPlayerStats = vi.fn();
const getPlayerProfile = vi.fn();

vi.mock("@/lib/server/supabaseServer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/supabaseServer")>(
    "@/lib/server/supabaseServer",
  );

  return {
    ...actual,
    createPublicSupabaseServerClient,
    createSessionSupabaseServerClient,
    getVerifiedSupabaseSessionFromRequest,
  };
});

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

vi.mock("@/lib/server/dailyChallengeRepository", () => ({
  getChallengeResolutionForDate,
  createDailyAttempt,
  findDailyAttemptForUserAndDate,
  getDailyAttemptStart,
  getPlayerStats,
  getPlayerProfile,
}));

const todayChallenge = [
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

function buildRequest(sessionCookie?: string) {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (sessionCookie) {
    headers.set(
      "cookie",
      `${supabaseAuthStorageKey}=${encodeURIComponent(sessionCookie)}`,
    );
  }

  return new NextRequest("http://localhost/api/attempt/submit", {
    method: "POST",
    headers,
    body: JSON.stringify({
      date: "2026-04-01",
      answers: {
        q1: "A",
        q2: "B",
        q3: "D",
        q4: "D",
        q5: "A",
      },
    }),
  });
}

describe("POST /api/attempt/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getChallengeResolutionForDate.mockResolvedValue({
      dailyChallengeId: "challenge-1",
      questions: todayChallenge,
    });
    createPublicSupabaseServerClient.mockReturnValue({ tag: "public" });
    createSessionSupabaseServerClient.mockReturnValue({ tag: "session" });
    supabaseAdmin.mockReturnValue({ tag: "admin" });
    getVerifiedSupabaseSessionFromRequest.mockImplementation(async (request) =>
      request.cookies.get(supabaseAuthStorageKey)
        ? {
            accessToken: "access-token",
            client: { tag: "session" },
            user: { id: "user-123" },
          }
        : null,
    );
    getPlayerProfile.mockResolvedValue({ display_name: null });
    getPlayerStats.mockResolvedValue({
      averageScore: 4,
      totalPlays: 1,
      lastPlayedAt: "2026-04-01",
    });
    getDailyAttemptStart.mockResolvedValue({
      started_at: "2026-04-01T13:59:00.000Z",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scores a guest attempt without saving it", async () => {
    const { POST } = await import("@/app/api/attempt/submit/route");
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(createDailyAttempt).not.toHaveBeenCalled();
    expect(getChallengeResolutionForDate).toHaveBeenCalledWith(
      { tag: "public" },
      "2026-04-01",
    );
    await expect(response.json()).resolves.toMatchObject({
      saved: false,
      leaderboardEligible: false,
      attempt: {
        score: 4,
        total: 5,
      },
      shareText: ["YouKnowBall Daily Challenge 2026-04-01", "4/5", "🟩🟩⬜🟩🟩"].join(
        "\n",
      ),
    });
  });

  it("saves a signed-in attempt and returns updated stats", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T14:00:00.000Z"));

    createDailyAttempt.mockResolvedValue({
      id: "attempt-1",
      challenge_date: "2026-04-01",
      created_at: "2026-04-01T14:00:00.000Z",
      score: 4,
      total_questions: 5,
      duration_ms: 60_000,
      leaderboard_eligible: true,
      answers: {
        q1: "A",
        q2: "B",
        q3: "D",
        q4: "D",
        q5: "A",
      },
    });

    const sessionCookie = JSON.stringify({
      access_token: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
      },
    });

    const { POST } = await import("@/app/api/attempt/submit/route");
    const response = await POST(buildRequest(sessionCookie));

    expect(response.status).toBe(200);
    expect(getChallengeResolutionForDate).toHaveBeenCalledWith(
      { tag: "public" },
      "2026-04-01",
    );
    expect(createDailyAttempt).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        userId: "user-123",
        dailyChallengeId: "challenge-1",
        challengeDate: "2026-04-01",
        score: 4,
        totalQuestions: 5,
        durationMs: 60_000,
        leaderboardEligible: true,
        answers: {
          q1: "A",
          q2: "B",
          q3: "D",
          q4: "D",
          q5: "A",
        },
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      saved: true,
      leaderboardEligible: false,
      leaderboardStatus: "needs_display_name",
      stats: {
        averageScore: 4,
        totalPlays: 1,
        lastPlayedAt: "2026-04-01",
      },
      attempt: {
        id: "attempt-1",
        score: 4,
        total: 5,
        durationMs: 60_000,
        leaderboardEligible: true,
      },
    });
  });

  it("keeps signed-in attempts under five seconds off the leaderboard", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T14:00:03.000Z"));
    getDailyAttemptStart.mockResolvedValue({
      started_at: "2026-04-01T14:00:00.000Z",
    });
    createDailyAttempt.mockResolvedValue({
      id: "attempt-1",
      challenge_date: "2026-04-01",
      created_at: "2026-04-01T14:00:03.000Z",
      score: 4,
      total_questions: 5,
      duration_ms: 3_000,
      leaderboard_eligible: false,
      answers: {
        q1: "A",
        q2: "B",
        q3: "D",
        q4: "D",
        q5: "A",
      },
    });

    const sessionCookie = JSON.stringify({
      access_token: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
      },
    });

    const { POST } = await import("@/app/api/attempt/submit/route");
    const response = await POST(buildRequest(sessionCookie));

    expect(response.status).toBe(200);
    expect(createDailyAttempt).toHaveBeenCalledWith(
      { tag: "admin" },
      expect.objectContaining({
        durationMs: 3_000,
        leaderboardEligible: false,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      saved: true,
      leaderboardEligible: false,
      attempt: {
        durationMs: 3_000,
        leaderboardEligible: false,
      },
    });
  });

  it("caps signed-in attempts after ninety seconds and keeps them leaderboard-eligible", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T14:03:01.000Z"));
    getDailyAttemptStart.mockResolvedValue({
      started_at: "2026-04-01T14:00:00.000Z",
    });
    getPlayerProfile.mockResolvedValue({ display_name: "Player" });
    createDailyAttempt.mockResolvedValue({
      id: "attempt-1",
      challenge_date: "2026-04-01",
      created_at: "2026-04-01T14:03:01.000Z",
      score: 4,
      total_questions: 5,
      duration_ms: 90_000,
      leaderboard_eligible: true,
      answers: {
        q1: "A",
        q2: "B",
        q3: "D",
        q4: "D",
        q5: "A",
      },
    });

    const sessionCookie = JSON.stringify({
      access_token: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
      },
    });

    const { POST } = await import("@/app/api/attempt/submit/route");
    const response = await POST(buildRequest(sessionCookie));

    expect(response.status).toBe(200);
    expect(createDailyAttempt).toHaveBeenCalledWith(
      { tag: "admin" },
      expect.objectContaining({
        durationMs: 90_000,
        leaderboardEligible: true,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      saved: true,
      leaderboardEligible: true,
      leaderboardStatus: "eligible",
      attempt: {
        durationMs: 90_000,
        leaderboardEligible: true,
      },
    });
  });

  it("saves signed-in attempts as leaderboard-ineligible when the timer cannot load", async () => {
    getDailyAttemptStart.mockRejectedValueOnce(
      new Error("Unable to load attempt timer."),
    );
    createDailyAttempt.mockResolvedValue({
      id: "attempt-1",
      challenge_date: "2026-04-01",
      created_at: "2026-04-01T14:00:00.000Z",
      score: 4,
      total_questions: 5,
      duration_ms: null,
      leaderboard_eligible: false,
      answers: {
        q1: "A",
        q2: "B",
        q3: "D",
        q4: "D",
        q5: "A",
      },
    });

    const sessionCookie = JSON.stringify({
      access_token: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
      },
    });

    const { POST } = await import("@/app/api/attempt/submit/route");
    const response = await POST(buildRequest(sessionCookie));

    expect(response.status).toBe(200);
    expect(createDailyAttempt).toHaveBeenCalledWith(
      { tag: "admin" },
      expect.objectContaining({
        durationMs: null,
        leaderboardEligible: false,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      saved: true,
      leaderboardEligible: false,
      leaderboardStatus: "timer_unavailable",
      attempt: {
        durationMs: null,
        leaderboardEligible: false,
      },
    });
  });

  it("returns an existing bridge-saved attempt before insert when the canonical id is available", async () => {
    const sessionCookie = JSON.stringify({
      access_token: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
      },
    });

    findDailyAttemptForUserAndDate.mockResolvedValue({
      id: "attempt-1",
      daily_challenge_id: null,
      challenge_date: "2026-04-01",
      created_at: "2026-04-01T14:00:00.000Z",
      score: 4,
      total_questions: 5,
      answers: {
        q1: "A",
        q2: "B",
        q3: "D",
        q4: "D",
        q5: "A",
      },
    });

    const { POST } = await import("@/app/api/attempt/submit/route");
    const response = await POST(buildRequest(sessionCookie));

    expect(response.status).toBe(409);
    expect(getChallengeResolutionForDate).toHaveBeenCalledWith(
      { tag: "public" },
      "2026-04-01",
    );
    expect(findDailyAttemptForUserAndDate).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        userId: "user-123",
        dailyChallengeId: "challenge-1",
        challengeDate: "2026-04-01",
      },
    );
    expect(createDailyAttempt).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      message: "You already played today's challenge.",
      saved: true,
      attempt: {
        id: "attempt-1",
        date: "2026-04-01",
        score: 4,
        total: 5,
      },
    });
  });

  it("returns the existing saved attempt on duplicate submission", async () => {
    const sessionCookie = JSON.stringify({
      access_token: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
      },
    });

    findDailyAttemptForUserAndDate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "attempt-1",
        daily_challenge_id: "challenge-1",
        challenge_date: "2026-04-01",
        created_at: "2026-04-01T14:00:00.000Z",
        score: 4,
        total_questions: 5,
        answers: {
          q1: "A",
          q2: "B",
          q3: "D",
          q4: "D",
          q5: "A",
        },
      });
    createDailyAttempt.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: "23505" }),
    );

    const { POST } = await import("@/app/api/attempt/submit/route");
    const response = await POST(buildRequest(sessionCookie));

    expect(response.status).toBe(409);
    expect(findDailyAttemptForUserAndDate).toHaveBeenCalledTimes(2);
    expect(createDailyAttempt).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      message: "You already played today's challenge.",
      saved: true,
      attempt: {
        id: "attempt-1",
        date: "2026-04-01",
        score: 4,
        total: 5,
      },
    });
  });

  it("drops the legacy date-based uniqueness constraint from daily_attempts", async () => {
    const migration = await readFile(
      new URL(
        "../../../../../supabase/migrations/202604030001_question_bank_refactor.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain(
      "drop constraint if exists daily_attempts_user_id_challenge_date_key",
    );
    expect(migration).toContain(
      "create unique index if not exists daily_attempts_user_id_challenge_date_unique",
    );
    expect(migration).toContain(
      "on public.daily_attempts (user_id, challenge_date);",
    );
  });
});
