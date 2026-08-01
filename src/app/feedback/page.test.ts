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

  it("accepts async Next search params and passes only a safe pathname", async () => {
    const source = await readFeedbackPageSource();

    expect(source).toContain("searchParams: Promise<{");
    expect(source).toContain("from?: string | string[]");
    expect(source).toContain("const params = await searchParams");
    expect(source).toContain("sanitizeSourcePath(params.from)");
    expect(source).toContain("typeof value !== \"string\"");
    expect(source).toContain(
      "Array.from(value).length > MAX_FEEDBACK_SOURCE_PATH_LENGTH",
    );
    expect(source).toContain('!value.startsWith("/")');
    expect(source).toContain('value.startsWith("//")');
    expect(source).toContain('value.includes("\\\\")');
    expect(source).toContain(String.raw`/[\u0000-\u001f\u007f]/u.test(value)`);
    expect(source).toContain('value.includes("?")');
    expect(source).toContain('value.includes("#")');
  });
});
