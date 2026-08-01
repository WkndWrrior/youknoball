import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_FEEDBACK_EMAIL_LENGTH,
  MAX_FEEDBACK_MESSAGE_LENGTH,
  MAX_FEEDBACK_SOURCE_PATH_LENGTH,
} from "@/lib/feedback";
import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const createFeedbackSubmission = vi.fn();
const createSessionSupabaseServerClient = vi.fn();
const getUser = vi.fn();
const sendFeedbackNotification = vi.fn();
const supabaseAdmin = vi.fn();

vi.mock("@/lib/server/feedbackRepository", () => ({
  createFeedbackSubmission,
}));

vi.mock("@/lib/server/feedbackNotifications", () => ({
  sendFeedbackNotification,
}));

vi.mock("@/lib/server/supabaseServer", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/server/supabaseServer")
  >("@/lib/server/supabaseServer");

  return {
    ...actual,
    createSessionSupabaseServerClient,
  };
});

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

function buildSessionCookie(userId = "cookie-user") {
  return JSON.stringify({
    access_token: "access-token",
    user: {
      id: userId,
      email: "player@example.com",
    },
  });
}

function buildRequest(
  body: unknown,
  sessionCookie?: string,
  contentType = "application/json; charset=utf-8",
) {
  const headers = new Headers({
    "content-type": contentType,
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

function buildStreamingRequest(
  chunks: string[],
  cancel: () => void,
) {
  const encoder = new TextEncoder();
  let chunkIndex = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[chunkIndex];
      chunkIndex += 1;

      if (chunk === undefined) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(chunk));
    },
    cancel,
  });

  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body,
    duplex: "half",
  });
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    supabaseAdmin.mockReturnValue({ tag: "admin" });
    createFeedbackSubmission.mockResolvedValue({ id: "feedback-1" });
    createSessionSupabaseServerClient.mockReturnValue({
      auth: { getUser },
    });
    getUser.mockResolvedValue({
      data: { user: { id: "verified-user" } },
      error: null,
    });
    sendFeedbackNotification.mockResolvedValue({ sent: true });
  });

  it("stores normalized guest feedback and notifies with the saved ID", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(200);
    expect(createSessionSupabaseServerClient).not.toHaveBeenCalled();
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

  it("accepts a maximum-valid escaped Unicode payload beneath the transport limit", async () => {
    const message = "🏀".repeat(MAX_FEEDBACK_MESSAGE_LENGTH);
    const contactEmail = `${"a".repeat(
      MAX_FEEDBACK_EMAIL_LENGTH - "@example.com".length,
    )}@example.com`;
    const sourcePath = `/${"a".repeat(MAX_FEEDBACK_SOURCE_PATH_LENGTH - 1)}`;
    const serializedPayload = JSON.stringify({
      feedbackType: "general",
      message,
      contactEmail,
      sourcePath,
      website: "",
    }).replaceAll("🏀", "\\ud83c\\udfc0");
    const requestBytes = new TextEncoder().encode(serializedPayload).byteLength;
    const request = new NextRequest("http://localhost/api/feedback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: serializedPayload,
    });

    expect(requestBytes).toBeGreaterThan(8 * 1024);
    expect(requestBytes).toBeLessThan(32 * 1024);

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(createFeedbackSubmission).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        feedbackType: "general",
        message,
        contactEmail,
        sourcePath,
        reporterUserId: null,
      },
    );
    await expect(response.json()).resolves.toEqual({
      message: "Thanks for helping us make You Kno Ball better.",
    });
  });

  it("attaches only the server-verified user when the cookie user is forged", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(
      buildRequest(
        {
          feedbackType: "idea",
          message: "Add a rivalry quiz.",
        },
        buildSessionCookie("forged-user"),
      ),
    );

    expect(response.status).toBe(200);
    expect(createSessionSupabaseServerClient).toHaveBeenCalledWith(
      "access-token",
    );
    expect(getUser).toHaveBeenCalledOnce();
    expect(createFeedbackSubmission).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        feedbackType: "idea",
        message: "Add a rivalry quiz.",
        contactEmail: null,
        sourcePath: null,
        reporterUserId: "verified-user",
      },
    );
    expect(sendFeedbackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "feedback-1",
        reporterUserId: "verified-user",
      }),
    );
  });

  it.each([
    [
      "an expired token",
      {
        data: { user: null },
        error: { message: "token expired" },
      },
    ],
    [
      "no returned user",
      {
        data: { user: null },
        error: null,
      },
    ],
  ])("continues as a guest when verification returns %s", async (_case, result) => {
    getUser.mockResolvedValue(result);

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(
      buildRequest(validPayload, buildSessionCookie("forged-user")),
    );

    expect(response.status).toBe(200);
    expect(getUser).toHaveBeenCalledOnce();
    expect(createFeedbackSubmission).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        ...normalizedPayload,
        reporterUserId: null,
      },
    );
    expect(sendFeedbackNotification).toHaveBeenCalledWith(
      expect.objectContaining({ reporterUserId: null }),
    );
  });

  it("continues as a guest when session verification throws", async () => {
    getUser.mockRejectedValue(new Error("auth unavailable"));

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(
      buildRequest(validPayload, buildSessionCookie("forged-user")),
    );

    expect(response.status).toBe(200);
    expect(createFeedbackSubmission).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        ...normalizedPayload,
        reporterUserId: null,
      },
    );
  });

  it("rejects unsupported media types before persistence", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(
      buildRequest(validPayload, undefined, "text/plain"),
    );

    expect(response.status).toBe(415);
    expect(createSessionSupabaseServerClient).not.toHaveBeenCalled();
    expect(supabaseAdmin).not.toHaveBeenCalled();
    expect(createFeedbackSubmission).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Unsupported media type.",
    });
  });

  it.each([
    [
      "an oversized message",
      {
        feedbackType: "bug",
        message: "x".repeat(40_000),
      },
    ],
    [
      "an oversized unknown field",
      {
        ...validPayload,
        clientMetadata: "x".repeat(40_000),
      },
    ],
  ])("rejects %s before persistence", async (_case, payload) => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(buildRequest(payload));

    expect(response.status).toBe(413);
    expect(createSessionSupabaseServerClient).not.toHaveBeenCalled();
    expect(supabaseAdmin).not.toHaveBeenCalled();
    expect(createFeedbackSubmission).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Request body is too large.",
    });
  });

  it("cancels a streamed body without Content-Length once it exceeds the limit", async () => {
    const cancel = vi.fn();
    const request = buildStreamingRequest(
      [
        '{"feedbackType":"bug","message":"',
        "x".repeat(40_000),
        '"}',
      ],
      cancel,
    );

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(request);

    expect(request.headers.has("content-length")).toBe(false);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(createFeedbackSubmission).not.toHaveBeenCalled();
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

  it.each([
    ["a missing saved ID", {}],
    ["a malformed saved ID", { id: 42 }],
    ["a null saved submission", null],
  ])("returns success without notifying for %s", async (_case, savedSubmission) => {
    createFeedbackSubmission.mockResolvedValue(savedSubmission);

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(200);
    expect(createFeedbackSubmission).toHaveBeenCalledOnce();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Thanks for helping us make You Kno Ball better.",
    });
  });

  it("waits for persistence to complete before notifying", async () => {
    const events: string[] = [];
    let resolvePersistence!: (value: { id: string }) => void;
    const persistence = new Promise<{ id: string }>((resolve) => {
      resolvePersistence = resolve;
    });
    createFeedbackSubmission.mockImplementation(async () => {
      events.push("repository:start");
      const savedSubmission = await persistence;
      events.push("repository:complete");
      return savedSubmission;
    });
    sendFeedbackNotification.mockImplementation(async () => {
      events.push("notification");
      return { sent: true };
    });

    const { POST } = await import("@/app/api/feedback/route");
    const responsePromise = POST(buildRequest(validPayload));

    await vi.waitFor(() => {
      expect(createFeedbackSubmission).toHaveBeenCalledOnce();
    });
    expect(events).toEqual(["repository:start"]);
    expect(sendFeedbackNotification).not.toHaveBeenCalled();

    resolvePersistence({ id: "feedback-1" });
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(events).toEqual([
      "repository:start",
      "repository:complete",
      "notification",
    ]);
  });
});
