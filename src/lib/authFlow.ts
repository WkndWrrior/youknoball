export type AuthMode = "signin" | "signup";

export type PasswordConfirmationValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: "missing_password" | "missing_confirmation" | "password_mismatch";
    };

const authModes: AuthMode[] = ["signin", "signup"];
const defaultAuthRedirectPath = "/play";

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isNonEmpty(value: string) {
  return value.trim().length > 0;
}

export function normalizeAuthRedirectPath(
  rawPath: string | null | undefined,
) {
  const path = rawPath?.trim();
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    return defaultAuthRedirectPath;
  }

  return path;
}

export function normalizeAuthEmail(rawEmail: string | null | undefined) {
  if (!rawEmail) {
    return null;
  }

  const normalized = rawEmail.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeAuthMode(rawMode: string | null | undefined): AuthMode {
  if (!rawMode) {
    return "signin";
  }

  const normalized = normalizeText(rawMode);
  return authModes.includes(normalized as AuthMode) ? (normalized as AuthMode) : "signin";
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
) : PasswordConfirmationValidationResult {
  if (!isNonEmpty(password)) {
    return {
      ok: false,
      code: "missing_password",
    };
  }

  if (!isNonEmpty(confirmation)) {
    return {
      ok: false,
      code: "missing_confirmation",
    };
  }

  if (password !== confirmation) {
    return {
      ok: false,
      code: "password_mismatch",
    };
  }

  return {
    ok: true,
  };
}

function requireNormalizedEmail(email: string) {
  const normalized = normalizeAuthEmail(email);
  if (!normalized) {
    throw new Error("Email must be a non-empty normalized value.");
  }

  return normalized;
}

export function getSignupVerificationMessage(email: string) {
  const normalizedEmail = requireNormalizedEmail(email);
  return `Check your inbox at ${normalizedEmail} to verify your account. Once you confirm, your scores will save automatically.`;
}

export function getRecoveryEmailMessage(email: string) {
  const normalizedEmail = requireNormalizedEmail(email);
  return `We sent a password reset link to ${normalizedEmail}. Open it to choose a new password.`;
}
