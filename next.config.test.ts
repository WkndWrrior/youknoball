import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Next.js security headers", () => {
  it("sets baseline browser security headers on every route", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const rules = await nextConfig.headers?.();
    const headers = new Map(
      rules?.[0]?.headers.map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(rules?.[0]?.source).toBe("/(.*)");
    expect(headers.get("strict-transport-security")).toContain("max-age=");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});
