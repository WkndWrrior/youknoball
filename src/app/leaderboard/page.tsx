import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getLeaderboardEntries } from "@/lib/server/dailyChallengeRepository";
import { createPublicSupabaseServerClient } from "@/lib/server/supabaseServer";

export const metadata = {
  title: "Leaderboard",
};

export default async function LeaderboardPage() {
  const client = createPublicSupabaseServerClient();

  let entries = [] as Awaited<ReturnType<typeof getLeaderboardEntries>>;

  try {
    entries = await getLeaderboardEntries(client, 50);
  } catch {
    entries = [];
  }

  return (
    <main className="px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-5xl rounded-[2.5rem] border border-white/10 bg-white/[0.05] p-8 shadow-[0_24px_100px_rgba(0,0,0,0.45)] sm:p-10">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ffb067]">Leaderboard</p>
        <h1 className="mt-4 font-display text-5xl leading-none text-white sm:text-6xl">
          Average score decides the board.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
          Rankings are based on timed signed-in daily challenge results only. Ties
          break by average completion time, total plays, then the most recent play date.
        </p>

        <div className="mt-8">
          <LeaderboardTable entries={entries} />
        </div>
      </section>
    </main>
  );
}
