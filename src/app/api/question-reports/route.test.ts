import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const createQuestionReport = vi.fn();
const supabaseAdmin = vi.fn();

vi.mock("@/lib/server/questionReportsRepository", () => ({
  createQuestionReport,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

const questionId = "00000000-0000-4000-8000-000000000001";

function buildSessionCookie() {
  return JSON.stringify({
    access_token: "access-token",
    user: {
      id: "user-123",
      email: "player@example.com",
    },
  });
}

function buildRequest(body: unknown, sessionCookie?: string) {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (sessionCookie !== undefined) {
    headers.set(
      "cookie",
      `${supabaseAuthStorageKey}=${encodeURIComponent(sessionCookie)}`,
    );
  }

  return new NextRequest("http://localhost/api/question-reports", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/question-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    supabaseAdmin.mockReturnValue({ tag: "admin" });
    createQuestionReport.mockResolvedValue({
      id: "report-1",
      question_id: questionId,
    });
  });

  it("stores a guest report with normalized values", async () => {
    const { POST } = await import("@/app/api/question-reports/route");
    const response = await POST(
      buildRequest({
        questionId,
        context: "sport_quiz",
        reason: "unclear_question",
        note: "  This wording felt confusing.  ",
      }),
    );

    expect(response.status).toBe(200);
    expect(createQuestionReport).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        questionId,
        reporterUserId: null,
        context: "sport_quiz",
        reason: "unclear_question",
        note: "This wording felt confusing.",
      },
    );
    await expect(response.json()).resolves.toEqual({
      message: "Thanks. We'll review this question.",
    });
  });

  it("attaches the signed-in user when a valid session cookie exists", async () => {
    const { POST } = await import("@/app/api/question-reports/route");
    const response = await POST(
      buildRequest(
        {
          questionId,
          context: "daily_challenge",
          reason: "wrong_answer",
        },
        buildSessionCookie(),
      ),
    );

    expect(response.status).toBe(200);
    expect(createQuestionReport).toHaveBeenCalledWith(
      { tag: "admin" },
      expect.objectContaining({
        questionId,
        reporterUserId: "user-123",
        context: "daily_challenge",
        reason: "wrong_answer",
        note: null,
      }),
    );
  });

  it("rejects invalid reports before inserting", async () => {
    const { POST } = await import("@/app/api/question-reports/route");
    const response = await POST(
      buildRequest({
        questionId: "not-a-question-id",
        reason: "wrong_answer",
      }),
    );

    expect(response.status).toBe(400);
    expect(createQuestionReport).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Invalid question report.",
    });
  });
});
