import { describe, expect, it } from "vitest";

import {
  FEEDBACK_TYPES,
  MAX_FEEDBACK_EMAIL_LENGTH,
  MAX_FEEDBACK_MESSAGE_LENGTH,
  MAX_FEEDBACK_SOURCE_PATH_LENGTH,
  parseFeedbackPayload,
} from "@/lib/feedback";

const validPayload = {
  feedbackType: "general",
  message: "Thanks for making sports trivia.",
};

describe("feedback", () => {
  it("normalizes a valid feedback payload", () => {
    expect(
      parseFeedbackPayload({
        feedbackType: "bug",
        message: "  The category card did not open.  ",
        contactEmail: "  PLAYER@EXAMPLE.COM ",
        sourcePath: "/categories",
        website: "",
      }),
    ).toEqual({
      feedbackType: "bug",
      message: "The category card did not open.",
      contactEmail: "player@example.com",
      sourcePath: "/categories",
    });
  });

  it.each(["general", "bug", "idea"] as const)(
    "accepts the %s feedback type",
    (feedbackType) => {
      expect(
        parseFeedbackPayload({ ...validPayload, feedbackType }),
      ).toMatchObject({ feedbackType });
    },
  );

  it("exports the supported feedback types", () => {
    expect(FEEDBACK_TYPES).toEqual(["general", "bug", "idea"]);
  });

  it("normalizes blank optional fields to null", () => {
    expect(
      parseFeedbackPayload({
        ...validPayload,
        contactEmail: "   ",
        sourcePath: "   ",
      }),
    ).toEqual({
      ...validPayload,
      contactEmail: null,
      sourcePath: null,
    });
  });

  it.each([
    ["an unknown feedback type", { ...validPayload, feedbackType: "praise" }],
    ["a blank message", { ...validPayload, message: "   " }],
    [
      "a message over the length limit",
      {
        ...validPayload,
        message: "x".repeat(MAX_FEEDBACK_MESSAGE_LENGTH + 1),
      },
    ],
    [
      "a malformed contact email",
      { ...validPayload, contactEmail: "player at example.com" },
    ],
    [
      "a contact email over the length limit",
      {
        ...validPayload,
        contactEmail: `${"a".repeat(
          MAX_FEEDBACK_EMAIL_LENGTH - "@example.com".length + 1,
        )}@example.com`,
      },
    ],
    [
      "an external source URL",
      { ...validPayload, sourcePath: "https://example.com/categories" },
    ],
    [
      "a source path without a leading slash",
      { ...validPayload, sourcePath: "categories" },
    ],
    [
      "a protocol-relative source path",
      { ...validPayload, sourcePath: "//example.com/categories" },
    ],
    [
      "a source path with a query string",
      { ...validPayload, sourcePath: "/categories?tab=all" },
    ],
    [
      "a source path with a fragment",
      { ...validPayload, sourcePath: "/categories#football" },
    ],
    [
      "a source path over the length limit",
      {
        ...validPayload,
        sourcePath: `/${"a".repeat(MAX_FEEDBACK_SOURCE_PATH_LENGTH)}`,
      },
    ],
    [
      "a populated honeypot",
      { ...validPayload, website: "https://spam.example" },
    ],
  ])("rejects %s", (_description, payload) => {
    expect(parseFeedbackPayload(payload)).toBeNull();
  });
});
