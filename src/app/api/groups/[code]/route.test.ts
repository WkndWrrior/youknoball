import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const getLeaderboardGroupDetail = vi.fn();
const supabaseAdmin = vi.fn();

vi.mock("@/lib/server/leaderboardGroupsRepository", () => ({
  getLeaderboardGroupDetail,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

function buildRequest(sessionCookie?: string) {
  const cookie =
    sessionCookie ??
    JSON.stringify({
      access_token: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
      },
    });
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", `${supabaseAuthStorageKey}=${encodeURIComponent(cookie)}`);
  }

  return new NextRequest("http://localhost/api/groups/AB12CD34", {
    method: "GET",
    headers,
  });
}

describe("GET /api/groups/[code]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    supabaseAdmin.mockReturnValue({ tag: "admin" });
  });

  it("returns group detail for a member", async () => {
    getLeaderboardGroupDetail.mockResolvedValue({
      group: {
        id: "group-1",
        name: "Saturday Crew",
        inviteCode: "AB12CD34",
        ownerUserId: "owner-1",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
      role: "member",
      memberCount: 2,
      entries: [],
    });

    const { GET } = await import("@/app/api/groups/[code]/route");
    const response = await GET(buildRequest(), {
      params: Promise.resolve({ code: "ab12cd34" }),
    });

    expect(response.status).toBe(200);
    expect(getLeaderboardGroupDetail).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        userId: "user-123",
        inviteCode: "AB12CD34",
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      group: { name: "Saturday Crew", inviteCode: "AB12CD34" },
    });
  });

  it("returns 404 when the signed-in player is not a member", async () => {
    getLeaderboardGroupDetail.mockResolvedValue(null);

    const { GET } = await import("@/app/api/groups/[code]/route");
    const response = await GET(buildRequest(), {
      params: Promise.resolve({ code: "ab12cd34" }),
    });

    expect(response.status).toBe(404);
  });
});
