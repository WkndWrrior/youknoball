import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
  getUser,
  submitSportQuizAttempt,
} = vi.hoisted(() => ({
  createSessionSupabaseServerClient: vi.fn(),
  getSupabaseSessionFromRequest: vi.fn(),
  getUser: vi.fn(),
  submitSportQuizAttempt: vi.fn(),
}));

vi.mock("@/lib/server/sportQuizRepository", () => ({
  submitSportQuizAttempt,
}));

vi.mock("@/lib/server/supabaseServer", () => ({
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
}));

const validAnswers = {
  q1: "A",
  q2: "B",
  q3: "C",
  q4: "D",
  q5: "A",
};
const validSubmissionId = "00000000-0000-4000-8000-000000000001";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    answers: validAnswers,
    submissionId: validSubmissionId,
    ...overrides,
  };
}

const gradedAttempt = {
  saved: false,
  score: 4,
  total: 5,
  results: [
    { question_id: "q1", chosen_option: "A", is_correct: true },
    { question_id: "q2", chosen_option: "B", is_correct: true },
    { question_id: "q3", chosen_option: "C", is_correct: true },
    { question_id: "q4", chosen_option: "D", is_correct: true },
    { question_id: "q5", chosen_option: "A", is_correct: false },
  ],
};

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost/api/sport-quiz/cfb/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function context(slug = "cfb") {
  return {
    params: Promise.resolve({ slug }),
  };
}

describe("POST /api/sport-quiz/[slug]/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSupabaseSessionFromRequest.mockReturnValue(null);
    createSessionSupabaseServerClient.mockReturnValue({
      auth: {
        getUser,
      },
    });
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "verified-user",
        },
      },
      error: null,
    });
    submitSportQuizAttempt.mockResolvedValue(gradedAttempt);
  });

  it.each([
    ["missing answers", { submissionId: validSubmissionId }],
    ["incomplete answers", validBody({ answers: { q1: "A" } })],
    [
      "invalid answers",
      validBody({
        answers: {
          ...validAnswers,
          q5: "E",
        },
      }),
    ],
    ["missing submission ID", { answers: validAnswers }],
    ["invalid submission ID", validBody({ submissionId: "not-a-uuid" })],
  ])("returns 400 before the repository for %s", async (_description, body) => {
    const { POST } = await import("@/app/api/sport-quiz/[slug]/submit/route");
    const response = await POST(buildRequest(body), context());

    expect(response.status).toBe(400);
    expect(submitSportQuizAttempt).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Please submit answers for all 5 questions.",
    });
  });

  it("grades a guest submission without a user ID", async () => {
    const { POST } = await import("@/app/api/sport-quiz/[slug]/submit/route");
    const response = await POST(buildRequest(validBody()), context());

    expect(response.status).toBe(200);
    expect(submitSportQuizAttempt).toHaveBeenCalledWith({
      slug: "cfb",
      userId: null,
      submissionId: validSubmissionId,
      answers: validAnswers,
    });
    await expect(response.json()).resolves.toEqual(gradedAttempt);
  });

  it("verifies a signed-in user and returns a saved attempt", async () => {
    getSupabaseSessionFromRequest.mockReturnValue({
      accessToken: "access-token",
      user: {
        id: "forged-cookie-user",
      },
    });
    submitSportQuizAttempt.mockResolvedValue({
      ...gradedAttempt,
      saved: true,
    });

    const { POST } = await import("@/app/api/sport-quiz/[slug]/submit/route");
    const response = await POST(
      buildRequest(validBody()),
      context(" CFB "),
    );

    expect(response.status).toBe(200);
    expect(createSessionSupabaseServerClient).toHaveBeenCalledWith("access-token");
    expect(getUser).toHaveBeenCalled();
    expect(submitSportQuizAttempt).toHaveBeenCalledWith({
      slug: "cfb",
      userId: "verified-user",
      submissionId: validSubmissionId,
      answers: validAnswers,
    });
    await expect(response.json()).resolves.toMatchObject({
      saved: true,
      score: 4,
      total: 5,
    });
  });

  it("ignores the cookie user ID when token verification fails", async () => {
    getSupabaseSessionFromRequest.mockReturnValue({
      accessToken: "access-token",
      user: {
        id: "forged-cookie-user",
      },
    });
    getUser.mockRejectedValue(new Error("auth unavailable"));

    const { POST } = await import("@/app/api/sport-quiz/[slug]/submit/route");
    const response = await POST(buildRequest(validBody()), context());

    expect(response.status).toBe(200);
    expect(submitSportQuizAttempt).toHaveBeenCalledWith({
      slug: "cfb",
      userId: null,
      submissionId: validSubmissionId,
      answers: validAnswers,
    });
  });

  it("returns 404 for an unsupported sport without calling the repository", async () => {
    const { POST } = await import("@/app/api/sport-quiz/[slug]/submit/route");
    const response = await POST(buildRequest(validBody()), context("mlb"));

    expect(response.status).toBe(404);
    expect(submitSportQuizAttempt).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Sport quiz not found.",
    });
  });

  it.each([
    ["Invalid sport quiz submission.", 400],
    ["Invalid sport quiz questions.", 400],
    ["Invalid sport quiz difficulty mix.", 400],
    ["Unsupported sport.", 404],
  ])("maps repository validation error %s to %i", async (message, status) => {
    submitSportQuizAttempt.mockRejectedValue(new Error(message));

    const { POST } = await import("@/app/api/sport-quiz/[slug]/submit/route");
    const response = await POST(buildRequest(validBody()), context());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ message });
  });

  it("returns a generic 500 response for unexpected repository failures", async () => {
    submitSportQuizAttempt.mockRejectedValue(
      new Error("database credentials and internal details"),
    );

    const { POST } = await import("@/app/api/sport-quiz/[slug]/submit/route");
    const response = await POST(buildRequest(validBody()), context());

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({
      message: "Unable to submit this sport quiz right now.",
    });
    expect(JSON.stringify(payload)).not.toContain("database credentials");
  });
});
