import { ImageResponse } from "next/og";

import { BrandSocialImage } from "@/components/BrandSocialImage";
import { siteName } from "@/lib/seo";

export const alt = siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<BrandSocialImage />, size);
}
