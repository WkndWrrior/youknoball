const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const FEEDBACK_TYPES = ["general", "bug", "idea"] as const;

export const MAX_FEEDBACK_MESSAGE_LENGTH = 2000;
export const MAX_FEEDBACK_EMAIL_LENGTH = 320;
export const MAX_FEEDBACK_SOURCE_PATH_LENGTH = 200;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export type ParsedFeedbackPayload = {
  feedbackType: FeedbackType;
  message: string;
  contactEmail: string | null;
  sourcePath: string | null;
};

export function isValidFeedbackContactEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFeedbackType(value: unknown): value is FeedbackType {
  return (
    typeof value === "string" &&
    FEEDBACK_TYPES.includes(value as FeedbackType)
  );
}

function exceedsCodePointLimit(value: string, limit: number): boolean {
  const codePoints = value[Symbol.iterator]();
  let count = 0;

  while (!codePoints.next().done) {
    count += 1;
    if (count > limit) {
      return true;
    }
  }

  return false;
}

function hasUnsafeSourcePathCharacter(value: string): boolean {
  for (const character of value) {
    const characterCode = character.charCodeAt(0);
    if (
      character === "\\" ||
      characterCode <= 0x1f ||
      characterCode === 0x7f
    ) {
      return true;
    }
  }

  return false;
}

export function normalizeFeedbackSourcePath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sourcePath = value.trim();
  if (!sourcePath) {
    return null;
  }

  if (
    hasUnsafeSourcePathCharacter(value) ||
    exceedsCodePointLimit(sourcePath, MAX_FEEDBACK_SOURCE_PATH_LENGTH) ||
    !sourcePath.startsWith("/") ||
    sourcePath.startsWith("//") ||
    sourcePath.includes("?") ||
    sourcePath.includes("#")
  ) {
    return null;
  }

  return sourcePath;
}

export function parseFeedbackPayload(
  value: unknown,
): ParsedFeedbackPayload | null {
  if (!isRecord(value) || !isFeedbackType(value.feedbackType)) {
    return null;
  }

  const message =
    typeof value.message === "string" ? value.message.trim() : "";
  if (!message || exceedsCodePointLimit(message, MAX_FEEDBACK_MESSAGE_LENGTH)) {
    return null;
  }

  if (
    value.website !== undefined &&
    (typeof value.website !== "string" || value.website.trim())
  ) {
    return null;
  }

  if (
    value.contactEmail !== undefined &&
    value.contactEmail !== null &&
    typeof value.contactEmail !== "string"
  ) {
    return null;
  }

  const normalizedEmail = value.contactEmail?.trim().toLowerCase() || null;
  if (
    normalizedEmail &&
    (exceedsCodePointLimit(normalizedEmail, MAX_FEEDBACK_EMAIL_LENGTH) ||
      !isValidFeedbackContactEmail(normalizedEmail))
  ) {
    return null;
  }

  const sourcePath = normalizeFeedbackSourcePath(value.sourcePath);
  if (
    value.sourcePath !== undefined &&
    value.sourcePath !== null &&
    (typeof value.sourcePath !== "string" ||
      (Boolean(value.sourcePath.trim()) && !sourcePath))
  ) {
    return null;
  }

  return {
    feedbackType: value.feedbackType,
    message,
    contactEmail: normalizedEmail,
    sourcePath,
  };
}
