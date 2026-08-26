import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getVerifiedSupabaseSessionFromRequest = vi.fn();
const upsertPlayerDisplayName = vi.fn();

vi.mock("@/lib/server/supabaseServer", () => ({
  getVerifiedSupabaseSessionFromRequest,
}));

vi.mock("@/lib/server/dailyChallengeRepository", () => ({
  upsertPlayerDisplayName,
}));

function buildRequest(displayName = "  Teddy  ") {
  return new NextRequest("http://localhost/api/profile/display-name", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
}

describe("POST /api/profile/display-name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getVerifiedSupabaseSessionFromRequest.mockResolvedValue({
      client: { tag: "session" },
      user: { id: "verified-user" },
    });
    upsertPlayerDisplayName.mockResolvedValue({ display_name: "Teddy" });
  });

  it("updates only the server-verified user's profile", async () => {
    const { POST } = await import("@/app/api/profile/display-name/route");
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(upsertPlayerDisplayName).toHaveBeenCalledWith(
      { tag: "session" },
      { userId: "verified-user", displayName: "Teddy" },
    );
  });

  it("returns a generic error without leaking repository details", async () => {
    upsertPlayerDisplayName.mockRejectedValue(new Error("relation profiles missing"));

    const { POST } = await import("@/app/api/profile/display-name/route");
    const response = await POST(buildRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to save display name.",
    });
  });
});
