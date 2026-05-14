type ParsedSupabaseSession = {
  accessToken: string;
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
  };
};

type StoredSupabaseSession = {
  access_token?: unknown;
  user?: {
    id?: unknown;
    email?: unknown;
    user_metadata?: {
      display_name?: unknown;
    };
  };
};

export function parseSupabaseSessionCookie(
  rawValue: string | null | undefined,
): ParsedSupabaseSession | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as StoredSupabaseSession;
    if (
      !parsed ||
      typeof parsed.access_token !== "string" ||
      !parsed.user ||
      typeof parsed.user.id !== "string"
    ) {
      return null;
    }

    return {
      accessToken: parsed.access_token,
      user: {
        id: parsed.user.id,
        email: typeof parsed.user.email === "string" ? parsed.user.email : null,
        displayName:
          typeof parsed.user.user_metadata?.display_name === "string"
            ? parsed.user.user_metadata.display_name
            : null,
      },
    };
  } catch {
    return null;
  }
}
