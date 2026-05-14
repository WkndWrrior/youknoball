import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPlayerSportCategoryPerformance = vi.fn();
const getSupabaseSessionFromRequest = vi.fn();
const createSessionSupabaseServerClient = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/server/dailyChallengeRepository", () => ({
  getPlayerSportCategoryPerformance,
}));

vi.mock("@/lib/server/supabaseServer", () => ({
  createSessionSupabaseServerClient,
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
    createSessionSupabaseServerClient.mockReturnValue({
      auth: {
        getUser,
      },
    });
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "verified-user",
        },
      },
      error: null,
    });
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

  it("returns signed-in sport slugs ranked by verified player performance", async () => {
    getSupabaseSessionFromRequest.mockReturnValue({
      accessToken: "access-token",
      user: {
        id: "forged-cookie-user",
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
    expect(createSessionSupabaseServerClient).toHaveBeenCalledWith("access-token");
    expect(getUser).toHaveBeenCalled();
    expect(getPlayerSportCategoryPerformance).toHaveBeenCalledWith("verified-user");
    await expect(response.json()).resolves.toEqual({
      slugs: ["nfl", "cbb", "nba", "nhl"],
    });
  });

  it.each([
    [
      "token verification errors",
      {
        data: {
          user: {
            id: "verified-user",
          },
        },
        error: new Error("invalid token"),
      },
    ],
    [
      "token verification returns no user",
      {
        data: {
          user: null,
        },
        error: null,
      },
    ],
  ])("returns default sport slugs when %s", async (_description, getUserResult) => {
    getSupabaseSessionFromRequest.mockReturnValue({
      accessToken: "access-token",
      user: {
        id: "forged-cookie-user",
      },
    });
    getUser.mockResolvedValue(getUserResult);

    const { GET } = await import("@/app/api/sport-cards/order/route");
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(createSessionSupabaseServerClient).toHaveBeenCalledWith("access-token");
    expect(getUser).toHaveBeenCalled();
    expect(getPlayerSportCategoryPerformance).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      slugs: ["nba", "cbb", "nfl", "nhl"],
    });
  });

  it("returns default sport slugs when player performance cannot be loaded", async () => {
    getSupabaseSessionFromRequest.mockReturnValue({
      accessToken: "access-token",
      user: {
        id: "forged-cookie-user",
      },
    });
    getPlayerSportCategoryPerformance.mockRejectedValue(new Error("repository failed"));

    const { GET } = await import("@/app/api/sport-cards/order/route");
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(createSessionSupabaseServerClient).toHaveBeenCalledWith("access-token");
    expect(getUser).toHaveBeenCalled();
    expect(getPlayerSportCategoryPerformance).toHaveBeenCalledWith("verified-user");
    await expect(response.json()).resolves.toEqual({
      slugs: ["nba", "cbb", "nfl", "nhl"],
    });
  });
});
