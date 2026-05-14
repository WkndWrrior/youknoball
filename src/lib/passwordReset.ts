import type { PasswordConfirmationValidationResult } from "@/lib/authFlow";

export function getPasswordResetValidationErrorMessage(
  code: Extract<PasswordConfirmationValidationResult, { ok: false }>["code"],
) {
  if (code === "missing_password") {
    return "Please enter a new password.";
  }

  if (code === "missing_confirmation") {
    return "Please confirm your new password.";
  }

  return "Passwords do not match.";
}

export function getPasswordResetSuccessMessage() {
  return "Password updated. Continue to your account.";
}

export function getPasswordResetSessionErrorMessage() {
  return "This password reset link is invalid or expired. Request a new one.";
}
