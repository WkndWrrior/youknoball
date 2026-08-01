import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

async function readFeedbackPageSource() {
  return readFile(
    path.join(process.cwd(), "src/app/feedback/page.tsx"),
    "utf8",
  );
}

describe("feedback page", () => {
  it("renders the feedback form with concise page copy", async () => {
    const source = await readFeedbackPageSource();

    expect(source).toContain(
      'import { FeedbackForm } from "@/components/FeedbackForm"',
    );
    expect(source).toContain('title: "Feedback"');
    expect(source).toContain(">Feedback</h1>");
    expect(source).toContain(
      "Tell us what would make You Kno Ball better.",
    );
    expect(source).toContain("<FeedbackForm sourcePath={sourcePath} />");
    expect(source).not.toContain("rounded-[2rem]");
    expect(source).not.toContain("bg-white/[0.05]");
  });

  it("normalizes async Next search params through the shared validator", async () => {
    const source = await readFeedbackPageSource();

    expect(source).toContain("searchParams: Promise<{");
    expect(source).toContain("from?: string | string[]");
    expect(source).toContain("const params = await searchParams");
    expect(source).toContain(
      'import { normalizeFeedbackSourcePath } from "@/lib/feedback"',
    );
    expect(source).toContain("normalizeFeedbackSourcePath(params.from)");
    expect(source).not.toContain("function sanitizeSourcePath");
  });
});
