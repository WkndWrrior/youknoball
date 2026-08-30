import { ImageResponse } from "next/og";

import { BrandAppIcon } from "@/components/BrandAppIcon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<BrandAppIcon size={size.width} />, size);
}
