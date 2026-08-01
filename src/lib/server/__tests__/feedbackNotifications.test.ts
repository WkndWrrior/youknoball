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
  });

  it("skips email when the existing Resend settings are not configured", async () => {
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
      "You Kno Ball <alerts@example.com>",
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
      from: "You Kno Ball <alerts@example.com>",
      to: ["first@example.com", "second@example.com"],
      subject: "Player feedback: Bug",
    });
    expect(body.text).toContain(`Submission ID: ${feedback.submissionId}`);
    expect(body.text).toContain("Feedback type: Bug");
    expect(body.text).toContain(`Message: ${feedback.message}`);
    expect(body.text).toContain(`Contact email: ${feedback.contactEmail}`);
    expect(body.text).toContain(
      `Reporter user ID: ${feedback.reporterUserId}`,
    );
    expect(body.text).toContain(`Source path: ${feedback.sourcePath}`);
    expect(body.text).toContain("from internal.feedback_review");
    expect(body.text).toContain(`where id = '${feedback.submissionId}'`);
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
});
