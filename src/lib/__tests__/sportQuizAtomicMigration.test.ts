import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("atomic sport quiz submission migration", () => {
  it("adds idempotent transactional attempt recording for service-role callers", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202606100001_atomic_sport_quiz_submissions.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("add column if not exists submission_id uuid");
    expect(migration).toContain("alter column submission_id set not null");
    expect(migration).toContain("unique (user_id, submission_id)");
    expect(migration).toContain(
      "create or replace function public.record_sport_quiz_attempt",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("jsonb_array_length(p_items) <> 5");
    expect(migration).toContain("insert into public.sport_quiz_attempt_items");
    expect(migration).toContain("on conflict (user_id, submission_id) do nothing");
    expect(migration).toContain("revoke all on function public.record_sport_quiz_attempt");
    expect(migration).toContain("grant execute on function public.record_sport_quiz_attempt");
    expect(migration).toContain("to service_role");
  });
});
