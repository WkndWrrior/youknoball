import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const joinLeaderboardGroupByInviteCode = vi.fn();
const supabaseAdmin = vi.fn();
const getVerifiedSupabaseSessionFromRequest = vi.fn();

vi.mock("@/lib/server/leaderboardGroupsRepository", () => ({
  joinLeaderboardGroupByInviteCode,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

vi.mock("@/lib/server/supabaseServer", () => ({
  getVerifiedSupabaseSessionFromRequest,
}));

function buildRequest(body: unknown, sessionCookie?: string) {
  const cookie =
    sessionCookie ??
    JSON.stringify({
      access_token: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
      },
    });
  const headers = new Headers({
    "content-type": "application/json",
  });
  if (cookie) {
    headers.set("cookie", `${supabaseAuthStorageKey}=${encodeURIComponent(cookie)}`);
  }

  return new NextRequest("http://localhost/api/groups/join", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/groups/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    supabaseAdmin.mockReturnValue({ tag: "admin" });
    getVerifiedSupabaseSessionFromRequest.mockResolvedValue({
      user: { id: "verified-user" },
    });
  });

  it("joins the signed-in player by invite code", async () => {
    joinLeaderboardGroupByInviteCode.mockResolvedValue({
      id: "group-1",
      name: "Saturday Crew",
      inviteCode: "AB12CD34",
      ownerUserId: "owner-1",
      createdAt: "2026-05-02T00:00:00.000Z",
    });

    const { POST } = await import("@/app/api/groups/join/route");
    const response = await POST(buildRequest({ inviteCode: " ab12cd34 " }));

    expect(response.status).toBe(200);
    expect(joinLeaderboardGroupByInviteCode).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        userId: "verified-user",
        inviteCode: "AB12CD34",
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      group: { inviteCode: "AB12CD34" },
    });
  });
});
