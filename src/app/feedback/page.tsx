import type { Metadata } from "next";

import { FeedbackForm } from "@/components/FeedbackForm";
import { normalizeFeedbackSourcePath } from "@/lib/feedback";

export const metadata: Metadata = {
  title: "Feedback",
};

type FeedbackPageProps = {
  searchParams: Promise<{
    from?: string | string[];
  }>;
};

export default async function FeedbackPage({
  searchParams,
}: FeedbackPageProps) {
  const params = await searchParams;
  const sourcePath = normalizeFeedbackSourcePath(params.from);

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
