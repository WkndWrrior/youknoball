import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const createLeaderboardGroupForOwner = vi.fn();
const listLeaderboardGroupsForUser = vi.fn();
const supabaseAdmin = vi.fn();
const getVerifiedSupabaseSessionFromRequest = vi.fn();

vi.mock("@/lib/server/leaderboardGroupsRepository", () => ({
  createLeaderboardGroupForOwner,
  listLeaderboardGroupsForUser,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

vi.mock("@/lib/server/supabaseServer", () => ({
  getVerifiedSupabaseSessionFromRequest,
}));

function buildSessionCookie() {
  return JSON.stringify({
    access_token: "access-token",
    user: {
      id: "user-123",
      email: "player@example.com",
    },
  });
}

function buildRequest(method: "GET" | "POST", body?: unknown, sessionCookie = buildSessionCookie()) {
  const headers = new Headers();
  if (body) {
    headers.set("content-type", "application/json");
  }
  if (sessionCookie) {
    headers.set("cookie", `${supabaseAuthStorageKey}=${encodeURIComponent(sessionCookie)}`);
  }

  return new NextRequest("http://localhost/api/groups", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("/api/groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    supabaseAdmin.mockReturnValue({ tag: "admin" });
    getVerifiedSupabaseSessionFromRequest.mockResolvedValue({
      user: { id: "verified-user" },
      client: { tag: "session" },
      accessToken: "access-token",
    });
  });

  it("requires auth to list groups", async () => {
    getVerifiedSupabaseSessionFromRequest.mockResolvedValue(null);
    const { GET } = await import("@/app/api/groups/route");
    const response = await GET(buildRequest("GET", undefined, ""));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "You must be signed in." });
  });

  it("lists the signed-in player's groups", async () => {
    listLeaderboardGroupsForUser.mockResolvedValue([
      {
        id: "group-1",
        name: "Saturday Crew",
        inviteCode: "AB12CD34",
        ownerUserId: "user-123",
        role: "owner",
        memberCount: 3,
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    ]);

    const { GET } = await import("@/app/api/groups/route");
    const response = await GET(buildRequest("GET"));

    expect(response.status).toBe(200);
    expect(listLeaderboardGroupsForUser).toHaveBeenCalledWith(
      { tag: "admin" },
      "verified-user",
    );
    await expect(response.json()).resolves.toMatchObject({
      groups: [{ name: "Saturday Crew", inviteCode: "AB12CD34" }],
    });
  });

  it("creates a group for the signed-in player", async () => {
    createLeaderboardGroupForOwner.mockResolvedValue({
      id: "group-1",
      name: "Saturday Crew",
      inviteCode: "AB12CD34",
      ownerUserId: "user-123",
      createdAt: "2026-05-02T00:00:00.000Z",
    });

    const { POST } = await import("@/app/api/groups/route");
    const response = await POST(buildRequest("POST", { name: " Saturday   Crew " }));

    expect(response.status).toBe(200);
    expect(createLeaderboardGroupForOwner).toHaveBeenCalledWith(
      { tag: "admin" },
      {
        ownerUserId: "verified-user",
        name: "Saturday Crew",
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      group: { name: "Saturday Crew", inviteCode: "AB12CD34" },
    });
  });
});
