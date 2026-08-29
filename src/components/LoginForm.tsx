"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  getRecoveryEmailMessage,
  getSignupVerificationMessage,
  normalizeAuthEmail,
  normalizeAuthMode,
  validatePasswordConfirmation,
  type AuthMode,
} from "@/lib/authFlow";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type LoginFormProps = {
  callbackError: string | null;
  redirectPath: string;
};

function getRedirectUrl(pathname: string) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");

  return `${siteUrl}${pathname}`;
}

function getPasswordConfirmationErrorMessage(code: string) {
  if (code === "missing_password") {
    return "Please create a password.";
  }

  if (code === "missing_confirmation") {
    return "Please confirm your password.";
  }

  return "Passwords do not match.";
}

const authModeDetails: Record<
  AuthMode,
  {
    heading: string;
    description: string;
    submitLabel: string;
    submittingLabel: string;
  }
> = {
  signin: {
    heading: "Sign in",
    description: "Use your password to pick up where you left off.",
    submitLabel: "Sign in",
    submittingLabel: "Signing in...",
  },
  signup: {
    heading: "Create account",
    description: "Create a password, confirm your email, and save your results.",
    submitLabel: "Create account",
    submittingLabel: "Creating account...",
  },
};

export function LoginForm({ callbackError, redirectPath }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const normalizedEmail = normalizeAuthEmail(email);
      if (!normalizedEmail) {
        throw new Error("Please enter an email.");
      }

      const client = supabaseBrowser();
      const callbackPath = `/auth/callback?next=${encodeURIComponent(redirectPath)}`;
      const redirectTo = getRedirectUrl(callbackPath);

      if (mode === "signin") {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError) {
          throw signInError;
        }

        router.replace(redirectPath);
        return;
      }

      const confirmation = validatePasswordConfirmation(password, confirmPassword);
      if (!confirmation.ok) {
        throw new Error(getPasswordConfirmationErrorMessage(confirmation.code));
      }

      const { error: signUpError } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setSuccess(getSignupVerificationMessage(normalizedEmail));
      setEmail(normalizedEmail);
      setPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to complete authentication.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onMagicLink() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const normalizedEmail = normalizeAuthEmail(email);
      if (!normalizedEmail) {
        throw new Error("Please enter an email.");
      }

      const callbackPath = `/auth/callback?next=${encodeURIComponent(redirectPath)}`;
      const { error: otpError } = await supabaseBrowser().auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: getRedirectUrl(callbackPath),
          shouldCreateUser: false,
        },
      });

      if (otpError && otpError.code !== "otp_disabled") {
        throw otpError;
      }

      setSuccess(
        "If an account exists for that email, check your inbox for a sign-in link.",
      );
      setEmail(normalizedEmail);
    } catch (magicLinkError) {
      setError(
        magicLinkError instanceof Error
          ? magicLinkError.message
          : "Unable to send a sign-in link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgotPassword() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const normalizedEmail = normalizeAuthEmail(email);
      if (!normalizedEmail) {
        throw new Error("Please enter an email.");
      }

      const { error: recoveryError } = await supabaseBrowser().auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: getRedirectUrl("/auth/callback"),
        },
      );

      if (recoveryError) {
        throw recoveryError;
      }

      setSuccess(getRecoveryEmailMessage(normalizedEmail));
      setEmail(normalizedEmail);
    } catch (recoverySubmitError) {
      setError(
        recoverySubmitError instanceof Error
          ? recoverySubmitError.message
          : "Unable to send recovery email.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode(nextMode: string) {
    setMode(normalizeAuthMode(nextMode));
    setError(null);
    setSuccess(null);
  }

  const details = authModeDetails[mode];
  const showConfirmationField = mode === "signup";

  return (
    <main className="px-4 py-12 sm:px-6">
      <section className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#ff7a18]">
            Official account
          </p>
          <h1 className="mt-4 max-w-lg font-display text-4xl leading-none text-white sm:text-5xl">
            Save scores, track your average, climb the board.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/72">
            Guests can still play free. If you create an account, you&apos;ll verify
            your email, keep a password, and carry your results across devices.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                Password
              </p>
              <p className="mt-2 text-sm text-white/75">
                Sign in with email and password by default.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                Verification
              </p>
              <p className="mt-2 text-sm text-white/75">
                New accounts verify before they become active.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                Fallback
              </p>
              <p className="mt-2 text-sm text-white/75">
                Magic links stay available if you want a one-time entry path.
              </p>
            </div>
          </div>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="flex gap-2 rounded-full border border-white/10 bg-black/30 p-1">
            {(["signin", "signup"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeMode(item)}
                className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition ${
                  mode === item
                    ? "bg-[#ff7a18] text-black"
                    : "text-white/60 hover:text-white"
                }`}
                aria-pressed={mode === item}
              >
                {item === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <h2 className="mt-5 font-display text-3xl leading-none text-white">
            {details.heading}
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/70">{details.description}</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-white" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#ff7a18]"
              placeholder="you@example.com"
              required
            />

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#ff7a18]"
                  placeholder="Enter your password"
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>

              {showConfirmationField ? (
                <div>
                  <label
                    className="block text-sm font-medium text-white"
                    htmlFor="confirm-password"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#ff7a18]"
                    placeholder="Repeat your password"
                    required
                    autoComplete="new-password"
                  />
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {mode === "signin" ? (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={submitting}
                  className="text-left text-sm font-medium text-white/60 transition hover:text-white disabled:cursor-not-allowed disabled:text-white/30"
                >
                  Forgot password?
                </button>
              ) : (
                <span className="text-sm text-white/45">
                  Verification email required after signup.
                </span>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={`w-full rounded-full px-4 py-3 text-sm font-semibold transition sm:w-auto ${
                  submitting
                    ? "cursor-not-allowed bg-white/10 text-white/35"
                    : "bg-[#ff7a18] text-black hover:bg-[#ff8c36]"
                }`}
              >
                {submitting ? details.submittingLabel : details.submitLabel}
              </button>
            </div>

            {mode === "signin" ? (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs uppercase text-white/40">or</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <button
                  type="button"
                  onClick={onMagicLink}
                  disabled={submitting}
                  className="w-full rounded-full border border-white/15 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:text-white/30"
                >
                  Email me a sign-in link
                </button>
              </div>
            ) : null}
          </form>

          {error ? (
            <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}
          {!error && callbackError ? (
            <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {callbackError}
            </p>
          ) : null}
          {success ? (
            <p className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {success}
            </p>
          ) : null}

          <p className="mt-4 text-xs leading-5 text-white/45">
            {mode === "signin"
              ? "Use your password or request a one-time sign-in link."
              : "New accounts require email verification before they save scores."}
          </p>
        </section>
      </section>
    </main>
  );
}
