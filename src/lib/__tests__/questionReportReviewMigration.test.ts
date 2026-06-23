import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("question report review migration", () => {
  it("adds a private internal review queue view for reported questions", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202606220007_question_report_review_queue.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("create schema if not exists internal");
    expect(migration).toContain(
      "create or replace view internal.question_report_review",
    );
    expect(migration).toContain("from public.question_reports r");
    expect(migration).toContain("join public.questions q");
    expect(migration).toContain("join public.sports s");
    expect(migration).toContain("left join public.profiles p");

    expect(migration).toContain("r.id as report_id");
    expect(migration).toContain("r.status as report_status");
    expect(migration).toContain("r.reason as report_reason");
    expect(migration).toContain("r.note as report_note");
    expect(migration).toContain("r.context as report_context");
    expect(migration).toContain("r.reporter_user_id");
    expect(migration).toContain("p.display_name as reporter_display_name");
    expect(migration).toContain("q.question_text");
    expect(migration).toContain("q.option_a");
    expect(migration).toContain("q.option_b");
    expect(migration).toContain("q.option_c");
    expect(migration).toContain("q.option_d");
    expect(migration).toContain("q.correct_option");
    expect(migration).toContain("end as correct_answer");
    expect(migration).toContain("q.source_notes");

    expect(migration).toContain(
      "revoke all on schema internal from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on internal.question_report_review from public, anon, authenticated",
    );
    expect(migration).not.toMatch(/grant\s+select\s+on\s+internal\.question_report_review/i);
  });
});
