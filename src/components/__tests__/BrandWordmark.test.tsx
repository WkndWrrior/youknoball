/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrandWordmark } from "@/components/BrandWordmark";

afterEach(cleanup);

describe("BrandWordmark", () => {
  it("renders the approved all-orange visual wordmark", () => {
    render(<BrandWordmark />);

    const wordmark = screen.getByText("YOUKNOBALL");

    expect(wordmark.getAttribute("aria-label")).toBe("YouKnoBall");
    expect(wordmark.className).toContain("font-display");
    expect(wordmark.className).toContain("text-[#ff7a18]");
    expect(wordmark.className).not.toContain("text-white");
  });
});
