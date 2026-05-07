import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPlayerSportCategoryPerformance = vi.fn();
const getSupabaseSessionFromRequest = vi.fn();

vi.mock("@/lib/server/dailyChallengeRepository", () => ({
  getPlayerSportCategoryPerformance,
}));

vi.mock("@/lib/server/supabaseServer", () => ({
  getSupabaseSessionFromRequest,
}));

function buildRequest() {
  return new NextRequest("http://localhost/api/sport-cards/order");
}

describe("GET /api/sport-cards/order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSupabaseSessionFromRequest.mockReturnValue(null);
  });

  it("returns default sport slugs when there is no session", async () => {
    const { GET } = await import("@/app/api/sport-cards/order/route");
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(getPlayerSportCategoryPerformance).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      slugs: ["nba", "cbb", "nfl", "nhl"],
    });
  });

  it("returns signed-in sport slugs ranked by player performance", async () => {
    getSupabaseSessionFromRequest.mockReturnValue({
      user: {
        id: "user-123",
      },
    });
    getPlayerSportCategoryPerformance.mockResolvedValue([
      {
        slug: "nba",
        answeredCount: 5,
        correctCount: 2,
        lastAnsweredAt: "2026-05-01T00:00:00.000Z",
      },
      {
        slug: "nfl",
        answeredCount: 4,
        correctCount: 4,
        lastAnsweredAt: "2026-05-02T00:00:00.000Z",
      },
      {
        slug: "cbb",
        answeredCount: 5,
        correctCount: 4,
        lastAnsweredAt: "2026-05-03T00:00:00.000Z",
      },
    ]);

    const { GET } = await import("@/app/api/sport-cards/order/route");
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(getPlayerSportCategoryPerformance).toHaveBeenCalledWith("user-123");
    await expect(response.json()).resolves.toEqual({
      slugs: ["nfl", "cbb", "nba", "nhl"],
    });
  });

  it("returns default sport slugs when player performance cannot be loaded", async () => {
    getSupabaseSessionFromRequest.mockReturnValue({
      user: {
        id: "user-123",
      },
    });
    getPlayerSportCategoryPerformance.mockRejectedValue(new Error("repository failed"));

    const { GET } = await import("@/app/api/sport-cards/order/route");
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(getPlayerSportCategoryPerformance).toHaveBeenCalledWith("user-123");
    await expect(response.json()).resolves.toEqual({
      slugs: ["nba", "cbb", "nfl", "nhl"],
    });
  });
});
