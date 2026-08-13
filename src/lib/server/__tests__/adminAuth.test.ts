import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeDailyReviewRequest,
  parseDailyReviewAdminUserIds,
} from "@/lib/server/adminAuth";
import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const adminId = "00000000-0000-4000-8000-000000000001";

function request(session?: object) {
  const headers = new Headers();
  if (session) {
    headers.set(
      "cookie",
      `${supabaseAuthStorageKey}=${encodeURIComponent(JSON.stringify(session))}`,
    );
  }
  return new NextRequest("https://youknoball.com/admin/daily-review/2026-08-13", {
    headers,
  });
}

describe("daily review admin authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses only a complete, unique UUID allowlist", () => {
    expect(parseDailyReviewAdminUserIds(` ${adminId},${adminId} `)).toEqual(
      new Set([adminId]),
    );
    expect(parseDailyReviewAdminUserIds(`${adminId},not-a-uuid`)).toBeNull();
    expect(parseDailyReviewAdminUserIds("  ")).toBeNull();
  });

  it("rejects a missing session before creating a Supabase client", async () => {
    const createSessionClient = vi.fn();
    const result = await authorizeDailyReviewRequest(request(), {
      allowlist: adminId,
      createSessionClient,
    });
    expect(result).toEqual({ authorized: false, reason: "unauthenticated" });
    expect(createSessionClient).not.toHaveBeenCalled();
  });

  it("rejects a forged cookie identity and trusts only getUser", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "00000000-0000-4000-8000-000000000999" } },
      error: null,
    }));
    const result = await authorizeDailyReviewRequest(
      request({ access_token: "verified-token", user: { id: adminId } }),
      {
        allowlist: adminId,
        createSessionClient: vi.fn(() => ({ auth: { getUser } })),
      },
    );
    expect(result).toEqual({ authorized: false, reason: "forbidden" });
  });

  it("fails closed when the allowlist is absent", async () => {
    const result = await authorizeDailyReviewRequest(
      request({ access_token: "verified-token" }),
      {
        allowlist: undefined,
        createSessionClient: vi.fn(() => ({
          auth: { getUser: vi.fn(async () => ({ data: { user: { id: adminId } }, error: null })) },
        })),
      },
    );
    expect(result).toEqual({ authorized: false, reason: "not_configured" });
  });

  it("authorizes a server-verified allowlisted user", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: adminId } },
      error: null,
    }));
    const result = await authorizeDailyReviewRequest(
      request({ access_token: "verified-token", user: { id: "forged" } }),
      {
        allowlist: adminId,
        createSessionClient: vi.fn(() => ({ auth: { getUser } })),
      },
    );
    expect(result).toEqual({ authorized: true, userId: adminId });
    expect(getUser).toHaveBeenCalledOnce();
  });
});
