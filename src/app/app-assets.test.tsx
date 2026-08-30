import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import appleIcon, {
  contentType as appleContentType,
  size as appleSize,
} from "@/app/apple-icon";
import icon, {
  contentType as iconContentType,
  size as iconSize,
} from "@/app/icon";
import manifest from "@/app/manifest";
import { GET as getAppIcon } from "@/app/app-icon/[size]/route";
import { BrandAppIcon } from "@/components/BrandAppIcon";

function pngDimensions(buffer: ArrayBuffer) {
  const view = new DataView(buffer);

  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

describe("YouKnoBall app assets", () => {
  it.each([
    ["browser", icon, iconContentType, iconSize, { width: 32, height: 32 }],
    ["Apple", appleIcon, appleContentType, appleSize, { width: 180, height: 180 }],
  ])(
    "generates the %s icon as a correctly sized PNG",
    async (_name, renderIcon, contentType, size, expectedSize) => {
      expect(contentType).toBe("image/png");
      expect(size).toEqual(expectedSize);

      const response = renderIcon();
      const body = await response.arrayBuffer();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      expect(pngDimensions(body)).toEqual(expectedSize);
    },
  );

  it("renders the compact YKB mark with the exact approved colors", () => {
    const element = BrandAppIcon();

    expect(isValidElement(element)).toBe(true);
    expect((element as ReactElement<{ style: Record<string, unknown> }>).props.style)
      .toMatchObject({ backgroundColor: "#050505" });

    const mark = (
      element as ReactElement<{
        children: ReactElement<{
          children: string;
          style: Record<string, unknown>;
        }>;
      }>
    ).props.children;
    expect(mark.props.children).toBe("YKB");
    expect(mark.props.style).toMatchObject({ color: "#ff7a18" });
  });

  it.each([192, 512])("generates the %i install icon", async (size) => {
    const response = await getAppIcon(new Request("https://youknoball.com"), {
      params: Promise.resolve({ size: String(size) }),
    });
    const body = await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(pngDimensions(body)).toEqual({ width: size, height: size });
  });

  it("rejects unsupported install icon sizes", async () => {
    const response = await getAppIcon(new Request("https://youknoball.com"), {
      params: Promise.resolve({ size: "256" }),
    });

    expect(response.status).toBe(404);
  });

  it("publishes the approved installable web app manifest", () => {
    expect(manifest()).toEqual({
      name: "YouKnoBall",
      short_name: "YouKnoBall",
      description:
        "Daily and sport-specific trivia quizzes covering the NBA, NFL, college football, college basketball, NHL, and MLB.",
      start_url: "/",
      display: "standalone",
      background_color: "#050505",
      theme_color: "#ff7a18",
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
    });
  });
});
