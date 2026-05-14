"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import {
  formatTimer,
  getRemainingTimerMs,
} from "@/lib/challengeTimer";
import {
  clearPendingGuestAttemptClaim,
  getStoredAttemptKey,
  readPendingGuestAttemptClaim,
  shouldAutoClaimPendingGuestAttempt,
  type AnswerOption,
  type AttemptSubmitResponse,
  type DailyChallengeQuestionForPlayer,
  type DailyChallengeResponse,
  writePendingGuestAttemptClaim,
} from "@/lib/dailyChallenge";
import { formatChallengeDate } from "@/lib/date";
import {
  buildFacebookShareUrl,
  buildNativeShareData,
  buildShareMessage,
  buildShareUrl,
  buildXShareUrl,
} from "@/lib/shareLinks";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const optionKeys: AnswerOption[] = ["A", "B", "C", "D"];
type AttemptQuestionResult = AttemptSubmitResponse["attempt"]["results"][number];

function getOptionText(question: DailyChallengeQuestionForPlayer, option: AnswerOption) {
  if (option === "A") return question.option_a;
  if (option === "B") return question.option_b;
  if (option === "C") return question.option_c;
  return question.option_d;
}

function readStoredAttempt(date: string) {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(getStoredAttemptKey(date));
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as AttemptSubmitResponse;
  } catch {
    return null;
  }
}

function writeStoredAttempt(result: AttemptSubmitResponse) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.setItem(getStoredAttemptKey(result.attempt.date), JSON.stringify(result));
}

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function getShareSiteUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "https://youknoball.com";
}

