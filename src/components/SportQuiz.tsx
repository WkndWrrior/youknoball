"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AnswerOption, SubmittedAnswers } from "@/lib/dailyChallenge";
import {
  MAX_SPORT_QUIZ_RECENT_QUESTION_IDS,
  SPORT_QUIZ_QUESTION_COUNT,
  parseSportQuizRecentQuestionIds,
  type SportQuizPlayerQuestion,
  type SportQuizReadyResponse,
  type SportQuizStartResponse,
  type SportQuizSubmitResponse,
} from "@/lib/sportQuiz";

const optionKeys: AnswerOption[] = ["A", "B", "C", "D"];
const SPORT_QUIZ_HISTORY_KEY_PREFIX = "ykb_sport_quiz_recent";

type QuizViewState =
  | "loading"
  | "unavailable"
  | "playing"
  | "submitting"
  | "results"
  | "error";

type ErrorAction = "load" | "submit";

type SportQuizProps = {
  slug: string;
  title: string;
};

function getHistoryKey(slug: string) {
  return `${SPORT_QUIZ_HISTORY_KEY_PREFIX}:${slug}`;
}

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readRecentQuestionIds(slug: string) {
  const storage = getBrowserStorage();
  if (!storage) {
    return [];
  }

  try {
    return parseSportQuizRecentQuestionIds(
      JSON.parse(storage.getItem(getHistoryKey(slug)) ?? "[]"),
    );
  } catch {
    return [];
  }
}

export function promoteRecentQuestionIds(
  existingQuestionIds: readonly string[],
  completedQuestionIds: readonly string[],
) {
  const completedIds = parseSportQuizRecentQuestionIds(completedQuestionIds);
  const completedIdSet = new Set(completedIds);
  const retainedIds = parseSportQuizRecentQuestionIds(existingQuestionIds).filter(
    (questionId) => !completedIdSet.has(questionId),
  );

  return [...retainedIds, ...completedIds].slice(
    -MAX_SPORT_QUIZ_RECENT_QUESTION_IDS,
  );
}

function rememberCompletedQuestions(slug: string, questionIds: string[]) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  const recentQuestionIds = promoteRecentQuestionIds(
    readRecentQuestionIds(slug),
    questionIds,
  );

  storage.setItem(getHistoryKey(slug), JSON.stringify(recentQuestionIds));
}

function getOptionText(question: SportQuizPlayerQuestion, option: AnswerOption) {
  if (option === "A") return question.option_a;
  if (option === "B") return question.option_b;
  if (option === "C") return question.option_c;
  return question.option_d;
}

function getResponseMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

