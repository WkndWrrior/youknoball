import "server-only";

import type { NextRequest } from "next/server";

import {
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
} from "@/lib/server/supabaseServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: unknown } | null };
      error: unknown;
    }>;
  };
};

export type DailyReviewAuthorization =
  | { authorized: true; userId: string }
  | {
      authorized: false;
      reason: "unauthenticated" | "forbidden" | "not_configured";
    };

export function parseDailyReviewAdminUserIds(value: string | undefined) {
  const ids = (value ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !UUID_PATTERN.test(id))) {
    return null;
  }
  return new Set(ids);
}

export async function authorizeDailyReviewAccess(
  accessToken: string | null,
  options: {
    allowlist?: string;
    createSessionClient?: (accessToken: string) => SessionClient;
  } = {},
): Promise<DailyReviewAuthorization> {
  const allowlist = parseDailyReviewAdminUserIds(
    options.allowlist ?? process.env.DAILY_REVIEW_ADMIN_USER_IDS,
  );
  if (!allowlist) return { authorized: false, reason: "not_configured" };
  if (!accessToken) return { authorized: false, reason: "unauthenticated" };

  try {
    const client = (options.createSessionClient ??
      createSessionSupabaseServerClient)(accessToken) as SessionClient;
    const { data, error } = await client.auth.getUser();
    const userId = data.user?.id;
    if (error || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
      return { authorized: false, reason: "unauthenticated" };
    }
    const normalizedUserId = userId.toLowerCase();
    return allowlist.has(normalizedUserId)
      ? { authorized: true, userId: normalizedUserId }
      : { authorized: false, reason: "forbidden" };
  } catch {
    return { authorized: false, reason: "unauthenticated" };
  }
}

export async function authorizeDailyReviewRequest(
  request: NextRequest,
  options: {
    allowlist?: string;
    createSessionClient?: (accessToken: string) => SessionClient;
  } = {},
) {
  const session = getSupabaseSessionFromRequest(request);
  return authorizeDailyReviewAccess(session?.accessToken ?? null, options);
}
