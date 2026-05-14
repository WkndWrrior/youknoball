import type { Metadata } from "next";
import Link from "next/link";

import { AuthButton } from "@/components/AuthButton";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://youknowball.com"),
  title: {
    default: "YouKnowBall",
    template: "%s | YouKnowBall",
  },
  description:
    "YouKnowBall is the fast, competitive daily sports trivia game with one five-question challenge every day.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-8">
              <Link className="block" href="/">
                <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.5em] text-[#ff7a18]">
                  YouKnowBall
                </span>
                <span className="font-display text-lg tracking-[0.08em] text-white">
                  Daily sports trivia
                </span>
              </Link>
              <nav className="hidden items-center gap-5 text-sm text-white/70 md:flex">
                <Link className="transition hover:text-white" href="/play">
                  Play
                </Link>
                <Link className="transition hover:text-white" href="/leaderboard">
                  Leaderboard
                </Link>
                <Link className="transition hover:text-white" href="/groups">
                  Groups
                </Link>
                <Link className="transition hover:text-white" href="/categories/nba">
                  Categories
                </Link>
              </nav>
            </div>
            <div className="shrink-0">
              <AuthButton />
            </div>
          </div>
          <div className="border-t border-white/5 px-4 py-2 md:hidden">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              <Link className="transition hover:text-white" href="/play">
                Play
              </Link>
              <Link className="transition hover:text-white" href="/leaderboard">
                Board
              </Link>
              <Link className="transition hover:text-white" href="/groups">
                Groups
              </Link>
              <Link className="transition hover:text-white" href="/categories/nba">
                NBA
              </Link>
            </div>
          </div>
        </header>
        <div className="relative">{children}</div>
      </body>
    </html>
  );
}
