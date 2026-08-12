"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DailyReviewActions({
  date,
  reviewItemId,
  replacementQuestionId,
  disabled,
}: {
  date: string;
  reviewItemId: string;
  replacementQuestionId: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: "keep" | "replace") {
    const label = action === "keep" ? "keep this question" : "apply the verified replacement";
    if (!window.confirm(`Confirm: ${label}?`)) return;
    setPending(true);
    setError(null);
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

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" disabled={disabled || pending} onClick={() => resolve("keep")}>
        Keep
      </button>
      <button
        type="button"
        disabled={disabled || pending || !replacementQuestionId}
        onClick={() => resolve("replace")}
      >
        Replace
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
