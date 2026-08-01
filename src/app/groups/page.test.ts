import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("groups pages", () => {
  it("wires the groups dashboard, detail, join pages, and navigation", async () => {
    const groupsPage = await readFile(
      path.join(process.cwd(), "src/app/groups/page.tsx"),
      "utf8",
    );
    const detailPage = await readFile(
      path.join(process.cwd(), "src/app/groups/[code]/page.tsx"),
      "utf8",
    );
    const joinPage = await readFile(
      path.join(process.cwd(), "src/app/groups/join/[code]/page.tsx"),
      "utf8",
    );
    const layout = await readFile(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(groupsPage).toContain("GroupsDashboard");
    expect(detailPage).toContain("GroupLeaderboardView");
    expect(joinPage).toContain("JoinGroupView");
    expect(layout).toContain('href="/groups"');
    expect(layout).toContain('href="/categories"');
    expect(layout).not.toContain('href="/categories/nba"');
    expect(layout).toContain("Categories");
    expect(layout).not.toContain("\n                NBA\n");
    expect(layout).toContain("You Kno Ball");
    expect(layout).not.toContain("YouKnowBall\n                </span>");
    expect(layout).toContain("gap-10 lg:gap-12");
    expect(layout).toContain(
      'className="block text-xl font-semibold uppercase tracking-[0.08em] text-[#ff7a18]"',
    );
    expect(layout).not.toContain("sm:text-[0.65rem]");
    expect(layout).not.toContain("sm:tracking-[0.5em]");
    expect(layout).toContain("text-sm tracking-[0.08em]");
    expect(layout).toContain("sm:text-lg");
    expect(layout).toContain("justify-between gap-2 text-[0.68rem]");
    expect(layout).toContain("tracking-[0.08em]");
    expect(layout).toContain("sm:gap-4 sm:text-xs sm:tracking-[0.3em]");
    expect(layout).toContain("rounded-2xl px-3 py-2 ring-1 ring-transparent");
    expect(layout).toContain("hover:ring-[#ff7a18]/70");
    expect(layout).toContain("active:scale-[0.98]");
    expect(layout).toContain("active:bg-[#ff7a18]/10");
    expect(layout).toContain("focus-visible:ring-[#ff7a18]/70");
    expect(layout).toContain(
      'import { SiteFooter } from "@/components/SiteFooter"',
    );
    expect(layout).toContain('<body className="flex min-h-screen flex-col">');
    expect(layout).toContain('<div className="relative flex-1">{children}</div>');
    const contentIndex = layout.indexOf(
      '<div className="relative flex-1">{children}</div>',
    );
    const footerIndex = layout.indexOf("<SiteFooter />");
    expect(contentIndex).toBeGreaterThanOrEqual(0);
    expect(footerIndex).toBeGreaterThan(contentIndex);
  });
});
