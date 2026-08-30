import type { Metadata } from "next";

import { buildSocialMetadata } from "@/lib/seo";

const title = "Daily Sports Trivia Challenge";
const description =
  "Play today’s free five-question sports trivia challenge, test your all-sports knowledge, and compete on the YouKnoBall leaderboard.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/play" },
  ...buildSocialMetadata(title, description, "/play"),
};

export default function PlayLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
