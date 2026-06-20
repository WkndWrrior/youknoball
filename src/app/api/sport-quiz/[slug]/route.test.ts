import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSessionSupabaseServerClient,
  getSportQuizForPlayer,
  getSupabaseSessionFromRequest,
  getUser,
} = vi.hoisted(() => ({
  createSessionSupabaseServerClient: vi.fn(),
  getSportQuizForPlayer: vi.fn(),
  getSupabaseSessionFromRequest: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/server/sportQuizRepository", () => ({
  getSportQuizForPlayer,
}));

vi.mock("@/lib/server/supabaseServer", () => ({
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
}));

const readyQuiz = {
  status: "ready" as const,
  sport: {
    slug: "cfb",
    name: "CFB",
  },
  questions: Array.from({ length: 5 }, (_, index) => ({
    id: `q${index + 1}`,
    slot: index + 1,
    sport: "CFB",
    difficulty: index < 2 ? "easy" : index === 2 ? "medium" : "hard",
    question_text: `Question ${index + 1}`,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
  })),
};

function buildRequest(body: unknown = {}) {
  return new NextRequest("http://localhost/api/sport-quiz/cfb", {
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

describe("POST /api/sport-quiz/[slug]", () => {
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
    getSportQuizForPlayer.mockResolvedValue(readyQuiz);
  });

  it("starts a guest quiz and passes client recent IDs through for repository parsing", async () => {
    const recentQuestionIds = ["q1", "q2", "q1"];
    const { POST } = await import("@/app/api/sport-quiz/[slug]/route");
    const response = await POST(buildRequest({ recentQuestionIds }), context());

    expect(response.status).toBe(200);
    expect(getSportQuizForPlayer).toHaveBeenCalledWith({
      slug: "cfb",
      userId: null,
      clientRecentQuestionIds: recentQuestionIds,
    });
    await expect(response.json()).resolves.toEqual(readyQuiz);
  });

  it("uses only the verified signed-in user ID", async () => {
    getSupabaseSessionFromRequest.mockReturnValue({
      accessToken: "access-token",
      user: {
        id: "forged-cookie-user",
      },
    });

    const { POST } = await import("@/app/api/sport-quiz/[slug]/route");
    const response = await POST(buildRequest(), context(" CFB "));

    expect(response.status).toBe(200);
    expect(createSessionSupabaseServerClient).toHaveBeenCalledWith("access-token");
    expect(getUser).toHaveBeenCalled();
    expect(getSportQuizForPlayer).toHaveBeenCalledWith({
      slug: "cfb",
      userId: "verified-user",
      clientRecentQuestionIds: undefined,
    });
  });

  it.each([
    [
      "verification returns an error",
      {
        data: {
          user: {
            id: "forged-cookie-user",
          },
        },
        error: new Error("invalid token"),
      },
    ],
    [
      "verification returns no user",
      {
        data: {
          user: null,
        },
        error: null,
      },
    ],
  ])("ignores a forged cookie when %s", async (_description, getUserResult) => {
    getSupabaseSessionFromRequest.mockReturnValue({
      accessToken: "access-token",
      user: {
        id: "forged-cookie-user",
      },
    });
    getUser.mockResolvedValue(getUserResult);

    const { POST } = await import("@/app/api/sport-quiz/[slug]/route");
    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(200);
    expect(getSportQuizForPlayer).toHaveBeenCalledWith({
      slug: "cfb",
      userId: null,
      clientRecentQuestionIds: undefined,
    });
  });

  it("returns 404 for an unsupported sport without calling the repository", async () => {
    const { POST } = await import("@/app/api/sport-quiz/[slug]/route");
    const response = await POST(buildRequest(), context("mls"));

    expect(response.status).toBe(404);
    expect(getSportQuizForPlayer).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Sport quiz not found.",
    });
  });

  it("returns an unavailable bank response with status 200", async () => {
    getSportQuizForPlayer.mockResolvedValue({
      status: "unavailable",
      message: "This sport quiz is not available yet.",
    });

    const { POST } = await import("@/app/api/sport-quiz/[slug]/route");
    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      message: "This sport quiz is not available yet.",
    });
  });

  it("returns a retryable unavailable response without exposing repository errors", async () => {
    getSportQuizForPlayer.mockRejectedValue(
      new Error("database credentials and internal details"),
    );

    const { POST } = await import("@/app/api/sport-quiz/[slug]/route");
    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      status: "unavailable",
      message: "Unable to load this sport quiz right now. Please try again.",
    });
    expect(JSON.stringify(payload)).not.toContain("database credentials");
  });

  it("never exposes correct answers from a ready start response", async () => {
    getSportQuizForPlayer.mockResolvedValue({
      ...readyQuiz,
      questions: readyQuiz.questions.map((question) => ({
        ...question,
        correct_option: "A",
        source_notes: "internal",
      })),
    });

    const { POST } = await import("@/app/api/sport-quiz/[slug]/route");
    const response = await POST(buildRequest(), context());
    const payload = await response.json();

    expect(payload.questions).toHaveLength(5);
    expect(payload.questions[0]).toEqual(readyQuiz.questions[0]);
    expect(JSON.stringify(payload)).not.toContain("correct_option");
    expect(JSON.stringify(payload)).not.toContain("source_notes");
  });
});
