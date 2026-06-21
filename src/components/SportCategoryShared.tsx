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

export function normalizeSportCategorySlugs(payload: unknown) {
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

export function useOrderedSportCategories() {
  const [orderedSlugs, setOrderedSlugs] = useState<SportCategorySlug[]>(defaultSlugs);

  useEffect(() => {
    let isMounted = true;

    async function loadSportCardOrder() {
      try {
        const response = await fetch("/api/sport-cards/order");
        if (!response.ok) return;

        const payload = await response.json();
        const nextSlugs = normalizeSportCategorySlugs(payload);
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

  return useMemo(
    () => orderedSlugs.map((slug) => categoriesBySlug.get(slug)).filter(isCategory),
    [categoriesBySlug, orderedSlugs],
  );
}

export function CategoryIcon({
  slug,
  className,
}: {
  slug: CategoryCard["slug"];
  className?: string;
}) {
  switch (slug) {
    case "nba":
      return (
        <svg
          aria-hidden="true"
          className={className}
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M5.5 12h13M12 5a9 9 0 0 0 0 14M12 5a9 9 0 0 1 0 14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "cbb":
      return (
        <svg
          aria-hidden="true"
          className={className}
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M5 5h5v4H5zM5 15h5v4H5zM14 10h5v4h-5zM10 7h2v10h2M12 12h2"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "nfl":
      return (
        <svg
          aria-hidden="true"
          className={className}
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M7 6v8h10V6M12 14v6M9 20h6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "cfb":
      return (
        <svg
          aria-hidden="true"
          className={className}
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M5 6v12l14-6Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="M5 8H2.5M5 16H2.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "nhl":
      return (
        <svg
          aria-hidden="true"
          className={className}
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M20 5 16 17M16 17H8M14 19h5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <ellipse
            cx="17"
            cy="18"
            rx="3"
            ry="1.4"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "mlb":
      return (
        <svg
          aria-hidden="true"
          className={className}
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M6 5h12v9l-6 5-6-5Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
  }
}

export function SportCategoryCardLink({
  category,
  className = "",
}: {
  category: CategoryCard;
  className?: string;
}) {
  return (
    <Link
      className={`group relative flex min-h-[17rem] flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/35 p-5 hover:border-[#ff7a18]/40 hover:bg-black/55 sm:rounded-[1.75rem] ${className}`}
      data-category-card
      href={`/categories/${category.slug}`}
    >
      <CategoryIcon
        className="absolute right-5 top-5 h-10 w-10 text-white/20 transition group-hover:text-white/35"
        slug={category.slug}
      />
      <div className="pr-12">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-[#ffb067]">
          {category.eyebrow}
        </p>
        <h3 className="mt-4 font-display text-2xl leading-none text-white sm:text-3xl">
          {category.title}
        </h3>
        <p className="mt-3 text-sm leading-6 text-white/68">
          {category.description}
        </p>
      </div>
    </Link>
  );
}
