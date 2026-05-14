import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const createClient = vi.fn();
const supabaseAdmin = vi.fn();

vi.mock("@supabase/supabase-js", async () => {
  const actual = await vi.importActual<typeof import("@supabase/supabase-js")>(
    "@supabase/supabase-js",
  );

  return {
    ...actual,
    createClient,
  };
});

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin,
}));

function buildRequest(query: Record<string, string>) {
  const url = new URL("http://localhost/auth/callback");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return new NextRequest(url);
}

function createAdminClientMock() {
  const upsert = vi.fn(async () => ({ data: null, error: null }));

  return {
    from: vi.fn(() => ({
      upsert,
    })),
    upsert,
  };
}

function createAuthClientMock(options: {
  exchangeResult?: { data: { user: { id: string } | null }; error: null | { message: string } };
  verifyResult?: { data: { user: { id: string } | null }; error: null | { message: string } };
  cookieValue?: string;
}) {
  let storage: {
    setItem: (key: string, value: string) => void;
  } | null = null;

  const client = {
    auth: {
      exchangeCodeForSession: vi.fn(async () => {
        if (options.cookieValue && storage) {
          storage.setItem(supabaseAuthStorageKey, options.cookieValue);
        }

        return (
          options.exchangeResult ?? {
            data: { user: { id: "user-123" } },
            error: null,
          }
        );
      }),
      verifyOtp: vi.fn(async () => {
        if (options.cookieValue && storage) {
          storage.setItem(supabaseAuthStorageKey, options.cookieValue);
        }

        return (
          options.verifyResult ?? {
            data: { user: { id: "user-123" } },
            error: null,
          }
        );
      }),
    },
  };

  createClient.mockImplementation((
    _url: string,
    _key: string,
    config: { auth: { storage: { setItem: (key: string, value: string) => void } } },
  ) => {
    storage = config.auth.storage;
    return client;
  });

  return client;
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs?.();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.local");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs?.();
  });

  it("redirects signup confirmations to /play and preserves auth cookie and profile behavior", async () => {
    const adminClient = createAdminClientMock();
    const authClient = createAuthClientMock({
      cookieValue: "session-cookie",
    });

    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(buildRequest({ code: "signup-code" }));

    expect(response.headers.get("location")).toBe("http://localhost/play");
    expect(authClient.auth.exchangeCodeForSession).toHaveBeenCalledWith("signup-code");
    expect(adminClient.from).toHaveBeenCalledWith("profiles");
    expect(adminClient.upsert).toHaveBeenCalledWith({ id: "user-123" }, { onConflict: "id" });
    expect(response.cookies.get(supabaseAuthStorageKey)?.value).toBe("session-cookie");
  });

  it("redirects recovery links to /reset-password", async () => {
    const adminClient = createAdminClientMock();
    const authClient = createAuthClientMock({
      cookieValue: "recovery-cookie",
    });

    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      buildRequest({
        token_hash: "recovery-token",
        type: "recovery",
      }),
    );

    expect(authClient.auth.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "recovery-token",
    });
    expect(response.headers.get("location")).toBe("http://localhost/reset-password");
    expect(adminClient.upsert).toHaveBeenCalledWith({ id: "user-123" }, { onConflict: "id" });
    expect(response.cookies.get(supabaseAuthStorageKey)?.value).toBe("recovery-cookie");
  });

  it("redirects code-based recovery callbacks to /reset-password", async () => {
    const adminClient = createAdminClientMock();
    const authClient = createAuthClientMock({
      cookieValue: "recovery-cookie",
    });

    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      buildRequest({
        code: "recovery-code",
        type: "recovery",
      }),
    );

    expect(authClient.auth.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(response.headers.get("location")).toBe("http://localhost/reset-password");
    expect(adminClient.upsert).toHaveBeenCalledWith({ id: "user-123" }, { onConflict: "id" });
    expect(response.cookies.get(supabaseAuthStorageKey)?.value).toBe("recovery-cookie");
  });

  it("redirects expired recovery links back to /login with a recovery-specific error", async () => {
    const adminClient = createAdminClientMock();
    createAuthClientMock({
      verifyResult: {
        data: { user: null },
        error: { message: "link expired" },
      },
    });

    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      buildRequest({
        token_hash: "expired-recovery-token",
        type: "recovery",
      }),
    );

    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("Invalid or expired recovery link.");
    expect(adminClient.from).not.toHaveBeenCalledWith("profiles");
  });

  it("redirects to /login when profile upsert fails after a successful auth exchange", async () => {
    const adminClient = {
      from: vi.fn(() => ({
        upsert: vi.fn(async () => ({
          data: null,
          error: { message: "profile upsert failed" },
        })),
      })),
    };
    const authClient = createAuthClientMock({
      cookieValue: "session-cookie",
    });

    supabaseAdmin.mockReturnValue(adminClient);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(buildRequest({ code: "signup-code" }));

    const location = new URL(response.headers.get("location") ?? "");

    expect(authClient.auth.exchangeCodeForSession).toHaveBeenCalledWith("signup-code");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("Unable to complete sign-in. Try again.");
    expect(response.cookies.get(supabaseAuthStorageKey)?.value).toBe("session-cookie");
  });
});
