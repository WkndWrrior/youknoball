import { describe, expect, it } from "vitest";

import {
  MAX_QUESTION_REPORT_NOTE_LENGTH,
  parseQuestionReportPayload,
} from "@/lib/questionReports";

const questionId = "00000000-0000-4000-8000-000000000001";

describe("questionReports", () => {
  it("normalizes a valid player report payload", () => {
    expect(
      parseQuestionReportPayload({
        questionId,
        context: "daily_challenge",
        reason: "wrong_answer",
        note: "  The listed answer looks off.  ",
      }),
    ).toEqual({
      questionId,
      context: "daily_challenge",
      reason: "wrong_answer",
      note: "The listed answer looks off.",
    });
  });

  it("allows an omitted note and defaults context to unknown", () => {
    expect(
      parseQuestionReportPayload({
        questionId,
        reason: "typo",
      }),
    ).toEqual({
      questionId,
      context: "unknown",
      reason: "typo",
      note: null,
    });
  });

  it.each([
    ["bad question ID", { questionId: "not-a-uuid", reason: "wrong_answer" }],
    ["bad reason", { questionId, reason: "bad_reason" }],
    ["bad context", { questionId, reason: "wrong_answer", context: "daily" }],
    [
      "note too long",
      {
        questionId,
        reason: "wrong_answer",
        note: "x".repeat(MAX_QUESTION_REPORT_NOTE_LENGTH + 1),
      },
    ],
  ])("rejects %s", (_description, payload) => {
    expect(parseQuestionReportPayload(payload)).toBeNull();
  });
});
