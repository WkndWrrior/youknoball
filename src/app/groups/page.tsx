import { GroupsDashboard } from "@/components/GroupsDashboard";

export const metadata = {
  title: "Groups",
};

export default function GroupsPage() {
  return (
    <main className="px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-5xl rounded-[2.5rem] border border-white/10 bg-white/[0.05] p-8 shadow-[0_24px_100px_rgba(0,0,0,0.45)] sm:p-10">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ffb067]">
          Groups
        </p>
        <h1 className="mt-4 font-display text-5xl leading-none text-white sm:text-6xl">
          Friend leaderboards.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
          Create an invite link, bring in your crew, and rank timed daily scores
          inside the group.
        </p>
        <div className="mt-8">
          <GroupsDashboard />
        </div>
      </section>
    </main>
  );
}
