import type { Metadata } from "next";

import { FeedbackForm } from "@/components/FeedbackForm";
import { MAX_FEEDBACK_SOURCE_PATH_LENGTH } from "@/lib/feedback";

export const metadata: Metadata = {
  title: "Feedback",
};

type FeedbackPageProps = {
  searchParams: Promise<{
    from?: string | string[];
  }>;
};

function sanitizeSourcePath(
  value: string | string[] | undefined,
): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    Array.from(value).length > MAX_FEEDBACK_SOURCE_PATH_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return null;
  }

  return value;
}

export default async function FeedbackPage({
  searchParams,
}: FeedbackPageProps) {
  const params = await searchParams;
  const sourcePath = sanitizeSourcePath(params.from);

  return (
    <main className="px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6">
          <h1 className="font-display text-4xl font-black uppercase text-white sm:text-5xl">Feedback</h1>
          <p className="mt-2 text-sm leading-6 text-white/60 sm:text-base">
            Tell us what would make You Kno Ball better.
          </p>
        </header>
        <FeedbackForm sourcePath={sourcePath} />
      </div>
    </main>
  );
}
