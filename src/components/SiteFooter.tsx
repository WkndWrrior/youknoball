"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();

  return (
    <footer className="px-4 py-5 text-center sm:px-6">
      <Link
        className="rounded-sm px-2 py-1 text-xs font-medium text-white/60 underline-offset-4 transition hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        href={{ pathname: "/feedback", query: { from: pathname } }}
      >
        Feedback
      </Link>
    </footer>
  );
}
