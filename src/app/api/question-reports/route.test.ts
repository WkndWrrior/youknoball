import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const createQuestionReport = vi.fn();
const sendQuestionReportNotification = vi.fn();
const supabaseAdmin = vi.fn();
const getVerifiedSupabaseSessionFromRequest = vi.fn();

vi.mock("@/lib/server/questionReportsRepository", () => ({
  createQuestionReport,
}));

vi.mock("@/lib/server/questionReportNotifications", () => ({
  sendQuestionReportNotification,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

vi.mock("@/lib/server/supabaseServer", () => ({
  getVerifiedSupabaseSessionFromRequest,
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

function buildRawRequest(body: string, contentType: string) {
  return new NextRequest("http://localhost/api/question-reports", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
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
    sendQuestionReportNotification.mockResolvedValue({ sent: true });
    getVerifiedSupabaseSessionFromRequest.mockResolvedValue(null);
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
    expect(sendQuestionReportNotification).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        reportId: "report-1",
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
    getVerifiedSupabaseSessionFromRequest.mockResolvedValue({
      user: { id: "verified-user" },
    });
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
        reporterUserId: "verified-user",
        context: "daily_challenge",
        reason: "wrong_answer",
        note: null,
      }),
    );
    expect(sendQuestionReportNotification).toHaveBeenCalledWith(
      { tag: "admin" },
      expect.objectContaining({
        reportId: "report-1",
        reporterUserId: "verified-user",
      }),
    );
  });

  it("does not fail the player report when notification email fails", async () => {
    sendQuestionReportNotification.mockRejectedValue(new Error("email down"));

    const { POST } = await import("@/app/api/question-reports/route");
    const response = await POST(
      buildRequest({
        questionId,
        context: "daily_challenge",
        reason: "wrong_answer",
      }),
    );

    expect(response.status).toBe(200);
    expect(createQuestionReport).toHaveBeenCalled();
    expect(sendQuestionReportNotification).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Thanks. We'll review this question.",
    });
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

  it("rejects non-JSON request bodies", async () => {
    const { POST } = await import("@/app/api/question-reports/route");
    const response = await POST(buildRawRequest("question=bad", "text/plain"));

    expect(response.status).toBe(415);
    expect(createQuestionReport).not.toHaveBeenCalled();
  });

  it("rejects request bodies larger than 32 KiB", async () => {
    const { POST } = await import("@/app/api/question-reports/route");
    const response = await POST(
      buildRawRequest(
        JSON.stringify({ note: "x".repeat(33 * 1024) }),
        "application/json",
      ),
    );

    expect(response.status).toBe(413);
    expect(createQuestionReport).not.toHaveBeenCalled();
  });
});
