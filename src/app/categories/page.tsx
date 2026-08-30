import type { Metadata } from "next";

import { SportCategoryGrid } from "@/components/SportCategoryGrid";
import { buildSocialMetadata } from "@/lib/seo";

const title = "Sports Trivia Quizzes";
const description =
  "Choose an NBA, NFL, college football, college basketball, NHL, or MLB trivia quiz on YouKnoBall and play five fresh questions whenever.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/categories" },
  ...buildSocialMetadata(title, description, "/categories"),
};

export default function CategoriesPage() {
  return (
    <main className="px-4 py-8 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-6xl">
        <header className="max-w-2xl px-1 sm:px-0">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ffb067]">
            Categories
          </p>
          <h1 className="mt-4 font-display text-4xl leading-none text-white sm:text-5xl">
            Choose your category
          </h1>
          <p className="mt-4 text-base leading-7 text-white/70">
            Pick a sports trivia quiz and run five fresh questions.
          </p>
        </header>

        <SportCategoryGrid />
      </section>
    </main>
  );
}
