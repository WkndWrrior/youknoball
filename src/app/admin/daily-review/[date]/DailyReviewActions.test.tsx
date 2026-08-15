/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DailyReviewActions from "@/app/admin/daily-review/[date]/DailyReviewActions";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const fetchMock = vi.fn<typeof fetch>();

const props = {
  date: "2026-08-16",
  reviewItemId: "11111111-1111-4111-8111-111111111111",
  replacementQuestionId: "22222222-2222-4222-8222-222222222222",
  correctOption: "B" as const,
  options: {
    A: "Boston Celtics",
    B: "Dallas Mavericks",
    C: "Denver Nuggets",
    D: "Miami Heat",
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  refreshMock.mockReset();
  vi.unstubAllGlobals();
});

describe("DailyReviewActions", () => {
  it("renders all answer choices and only enables verification after a change", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ outcome: "applied" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<DailyReviewActions {...props} />);

    const choices = screen.getAllByRole("radio");
    expect(choices).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "B Dallas Mavericks" }).getAttribute("checked")).not.toBeNull();

    const verify = screen.getByRole("button", { name: "Verify and apply" });
    expect(verify.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "C Denver Nuggets" }));
    expect(verify.hasAttribute("disabled")).toBe(false);
    fireEvent.click(verify);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/daily-review/2026-08-16/correct-answer",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reviewItemId: props.reviewItemId,
          newCorrectOption: "C",
        }),
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("disables every review command while a request is pending", async () => {
    let finishRequest!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        finishRequest = resolve;
      }),
    );
    render(<DailyReviewActions {...props} />);

    fireEvent.click(screen.getByRole("radio", { name: "A Boston Celtics" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify and apply" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Keep" }).hasAttribute("disabled")).toBe(true);
      expect(screen.getByRole("button", { name: "Replace" }).hasAttribute("disabled")).toBe(true);
      expect(screen.getByRole("button", { name: "Verify and apply" }).hasAttribute("disabled")).toBe(true);
    });

    finishRequest(
      new Response(JSON.stringify({ outcome: "applied" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("preserves the selection and renders safe public details when verification is rejected", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          outcome: "verification_rejected",
          finding: {
            explanation: "The sources still support Dallas.",
            conflicts: ["The proposed answer conflicts with the official result."],
          },
          evidence: [
            { title: "NBA recap", url: "https://www.nba.com/game/recap" },
            { title: "Unsafe source", url: "javascript:alert(1)" },
          ],
          estimatedCostMicrodollars: 63125,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    render(<DailyReviewActions {...props} />);

    const proposed = screen.getByRole("radio", { name: "D Miami Heat" });
    fireEvent.click(proposed);
    fireEvent.click(screen.getByRole("button", { name: "Verify and apply" }));

    expect(await screen.findByText("The sources still support Dallas.")).not.toBeNull();
    expect(screen.getByText("The proposed answer conflicts with the official result.")).not.toBeNull();
    expect(screen.getByText("Estimated API cost: $0.063125")).not.toBeNull();
    expect(screen.getByRole("link", { name: "NBA recap" }).getAttribute("href")).toBe(
      "https://www.nba.com/game/recap",
    );
    expect(screen.queryByRole("link", { name: "Unsafe source" })).toBeNull();
    expect((proposed as HTMLInputElement).checked).toBe(true);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps billable verification details visible when persistence fails", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          outcome: "persistence_failed",
          finding: { explanation: "The proposed answer was verified.", conflicts: [] },
          evidence: [{ title: "Official source", url: "https://www.espn.com/result" }],
          estimatedCostMicrodollars: 1200,
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );
    render(<DailyReviewActions {...props} />);

    fireEvent.click(screen.getByRole("radio", { name: "A Boston Celtics" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify and apply" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The verified answer could not be saved. Try again.",
    );
    expect(screen.getByText("The proposed answer was verified.")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Official source" })).not.toBeNull();
    expect(screen.getByText("Estimated API cost: $0.001200")).not.toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
