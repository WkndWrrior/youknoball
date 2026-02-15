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
    await supabaseBrowser().auth.signOut();
    setUser(null);
    setSigningOut(false);
  }

  if (loading) {
    return (
      <span className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300">
        Checking auth...
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 dark:text-slate-300">{user.email}</span>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
          signingOut
            ? "cursor-not-allowed bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
            : "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        }`}
      >
        {signingOut ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
