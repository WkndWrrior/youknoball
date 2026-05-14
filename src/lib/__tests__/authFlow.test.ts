import { describe, expect, it } from "vitest";

import {
  getRecoveryEmailMessage,
  getSignupVerificationMessage,
  normalizeAuthEmail,
  normalizeAuthMode,
  validatePasswordConfirmation,
} from "@/lib/authFlow";

describe("normalizeAuthMode", () => {
  it("normalizes supported auth modes and falls back to signin", () => {
    expect(normalizeAuthMode("signin")).toBe("signin");
    expect(normalizeAuthMode(" signup ")).toBe("signup");
    expect(normalizeAuthMode("MAGIC-LINK")).toBe("magic-link");
    expect(normalizeAuthMode("unknown")).toBe("signin");
    expect(normalizeAuthMode(null)).toBe("signin");
    expect(normalizeAuthMode(undefined)).toBe("signin");
    expect(normalizeAuthMode("")).toBe("signin");
    expect(normalizeAuthMode("   ")).toBe("signin");
  });
});

describe("validatePasswordConfirmation", () => {
  it("returns useful validation errors for missing or mismatched passwords", () => {
    expect(validatePasswordConfirmation("", "abc123")).toEqual({
      ok: false,
      code: "missing_password",
    });
    expect(validatePasswordConfirmation("abc123", "")).toEqual({
      ok: false,
      code: "missing_confirmation",
    });
    expect(validatePasswordConfirmation("abc123", "abc124")).toEqual({
      ok: false,
      code: "password_mismatch",
    });
  });

  it("returns null when the password confirmation is valid", () => {
    expect(validatePasswordConfirmation("abc123", "abc123")).toEqual({
      ok: true,
    });
  });
});

describe("auth flow messages", () => {
  it("normalizes email input and rejects blank email values", () => {
    expect(normalizeAuthEmail("  fan@example.com  ")).toBe("fan@example.com");
    expect(normalizeAuthEmail("")).toBeNull();
    expect(normalizeAuthEmail("   ")).toBeNull();
    expect(normalizeAuthEmail(null)).toBeNull();
    expect(normalizeAuthEmail(undefined)).toBeNull();
  });

  it("builds a verification-required signup message", () => {
    expect(getSignupVerificationMessage("fan@example.com")).toBe(
      "Check your inbox at fan@example.com to verify your account. Once you confirm, your scores will save automatically.",
    );
  });

  it("builds a recovery email message", () => {
    expect(getRecoveryEmailMessage("fan@example.com")).toBe(
      "We sent a password reset link to fan@example.com. Open it to choose a new password.",
    );
  });
});
