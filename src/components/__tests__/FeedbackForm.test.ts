import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

async function readFeedbackFormSource() {
  return readFile(
    path.join(process.cwd(), "src/components/FeedbackForm.tsx"),
    "utf8",
  );
}

describe("FeedbackForm", () => {
  it("uses the shared feedback contract and accessible compact controls", async () => {
    const source = await readFeedbackFormSource();

    expect(source).toContain('"use client"');
    expect(source).toContain('from "@/lib/feedback"');
    expect(source).toContain("FEEDBACK_TYPES");
    expect(source).toContain("MAX_FEEDBACK_EMAIL_LENGTH");
    expect(source).toContain("MAX_FEEDBACK_MESSAGE_LENGTH");
    expect(source).toContain("type FeedbackType");
    expect(source).toContain("sourcePath: string | null");
    expect(source).toContain("<fieldset>");
    expect(source).toContain("<legend");
    expect(source).toContain('type="radio"');
    expect(source).toContain("General");
    expect(source).toContain("Bug");
    expect(source).toContain("Idea");
    expect(source).toContain("FEEDBACK_TYPES.map");
    expect(source).toContain("required");
    expect(source).toContain(
      "Array.from(value).slice(0, maxCodePoints).join(\"\")",
    );
    expect(source).toContain(
      "limitCodePoints(event.target.value, MAX_FEEDBACK_MESSAGE_LENGTH)",
    );
    expect(source).toContain('type="email"');
    expect(source).toContain("maxLength={MAX_FEEDBACK_EMAIL_LENGTH}");
    expect(source).toContain('name="website"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("tabIndex={-1}");
    expect(source).toContain('autoComplete="off"');
    expect(source).toContain("rounded-lg");
    expect(source).toContain("focus-visible:ring-2");
  });

  it("posts JSON once and includes the source pathname", async () => {
    const source = await readFeedbackFormSource();

    expect(source).toContain('fetch("/api/feedback"');
    expect(source).toContain('method: "POST"');
    expect(source).toContain('"content-type": "application/json"');
    expect(source).toContain("body: JSON.stringify({");
    expect(source).toContain("feedbackType,");
    expect(source).toContain("message,");
    expect(source).toContain("contactEmail,");
    expect(source).toContain("website,");
    expect(source).toContain("sourcePath,");
    expect(source).toContain("response.json()");
    expect(source).toContain("{ message?: string }");
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain("submittingRef.current");
    expect(source).toContain("disabled={submitting}");
  });

  it("clears every editable field on success and exposes a status", async () => {
    const source = await readFeedbackFormSource();

    expect(source).toContain('setFeedbackType("general")');
    expect(source).toContain('setMessage("")');
    expect(source).toContain('setContactEmail("")');
    expect(source).toContain('setWebsite("")');
    expect(source).toContain('role="status"');
  });

  it("preserves inputs on failure and exposes an alert", async () => {
    const source = await readFeedbackFormSource();
    const responseGuard = source.indexOf("if (!response.ok)");
    const firstReset = source.indexOf('setFeedbackType("general")', responseGuard);
    const catchBlock = source.indexOf("} catch (feedbackError)", firstReset);

    expect(responseGuard).toBeGreaterThanOrEqual(0);
    expect(firstReset).toBeGreaterThan(responseGuard);
    expect(catchBlock).toBeGreaterThan(firstReset);
    expect(source.slice(catchBlock)).not.toContain('setFeedbackType("general")');
    expect(source.slice(catchBlock)).not.toContain('setMessage("")');
    expect(source.slice(catchBlock)).not.toContain('setContactEmail("")');
    expect(source.slice(catchBlock)).not.toContain('setWebsite("")');
    expect(source).toContain('role="alert"');
  });
});
