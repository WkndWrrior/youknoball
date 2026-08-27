import type { MetadataRoute } from "next";

import { publicRoutes, siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
  }));
}
