"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AnswerOption = "A" | "B" | "C" | "D";

interface CorrectionDetails {
  explanation: string | null;
  conflicts: string[];
  evidence: Array<{ title: string; url: string }>;
  estimatedCostMicrodollars: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function publicCorrectionDetails(value: unknown): CorrectionDetails | null {
  if (!isRecord(value)) return null;
  const finding = isRecord(value.finding) ? value.finding : null;
  const explanation =
    finding && typeof finding.explanation === "string"
      ? finding.explanation
      : null;
  const conflicts =
    finding && Array.isArray(finding.conflicts)
      ? finding.conflicts.filter(
          (conflict): conflict is string => typeof conflict === "string",
        )
      : [];
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.flatMap((item) => {
        if (
          !isRecord(item) ||
          typeof item.title !== "string" ||
          typeof item.url !== "string"
        ) {
          return [];
        }
        const url = safeEvidenceUrl(item.url);
        return url ? [{ title: item.title, url }] : [];
      })
    : [];
  const estimatedCostMicrodollars =
    typeof value.estimatedCostMicrodollars === "number" &&
    Number.isFinite(value.estimatedCostMicrodollars) &&
    value.estimatedCostMicrodollars >= 0
      ? value.estimatedCostMicrodollars
      : null;

  if (
    explanation === null &&
    conflicts.length === 0 &&
    evidence.length === 0 &&
    estimatedCostMicrodollars === null
  ) {
    return null;
  }
  return { explanation, conflicts, evidence, estimatedCostMicrodollars };
}

export default function DailyReviewActions({
  date,
  reviewItemId,
  replacementQuestionId,
  correctOption,
  options,
}: {
  date: string;
  reviewItemId: string;
  replacementQuestionId: string | null;
  correctOption: AnswerOption;
  options: Record<AnswerOption, string>;
}) {
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState<AnswerOption>(correctOption);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<CorrectionDetails | null>(null);

  async function resolve(action: "keep" | "replace") {
    const label = action === "keep" ? "keep this question" : "apply the verified replacement";
    if (!window.confirm(`Confirm: ${label}?`)) return;
    setPending(true);
    setError(null);
    setDetails(null);
    try {
      const response = await fetch(
        `/api/admin/daily-review/${encodeURIComponent(date)}/resolve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            reviewItemId,
            replacementQuestionId: action === "replace" ? replacementQuestionId : null,
          }),
        },
      );
      if (!response.ok) throw new Error("Unable to update this review item.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this review item.");
    } finally {
      setPending(false);
    }
  }

  async function verifyAndApply() {
    if (selectedOption === correctOption) return;
    setPending(true);
    setError(null);
    setDetails(null);
    try {
      const response = await fetch(
        `/api/admin/daily-review/${encodeURIComponent(date)}/correct-answer`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reviewItemId,
            newCorrectOption: selectedOption,
          }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const outcome = isRecord(payload) && typeof payload.outcome === "string"
        ? payload.outcome
        : null;
      const nextDetails = publicCorrectionDetails(payload);
      setDetails(nextDetails);

      if (response.ok && outcome === "applied") {
        router.refresh();
        return;
      }
      if (response.ok && outcome === "verification_rejected") {
        setError("Answer not changed. Verification did not pass.");
        return;
      }
      if (response.status === 409) {
        setError("This review item can no longer be changed.");
        return;
      }
      if (response.status === 502) {
        setError("Verification is temporarily unavailable. Try again.");
        return;
      }
      if (outcome === "persistence_failed") {
        setError("The verified answer could not be saved. Try again.");
        return;
      }
      setError("Unable to verify this answer. Try again.");
    } catch {
      setError("Unable to verify this answer. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <fieldset
        disabled={pending}
        style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: 6 }}
      >
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>Correct answer</legend>
        {(["A", "B", "C", "D"] as const).map((option) => (
          <label key={option} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input
              type="radio"
              name={`correct-answer-${reviewItemId}`}
              value={option}
              aria-label={`${option} ${options[option]}`}
              checked={selectedOption === option}
              onChange={() => setSelectedOption(option)}
            />
            <strong>{option}</strong>
            <span>{options[option]}</span>
          </label>
        ))}
      </fieldset>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" disabled={pending} onClick={() => resolve("keep")}>
          Keep
        </button>
        <button
          type="button"
          disabled={pending || !replacementQuestionId}
          onClick={() => resolve("replace")}
        >
          Replace
        </button>
        <button
          type="button"
          disabled={pending || selectedOption === correctOption}
          onClick={verifyAndApply}
        >
          Verify and apply
        </button>
      </div>

      {error ? <span role="alert">{error}</span> : null}
      {details ? (
        <div
          role="status"
          aria-label="Answer verification details"
          style={{ borderTop: "1px solid #e5e5e5", paddingTop: 10, fontSize: 14 }}
        >
          {details.explanation ? <p style={{ margin: "0 0 6px" }}>{details.explanation}</p> : null}
          {details.conflicts.length ? (
            <ul style={{ margin: "0 0 6px", paddingLeft: 20 }}>
              {details.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}
            </ul>
          ) : null}
          {details.evidence.length ? (
            <ul style={{ margin: "0 0 6px", paddingLeft: 20 }}>
              {details.evidence.map((evidence) => (
                <li key={evidence.url}>
                  <a href={evidence.url} target="_blank" rel="noreferrer">
                    {evidence.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {details.estimatedCostMicrodollars !== null ? (
            <p style={{ margin: 0 }}>
              Estimated API cost: ${(details.estimatedCostMicrodollars / 1_000_000).toFixed(6)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
