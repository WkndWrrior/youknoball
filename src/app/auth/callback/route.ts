import { createClient, type EmailOtpType, type SupportedStorage } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const oneYearSeconds = 60 * 60 * 24 * 365;

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

function getOtpType(raw: string | null) {
  if (!raw) {
    return null;
  }

  const value = raw.toLowerCase();
  const allowed: EmailOtpType[] = [
    "email",
    "recovery",
    "invite",
    "email_change",
    "magiclink",
    "signup",
  ];
  return allowed.includes(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

function applyAuthCookies(response: NextResponse, mutations: Map<string, string | null>) {
  for (const [name, value] of mutations) {
    if (value === null) {
      response.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      continue;
    }

    response.cookies.set(name, value, {
      path: "/",
      maxAge: oneYearSeconds,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
}

export async function GET(request: NextRequest) {
  const redirectUrl = new URL("/play", request.url);
  const loginUrl = new URL("/login", request.url);
  const config = getSupabasePublicConfig();

  if (!config) {
    loginUrl.searchParams.set("error", "Missing Supabase config.");
    return NextResponse.redirect(loginUrl);
  }

  const cookieMutations = new Map<string, string | null>();
  const storage: SupportedStorage = {
    getItem: (key: string) => {
      if (cookieMutations.has(key)) {
        return cookieMutations.get(key) ?? null;
      }
      return request.cookies.get(key)?.value ?? null;
    },
    setItem: (key: string, value: string) => {
      cookieMutations.set(key, value);
    },
    removeItem: (key: string) => {
      cookieMutations.set(key, null);
    },
  };

  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage,
      storageKey: supabaseAuthStorageKey,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const otpType = getOtpType(searchParams.get("type"));

    let userId: string | null = null;

    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        throw error;
      }
      userId = data.user?.id ?? null;
    } else if (tokenHash && otpType) {
      const { data, error } = await client.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      });
      if (error) {
        throw error;
      }
      userId = data.user?.id ?? null;
    } else {
      loginUrl.searchParams.set("error", "Invalid or expired magic link.");
      return NextResponse.redirect(loginUrl);
    }

    if (userId) {
      await supabaseAdmin().from("profiles").upsert({ id: userId }, { onConflict: "id" });
    }

    const response = NextResponse.redirect(redirectUrl);
    applyAuthCookies(response, cookieMutations);
    return response;
  } catch {
    loginUrl.searchParams.set("error", "Unable to complete sign-in. Try again.");
    const response = NextResponse.redirect(loginUrl);
    applyAuthCookies(response, cookieMutations);
    return response;
  }
}
