import { ImageResponse } from "next/og";

import { BrandAppIcon } from "@/components/BrandAppIcon";

const supportedSizes = new Set([192, 512]);

type AppIconRouteContext = {
  params: Promise<{ size: string }>;
};

export async function GET(
  _request: Request,
  { params }: AppIconRouteContext,
) {
  const requestedSize = Number((await params).size);

  if (!supportedSizes.has(requestedSize)) {
    return new Response(null, { status: 404 });
  }

  return new ImageResponse(<BrandAppIcon size={requestedSize} />, {
    width: requestedSize,
    height: requestedSize,
  });
}
