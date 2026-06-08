import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("sport quiz attempt migration", () => {
  it("adds read-only, player-owned sport quiz attempt storage", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202606080001_sport_quiz_attempts.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "create table if not exists public.sport_quiz_attempts",
    );
    expect(migration).toContain(
      "create table if not exists public.sport_quiz_attempt_items",
    );
    expect(migration).toContain(
      "user_id uuid not null references auth.users (id) on delete cascade",
    );
    expect(migration).toContain(
      "sport_id uuid not null references public.sports (id) on delete restrict",
    );
    expect(migration).toContain(
      "score smallint not null check (score between 0 and 5)",
    );
    expect(migration).toContain(
      "total_questions smallint not null check (total_questions = 5)",
    );
    expect(migration).toContain(
      "attempt_id uuid not null references public.sport_quiz_attempts (id) on delete cascade",
    );
    expect(migration).toContain(
      "question_id uuid not null references public.questions (id) on delete restrict",
    );
    expect(migration).toContain(
      "chosen_option text not null check (chosen_option in ('A', 'B', 'C', 'D'))",
    );
    expect(migration).toContain("unique (attempt_id, question_id)");

    expect(migration).toContain(
      "create index if not exists sport_quiz_attempts_user_id_idx",
    );
    expect(migration).toContain(
      "create index if not exists sport_quiz_attempts_sport_id_idx",
    );
    expect(migration).toContain(
      "create index if not exists sport_quiz_attempt_items_attempt_id_idx",
    );
    expect(migration).toContain(
      "create index if not exists sport_quiz_attempt_items_question_id_idx",
    );

    expect(migration).toContain(
      "alter table public.sport_quiz_attempts enable row level security",
    );
    expect(migration).toContain(
      "alter table public.sport_quiz_attempt_items enable row level security",
    );
    expect(migration).toContain("policyname = 'sport_quiz_attempts_select_own'");
    expect(migration).toContain("using (auth.uid() = user_id)");
    expect(migration).toContain(
      "policyname = 'sport_quiz_attempt_items_select_own'",
    );
    expect(migration).toContain(
      "from public.sport_quiz_attempts attempts",
    );
    expect(migration).toContain("attempts.user_id = auth.uid()");

    expect(migration).toContain(
      "grant select on public.sport_quiz_attempts to authenticated",
    );
    expect(migration).toContain(
      "grant select on public.sport_quiz_attempt_items to authenticated",
    );
    expect(migration).not.toMatch(/grant\s+[^;]*\bto anon\b/i);
    expect(migration).not.toMatch(/grant\s+[^;]*\binsert\b[^;]*authenticated/i);
  });
});
