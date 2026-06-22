"use client";

import { useId, useState, type FormEvent } from "react";

import type {
  QuestionReportContext,
  QuestionReportReason,
} from "@/lib/questionReports";

type QuestionReportButtonProps = {
  questionId: string;
  context: QuestionReportContext;
  className?: string;
};

const reasonOptions: Array<{
  value: QuestionReportReason;
  label: string;
}> = [
  { value: "wrong_answer", label: "Answer looks wrong" },
  { value: "unclear_question", label: "Question is unclear" },
  { value: "typo", label: "Typo or wording issue" },
  { value: "other", label: "Something else" },
];

export function QuestionReportButton({
  questionId,
  context,
  className = "",
}: QuestionReportButtonProps) {
  const formId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<QuestionReportReason>("wrong_answer");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/question-reports", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          questionId,
          context,
          reason,
          note,
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to report this question.");
      }

      setMessage(payload.message ?? "Thanks. We'll review this question.");
      setNote("");
      setIsOpen(false);
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : "Unable to report this question.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          setError(null);
          setMessage(null);
        }}
        className="inline-flex min-h-9 items-center justify-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 transition hover:border-[#ff7a18]/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]"
        aria-expanded={isOpen}
        aria-controls={`${formId}-panel`}
      >
        Report issue
      </button>

      {isOpen ? (
        <form
          id={`${formId}-panel`}
          onSubmit={submitReport}
          className="mt-3 min-w-0 rounded-[1rem] border border-white/10 bg-black/45 p-3"
        >
          <label
            htmlFor={`${formId}-reason`}
            className="block text-xs font-semibold uppercase tracking-[0.2em] text-white/45"
          >
            Issue
          </label>
          <select
            id={`${formId}-reason`}
            value={reason}
            onChange={(event) =>
              setReason(event.target.value as QuestionReportReason)
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#ff7a18]"
          >
            {reasonOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label
            htmlFor={`${formId}-note`}
            className="mt-3 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45"
          >
            Note
          </label>
          <textarea
            id={`${formId}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Optional detail"
            className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[#ff7a18]"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                submitting
                  ? "cursor-not-allowed bg-white/10 text-white/35"
                  : "bg-[#ff7a18] text-black hover:bg-[#ff8c36]"
              }`}
            >
              {submitting ? "Sending..." : "Send report"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/65 hover:border-white/25 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {message ? (
        <p className="mt-2 text-xs leading-5 text-emerald-200" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs leading-5 text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
