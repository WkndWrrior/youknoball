import Link from "next/link";

import { LeaderboardTable } from "@/components/LeaderboardTable";
import { SportCategoryCards } from "@/components/SportCategoryCards";
import { getLeaderboardEntries } from "@/lib/server/dailyChallengeRepository";
import { createPublicSupabaseServerClient } from "@/lib/server/supabaseServer";

export default async function Home() {
  const client = createPublicSupabaseServerClient();

  let leaderboardEntries = [] as Awaited<ReturnType<typeof getLeaderboardEntries>>;

  try {
    leaderboardEntries = await getLeaderboardEntries(client, 5);
  } catch {
    leaderboardEntries = [];
  }

  return (
    <main className="px-4 py-10 sm:px-6">
      <section
        data-home-section="daily-hero"
        className="mx-auto flex min-h-[32rem] w-full max-w-6xl items-center overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/[0.045] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:p-10 lg:p-12"
      >
        <div className="mx-auto w-full max-w-4xl text-center">
          <div className="inline-flex rounded-full border border-[#ff7a18]/30 bg-[#ff7a18]/10 px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-[#ffb067]">
            Today&apos;s daily challenge
          </div>
          <h1 className="mx-auto mt-7 max-w-4xl font-display text-6xl leading-none text-white sm:text-7xl lg:text-7xl">
            Play the five-question run.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-white/72 sm:text-lg">
            The daily all-sports challenge is the main event. Play as a guest, sign
            in to rank, then see how your score holds up after the board settles.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/play"
              className="inline-flex items-center justify-center rounded-full bg-[#ff7a18] px-9 py-5 text-base font-semibold text-black hover:bg-[#ff8c36]"
            >
              Play today&apos;s challenge
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-9 py-5 text-base font-semibold text-white hover:border-white/25 hover:bg-white/10"
            >
              View leaderboard
            </Link>
          </div>
        </div>
      </section>

      <section
        data-home-section="leaderboard-preview"
        className="mx-auto mt-8 w-full max-w-6xl rounded-[2.25rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">
              Leaderboard
            </p>
            <h2 className="mt-3 font-display text-4xl leading-none text-white">
              The board follows the run.
            </h2>
          </div>
          <Link
            href="/leaderboard"
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:border-[#ff7a18] hover:text-[#ffb067]"
          >
            Full leaderboard
          </Link>
        </div>
        <LeaderboardTable compact entries={leaderboardEntries} />
      </section>

      <section
        data-home-section="category-lanes"
        className="mx-auto mt-8 w-full max-w-6xl rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 sm:p-10"
      >
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">More lanes</p>
          <h2 className="mt-3 font-display text-4xl leading-none text-white">
            Daily challenge first.
            <br />
            Category universes next.
          </h2>
          <p className="mt-4 text-base leading-7 text-white/70">
            The all-sports daily is the main event. These category tracks are where
            YouKnowBall expands once the core loop is humming.
          </p>
        </div>

        <SportCategoryCards />
      </section>
    </main>
  );
}
