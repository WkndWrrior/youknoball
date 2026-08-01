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

  it.each([
    ["null", null, null],
    ["undefined", undefined, undefined],
    ["blank strings", "   ", "   "],
  ])(
    "normalizes %s optional fields to null",
    (_description, contactEmail, sourcePath) => {
      expect(
        parseFeedbackPayload({
          ...validPayload,
          contactEmail,
          sourcePath,
        }),
      ).toEqual({
        ...validPayload,
        contactEmail: null,
        sourcePath: null,
      });
    },
  );

  it.each([
    [
      "message",
      { message: "x".repeat(MAX_FEEDBACK_MESSAGE_LENGTH) },
    ],
    [
      "contact email",
      {
        contactEmail: `${"a".repeat(
          MAX_FEEDBACK_EMAIL_LENGTH - "@example.com".length,
        )}@example.com`,
      },
    ],
    [
      "source path",
      {
        sourcePath: `/${"a".repeat(MAX_FEEDBACK_SOURCE_PATH_LENGTH - 1)}`,
      },
    ],
  ])("accepts a %s at the exact length limit", (_description, fields) => {
    expect(parseFeedbackPayload({ ...validPayload, ...fields })).toMatchObject(
      fields,
    );
  });

  it("accepts a message with the maximum astral Unicode code points", () => {
    const message = "🏀".repeat(MAX_FEEDBACK_MESSAGE_LENGTH);

    expect(parseFeedbackPayload({ ...validPayload, message })).toMatchObject({
      message,
    });
  });

  it("rejects every ASCII control character in a nonblank source path", () => {
    const controlCodePoints = [
      ...Array.from({ length: 0x20 }, (_value, codePoint) => codePoint),
      0x7f,
    ];

    for (const codePoint of controlCodePoints) {
      const controlCharacter = String.fromCodePoint(codePoint);

      expect(
        parseFeedbackPayload({
          ...validPayload,
          sourcePath: `/categories${controlCharacter}hidden`,
        }),
        `U+${codePoint.toString(16).padStart(4, "0")}`,
      ).toBeNull();
    }
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
      "a message with one too many astral Unicode code points",
      {
        ...validPayload,
        message: "🏀".repeat(MAX_FEEDBACK_MESSAGE_LENGTH + 1),
      },
    ],
    [
      "a malformed contact email",
      { ...validPayload, contactEmail: "player at example.com" },
    ],
    [
      "a non-string contact email",
      { ...validPayload, contactEmail: 42 },
    ],
    [
      "a non-string source path",
      { ...validPayload, sourcePath: { pathname: "/categories" } },
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
      "a backslash authority escape",
      { ...validPayload, sourcePath: "/\\evil.example/x" },
    ],
    [
      "a newline authority escape",
      { ...validPayload, sourcePath: "/\n/evil.example/x" },
    ],
    [
      "a source path with a trailing control character",
      { ...validPayload, sourcePath: "/categories\n" },
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
