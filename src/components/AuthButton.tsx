"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data } = await supabaseBrowser().auth.getSession();
      if (isMounted) {
        setUser(data.session?.user ?? null);
        setLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabaseBrowser().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function onSignOut() {
    setSigningOut(true);
    await supabaseBrowser().auth.signOut({ scope: "local" });
    setUser(null);
    setSigningOut(false);
  }

  if (loading) {
    return (
      <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[0.7rem] uppercase tracking-[0.25em] text-white/45">
        Checking auth...
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-[#ff7a18] bg-[#ff7a18] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#ff8c36]"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-2">
      <span className="hidden max-w-40 truncate px-2 text-xs text-white/70 sm:block">
        {user.email}
      </span>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
          signingOut
            ? "cursor-not-allowed bg-white/10 text-white/35"
            : "bg-white text-black hover:bg-[#ffede0]"
        }`}
      >
        {signingOut ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