export function SportQuiz({ slug, title }: SportQuizProps) {
  const [viewState, setViewState] = useState<QuizViewState>("loading");
  const [quiz, setQuiz] = useState<SportQuizReadyResponse | null>(null);
  const [answers, setAnswers] = useState<SubmittedAnswers>({});
  const [result, setResult] = useState<SportQuizSubmitResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<ErrorAction>("load");

  const loadQuiz = useCallback(async () => {
    setViewState("loading");
    setQuiz(null);
    setAnswers({});
    setResult(null);
    setMessage(null);
    setErrorAction("load");

    try {
      const recentQuestionIds = readRecentQuestionIds(slug);
      const response = await fetch(`/api/sport-quiz/${slug}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ recentQuestionIds }),
      });
      const payload = (await response.json()) as SportQuizStartResponse | {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(getResponseMessage(payload, "Unable to load this quiz."));
      }

      if (!("status" in payload) || payload.status === "unavailable") {
        setMessage(
          getResponseMessage(payload, `${title} questions are unavailable right now.`),
        );
        setViewState("unavailable");
        return;
      }

      if (
        payload.status !== "ready" ||
        payload.questions.length !== SPORT_QUIZ_QUESTION_COUNT
      ) {
        throw new Error("This quiz does not have a complete five-question run.");
      }

      setQuiz(payload);
      setViewState("playing");
    } catch (loadError) {
      setMessage(
        loadError instanceof Error ? loadError.message : "Unable to load this quiz.",
      );
      setViewState("error");
    }
  }, [slug, title]);

  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  const answeredCount = useMemo(() => {
    if (!quiz) {
      return 0;
    }

    return quiz.questions.filter((question) => answers[question.id]).length;
  }, [answers, quiz]);

  const resultByQuestionId = useMemo(() => {
    return new Map(
      result?.results.map((questionResult) => [
        questionResult.question_id,
        questionResult,
      ]) ?? [],
    );
  }, [result]);

  const canSubmit =
    viewState === "playing" &&
    answeredCount === SPORT_QUIZ_QUESTION_COUNT &&
    Boolean(quiz);

  function selectAnswer(questionId: string, option: AnswerOption) {
    if (viewState !== "playing") {
      return;
    }

    setAnswers((current) => ({
      ...current,
      [questionId]: option,
    }));
    setMessage(null);
  }

  async function submitQuiz() {
    if (!quiz || answeredCount !== SPORT_QUIZ_QUESTION_COUNT) {
      setMessage("Please answer all 5 questions before submitting.");
      return;
    }

    setViewState("submitting");
    setMessage(null);
    setErrorAction("submit");

    try {
      const payloadAnswers: SubmittedAnswers = {};
      for (const question of quiz.questions) {
        const answer = answers[question.id];
        if (!answer) {
          throw new Error("Please answer all 5 questions before submitting.");
        }
        payloadAnswers[question.id] = answer;
      }

      const response = await fetch(`/api/sport-quiz/${slug}/submit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ answers: payloadAnswers }),
      });
      const payload = (await response.json()) as SportQuizSubmitResponse | {
        message?: string;
      };

      if (
        !response.ok ||
        !("results" in payload) ||
        payload.results.length !== SPORT_QUIZ_QUESTION_COUNT
      ) {
        throw new Error(getResponseMessage(payload, "Unable to score this quiz."));
      }

      rememberCompletedQuestions(
        slug,
        quiz.questions.map((question) => question.id),
      );
      setResult(payload);
      setViewState("results");
    } catch (submitError) {
      setMessage(
        submitError instanceof Error ? submitError.message : "Unable to score this quiz.",
      );
      setViewState("error");
    }
  }

  function retry() {
    if (errorAction === "submit" && quiz) {
      void submitQuiz();
      return;
    }

    void loadQuiz();
  }

  const showQuestions =
    Boolean(quiz) &&
    (viewState === "playing" ||
      viewState === "submitting" ||
      viewState === "results" ||
      (viewState === "error" && errorAction === "submit"));

  return (
    <section className="w-full" aria-label={`${title} quiz`}>
      {viewState === "loading" ? (
        <div
          className="min-h-40 border-y border-white/10 bg-white/[0.04] px-5 py-10 text-center"
          aria-live="polite"
        >
          <p className="text-sm text-white/70">Loading your {title} run...</p>
        </div>
      ) : null}

      {viewState === "unavailable" ? (
        <div className="border-y border-white/10 bg-white/[0.04] px-5 py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ffb067]">
            Not available yet
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{message}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void loadQuiz()}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#ff7a18] px-6 py-3 text-sm font-semibold text-black hover:bg-[#ff8c36]"
            >
              Try Again
            </button>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
            >
              Back to categories
            </Link>
          </div>
        </div>
      ) : null}

      {viewState === "error" ? (
        <div
          className="mb-5 border-y border-red-500/30 bg-red-500/10 px-5 py-5"
          role="alert"
        >
          <p className="text-sm leading-6 text-red-100">{message}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full border border-red-200/30 px-6 py-3 text-sm font-semibold text-red-50 hover:bg-red-500/10"
          >
            Try Again
          </button>
        </div>
      ) : null}

      {showQuestions && quiz ? (
        <>
          <div className="mb-5 flex flex-col gap-3 border-y border-white/10 bg-white/[0.035] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ffb067]">
                Five-question run
              </p>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Pick one answer for every question.
              </p>
            </div>
            <p className="font-display text-3xl text-white" aria-live="polite">
              {answeredCount}/{SPORT_QUIZ_QUESTION_COUNT}
            </p>
          </div>

          <div className="space-y-4">
            {quiz.questions.map((question) => {
              const selectedOption = answers[question.id];
              const questionResult = resultByQuestionId.get(question.id);

              return (
                <fieldset
                  key={question.id}
                  className="min-w-0 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.24)] sm:p-6"
                >
                  <legend className="w-full px-0">
                    <span className="block text-xs font-semibold uppercase tracking-[0.25em] text-[#ffb067]">
                      Question {question.slot} · {question.difficulty}
                    </span>
                    <span className="mt-3 block break-words text-lg font-semibold leading-7 text-white sm:text-xl sm:leading-8">
                      {question.question_text}
                    </span>
                  </legend>

                  <div className="mt-4 min-h-6">
                    <p
                      aria-hidden={!questionResult}
                      className={`block min-h-6 break-words text-xs font-semibold uppercase tracking-[0.25em] ${
                        questionResult
                          ? questionResult.is_correct
                            ? "text-emerald-200"
                            : "text-red-200"
                          : "invisible"
                      }`}
                    >
                      {questionResult
                        ? `${
                            questionResult.is_correct ? "Correct" : "Miss"
                          } · Your answer: ${questionResult.chosen_option}`
                        : "Answer feedback"}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {optionKeys.map((option) => {
                      const isSelected = selectedOption === option;
                      const isSubmittedChoice =
                        questionResult?.chosen_option === option;

                      return (
                        <button
                          key={`${question.id}-${option}`}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => selectAnswer(question.id, option)}
                          disabled={viewState !== "playing"}
                          className={`min-h-14 min-w-0 rounded-[1rem] border px-4 py-4 text-left text-sm leading-6 ${
                            questionResult && isSubmittedChoice
                              ? questionResult.is_correct
                                ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                : "border-red-400/50 bg-red-500/10 text-red-100"
                              : isSelected
                                ? "border-[#ff7a18] bg-[#ff7a18]/10 text-white"
                                : "border-white/10 bg-black/30 text-white/82 hover:border-white/25 hover:bg-black/45"
                          }`}
                        >
                          <span className="mr-2 font-semibold text-[#ffb067]">
                            {option}
                          </span>
                          <span className="break-words">
                            {getOptionText(question, option)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </>
      ) : null}

      {quiz && (viewState === "playing" || viewState === "submitting") ? (
        <div className="mt-5 flex flex-col gap-4 border-y border-white/10 bg-white/[0.04] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-white/65">
            {answeredCount === SPORT_QUIZ_QUESTION_COUNT
              ? "All five are locked in."
              : `Answer ${SPORT_QUIZ_QUESTION_COUNT - answeredCount} more to submit.`}
          </p>
          <button
            type="button"
            onClick={() => void submitQuiz()}
            disabled={!canSubmit}
            className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-sm font-semibold ${
              canSubmit
                ? "bg-[#ff7a18] text-black hover:bg-[#ff8c36]"
                : "cursor-not-allowed bg-white/10 text-white/35"
            }`}
          >
            {viewState === "submitting" ? "Scoring..." : "Submit Answers"}
          </button>
        </div>
      ) : null}

      {viewState === "results" && result ? (
        <div className="mt-5 border-y border-[#ff7a18]/30 bg-[#ff7a18]/8 px-5 py-7 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ffb067]">
            Final score
          </p>
          <p className="mt-3 font-display text-5xl leading-none text-white">
            {result.score}/{result.total}
          </p>
          <p className="mt-3 text-sm leading-6 text-white/65">
            {result.saved
              ? "This run was saved to your account."
              : "This guest run was not saved to an account."}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void loadQuiz()}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#ff7a18] px-6 py-3 text-sm font-semibold text-black hover:bg-[#ff8c36]"
            >
              Play Again
            </button>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
            >
              Back to categories
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
