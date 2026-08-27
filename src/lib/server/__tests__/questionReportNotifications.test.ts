import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendQuestionReportNotification } from "@/lib/server/questionReportNotifications";

const { getQuestionForReportNotification } = vi.hoisted(() => ({
  getQuestionForReportNotification: vi.fn(),
}));

vi.mock("@/lib/server/questionReportsRepository", () => ({
  getQuestionForReportNotification,
}));

const report = {
  reportId: "report-1",
  questionId: "00000000-0000-4000-8000-000000000001",
  reporterUserId: "user-1",
  context: "daily_challenge" as const,
  reason: "wrong_answer" as const,
  note: "The answer looks wrong.",
};

const question = {
  id: report.questionId,
  sport: "NBA",
  difficulty: "medium",
  question_text: "Who won the 2024 NBA Finals?",
  option_a: "Dallas Mavericks",
  option_b: "Denver Nuggets",
  option_c: "Miami Heat",
  option_d: "Boston Celtics",
  correct_option: "D",
  correct_answer: "Boston Celtics",
  source_notes: "Verified against NBA.com",
};

describe("question report notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    getQuestionForReportNotification.mockResolvedValue(question);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips email when Resend settings are not configured", async () => {
    const fetchMock = vi.fn();

    const result = await sendQuestionReportNotification(
      { tag: "admin" } as never,
      report,
      fetchMock,
    );

    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(getQuestionForReportNotification).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a Resend email with report and question details", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("QUESTION_REPORT_EMAIL_TO", "teddy@example.com");
    vi.stubEnv("QUESTION_REPORT_EMAIL_FROM", "YouKnoBall <alerts@example.com>");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });

    const result = await sendQuestionReportNotification(
      { tag: "admin" } as never,
      report,
      fetchMock,
    );

    expect(result).toEqual({ sent: true });
    expect(getQuestionForReportNotification).toHaveBeenCalledWith(
      { tag: "admin" },
      report.questionId,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
        headers: {
          authorization: "Bearer resend-key",
          "content-type": "application/json",
        },
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      from: "YouKnoBall <alerts@example.com>",
      to: ["teddy@example.com"],
      subject: "Question reported: NBA medium",
    });
    expect(body.text).toContain("Report ID: report-1");
    expect(body.text).toContain("Reason: wrong_answer");
    expect(body.text).toContain("Context: daily_challenge");
    expect(body.text).toContain("Question: Who won the 2024 NBA Finals?");
    expect(body.text).toContain("Correct answer: Boston Celtics");
    expect(body.text).toContain("Note: The answer looks wrong.");
    expect(body.text).toContain("from internal.question_report_review");
  });
});
