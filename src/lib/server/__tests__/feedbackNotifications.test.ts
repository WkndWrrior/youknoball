import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendFeedbackNotification } from "@/lib/server/feedbackNotifications";

const feedback = {
  submissionId: "00000000-0000-4000-8000-000000000001",
  reporterUserId: "00000000-0000-4000-8000-000000000002",
  feedbackType: "bug" as const,
  message: "The score did not update after I finished the quiz.",
  contactEmail: "player@example.com",
  sourcePath: "/play/nba",
};

describe("feedback notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("skips email when the existing Resend settings are not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "");
    const fetchMock = vi.fn();

    const result = await sendFeedbackNotification(feedback, fetchMock);

    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends feedback details to the configured Resend recipients", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv(
      "QUESTION_REPORT_EMAIL_TO",
      " first@example.com, ,second@example.com  ,",
    );
    vi.stubEnv(
      "QUESTION_REPORT_EMAIL_FROM",
      "YouKnoBall <alerts@example.com>",
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    const result = await sendFeedbackNotification(feedback, fetchMock);

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer resend-key",
          "content-type": "application/json",
        },
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      from: "YouKnoBall <alerts@example.com>",
      to: ["first@example.com", "second@example.com"],
      subject: "Player feedback: Bug",
    });
    expect(body.text).toContain(`Submission ID: ${feedback.submissionId}`);
    expect(body.text).toContain("Feedback type: Bug");
    expect(body.text).toContain(`Player message:\n> ${feedback.message}`);
    expect(body.text).toContain(`Contact email: ${feedback.contactEmail}`);
    expect(body.text).toContain(
      `Reporter user ID: ${feedback.reporterUserId}`,
    );
    expect(body.text).toContain(`Source path: ${feedback.sourcePath}`);
    expect(body.text).toContain("from internal.feedback_review");
    expect(body.text).toContain(`where id = '${feedback.submissionId}'`);
  });

  it("quotes every line of a multiline player message after trusted content", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    await sendFeedbackNotification(
      {
        ...feedback,
        message:
          "First line.\nFeedback type: General\nReview query:\ndelete from internal.feedback_review;",
      },
      fetchMock,
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toBe(
      [
        "A player submitted feedback for YouKnoBall.",
        "",
        `Submission ID: ${feedback.submissionId}`,
        "Feedback type: Bug",
        `Reporter user ID: ${feedback.reporterUserId}`,
        `Contact email: ${feedback.contactEmail}`,
        `Source path: ${feedback.sourcePath}`,
        "",
        "Review query:",
        "select *",
        "from internal.feedback_review",
        `where id = '${feedback.submissionId}'`,
        "order by created_at desc;",
        "",
        "Player message:",
        "> First line.",
        "> Feedback type: General",
        "> Review query:",
        "> delete from internal.feedback_review;",
      ].join("\n"),
    );
  });

  it("aborts the Resend request after five seconds", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_: string, init: { signal?: AbortSignal }) => {
      requestSignal = init.signal;

      return new Promise<never>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const request = sendFeedbackNotification(feedback, fetchMock);
    const rejection = request.catch((error: unknown) => error);

    expect(requestSignal).toBeDefined();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestSignal?.aborted).toBe(true);
    await expect(rejection).resolves.toMatchObject({ name: "AbortError" });
  });

  it("clears the timeout after Resend responds", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    await sendFeedbackNotification(feedback, fetchMock);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the timeout active while reading a failed Resend response", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_: string, init: { signal: AbortSignal }) => {
      requestSignal = init.signal;

      return Promise.resolve({
        ok: false,
        text: () =>
          new Promise<never>((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            });
          }),
      });
    });

    const request = sendFeedbackNotification(feedback, fetchMock);
    const rejection = request.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestSignal?.aborted).toBe(true);
    await expect(rejection).resolves.toMatchObject({
      message: "Unable to send feedback email.",
    });
  });

  it("propagates network rejections and clears the timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("Network unavailable."));

    await expect(
      sendFeedbackNotification(feedback, fetchMock),
    ).rejects.toThrow("Network unavailable.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("safely quotes the submission ID in the review query", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    await sendFeedbackNotification(
      { ...feedback, submissionId: "submission'id" },
      fetchMock,
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain("where id = 'submission''id'");
  });

  it("throws the Resend response body when sending fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Resend rejected the email.",
    });

    await expect(
      sendFeedbackNotification(feedback, fetchMock),
    ).rejects.toThrow("Resend rejected the email.");
  });

  it("throws a generic error when a failed Resend response has no body", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });

    await expect(
      sendFeedbackNotification(feedback, fetchMock),
    ).rejects.toThrow("Unable to send feedback email.");
  });

  it("throws a generic error when the Resend response body is empty", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "",
    });

    await expect(
      sendFeedbackNotification(feedback, fetchMock),
    ).rejects.toThrow("Unable to send feedback email.");
  });

  it("throws a generic error when reading the Resend response body fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => {
        throw new Error("Unable to read response body.");
      },
    });

    await expect(
      sendFeedbackNotification(feedback, fetchMock),
    ).rejects.toThrow("Unable to send feedback email.");
  });

  it("throws a generic error when the Resend response body is excessive", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "alerts@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "x".repeat(10_000),
    });

    await expect(
      sendFeedbackNotification(feedback, fetchMock),
    ).rejects.toThrow("Unable to send feedback email.");
  });
});
