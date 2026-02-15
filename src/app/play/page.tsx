"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

type AnswerOption = "A" | "B" | "C" | "D";

type ChallengeQuestion = {
  id: string | number;
  sport: string | null;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

type ChallengeResponse = {
  date: string;
  source: "scheduled" | "fallback_recent";
  questions: ChallengeQuestion[];
  error?: string;
};

type AttemptResult = {
  question_id: string;
  chosen_option: AnswerOption;
  is_correct: boolean;
};

type SubmittedAttempt = {
  id: string;
  date: string;
  created_at: string;
  score: number;
  total: number;
  results: AttemptResult[];
};

type SubmitSuccessResponse = {
  message: string;
  attempt: SubmittedAttempt;
};

type SubmitConflictResponse = {
  message: string;
  existing_attempt: SubmittedAttempt;
};

type SubmitErrorResponse = {
  message: string;
};

const OPTION_KEYS: AnswerOption[] = ["A", "B", "C", "D"];

function getOptionText(question: ChallengeQuestion, option: AnswerOption) {
  if (option === "A") return question.option_a;
  if (option === "B") return question.option_b;
  if (option === "C") return question.option_c;
  return question.option_d;
}

export default function PlayPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<ChallengeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, AnswerOption>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmittedAttempt | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data: sessionData } = await supabaseBrowser().auth.getSession();
      if (mounted) {
        setUser(sessionData.session?.user ?? null);
        setAuthLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabaseBrowser().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadChallenge() {
      try {
        setLoading(true);
        const response = await fetch("/api/challenge/today", { cache: "no-store" });
        const payload = (await response.json()) as ChallengeResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load today's challenge.");
        }

        if (isMounted) {
          setData(payload);
          setError(null);
          setAnswers({});
          setResult(null);
          setSubmitError(null);
          setCopyMessage(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Unable to load today's challenge.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadChallenge();

    return () => {
      isMounted = false;
    };
  }, []);

  const questionCount = data?.questions.length ?? 0;
  const showNotEnoughQuestionsNotice = useMemo(
    () => !loading && !error && data !== null && questionCount < 5,
    [data, error, loading, questionCount],
  );

  const answeredCount = useMemo(() => {
    if (!data) {
      return 0;
    }

    return data.questions.reduce((count, question) => {
      return answers[String(question.id)] ? count + 1 : count;
    }, 0);
  }, [answers, data]);

  const canSubmit = useMemo(() => {
    if (!user) {
      return false;
    }

    return Boolean(
      data &&
        data.questions.length === 5 &&
        answeredCount === 5 &&
        !loading &&
        !error &&
        !submitting &&
        !result,
    );
  }, [answeredCount, data, error, loading, result, submitting, user]);

  const resultByQuestionId = useMemo(() => {
    const map = new Map<string, AttemptResult>();
    if (!result) {
      return map;
    }

    for (const item of result.results) {
      map.set(item.question_id, item);
    }
    return map;
  }, [result]);

  const emojiBar = useMemo(() => {
    if (!result || !data) {
      return "";
    }

    return data.questions
      .map((question) => {
        const questionResult = resultByQuestionId.get(String(question.id));
        return questionResult?.is_correct ? "🟩" : "⬜";
      })
      .join("");
  }, [data, result, resultByQuestionId]);

  const shareText = useMemo(() => {
    if (!result) {
      return "";
    }

    return `I scored ${result.score}/${result.total} on YouKnoBall?\n${emojiBar}`;
  }, [emojiBar, result]);

  function selectAnswer(questionId: string, option: AnswerOption) {
    setAnswers((current) => ({
      ...current,
      [questionId]: option,
    }));
    setCopyMessage(null);
  }

  async function onSubmit() {
    if (!data || !canSubmit) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setCopyMessage(null);

    try {
      const payloadAnswers: Record<string, AnswerOption> = {};
      for (const question of data.questions) {
        const questionId = String(question.id);
        const choice = answers[questionId];
        if (!choice) {
          throw new Error("Please answer all 5 questions before submitting.");
        }
        payloadAnswers[questionId] = choice;
      }

      const response = await fetch("/api/attempt/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: data.date,
          answers: payloadAnswers,
        }),
      });

      if (response.status === 409) {
        const conflictPayload = (await response.json()) as SubmitConflictResponse;
        setSubmitError(conflictPayload.message);
        if (conflictPayload.existing_attempt) {
          setResult(conflictPayload.existing_attempt);
        }
        return;
      }

      if (!response.ok) {
        const failurePayload = (await response.json()) as SubmitErrorResponse;
        throw new Error(failurePayload.message ?? "Unable to submit attempt.");
      }

      const successPayload = (await response.json()) as SubmitSuccessResponse;
      setResult(successPayload.attempt);
      setSubmitError(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to submit attempt.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyShareText() {
    if (!shareText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopyMessage("Copied to clipboard.");
    } catch {
      setCopyMessage("Copy failed. Please copy manually.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Today&apos;s Challenge</h1>
          {!loading && data ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Date: {data.date} | Source:{" "}
              {data.source === "scheduled" ? "Scheduled challenge" : "Recent fallback"}
            </p>
          ) : null}
        </header>

        {loading ? (
          <section className="rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            Loading challenge...
          </section>
        ) : null}

        {!loading && error ? (
          <section className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </section>
        ) : null}

        {showNotEnoughQuestionsNotice ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            Only {questionCount} question{questionCount === 1 ? "" : "s"} found. Add more
            questions in Supabase to reach a full 5-question challenge.
          </section>
        ) : null}

        {!authLoading && !user ? (
          <section className="rounded-xl border border-indigo-300 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
            Sign in to save streaks & leaderboard (optional).{" "}
            <Link className="font-semibold underline" href="/login">
              Go to login
            </Link>
            .
          </section>
        ) : null}

        {!loading && !error && data ? (
          <section className="space-y-4">
            {data.questions.map((question, index) => (
              <article
                key={question.id}
                className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Question {index + 1}
                  {question.sport ? ` | ${question.sport}` : ""}
                </p>
                <h2 className="mb-4 text-lg font-medium">{question.question_text}</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OPTION_KEYS.map((option) => {
                    const selected = answers[String(question.id)] === option;
                    return (
                      <button
                        key={`${question.id}-${option}`}
                        type="button"
                        onClick={() => selectAnswer(String(question.id), option)}
                        className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                          selected
                            ? "border-sky-500 bg-sky-100 text-sky-900 dark:border-sky-400 dark:bg-sky-900/40 dark:text-sky-100"
                            : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
                        }`}
                      >
                        <span className="font-semibold">{option}.</span>{" "}
                        {getOptionText(question, option)}
                      </button>
                    );
                  })}
                </div>
                {result ? (
                  <p className="mt-3 text-sm font-medium">
                    {resultByQuestionId.get(String(question.id))?.is_correct
                      ? "Correct"
                      : "Incorrect"}{" "}
                    {resultByQuestionId.get(String(question.id))
                      ? `(You chose ${
                          resultByQuestionId.get(String(question.id))?.chosen_option
                        })`
                      : ""}
                  </p>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}

        {!loading && !error && data && user ? (
          <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
              Answered {answeredCount}/5
            </p>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className={`w-full rounded-md px-4 py-2 text-sm font-medium ${
                canSubmit
                  ? "bg-sky-600 text-white hover:bg-sky-500"
                  : "cursor-not-allowed bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              }`}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            {!canSubmit && !result && data.questions.length === 5 ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Submit unlocks once all 5 questions are answered.
              </p>
            ) : null}
            {submitError ? (
              <p className="mt-3 text-sm text-red-700 dark:text-red-300">{submitError}</p>
            ) : null}
          </section>
        ) : null}

        {result ? (
          <section className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">Your Result</h3>
              <p className="text-sm">
                Score: {result.score}/{result.total}
              </p>
            </div>

            <div className="rounded-md border border-emerald-300 bg-white p-3 dark:border-emerald-800 dark:bg-slate-900">
              <p className="text-sm font-medium">Share</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{shareText}</p>
              <button
                type="button"
                onClick={copyShareText}
                className="mt-3 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Copy
              </button>
              {copyMessage ? (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {copyMessage}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
