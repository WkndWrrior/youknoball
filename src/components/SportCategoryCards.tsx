"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  sportsCategories,
  type CategoryCard,
  type SportCategorySlug,
} from "@/lib/categories";

const defaultSlugs = sportsCategories.map((category) => category.slug);
const knownSlugs = new Set<SportCategorySlug>(defaultSlugs);

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCategory(category: CategoryCard | undefined): category is CategoryCard {
  return Boolean(category);
}

function normalizeSlugs(payload: unknown) {
  if (!isObjectLike(payload) || !Array.isArray(payload.slugs)) {
    return null;
  }

  const orderedSlugs: SportCategorySlug[] = [];
  const seenSlugs = new Set<SportCategorySlug>();

  for (const slug of payload.slugs) {
    if (typeof slug !== "string") continue;

    const normalizedSlug = slug.trim().toLowerCase() as SportCategorySlug;
    if (!knownSlugs.has(normalizedSlug) || seenSlugs.has(normalizedSlug)) {
      continue;
    }

    orderedSlugs.push(normalizedSlug);
    seenSlugs.add(normalizedSlug);
  }

  for (const slug of defaultSlugs) {
    if (!seenSlugs.has(slug)) {
      orderedSlugs.push(slug);
    }
  }

  return orderedSlugs;
}

export function SportCategoryCards() {
  const [orderedSlugs, setOrderedSlugs] = useState<SportCategorySlug[]>(defaultSlugs);

  useEffect(() => {
    let isMounted = true;

    async function loadSportCardOrder() {
      try {
        const response = await fetch("/api/sport-cards/order");
        if (!response.ok) return;

        const payload = await response.json();
        const nextSlugs = normalizeSlugs(payload);
        if (nextSlugs && isMounted) {
          setOrderedSlugs(nextSlugs);
        }
      } catch {
        // Keep the default order when the custom order is unavailable.
      }
    }

    loadSportCardOrder();

    return () => {
      isMounted = false;
    };
  }, []);

  const categoriesBySlug = useMemo(
    () => new Map(sportsCategories.map((category) => [category.slug, category])),
    [],
  );

  const orderedCategories = useMemo(
    () => orderedSlugs.map((slug) => categoriesBySlug.get(slug)).filter(isCategory),
    [categoriesBySlug, orderedSlugs],
  );

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {orderedCategories.map((category) => (
        <Link
          key={category.slug}
          href={`/categories/${category.slug}`}
          className="group rounded-[1.75rem] border border-white/10 bg-black/35 p-5 hover:border-[#ff7a18]/40 hover:bg-black/55"
        >
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-[#ffb067]">
            {category.eyebrow}
          </p>
          <h3 className="mt-4 font-display text-3xl leading-none text-white">
            {category.title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-white/68">
            {category.description}
          </p>
          <span className="mt-6 inline-flex text-sm font-semibold text-white/75 transition group-hover:text-[#ffb067]">
            Explore preview
          </span>
        </Link>
      ))}
    </div>
  );
}
