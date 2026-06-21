"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  SportCategoryCardLink,
  useOrderedSportCategories,
} from "@/components/SportCategoryShared";

function ArrowIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d={direction === "previous" ? "M15 6 9 12l6 6" : "M9 6l6 6-6 6"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function getCategoryCards(carousel: HTMLElement) {
  return Array.from(carousel.querySelectorAll<HTMLElement>("[data-category-card]"));
}

function getCenteredCardIndex(carousel: HTMLElement) {
  const cards = getCategoryCards(carousel);

  if (cards.length === 0) {
    return { cards, index: -1 };
  }

  const carouselCenter = carousel.scrollLeft + carousel.clientWidth / 2;
  let index = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  cards.forEach((card, cardIndex) => {
    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
    const distance = Math.abs(cardCenter - carouselCenter);

    if (distance < nearestDistance) {
      index = cardIndex;
      nearestDistance = distance;
    }
  });

  return { cards, index };
}

export function SportCategoryCards() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const hasCenteredMobileCardRef = useRef(false);
  const orderedCategories = useOrderedSportCategories();
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);

  const updateScrollState = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const { cards, index } = getCenteredCardIndex(carousel);
    if (index === -1) {
      setCanScrollPrevious(false);
      setCanScrollNext(false);
      return;
    }

    setCanScrollPrevious(index > 0);
    setCanScrollNext(index < cards.length - 1);
  }, []);

  const scrollToCategoryIndex = useCallback(
    (targetIndex: number, behavior: ScrollBehavior = "smooth") => {
      const carousel = carouselRef.current;
      if (!carousel) return;

      const cards = getCategoryCards(carousel);
      if (cards.length === 0) return;

      const clampedIndex = Math.max(0, Math.min(cards.length - 1, targetIndex));
      const card = cards[clampedIndex];

      carousel.scrollTo({
        behavior,
        left: card.offsetLeft - (carousel.clientWidth - card.offsetWidth) / 2,
      });
      window.requestAnimationFrame(updateScrollState);
    },
    [updateScrollState],
  );

  const centerInitialMobileCard = useCallback(() => {
    const carousel = carouselRef.current;
    if (
      !carousel ||
      hasCenteredMobileCardRef.current ||
      !window.matchMedia("(max-width: 767px)").matches
    ) {
      return;
    }

    scrollToCategoryIndex(1, "auto");
    hasCenteredMobileCardRef.current = true;
  }, [scrollToCategoryIndex]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const frame = window.requestAnimationFrame(() => {
      updateScrollState();
      centerInitialMobileCard();
    });
    carousel.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      window.cancelAnimationFrame(frame);
      carousel.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [centerInitialMobileCard, orderedCategories.length, updateScrollState]);

  const scrollByCard = useCallback((direction: -1 | 1) => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const { index } = getCenteredCardIndex(carousel);
    scrollToCategoryIndex(index + direction);
  }, [scrollToCategoryIndex]);

  return (
    <div className="-mx-4 mt-6 grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1 sm:mx-0 sm:mt-8 sm:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] sm:gap-3">
      <button
        aria-label="Previous category"
        className="inline-flex h-8 w-8 items-center justify-center justify-self-center rounded-full border border-white/15 bg-black/75 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] hover:border-[#ff7a18]/60 hover:text-[#ffb067] disabled:pointer-events-none disabled:opacity-25 sm:h-9 sm:w-9"
        disabled={!canScrollPrevious}
        onClick={() => scrollByCard(-1)}
        type="button"
      >
        <ArrowIcon direction="previous" />
      </button>

      <div
        ref={carouselRef}
        className="flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-5 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4 sm:px-6 md:px-[4%] lg:px-[1.5%]"
        data-category-carousel
      >
        {orderedCategories.map((category) => (
          <SportCategoryCardLink
            key={category.slug}
            category={category}
            className="shrink-0 basis-full snap-center md:basis-[46%] lg:basis-[31%]"
          />
        ))}
      </div>

      <button
        aria-label="Next category"
        className="inline-flex h-8 w-8 items-center justify-center justify-self-center rounded-full border border-white/15 bg-black/75 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] hover:border-[#ff7a18]/60 hover:text-[#ffb067] disabled:pointer-events-none disabled:opacity-25 sm:h-9 sm:w-9"
        disabled={!canScrollNext}
        onClick={() => scrollByCard(1)}
        type="button"
      >
        <ArrowIcon direction="next" />
      </button>
    </div>
  );
}
