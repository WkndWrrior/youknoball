import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import DailyReviewActions from "@/app/admin/daily-review/[date]/DailyReviewActions";
import { authorizeDailyReviewAccess } from "@/lib/server/adminAuth";
import { loadDailyQuestionReviewByDate } from "@/lib/server/dailyQuestionReviewRepository";
import { getSupabaseSessionFromCookieValue } from "@/lib/server/supabaseServer";
import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function safeEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function DailyReviewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!validDate(date)) notFound();
  const cookieStore = await cookies();
  const session = getSupabaseSessionFromCookieValue(
    cookieStore.get(supabaseAuthStorageKey)?.value,
  );
  const auth = await authorizeDailyReviewAccess(session?.accessToken ?? null);
  if (!auth.authorized) {
    if (auth.reason === "unauthenticated") {
      redirect(`/login?next=${encodeURIComponent(`/admin/daily-review/${date}`)}`);
    }
    notFound();
  }

  const review = await loadDailyQuestionReviewByDate(supabaseAdmin(), date);
  if (!review) notFound();

  return (
    <main style={{ maxWidth: 1050, margin: "0 auto", padding: "32px 20px 64px" }}>
      <header style={{ borderBottom: "1px solid #d9d9d9", paddingBottom: 20, marginBottom: 20 }}>
        <p style={{ margin: 0, color: "#b44b16", fontWeight: 700 }}>Daily 5 review</p>
        <h1 style={{ margin: "4px 0 8px", fontSize: 32 }}>{date}</h1>
        <p style={{ margin: 0 }}>
          Status: <strong>{review.run.status}</strong> · Estimated cost:{" "}
          {`$${(review.run.estimatedCostMicrodollars / 1_000_000).toFixed(6)}`}
        </p>
      </header>

      <div style={{ display: "grid", gap: 16 }}>
        {review.items.map((item) => (
          <article key={item.id} style={{ border: "1px solid #d9d9d9", borderRadius: 8, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <strong>Slot {item.slot} · {item.question.sport.name} · {item.question.difficulty}</strong>
              <span>{item.finding?.verdict ?? item.reviewStatus}</span>
            </div>
            <h2 style={{ fontSize: 20, margin: "14px 0 8px" }}>{item.question.question_text}</h2>
            <p>{item.finding?.explanation ?? "Verification did not complete."}</p>
            {item.finding?.evidence.length ? (
              <ul>
                {item.finding.evidence.flatMap((evidence) => {
                  const href = safeEvidenceUrl(evidence.url);
                  return href ? [<li key={href}><a href={href} target="_blank" rel="noreferrer">{evidence.title}</a></li>] : [];
                })}
              </ul>
            ) : null}
            {item.replacement ? (
              <section style={{ borderTop: "1px solid #e5e5e5", marginTop: 16, paddingTop: 16 }}>
                <strong>Verified replacement</strong>
                <p>{item.replacement.snapshot.question_text}</p>
                {!item.replacement.eligible ? <p>Replacement unavailable.</p> : null}
              </section>
            ) : null}
            {item.reviewStatus === "completed" &&
            item.resolution === "pending" &&
            item.finding &&
            item.finding.verdict !== "passed" ? (
              <DailyReviewActions
                date={date}
                reviewItemId={item.id}
                replacementQuestionId={item.replacement?.eligible ? item.replacement.questionId : null}
              />
            ) : null}
            {item.resolution !== "pending" ? <p>Resolution: {item.resolution}</p> : null}
          </article>
        ))}
      </div>
    </main>
  );
}
