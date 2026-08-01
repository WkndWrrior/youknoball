import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("SiteFooter", () => {
  it("links to feedback with the current pathname", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/SiteFooter.tsx"),
      "utf8",
    );

    expect(source).toContain('"use client"');
    expect(source).toContain('import Link from "next/link"');
    expect(source).toContain('import { usePathname } from "next/navigation"');
    expect(source).toContain("const pathname = usePathname()");
    expect(source).toContain('pathname: "/feedback"');
    expect(source).toContain("query: { from: pathname }");
    expect(source).toMatch(/>\s*Feedback\s*<\/Link>/);
  });

  it("stays compact and in normal document flow", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/SiteFooter.tsx"),
      "utf8",
    );

    expect(source).toContain("text-xs");
    expect(source).toContain("text-white/60");
    expect(source).toContain("focus-visible:ring-2");
    expect(source).not.toContain("fixed");
    expect(source).not.toContain("sticky");
  });
});
