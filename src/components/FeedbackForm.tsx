"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import {
  FEEDBACK_TYPES,
  MAX_FEEDBACK_EMAIL_LENGTH,
  MAX_FEEDBACK_MESSAGE_LENGTH,
  isValidFeedbackContactEmail,
  type FeedbackType,
} from "@/lib/feedback";

type FeedbackFormProps = {
  sourcePath: string | null;
};

const feedbackTypeLabels: Record<FeedbackType, string> = {
  general: "General",
  bug: "Bug",
  idea: "Idea",
};

const defaultSuccessMessage =
  "Thanks for helping us make You Kno Ball better.";
const genericErrorMessage = "Unable to send feedback.";

function limitCodePoints(value: string, maxCodePoints: number) {
  return Array.from(value).slice(0, maxCodePoints).join("");
}

async function readResponseMessage(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as unknown;
    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      "message" in payload &&
      typeof payload.message === "string" &&
      payload.message.trim()
    ) {
      return payload.message;
    }
  } catch {
    return null;
  }

  return null;
}

export function FeedbackForm({ sourcePath }: FeedbackFormProps) {
  const formId = useId();
  const submittingRef = useRef(false);
  const [feedbackType, setFeedbackType] =
    useState<FeedbackType>("general");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [contactEmailError, setContactEmailError] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    setStatus(null);
    setError(null);

    const nextMessageError = message.trim() ? null : "Enter a message.";
    const trimmedContactEmail = contactEmail.trim();
    const nextContactEmailError =
      trimmedContactEmail &&
      !isValidFeedbackContactEmail(trimmedContactEmail)
        ? "Enter a valid email address."
        : null;

    setMessageError(nextMessageError);
    setContactEmailError(nextContactEmailError);
    if (nextMessageError || nextContactEmailError) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          feedbackType,
          message,
          contactEmail,
          website,
          sourcePath,
        }),
      });

      if (!response.ok) {
        const responseMessage = await readResponseMessage(response);
        throw new Error(responseMessage ?? genericErrorMessage);
      }

      const responseMessage = await readResponseMessage(response);
      setFeedbackType("general");
      setMessage("");
      setContactEmail("");
      setWebsite("");
      setMessageError(null);
      setContactEmailError(null);
      setStatus(responseMessage ?? defaultSuccessMessage);
    } catch (feedbackError) {
      setError(
        feedbackError instanceof Error
          ? feedbackError.message
          : genericErrorMessage,
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submitFeedback}
      noValidate
      aria-busy={submitting}
      aria-label="Feedback form"
      className="w-full rounded-lg border border-white/10 bg-black/70 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)] sm:p-5"
    >
      <fieldset>
        <legend className="text-xs font-semibold uppercase text-white/60">
          Feedback type
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1">
          {FEEDBACK_TYPES.map((feedbackTypeOption) => (
            <label
              key={feedbackTypeOption}
              className="relative min-w-0 cursor-pointer text-center"
            >
              <input
                type="radio"
                name="feedbackType"
                value={feedbackTypeOption}
                checked={feedbackType === feedbackTypeOption}
                onChange={() => setFeedbackType(feedbackTypeOption)}
                disabled={submitting}
                className="peer sr-only"
              />
              <span className="block rounded-md px-2 py-2 text-xs font-semibold text-white/60 transition peer-checked:bg-[#ff7a18] peer-checked:text-black peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[#ffb067] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black sm:text-sm">
                {feedbackTypeLabels[feedbackTypeOption]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <label
            htmlFor={`${formId}-message`}
            className="text-sm font-semibold text-white"
          >
            Message
          </label>
          <span
            id={`${formId}-message-count`}
            className="text-xs tabular-nums text-white/60"
          >
            {Array.from(message).length}/{MAX_FEEDBACK_MESSAGE_LENGTH}
          </span>
        </div>
        <textarea
          id={`${formId}-message`}
          value={message}
          onChange={(event) => {
            setMessage(
              limitCodePoints(
                event.target.value,
                MAX_FEEDBACK_MESSAGE_LENGTH,
              ),
            );
            setMessageError(null);
          }}
          disabled={submitting}
          required
          rows={7}
          aria-invalid={messageError ? true : undefined}
          aria-describedby={`${formId}-message-count${
            messageError ? ` ${formId}-message-error` : ""
          }`}
          className="mt-2 block min-h-40 w-full resize-y rounded-lg border border-white/15 bg-black px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/50 focus-visible:border-[#ff7a18] focus-visible:ring-2 focus-visible:ring-[#ff7a18]/35"
          placeholder="What should we know?"
        />
        {messageError ? (
          <p
            id={`${formId}-message-error`}
            className="mt-2 text-sm leading-5 text-red-200"
            role="alert"
          >
            {messageError}
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        <label
          htmlFor={`${formId}-email`}
          className="text-sm font-semibold text-white"
        >
          Contact email{" "}
          <span className="font-normal text-white/70">(optional)</span>
        </label>
        <input
          id={`${formId}-email`}
          type="email"
          value={contactEmail}
          onChange={(event) => {
            setContactEmail(
              limitCodePoints(event.target.value, MAX_FEEDBACK_EMAIL_LENGTH),
            );
            setContactEmailError(null);
          }}
          disabled={submitting}
          autoComplete="email"
          inputMode="email"
          aria-invalid={contactEmailError ? true : undefined}
          aria-describedby={
            contactEmailError ? `${formId}-email-error` : undefined
          }
          className="mt-2 block w-full rounded-lg border border-white/15 bg-black px-3 py-3 text-sm text-white outline-none placeholder:text-white/50 focus-visible:border-[#ff7a18] focus-visible:ring-2 focus-visible:ring-[#ff7a18]/35"
          placeholder="you@example.com"
        />
        {contactEmailError ? (
          <p
            id={`${formId}-email-error`}
            className="mt-2 text-sm leading-5 text-red-200"
            role="alert"
          >
            {contactEmailError}
          </p>
        ) : null}
      </div>

      <div
        aria-hidden="true"
        className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor={`${formId}-website`}>Website</label>
        <input
          id={`${formId}-website`}
          name="feedback_check_7f3c"
          type="text"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          disabled={submitting}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#ff7a18] px-5 py-3 text-sm font-bold text-black hover:bg-[#ff8c36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb067] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 sm:w-auto"
      >
        {submitting ? "Sending..." : "Send feedback"}
      </button>

      {status ? (
        <p className="mt-4 text-sm leading-6 text-emerald-200" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm leading-6 text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
