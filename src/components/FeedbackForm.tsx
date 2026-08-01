"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import {
  FEEDBACK_TYPES,
  MAX_FEEDBACK_EMAIL_LENGTH,
  MAX_FEEDBACK_MESSAGE_LENGTH,
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

function limitCodePoints(value: string, maxCodePoints: number) {
  return Array.from(value).slice(0, maxCodePoints).join("");
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
  const [submitting, setSubmitting] = useState(false);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setStatus(null);
    setError(null);

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
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to send feedback.");
      }

      setFeedbackType("general");
      setMessage("");
      setContactEmail("");
      setWebsite("");
      setStatus(
        payload.message ?? "Thanks for helping us make You Kno Ball better.",
      );
    } catch (feedbackError) {
      setError(
        feedbackError instanceof Error
          ? feedbackError.message
          : "Unable to send feedback.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submitFeedback}
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
            className="text-xs tabular-nums text-white/45"
          >
            {Array.from(message).length}/{MAX_FEEDBACK_MESSAGE_LENGTH}
          </span>
        </div>
        <textarea
          id={`${formId}-message`}
          value={message}
          onChange={(event) =>
            setMessage(limitCodePoints(event.target.value, MAX_FEEDBACK_MESSAGE_LENGTH))
          }
          required
          rows={7}
          aria-describedby={`${formId}-message-count`}
          className="mt-2 block min-h-40 w-full resize-y rounded-lg border border-white/15 bg-black px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus-visible:border-[#ff7a18] focus-visible:ring-2 focus-visible:ring-[#ff7a18]/35"
          placeholder="What should we know?"
        />
      </div>

      <div className="mt-5">
        <label
          htmlFor={`${formId}-email`}
          className="text-sm font-semibold text-white"
        >
          Contact email <span className="font-normal text-white/45">(optional)</span>
        </label>
        <input
          id={`${formId}-email`}
          type="email"
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          maxLength={MAX_FEEDBACK_EMAIL_LENGTH}
          autoComplete="email"
          inputMode="email"
          className="mt-2 block w-full rounded-lg border border-white/15 bg-black px-3 py-3 text-sm text-white outline-none placeholder:text-white/30 focus-visible:border-[#ff7a18] focus-visible:ring-2 focus-visible:ring-[#ff7a18]/35"
          placeholder="you@example.com"
        />
      </div>

      <div
        aria-hidden="true"
        className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor={`${formId}-website`}>Website</label>
        <input
          id={`${formId}-website`}
          name="website"
          type="text"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
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
