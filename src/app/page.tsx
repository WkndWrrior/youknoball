import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { LeaderboardTable } from "@/components/LeaderboardTable";
import { SportCategoryCards } from "@/components/SportCategoryCards";
import { getLeaderboardEntries } from "@/lib/server/dailyChallengeRepository";
import {
  createPublicSupabaseServerClient,
  getSupabaseSessionFromCookieValue,
} from "@/lib/server/supabaseServer";
import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";
import {
  homepageDescription,
  homepageTitle,
  serializeStructuredData,
  websiteStructuredData,
} from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: homepageTitle },
  description: homepageDescription,
  alternates: { canonical: "/" },
};

const signedOutHeroSubtext =
  "Play today’s all-sports challenge as a guest. Sign in to save your score, climb the leaderboard, and see where you rank when the day settles.";

const signedInHeroSubtext =
  "Prove that you kno ball. Climb the leaderboard and see where you rank when the day settles.";

export function WebsiteStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeStructuredData(websiteStructuredData),
      }}
    />
  );
}

export default async function Home() {
  const client = createPublicSupabaseServerClient();
  const cookieStore = await cookies();
  const session = getSupabaseSessionFromCookieValue(
    cookieStore.get(supabaseAuthStorageKey)?.value,
  );
  const heroSubtext = session ? signedInHeroSubtext : signedOutHeroSubtext;

  let leaderboardEntries = [] as Awaited<ReturnType<typeof getLeaderboardEntries>>;

  try {
    leaderboardEntries = await getLeaderboardEntries(client, 5);
  } catch {
    leaderboardEntries = [];
  }

  return (
    <>
      <WebsiteStructuredData />
      <main className="px-4 pt-5 pb-6 sm:px-6 sm:pt-6 sm:pb-10">
      <section
        data-home-section="daily-hero"
        className="mx-auto flex min-h-[calc(100svh-10rem)] w-full max-w-6xl items-center overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:min-h-[calc(100svh-10rem)] sm:rounded-[2.75rem] sm:p-10 lg:min-h-[calc(100svh-10rem)] lg:p-12"
      >
        <div className="mx-auto w-full max-w-5xl text-center">
          <div className="inline-flex rounded-full border border-[#ff7a18]/30 bg-[#ff7a18]/10 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[#ffb067] sm:px-5 sm:py-3 sm:text-xs sm:tracking-[0.35em]">
            Today&apos;s challenge
          </div>
          <h1 className="mx-auto mt-8 max-w-5xl whitespace-nowrap font-display text-[clamp(2.35rem,11.5vw,3rem)] leading-none text-white sm:text-[5.52rem] lg:text-[6.44rem]">
            Do you kno ball?
          </h1>
          <p className="mx-auto mt-8 max-w-3xl text-base leading-7 text-white/72 sm:text-xl sm:leading-8">
            {heroSubtext}
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:mt-10 sm:flex-row sm:gap-4">
            <Link
              href="/play"
              className="inline-flex w-full items-center justify-center rounded-full bg-[#ff7a18] px-8 py-5 text-base font-semibold text-black hover:bg-[#ff8c36] sm:w-auto sm:px-10 sm:py-6 sm:text-lg"
            >
              Play Now
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-8 py-5 text-base font-semibold text-white hover:border-white/25 hover:bg-white/10 sm:w-auto sm:px-10 sm:py-6 sm:text-lg"
            >
              View Leaderboard
            </Link>
          </div>
        </div>
      </section>

      <section
        data-home-section="category-lanes"
        className="mx-auto mt-10 w-full max-w-6xl sm:mt-12"
      >
        <div className="max-w-2xl px-1 sm:px-0">
          <h2 className="font-display text-3xl leading-none text-white sm:text-4xl">
            Stay in yo lane
          </h2>
          <p className="mt-4 text-base leading-7 text-white/70">
            Sport-specific quizzes with fresh questions across the games you follow closest.
          </p>
        </div>

        <SportCategoryCards />
      </section>

      <section
        data-home-section="leaderboard-preview"
        className="mx-auto mt-8 w-full max-w-6xl rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 sm:rounded-[2.25rem] sm:p-8"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">
              Leaderboard
            </p>
            <h2 className="mt-3 font-display text-3xl leading-none text-white sm:text-4xl">
              The board follows the run.
            </h2>
          </div>
          <Link
            href="/leaderboard"
            className="inline-flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:border-[#ff7a18] hover:text-[#ffb067] sm:w-auto"
          >
            Full leaderboard
          </Link>
        </div>
        <LeaderboardTable compact entries={leaderboardEntries} />
      </section>
      </main>
    </>
  );
}
