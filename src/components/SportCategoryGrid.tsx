"use client";

import {
  SportCategoryCardLink,
  useOrderedSportCategories,
} from "@/components/SportCategoryShared";

export function SportCategoryGrid() {
  const orderedCategories = useOrderedSportCategories();

  return (
    <div
      className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-category-grid
    >
      {orderedCategories.map((category) => (
        <SportCategoryCardLink
          key={category.slug}
          category={category}
          className="h-full"
        />
      ))}
    </div>
  );
}
