import type { MetadataRoute } from "next";

import {
  brandBackground,
  brandOrange,
  siteName,
} from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: siteName,
    description:
      "Daily and sport-specific trivia quizzes covering the NBA, NFL, college football, college basketball, NHL, and MLB.",
    start_url: "/",
    display: "standalone",
    background_color: brandBackground,
    theme_color: brandOrange,
    icons: [
      {
        src: "/app-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/app-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
