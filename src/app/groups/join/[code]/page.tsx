import { JoinGroupView } from "@/components/JoinGroupView";

type JoinGroupPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function JoinGroupPage({ params }: JoinGroupPageProps) {
  const { code } = await params;

  return (
    <main className="px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-3xl">
        <JoinGroupView inviteCode={code} />
      </section>
    </main>
  );
}
