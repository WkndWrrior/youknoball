import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("daily review admin page", () => {
  it("authorizes before loading service-role review data", () => {
    const source = readFileSync("src/app/admin/daily-review/[date]/page.tsx", "utf8");
    expect(source.indexOf("authorizeDailyReviewAccess(")).toBeLessThan(
      source.indexOf("loadDailyQuestionReviewByDate("),
    );
    expect(source).toContain("redirect(`/login?next=");
    expect(source).toContain("notFound()");
  });

  it("renders verdicts, evidence, replacement state, cost, and confirmed POST actions", () => {
    const page = readFileSync("src/app/admin/daily-review/[date]/page.tsx", "utf8");
    const actions = readFileSync(
      "src/app/admin/daily-review/[date]/DailyReviewActions.tsx",
      "utf8",
    );
    expect(page).toContain("review.run.estimatedCostMicrodollars");
    expect(page).toContain("item.finding?.verdict");
    expect(page).toContain("item.finding.evidence");
    expect(page).toContain("item.replacement?.eligible");
    expect(actions).toContain("window.confirm");
    expect(actions).toContain('method: "POST"');
    expect(actions).not.toContain('method: "GET"');
  });

  it("only renders actions for unresolved completed risk findings", () => {
    const source = readFileSync("src/app/admin/daily-review/[date]/page.tsx", "utf8");

    expect(source).toContain('item.reviewStatus === "completed"');
    expect(source).toContain('item.resolution === "pending"');
    expect(source).toContain("item.finding &&");
    expect(source).toContain('item.finding.verdict !== "passed"');
    expect(source).not.toContain('disabled={item.resolution !== "pending"}');
  });
});