export default function PlayPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [challenge, setChallenge] = useState<DailyChallengeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerOption>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptSubmitResponse | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [displayNameMessage, setDisplayNameMessage] = useState<string | null>(null);
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [claimingGuestAttempt, setClaimingGuestAttempt] = useState(false);
  const [guestClaimMessage, setGuestClaimMessage] = useState<string | null>(null);
  const [guestClaimError, setGuestClaimError] = useState<string | null>(null);
  const [claimAttemptedDate, setClaimAttemptedDate] = useState<string | null>(null);
  const [timerNowMs, setTimerNowMs] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabaseBrowser().auth.getSession();
      if (mounted) {
        setUser(data.session?.user ?? null);
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
    let mounted = true;

    async function loadChallenge() {
      try {
        setLoading(true);

        const response = await fetch("/api/challenge/today", {
          cache: "no-store",
        });
        const payload = (await response.json()) as DailyChallengeResponse;

        if (!response.ok) {
          throw new Error("Unable to load today's challenge.");
        }

        if (!mounted) {
          return;
        }

        setChallenge(payload);
        setError(null);
        setAnswers({});
        setSubmitError(null);
        setCopyMessage(null);
        setDisplayNameError(null);
        setDisplayNameMessage(null);
        setGuestClaimMessage(null);
        setGuestClaimError(null);
        setClaimAttemptedDate(null);

        const storedResult = readStoredAttempt(payload.date);
        setResult(storedResult);
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load today's challenge.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadChallenge();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (result) {
      writeStoredAttempt(result);
    }
  }, [result]);

  const readyChallenge = challenge?.status === "ready" ? challenge : null;

  useEffect(() => {
    if (!readyChallenge?.timer || result) {
      return;
    }

    setTimerNowMs(Date.now());
    const timerId = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [readyChallenge?.timer, result]);

  useEffect(() => {
    const storage = getBrowserStorage();
    const pendingClaim = readPendingGuestAttemptClaim(storage);

    if (readyChallenge && result?.saved && pendingClaim?.date === readyChallenge.date) {
      clearPendingGuestAttemptClaim(storage);
      return;
    }

    if (
      !readyChallenge ||
      !pendingClaim ||
      claimAttemptedDate === pendingClaim.date ||
      !shouldAutoClaimPendingGuestAttempt({
        userId: user?.id ?? null,
        challengeDate: readyChallenge.date,
        pendingClaim,
        hasSavedResult: Boolean(result?.saved),
        claimInFlight: claimingGuestAttempt,
      })
    ) {
      return;
    }

    let mounted = true;
    setClaimAttemptedDate(pendingClaim.date);

    async function claimGuestAttempt() {
      setClaimingGuestAttempt(true);
      setGuestClaimError(null);
      setGuestClaimMessage(null);

      try {
        const response = await fetch("/api/attempt/submit", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(pendingClaim),
        });

        const payload = (await response.json()) as
          | AttemptSubmitResponse
          | { message?: string };

        if ((!response.ok && response.status !== 409) || !("attempt" in payload)) {
          throw new Error(payload.message ?? "Unable to save your guest result.");
        }

        if (!mounted) {
          return;
        }

        clearPendingGuestAttemptClaim(storage);
        setResult(payload);
        setGuestClaimMessage("Guest result saved to your account.");
      } catch (claimError) {
        if (!mounted) {
          return;
        }

        setGuestClaimError(
          claimError instanceof Error
            ? claimError.message
            : "Unable to save your guest result.",
        );
      } finally {
        if (mounted) {
          setClaimingGuestAttempt(false);
        }
      }
    }

    void claimGuestAttempt();

    return () => {
      mounted = false;
    };
  }, [
    claimAttemptedDate,
    claimingGuestAttempt,
    readyChallenge,
    result?.saved,
    user?.id,
  ]);

  const answeredCount = useMemo(() => {
    if (!readyChallenge) {
      return 0;
    }

    return readyChallenge.questions.reduce((count, question) => {
      return answers[question.id] ? count + 1 : count;
    }, 0);
  }, [answers, readyChallenge]);

  const resultByQuestionId = useMemo(() => {
    const map = new Map<string, AttemptQuestionResult>();

    for (const item of result?.attempt.results ?? []) {
      map.set(item.question_id, item);
    }

    return map;
  }, [result]);

  const canSubmit = Boolean(
    readyChallenge &&
      answeredCount === 5 &&
      !submitting &&
      !result &&
      !loading &&
      !error,
  );

  const shareUrl = useMemo(() => buildShareUrl(getShareSiteUrl()), []);
  const shareMessage = useMemo(() => {
    if (!result?.shareText) {
      return "";
    }

    return buildShareMessage(result.shareText, shareUrl);
  }, [result?.shareText, shareUrl]);
  const xShareUrl = useMemo(() => {
    if (!result?.shareText) {
      return "";
    }

    return buildXShareUrl(result.shareText, shareUrl);
  }, [result?.shareText, shareUrl]);
  const facebookShareUrl = useMemo(() => buildFacebookShareUrl(shareUrl), [shareUrl]);
  const timerRemainingMs = readyChallenge?.timer
    ? getRemainingTimerMs(
        readyChallenge.timer.startedAt,
        new Date(timerNowMs),
        readyChallenge.timer.durationLimitMs,
      )
    : null;
  const timerDisplay = timerRemainingMs === null ? null : formatTimer(timerRemainingMs);
  const timerExpired = timerRemainingMs === 0;

  function selectAnswer(questionId: string, option: AnswerOption) {
    setAnswers((current) => ({
      ...current,
      [questionId]: option,
    }));
    setSubmitError(null);
    setCopyMessage(null);
  }

  async function submitAttempt() {
    if (!readyChallenge || !canSubmit) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setDisplayNameError(null);
    setDisplayNameMessage(null);

    try {
      const payloadAnswers: Record<string, AnswerOption> = {};
      const storage = getBrowserStorage();

      for (const question of readyChallenge.questions) {
        const selectedOption = answers[question.id];
        if (!selectedOption) {
          throw new Error("Please answer all 5 questions before submitting.");
        }

        payloadAnswers[question.id] = selectedOption;
      }

      const response = await fetch("/api/attempt/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          date: readyChallenge.date,
          answers: payloadAnswers,
        }),
      });

      const payload = (await response.json()) as
        | AttemptSubmitResponse
        | { message?: string };

      if (response.status === 409) {
        setSubmitError(payload.message ?? "You've already played today's challenge.");
        if ("attempt" in payload) {
          if (payload.saved) {
            clearPendingGuestAttemptClaim(storage);
          }
          setResult(payload);
        }
        return;
      }

      if (!response.ok || !("attempt" in payload)) {
        throw new Error(payload.message ?? "Unable to submit attempt.");
      }

      if (payload.saved) {
        clearPendingGuestAttemptClaim(storage);
      } else {
        writePendingGuestAttemptClaim(storage, {
          date: readyChallenge.date,
          answers: payloadAnswers,
        });
      }

      setResult(payload);
    } catch (submissionError) {
      setSubmitError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to submit attempt.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyShareText(successMessage = "Copied to clipboard.") {
    if (!shareMessage) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopyMessage(successMessage);
    } catch {
      setCopyMessage("Copy failed. Please copy manually.");
    }
  }

  async function shareResult() {
    if (!result?.shareText) {
      return;
    }

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(buildNativeShareData(result.shareText, shareUrl));
        setCopyMessage("Share sheet opened.");
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") {
          return;
        }
      }
    }

    await copyShareText("Copied result for sharing.");
  }

  async function saveDisplayName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!result?.saved || result.leaderboardEligible) {
      return;
    }

    setSavingDisplayName(true);
    setDisplayNameError(null);
    setDisplayNameMessage(null);

    try {
      const response = await fetch("/api/profile/display-name", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          displayName,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        leaderboardEligible?: boolean;
        displayName?: string | null;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to save display name.");
      }

      setResult((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          leaderboardEligible: Boolean(payload.leaderboardEligible),
          leaderboardStatus: payload.leaderboardEligible
            ? "eligible"
            : current.leaderboardStatus,
        };
      });
      setDisplayNameMessage(payload.message ?? "Display name saved.");
      setDisplayName(payload.displayName ?? displayName);
    } catch (saveError) {
      setDisplayNameError(
        saveError instanceof Error ? saveError.message : "Unable to save display name.",
      );
    } finally {
      setSavingDisplayName(false);
    }
  }

  return (
    <main className="px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-[2.25rem] border border-white/10 bg-white/[0.05] p-8 shadow-[0_24px_100px_rgba(0,0,0,0.45)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#ffb067]">
            Daily challenge
          </p>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-display text-5xl leading-none text-white sm:text-6xl">
                Today&apos;s run.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">
                Five all-sports questions, one score, and a shareable result card when
                you&apos;re done.
              </p>
            </div>
            {challenge ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-black/35 px-5 py-4">
                <p className="text-xs uppercase tracking-[0.25em] text-white/45">Date</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatChallengeDate(challenge.date)}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {loading ? (
          <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 text-sm text-white/70">
            Loading today&apos;s challenge...
          </section>
        ) : null}

        {!loading && error ? (
          <section className="rounded-[1.75rem] border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
            {error}
          </section>
        ) : null}

        {!loading && !error && challenge?.status === "unavailable" ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">Status</p>
            <h2 className="mt-3 font-display text-4xl leading-none text-white">
              Not live yet.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/70">
              {challenge.message}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full bg-[#ff7a18] px-5 py-3 text-sm font-semibold text-black hover:bg-[#ff8c36]"
              >
                Back to the hub
              </Link>
              <Link
                href="/leaderboard"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
              >
                View leaderboard
              </Link>
            </div>
          </section>
        ) : null}

        {!authLoading && !user ? (
          <section className="rounded-[1.75rem] border border-white/10 bg-black/35 p-5 text-sm leading-6 text-white/72">
            Play right now as a guest.{" "}
            <Link className="font-semibold text-[#ffb067] underline" href="/login">
              Sign in
            </Link>{" "}
            only if you want this score counted toward your average and the leaderboard.
          </section>
        ) : null}

        {readyChallenge ? (
          <>
            <section className="grid gap-4 lg:grid-cols-[1fr_16rem_16rem]">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                  Difficulty curve
                </p>
                <p className="mt-3 text-sm leading-6 text-white/72">
                  Questions 1 through 3 are meant to be gettable. Questions 4 and 5
                  are the heat check.
                </p>
              </div>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                  Progress
                </p>
                <p className="mt-2 font-display text-4xl text-white">{answeredCount}/5</p>
                <p className="mt-3 text-sm text-white/65">
                  {result
                    ? "This browser already has a result saved for today."
                  : "Lock in every answer before you submit."}
                </p>
              </div>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                  Timed leaderboard
                </p>
                <p className="mt-2 font-display text-4xl text-white">
                  {timerDisplay ?? "--:--"}
                </p>
                <p className="mt-3 text-sm text-white/65">
                  {readyChallenge.timer
                    ? timerExpired
                      ? "Timed leaderboard window closed."
                      : "Finish before zero to rank."
                    : "Guest runs are casual. Sign in before playing to rank."}
                </p>
              </div>
            </section>

            <section className="space-y-4">
              {readyChallenge.questions.map((question) => {
                const selectedOption = answers[question.id];
                const questionResult = resultByQuestionId.get(question.id);

                return (
                  <article
                    key={question.id}
                    className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_16px_50px_rgba(0,0,0,0.28)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ffb067]">
                          Question {question.slot}
                        </p>
                        <p className="mt-2 text-sm uppercase tracking-[0.2em] text-white/45">
                          {question.sport} · {question.difficulty === "pro" ? "Real fan" : "Accessible"}
                        </p>
                      </div>
                      {questionResult ? (
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${
                            questionResult.is_correct
                              ? "bg-emerald-500/15 text-emerald-200"
                              : "bg-red-500/15 text-red-200"
                          }`}
                        >
                          {questionResult.is_correct ? "Correct" : "Miss"}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="mt-5 text-xl font-semibold leading-8 text-white">
                      {question.question_text}
                    </h2>

                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {optionKeys.map((option) => {
                        const isSelected = selectedOption === option;
                        const isSubmittedChoice = questionResult?.chosen_option === option;
                        const isCorrectChoice = result && questionResult?.is_correct && isSubmittedChoice;

                        return (
                          <button
                            key={`${question.id}-${option}`}
                            type="button"
                            onClick={() => selectAnswer(question.id, option)}
                            disabled={Boolean(result)}
                            className={`rounded-[1.25rem] border px-4 py-4 text-left text-sm transition ${
                              isCorrectChoice
                                ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                : result && isSubmittedChoice
                                  ? "border-red-400/50 bg-red-500/10 text-red-100"
                                  : isSelected
                                    ? "border-[#ff7a18] bg-[#ff7a18]/10 text-white"
                                    : "border-white/10 bg-black/30 text-white/82 hover:border-white/25 hover:bg-black/45"
                            }`}
                          >
                            <span className="mr-2 font-semibold text-[#ffb067]">{option}</span>
                            {getOptionText(question, option)}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </section>

            {!result ? (
              <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">
                      Submit
                    </p>
                    <p className="mt-3 text-sm leading-6 text-white/70">
                      Guests can submit and share right away. Signed-in players also
                      save stats and leaderboard eligibility.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={submitAttempt}
                    disabled={!canSubmit}
                    className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
                      canSubmit
                        ? "bg-[#ff7a18] text-black hover:bg-[#ff8c36]"
                        : "cursor-not-allowed bg-white/10 text-white/35"
                    }`}
                  >
                    {submitting ? "Scoring..." : "Submit answers"}
                  </button>
                </div>
                {submitError ? (
                  <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {submitError}
                  </p>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {result ? (
          <section className="rounded-[2.25rem] border border-[#ff7a18]/30 bg-[#ff7a18]/8 p-8 shadow-[0_24px_100px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-[#ffb067]">Result</p>
                <h2 className="mt-4 font-display text-5xl leading-none text-white">
                  {result.attempt.score}/{result.attempt.total}
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/72">
                  {result.saved
                    ? "This run is saved to your account."
                    : user
                      ? "This run is still only in this browser until we finish attaching it to your account."
                      : "This run is saved in this browser only. Sign in now to attach this score to your account."}
                </p>
                {!user && !result.saved ? (
                  <Link
                    className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
                    href="/login"
                  >
                    Sign in to save this run
                  </Link>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {result.stats ? (
                  <>
                    <div className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4">
                      <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                        Average score
                      </p>
                      <p className="mt-2 font-display text-4xl text-white">
                        {result.stats.averageScore.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4">
                      <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                        Total plays
                      </p>
                      <p className="mt-2 font-display text-4xl text-white">
                        {result.stats.totalPlays}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4 sm:col-span-2">
                    <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                      Guest run
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/70">
                      Guest results are shareable, but they do not count toward saved
                      stats or leaderboard rank.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-black/35 p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-white/45">Share</p>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-7 text-white/82">
                {shareMessage}
              </pre>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={shareResult}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffede0]"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={() => void copyShareText()}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
                >
                  Copy result
                </button>
                <a
                  href={xShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
                >
                  X
                </a>
                <a
                  href={facebookShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
                >
                  Facebook
                </a>
              </div>
              {copyMessage ? (
                <p className="mt-3 text-xs uppercase tracking-[0.25em] text-white/55">
                  {copyMessage}
                </p>
              ) : null}
            </div>

            {claimingGuestAttempt ? (
              <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-black/35 p-5 text-sm leading-6 text-white/72">
                Saving this guest run to your account...
              </div>
            ) : null}

            {guestClaimMessage ? (
              <div className="mt-6 rounded-[1.75rem] border border-emerald-500/25 bg-emerald-500/10 p-5 text-sm leading-6 text-emerald-100">
                {guestClaimMessage}
              </div>
            ) : null}

            {guestClaimError ? (
              <div className="mt-6 rounded-[1.75rem] border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-200">
                {guestClaimError}
              </div>
            ) : null}

            {result.leaderboardStatus === "timed_out" ? (
              <div className="mt-6 rounded-[1.75rem] border border-[#ff7a18]/25 bg-[#ff7a18]/10 p-5 text-sm leading-6 text-[#ffd2b3]">
                Saved and shareable, but this run finished outside the timed leaderboard window.
              </div>
            ) : null}

            {result.leaderboardStatus === "timer_unavailable" ? (
              <div className="mt-6 rounded-[1.75rem] border border-[#ff7a18]/25 bg-[#ff7a18]/10 p-5 text-sm leading-6 text-[#ffd2b3]">
                Saved and shareable, but timed leaderboard eligibility could not be verified for this run.
              </div>
            ) : null}

            {result.leaderboardStatus === "casual" ? (
              <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-black/35 p-5 text-sm leading-6 text-white/72">
                Guest runs are casual. Sign in before playing to rank on the timed leaderboard.
              </div>
            ) : null}

            {result.saved && result.leaderboardStatus === "needs_display_name" ? (
              <form
                onSubmit={saveDisplayName}
                className="mt-6 rounded-[1.75rem] border border-white/10 bg-black/35 p-5"
              >
                <p className="text-xs uppercase tracking-[0.25em] text-[#ffb067]">
                  Leaderboard name
                </p>
                <h3 className="mt-3 font-display text-3xl text-white">
                  Claim your public name.
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
                  Your score is saved, but you will not appear on the leaderboard until
                  you pick a display name.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Pick a display name"
                    className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff7a18]"
                  />
                  <button
                    type="submit"
                    disabled={savingDisplayName}
                    className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                      savingDisplayName
                        ? "cursor-not-allowed bg-white/10 text-white/35"
                        : "bg-[#ff7a18] text-black hover:bg-[#ff8c36]"
                    }`}
                  >
                    {savingDisplayName ? "Saving..." : "Save name"}
                  </button>
                </div>
                {displayNameError ? (
                  <p className="mt-4 text-sm text-red-200">{displayNameError}</p>
                ) : null}
                {displayNameMessage ? (
                  <p className="mt-4 text-sm text-emerald-200">{displayNameMessage}</p>
                ) : null}
              </form>
            ) : null}

            {result.saved && result.leaderboardStatus === "eligible" ? (
              <div className="mt-6 rounded-[1.75rem] border border-emerald-500/25 bg-emerald-500/10 p-5 text-sm leading-6 text-emerald-100">
                This score is eligible for the leaderboard.
                <Link className="ml-2 font-semibold underline" href="/leaderboard">
                  See the board
                </Link>
                .
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
