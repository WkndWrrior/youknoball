import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("/play share controls", () => {
  it("wires the result card to native, X, and Facebook share helpers", async () => {
    const source = await readFile(path.join(process.cwd(), "src/app/play/page.tsx"), "utf8");

    expect(source).toContain('from "@/lib/shareLinks"');
    expect(source).toContain("async function shareResult()");
    expect(source).toContain("buildNativeShareData");
    expect(source).toContain("buildXShareUrl");
    expect(source).toContain("buildFacebookShareUrl");
    expect(source).toContain("formatTimer");
    expect(source).toContain("Timed leaderboard");
    expect(source).toContain("Timed leaderboard window closed.");
    expect(source).toContain('result.leaderboardStatus === "needs_display_name"');
    expect(source).toContain('result.leaderboardStatus === "timed_out"');
    expect(source).toContain('result.leaderboardStatus === "timer_unavailable"');
    expect(source).toContain("Copy result");
    expect(source).toContain("Facebook");
  });
});
