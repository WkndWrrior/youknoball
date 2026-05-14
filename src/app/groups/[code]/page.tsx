import { GroupLeaderboardView } from "@/components/GroupLeaderboardView";

type GroupPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function GroupPage({ params }: GroupPageProps) {
  const { code } = await params;

  return (
    <main className="px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-5xl">
        <GroupLeaderboardView inviteCode={code} />
      </section>
    </main>
  );
}
