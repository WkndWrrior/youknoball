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
    expect(source).toContain("getCappedElapsedTimerMs");
    expect(source).not.toContain("getRemainingTimerMs");
    expect(source).toContain("Timed leaderboard");
    expect(source).toContain("Speed breaks the tie.");
    expect(source).not.toContain("Timed leaderboard window closed.");
    expect(source).not.toContain("Finish before zero to rank.");
    expect(source).toContain('result.leaderboardStatus === "needs_display_name"');
    expect(source).toContain('result.leaderboardStatus === "timed_out"');
    expect(source).toContain('result.leaderboardStatus === "timer_unavailable"');
    expect(source).toContain("Copy result");
    expect(source).toContain("Facebook");
  });

  it("exposes a question report control on every daily question card", async () => {
    const source = await readFile(path.join(process.cwd(), "src/app/play/page.tsx"), "utf8");

    expect(source).toContain('import { QuestionReportButton } from "@/components/QuestionReportButton"');
    expect(source).toContain("<QuestionReportButton");
    expect(source).toContain('context="daily_challenge"');
    expect(source).toContain("questionId={question.id}");
  });
});
