import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";
import { parseSupabaseSessionCookie } from "@/lib/supabaseSession";

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return { supabaseUrl, supabaseAnonKey };
}

function decodeCookieValue(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function createPublicSupabaseServerClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createSessionSupabaseServerClient(accessToken: string) {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function getSupabaseSessionFromCookieValue(rawCookie: string | null | undefined) {
  return parseSupabaseSessionCookie(decodeCookieValue(rawCookie ?? undefined));
}

export function getSupabaseSessionFromRequest(request: NextRequest) {
  return getSupabaseSessionFromCookieValue(
    request.cookies.get(supabaseAuthStorageKey)?.value,
  );
}

export type ServerSupabaseClient = SupabaseClient;
