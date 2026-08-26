import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const createClient = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

function buildRequest(cookieUserId = "forged-user") {
  const session = JSON.stringify({
    access_token: "access-token",
    user: {
      id: cookieUserId,
      email: "player@example.com",
    },
  });

  return new NextRequest("http://localhost/api/test", {
    headers: {
      cookie: `${supabaseAuthStorageKey}=${encodeURIComponent(session)}`,
    },
  });
}

describe("getVerifiedSupabaseSessionFromRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("uses the user returned by Supabase instead of the cookie user", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "verified-user", email: "player@example.com" } },
          error: null,
        }),
      },
    };
    createClient.mockReturnValue(client);

    const { getVerifiedSupabaseSessionFromRequest } = await import(
      "@/lib/server/supabaseServer"
    );
    const verified = await getVerifiedSupabaseSessionFromRequest(
      buildRequest(),
    );

    expect(verified?.user.id).toBe("verified-user");
    expect(verified?.client).toBe(client);
    expect(client.auth.getUser).toHaveBeenCalledOnce();
  });

  it("rejects a cookie whose access token cannot be verified", async () => {
    createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("invalid token"),
        }),
      },
    });

    const { getVerifiedSupabaseSessionFromRequest } = await import(
      "@/lib/server/supabaseServer"
    );

    await expect(
      getVerifiedSupabaseSessionFromRequest(buildRequest()),
    ).resolves.toBeNull();
  });
});
