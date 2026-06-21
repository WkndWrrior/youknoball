"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AnswerOption, SubmittedAnswers } from "@/lib/dailyChallenge";
import {
  MAX_SPORT_QUIZ_RECENT_QUESTION_IDS,
  SPORT_QUIZ_QUESTION_COUNT,
  parseSportQuizRecentQuestionIds,
  parseSportQuizSubmissionId,
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

type SportQuizHistoryStorage = Pick<Storage, "getItem" | "setItem">;
type RandomUuidGenerator = (() => string) | null;
type RandomValuesGenerator = ((bytes: Uint8Array) => Uint8Array) | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAnswerOption(value: unknown): value is AnswerOption {
  return (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D"
  );
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function createSubmissionIdFromRandomValues(
  getRandomValues: (bytes: Uint8Array) => Uint8Array,
) {
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function createSportQuizSubmissionId(
  randomUUID?: RandomUuidGenerator,
  getRandomValues?: RandomValuesGenerator,
) {
  const generator =
    randomUUID === undefined
      ? (typeof globalThis.crypto !== "undefined" &&
          typeof globalThis.crypto.randomUUID === "function"
          ? () => globalThis.crypto.randomUUID()
          : null)
      : randomUUID;

  try {
    if (generator) {
      return parseSportQuizSubmissionId(generator());
    }
  } catch {
    return null;
  }

  const randomValuesGenerator =
    getRandomValues === undefined
      ? (typeof globalThis.crypto !== "undefined" &&
          typeof globalThis.crypto.getRandomValues === "function"
          ? (bytes: Uint8Array) => globalThis.crypto.getRandomValues(bytes)
          : null)
      : getRandomValues;

  if (!randomValuesGenerator) {
    return null;
  }

  try {
    return parseSportQuizSubmissionId(
      createSubmissionIdFromRandomValues(randomValuesGenerator),
    );
  } catch {
    return null;
  }
}

function getHistoryKey(slug: string) {
  return `${SPORT_QUIZ_HISTORY_KEY_PREFIX}:${slug}`;
}

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRecentQuestionIdsFromStorage(
  storage: SportQuizHistoryStorage | null,
  slug: string,
) {
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

function readRecentQuestionIds(slug: string) {
  return readRecentQuestionIdsFromStorage(getBrowserStorage(), slug);
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

export function writeSportQuizHistory(
  storage: SportQuizHistoryStorage | null,
  slug: string,
  questionIds: readonly string[],
) {
  if (!storage) {
    return false;
  }

  try {
    const recentQuestionIds = promoteRecentQuestionIds(
      readRecentQuestionIdsFromStorage(storage, slug),
      questionIds,
    );

    storage.setItem(getHistoryKey(slug), JSON.stringify(recentQuestionIds));
    return true;
  } catch {
    return false;
  }
}

export function parseSportQuizSubmitResponse(
  raw: unknown,
  expectedQuestionIds: readonly string[],
): SportQuizSubmitResponse | null {
  if (
    !isRecord(raw) ||
    typeof raw.saved !== "boolean" ||
    typeof raw.score !== "number" ||
    !Number.isInteger(raw.score) ||
    raw.score < 0 ||
    raw.score > SPORT_QUIZ_QUESTION_COUNT ||
    raw.total !== SPORT_QUIZ_QUESTION_COUNT ||
    !Array.isArray(raw.results) ||
    raw.results.length !== SPORT_QUIZ_QUESTION_COUNT
  ) {
    return null;
  }

  const expectedIds = new Set(expectedQuestionIds);
  if (expectedIds.size !== SPORT_QUIZ_QUESTION_COUNT) {
    return null;
  }

  const seenIds = new Set<string>();
  const results: SportQuizSubmitResponse["results"] = [];

  for (const rawResult of raw.results) {
    if (
      !isRecord(rawResult) ||
      typeof rawResult.question_id !== "string" ||
      !expectedIds.has(rawResult.question_id) ||
      seenIds.has(rawResult.question_id) ||
      !isAnswerOption(rawResult.chosen_option) ||
      typeof rawResult.is_correct !== "boolean"
    ) {
      return null;
    }

    seenIds.add(rawResult.question_id);
    results.push({
      question_id: rawResult.question_id,
      chosen_option: rawResult.chosen_option,
      is_correct: rawResult.is_correct,
    });
  }

  if (
    seenIds.size !== expectedIds.size ||
    results.filter((result) => result.is_correct).length !== raw.score
  ) {
    return null;
  }

  return {
    saved: raw.saved,
    score: raw.score,
    total: SPORT_QUIZ_QUESTION_COUNT,
    results,
  };
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
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<ErrorAction>("load");
  const requestIdRef = useRef(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const submitControllerRef = useRef<AbortController | null>(null);
  const resultSummaryRef = useRef<HTMLDivElement | null>(null);

  const loadQuiz = useCallback(async () => {
    loadControllerRef.current?.abort();
    submitControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    loadControllerRef.current = controller;

    setViewState("loading");
    setQuiz(null);
    setAnswers({});
    setResult(null);
    setSubmissionId(null);
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
        signal: controller.signal,
      });
      const payload = (await response.json()) as SportQuizStartResponse | {
        message?: string;
      };

      if (requestId !== requestIdRef.current) {
        return;
      }

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

      const nextSubmissionId = createSportQuizSubmissionId();
      if (!nextSubmissionId) {
        throw new Error("Unable to start this quiz.");
      }

      setSubmissionId(nextSubmissionId);
      setQuiz(payload);
      setViewState("playing");
    } catch (loadError) {
      if (isAbortError(loadError) || requestId !== requestIdRef.current) {
        return;
      }

      setMessage(
        loadError instanceof Error ? loadError.message : "Unable to load this quiz.",
      );
      setViewState("error");
    } finally {
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
      }
    }
  }, [slug, title]);

  useEffect(() => {
    void loadQuiz();

    return () => {
      requestIdRef.current += 1;
      loadControllerRef.current?.abort();
      submitControllerRef.current?.abort();
    };
  }, [loadQuiz]);

  useEffect(() => {
    if (viewState === "results" && result) {
      resultSummaryRef.current?.focus();
    }
  }, [result, viewState]);

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
    Boolean(quiz) &&
    Boolean(submissionId);

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
    if (!quiz || !submissionId || answeredCount !== SPORT_QUIZ_QUESTION_COUNT) {
      setMessage("Please answer all 5 questions before submitting.");
      return;
    }

    setViewState("submitting");
    setMessage(null);
    setErrorAction("submit");

    loadControllerRef.current?.abort();
    submitControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    submitControllerRef.current = controller;
    let completedResult: SportQuizSubmitResponse | null = null;

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
        body: JSON.stringify({ answers: payloadAnswers, submissionId }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as unknown;

      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(getResponseMessage(payload, "Unable to score this quiz."));
      }

      completedResult = parseSportQuizSubmitResponse(
        payload,
        quiz.questions.map((question) => question.id),
      );
      if (!completedResult) {
        throw new Error("Unable to score this quiz.");
      }
    } catch (submitError) {
      if (isAbortError(submitError) || requestId !== requestIdRef.current) {
        return;
      }

      setMessage(
        submitError instanceof Error ? submitError.message : "Unable to score this quiz.",
      );
      setViewState("error");
      return;
    } finally {
      if (submitControllerRef.current === controller) {
        submitControllerRef.current = null;
      }
    }

    if (!completedResult || requestId !== requestIdRef.current) {
      return;
    }

    setResult(completedResult);
    setViewState("results");
    writeSportQuizHistory(
      getBrowserStorage(),
      slug,
      quiz.questions.map((question) => question.id),
    );
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
              href="/categories"
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
                  <legend className="sr-only">
                    Question {question.slot} · {question.difficulty}:{" "}
                    {question.question_text}
                  </legend>

                  <div className="mb-4 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#ffb067]">
                      Question {question.slot} · {question.difficulty}
                    </p>
                    <h2 className="mt-3 break-words text-lg font-semibold leading-7 text-white sm:text-xl sm:leading-8">
                      {question.question_text}
                    </h2>
                  </div>

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
                        <label
                          key={`${question.id}-${option}`}
                          className={`flex min-h-14 min-w-0 cursor-pointer items-center rounded-[1rem] border px-4 py-4 text-left text-sm leading-6 focus-within:ring-2 focus-within:ring-[#ff7a18] ${
                            questionResult && isSubmittedChoice
                              ? questionResult.is_correct
                                ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                : "border-red-400/50 bg-red-500/10 text-red-100"
                              : isSelected
                                ? "border-[#ff7a18] bg-[#ff7a18]/10 text-white"
                                : "border-white/10 bg-black/30 text-white/82 hover:border-white/25 hover:bg-black/45"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`sport-quiz-${slug}-${question.id}`}
                            value={option}
                            checked={isSelected}
                            onChange={() => selectAnswer(question.id, option)}
                            disabled={viewState !== "playing"}
                            className="sr-only"
                          />
                          <span className="mr-2 font-semibold text-[#ffb067]">
                            {option}
                          </span>
                          <span className="break-words">
                            {getOptionText(question, option)}
                          </span>
                        </label>
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
        <div
          ref={resultSummaryRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="mt-5 border-y border-[#ff7a18]/30 bg-[#ff7a18]/8 px-5 py-7 outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18] sm:px-6"
        >
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
              href="/categories"
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
