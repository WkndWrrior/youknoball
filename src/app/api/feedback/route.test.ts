import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const createFeedbackSubmission = vi.fn();
const sendFeedbackNotification = vi.fn();
const supabaseAdmin = vi.fn();

vi.mock("@/lib/server/feedbackRepository", () => ({
  createFeedbackSubmission,
}));

vi.mock("@/lib/server/feedbackNotifications", () => ({
  sendFeedbackNotification,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

const validPayload = {
  feedbackType: "bug",
  message: "  The category card did not open.  ",
  contactEmail: "  PLAYER@EXAMPLE.COM ",
  sourcePath: "/categories",
  website: "",
};

const normalizedPayload = {
  feedbackType: "bug",
  message: "The category card did not open.",
  contactEmail: "player@example.com",
  sourcePath: "/categories",
};

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

  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function buildMalformedRequest() {
  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: "{",
  });
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    supabaseAdmin.mockReturnValue({ tag: "admin" });
    createFeedbackSubmission.mockResolvedValue({ id: "feedback-1" });
    sendFeedbackNotification.mockResolvedValue({ sent: true });
  });

  it("stores normalized guest feedback and notifies with the saved ID", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(200);
    expect(createFeedbackSubmission).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        ...normalizedPayload,
        reporterUserId: null,
      },
    );
    expect(sendFeedbackNotification).toHaveBeenCalledWith({
      ...normalizedPayload,
      submissionId: "feedback-1",
      reporterUserId: null,
    });
    await expect(response.json()).resolves.toEqual({
      message: "Thanks for helping us make You Kno Ball better.",
    });
  });

  it("attaches the signed-in user from a valid session cookie", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(
      buildRequest(
        {
          feedbackType: "idea",
          message: "Add a rivalry quiz.",
        },
        buildSessionCookie(),
      ),
    );

    expect(response.status).toBe(200);
    expect(createFeedbackSubmission).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        feedbackType: "idea",
        message: "Add a rivalry quiz.",
        contactEmail: null,
        sourcePath: null,
        reporterUserId: "user-123",
      },
    );
    expect(sendFeedbackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "feedback-1",
        reporterUserId: "user-123",
      }),
    );
  });

  it.each([
    [
      "an invalid payload",
      {
        feedbackType: "compliment",
        message: "Great game.",
      },
    ],
    ["a populated honeypot", { ...validPayload, website: "spam.example" }],
  ])("rejects %s before persistence", async (_description, payload) => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(buildRequest(payload));

    expect(response.status).toBe(400);
    expect(supabaseAdmin).not.toHaveBeenCalled();
    expect(createFeedbackSubmission).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Invalid feedback.",
    });
  });

  it("returns invalid feedback for malformed JSON before persistence", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(buildMalformedRequest());

    expect(response.status).toBe(400);
    expect(supabaseAdmin).not.toHaveBeenCalled();
    expect(createFeedbackSubmission).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Invalid feedback.",
    });
  });

  it("returns 500 without notifying when persistence fails", async () => {
    createFeedbackSubmission.mockRejectedValue(new Error("database down"));

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(500);
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Unable to send feedback.",
    });
  });

  it("returns success after persistence when notification fails", async () => {
    sendFeedbackNotification.mockRejectedValue(new Error("email down"));

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(buildRequest(validPayload));

    expect(createFeedbackSubmission).toHaveBeenCalledOnce();
    expect(sendFeedbackNotification).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Thanks for helping us make You Kno Ball better.",
    });
  });
});
