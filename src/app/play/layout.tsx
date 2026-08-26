import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily Sports Trivia Challenge",
  description:
    "Play today’s free five-question sports trivia challenge, test your all-sports knowledge, and compete on the YouKnoBall leaderboard.",
  alternates: { canonical: "/play" },
};

export default function PlayLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
