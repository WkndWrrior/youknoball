import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SportQuiz } from "@/components/SportQuiz";
import { getCategoryBySlug } from "@/lib/categories";
import { buildSocialMetadata, categorySeo } from "@/lib/seo";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);

  if (!category) {
    return {
      robots: { index: false, follow: false },
    };
  }

  const seo = categorySeo[category.slug];

  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.canonical },
    ...buildSocialMetadata(seo.title, seo.description, seo.canonical),
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  return (
    <main className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 border-b border-white/10 pb-8 sm:mb-10 sm:pb-10">
          <p className="text-xs uppercase tracking-[0.35em] text-[#ffb067]">
            {category.eyebrow}
          </p>
          <h1 className="mt-4 break-words font-display text-5xl leading-none text-white sm:text-6xl">
            {category.title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/72">
            {category.description}
          </p>
        </header>

        <SportQuiz slug={category.slug} title={category.title} />
      </div>
    </main>
  );
}
