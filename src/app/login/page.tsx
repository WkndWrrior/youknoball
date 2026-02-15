"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const callbackError = searchParams.get("error");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const trimmed = email.trim();
      if (!trimmed) {
        throw new Error("Please enter an email.");
      }

      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ??
        (typeof window !== "undefined" ? window.location.origin : "");
      const redirectTo = `${siteUrl}/auth/callback`;

      const { error: otpError } = await supabaseBrowser().auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (otpError) {
        throw otpError;
      }

      setSuccess(`Magic link sent to ${trimmed}. Check your inbox.`);
      setEmail(trimmed);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send magic link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto w-full max-w-md rounded-xl border border-slate-300 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold tracking-tight">Sign In</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Enter your email and we&apos;ll send you a magic link.
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
            placeholder="you@example.com"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className={`w-full rounded-md px-4 py-2 text-sm font-medium ${
              submitting
                ? "cursor-not-allowed bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                : "bg-sky-600 text-white hover:bg-sky-500"
            }`}
          >
            {submitting ? "Sending..." : "Send magic link"}
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </p>
        ) : null}
        {!error && callbackError ? (
          <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {callbackError}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
            {success}
          </p>
        ) : null}
      </section>
    </main>
  );
}
