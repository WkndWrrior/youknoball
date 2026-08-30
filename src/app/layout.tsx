import type { Metadata } from "next";
import Link from "next/link";

import { AuthButton } from "@/components/AuthButton";
import { BrandWordmark } from "@/components/BrandWordmark";
import { SiteFooter } from "@/components/SiteFooter";
import {
  buildSocialMetadata,
  homepageDescription,
  homepageTitle,
  siteName,
  siteUrl,
} from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: homepageTitle,
    template: `%s | ${siteName}`,
  },
  description: homepageDescription,
  ...buildSocialMetadata(homepageTitle, homepageDescription, "/"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-10 lg:gap-12">
              <Link
                className="block rounded-2xl px-3 py-2 ring-1 ring-transparent transition-all duration-200 ease-out hover:bg-white/[0.04] hover:ring-[#ff7a18]/70 active:scale-[0.98] active:bg-[#ff7a18]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                href="/"
              >
                <BrandWordmark />
                <span className="font-display text-sm tracking-[0.08em] text-white sm:text-lg">
                  Daily sports trivia
                </span>
              </Link>
              <nav className="hidden items-center gap-5 text-sm text-white/70 md:flex">
                <Link
                  className="rounded-full px-2 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  href="/play"
                >
                  Play
                </Link>
                <Link
                  className="rounded-full px-2 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  href="/leaderboard"
                >
                  Leaderboard
                </Link>
                <Link
                  className="rounded-full px-2 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  href="/groups"
                >
                  Groups
                </Link>
                <Link
                  className="rounded-full px-2 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  href="/categories"
                >
                  Categories
                </Link>
              </nav>
            </div>
            <div className="shrink-0">
              <AuthButton />
            </div>
          </div>
          <div className="border-t border-white/5 px-4 py-2 md:hidden">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white/60 sm:gap-4 sm:text-xs sm:tracking-[0.3em]">
              <Link
                className="rounded-full px-1 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                href="/play"
              >
                Play
              </Link>
              <Link
                className="rounded-full px-1 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                href="/leaderboard"
              >
                Board
              </Link>
              <Link
                className="rounded-full px-1 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                href="/groups"
              >
                Groups
              </Link>
              <Link
                className="rounded-full px-1 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a18]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                href="/categories"
              >
                Categories
              </Link>
            </div>
          </div>
        </header>
        <div className="relative flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
