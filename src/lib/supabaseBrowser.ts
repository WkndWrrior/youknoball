import {
  createClient,
  type SupportedStorage,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { supabaseAuthStorageKey } from "@/lib/supabaseAuthShared";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const target = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(target));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice(target.length));
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

function removeCookie(name: string) {
  if (typeof document === "undefined") {
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

const cookieStorage: SupportedStorage = {
  getItem: (key: string) => readCookie(key),
  setItem: (key: string, value: string) => {
    writeCookie(key, value);
  },
  removeItem: (key: string) => {
    removeCookie(key);
  },
};

export function supabaseBrowser() {
  if (typeof window === "undefined") {
    throw new Error("supabaseBrowser must only be used in the browser");
  }

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: cookieStorage,
        storageKey: supabaseAuthStorageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }

  return client;
}
