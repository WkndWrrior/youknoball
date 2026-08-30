import { describe, expect, it } from "vitest";

import openGraphImage, {
  alt as openGraphAlt,
  contentType as openGraphContentType,
  size as openGraphSize,
} from "@/app/opengraph-image";
import twitterImage, {
  alt as twitterAlt,
  contentType as twitterContentType,
  size as twitterSize,
} from "@/app/twitter-image";

describe("brand social images", () => {
  it.each([
    ["Open Graph", openGraphImage, openGraphAlt, openGraphContentType, openGraphSize],
    ["Twitter", twitterImage, twitterAlt, twitterContentType, twitterSize],
  ])("generates the shared %s PNG", async (_name, renderImage, alt, contentType, size) => {
    expect(alt).toBe("YouKnoBall");
    expect(contentType).toBe("image/png");
    expect(size).toEqual({ width: 1200, height: 630 });

    const response = renderImage();
    const body = await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(body.byteLength).toBeGreaterThan(1_000);
  });
});
