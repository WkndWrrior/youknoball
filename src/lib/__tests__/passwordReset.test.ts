import { describe, expect, it } from "vitest";

import {
  getPasswordResetSessionErrorMessage,
  getPasswordResetSuccessMessage,
  getPasswordResetValidationErrorMessage,
} from "@/lib/passwordReset";

describe("password reset helpers", () => {
  it("maps password confirmation validation codes to reset-password copy", () => {
    expect(getPasswordResetValidationErrorMessage("missing_password")).toBe(
      "Please enter a new password.",
    );
    expect(getPasswordResetValidationErrorMessage("missing_confirmation")).toBe(
      "Please confirm your new password.",
    );
    expect(getPasswordResetValidationErrorMessage("password_mismatch")).toBe(
      "Passwords do not match.",
    );
  });

  it("returns a clear success message after a password update", () => {
    expect(getPasswordResetSuccessMessage()).toBe(
      "Password updated. Continue to your account.",
    );
  });

  it("returns a clear session error for expired recovery links", () => {
    expect(getPasswordResetSessionErrorMessage()).toBe(
      "This password reset link is invalid or expired. Request a new one.",
    );
  });
});
