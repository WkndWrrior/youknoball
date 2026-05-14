"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { validatePasswordConfirmation } from "@/lib/authFlow";
import {
  getPasswordResetSessionErrorMessage,
  getPasswordResetSuccessMessage,
  getPasswordResetValidationErrorMessage,
} from "@/lib/passwordReset";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabaseBrowser().auth.getSession();

      if (!mounted) {
        return;
      }

      setHasSession(Boolean(data.session));
      setSessionLoading(false);
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!hasSession) {
        throw new Error(getPasswordResetSessionErrorMessage());
      }

      const validation = validatePasswordConfirmation(password, confirmPassword);
      if (!validation.ok) {
        throw new Error(getPasswordResetValidationErrorMessage(validation.code));
      }

      const { error: updateError } = await supabaseBrowser().auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess(getPasswordResetSuccessMessage());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to update password.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="px-4 py-12 sm:px-6">
      <section className="mx-auto w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#ff7a18]">
          Password reset
        </p>
        <h1 className="mt-4 font-display text-4xl leading-none text-white sm:text-5xl">
          Choose a new password.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-white/72">
          Set a fresh password for your YouKnowBall account, then continue back to
          your saved scores and leaderboard progress.
        </p>

        {sessionLoading ? (
          <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/35 p-5 text-sm text-white/72">
            Checking your recovery session...
          </div>
        ) : null}

        {!sessionLoading && !hasSession ? (
          <div className="mt-8 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-200">
            {getPasswordResetSessionErrorMessage()}
            <div className="mt-4">
              <Link className="font-semibold underline" href="/login">
                Back to sign in
              </Link>
            </div>
          </div>
        ) : null}

        {!sessionLoading && hasSession ? (
          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-white" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#ff7a18]"
                placeholder="Create a new password"
                required
                autoComplete="new-password"
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium text-white"
                htmlFor="confirm-password"
              >
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#ff7a18]"
                placeholder="Repeat the new password"
                required
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => router.replace("/play")}
                className="text-left text-sm font-medium text-white/60 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`w-full rounded-full px-4 py-3 text-sm font-semibold transition sm:w-auto ${
                  submitting
                    ? "cursor-not-allowed bg-white/10 text-white/35"
                    : "bg-[#ff7a18] text-black hover:bg-[#ff8c36]"
                }`}
              >
                {submitting ? "Updating..." : "Update password"}
              </button>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {success ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-200">
            <p>{success}</p>
            <div className="mt-4">
              <Link className="font-semibold underline" href="/play">
                Continue to play
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
