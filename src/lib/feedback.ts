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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFeedbackType(value: unknown): value is FeedbackType {
  return (
    typeof value === "string" &&
    FEEDBACK_TYPES.includes(value as FeedbackType)
  );
}

export function parseFeedbackPayload(
  value: unknown,
): ParsedFeedbackPayload | null {
  if (!isRecord(value) || !isFeedbackType(value.feedbackType)) {
    return null;
  }

  const message =
    typeof value.message === "string" ? value.message.trim() : "";
  if (!message || message.length > MAX_FEEDBACK_MESSAGE_LENGTH) {
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
    typeof value.contactEmail !== "string"
  ) {
    return null;
  }

  const normalizedEmail = value.contactEmail?.trim().toLowerCase() || null;
  if (
    normalizedEmail &&
    (normalizedEmail.length > MAX_FEEDBACK_EMAIL_LENGTH ||
      !EMAIL_PATTERN.test(normalizedEmail))
  ) {
    return null;
  }

  if (
    value.sourcePath !== undefined &&
    typeof value.sourcePath !== "string"
  ) {
    return null;
  }

  const sourcePath = value.sourcePath?.trim() || null;
  if (
    sourcePath &&
    (sourcePath.length > MAX_FEEDBACK_SOURCE_PATH_LENGTH ||
      !sourcePath.startsWith("/") ||
      sourcePath.startsWith("//") ||
      sourcePath.includes("?") ||
      sourcePath.includes("#"))
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
