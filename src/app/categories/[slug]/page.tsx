import Link from "next/link";
import { notFound } from "next/navigation";

import { getCategoryBySlug } from "@/lib/categories";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  return (
    <main className="px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-4xl rounded-[2.5rem] border border-white/10 bg-white/[0.05] p-8 shadow-[0_24px_100px_rgba(0,0,0,0.45)] sm:p-10">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ffb067]">
          {category.eyebrow}
        </p>
        <h1 className="mt-4 font-display text-5xl leading-none text-white sm:text-6xl">
          {category.title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/72">
          {category.description}
        </p>
        <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-black/35 p-6">
          <p className="text-sm leading-7 text-white/70">
            This category lane is intentionally a polished preview in v1 while the
            daily all-sports challenge stays center stage. The daily challenge is live
            now, and this track is next on deck.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/play"
              className="inline-flex items-center justify-center rounded-full bg-[#ff7a18] px-5 py-3 text-sm font-semibold text-black hover:bg-[#ff8c36]"
            >
              Play today&apos;s challenge
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
            >
              Back to the hub
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
