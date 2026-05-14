import { describe, expect, it } from "vitest";

import { parseSupabaseSessionCookie } from "@/lib/supabaseSession";

describe("parseSupabaseSessionCookie", () => {
  it("extracts the access token and user details from the stored auth cookie", () => {
    const session = parseSupabaseSessionCookie(
      JSON.stringify({
        access_token: "access-token",
        user: {
          id: "user-123",
          email: "player@example.com",
          user_metadata: {
            display_name: "PlayerOne",
          },
        },
      }),
    );

    expect(session).toEqual({
      accessToken: "access-token",
      user: {
        id: "user-123",
        email: "player@example.com",
        displayName: "PlayerOne",
      },
    });
  });

  it("returns null when the cookie does not contain a usable session", () => {
    expect(parseSupabaseSessionCookie("not-json")).toBeNull();
    expect(parseSupabaseSessionCookie(JSON.stringify({}))).toBeNull();
  });
});
