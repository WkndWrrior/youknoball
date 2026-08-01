/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteFooter } from "@/components/SiteFooter";

const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

beforeEach(() => {
  pathnameMock.mockReturnValue("/categories/nba");
});

afterEach(() => {
  cleanup();
  pathnameMock.mockReset();
});

describe("SiteFooter behavior", () => {
  it("links to feedback with the encoded current pathname", () => {
    render(<SiteFooter />);

    const link = screen.getByRole("link", { name: "Feedback" });

    expect(link.getAttribute("href")).toBe(
      "/feedback?from=%2Fcategories%2Fnba",
    );
  });

  it("renders compact muted content in normal document flow", () => {
    render(<SiteFooter />);

    const link = screen.getByRole("link", { name: "Feedback" });
    const footer = link.closest("footer");

    expect(footer).not.toBeNull();
    expect(link.classList.contains("text-xs")).toBe(true);
    expect(link.classList.contains("text-white/60")).toBe(true);
    expect(link.classList.contains("focus-visible:ring-2")).toBe(true);
    expect(link.classList.contains("focus-visible:ring-[#ff7a18]/70")).toBe(
      true,
    );

    const positionedElement = Array.from(
      footer?.querySelectorAll<HTMLElement>("*") ?? [],
    ).find(
      (element) =>
        element.classList.contains("fixed") ||
        element.classList.contains("sticky"),
    );

    expect(footer?.classList.contains("fixed")).toBe(false);
    expect(footer?.classList.contains("sticky")).toBe(false);
    expect(positionedElement).toBeUndefined();
  });
});
