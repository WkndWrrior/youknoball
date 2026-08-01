import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("player feedback migration", () => {
  it("adds private feedback storage and an internal review view", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202608010001_player_feedback.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "create table if not exists public.feedback_submissions",
    );
    expect(migration).toContain(
      "id uuid primary key default gen_random_uuid()",
    );
    expect(migration).toContain(
      "reporter_user_id uuid references auth.users (id) on delete set null",
    );
    expect(migration).toContain(
      "feedback_type text not null check (feedback_type in ('general', 'bug', 'idea'))",
    );
    expect(migration).toContain(
      "message text not null check (char_length(message) between 1 and 2000)",
    );
    expect(migration).toContain(
      "contact_email text check (contact_email is null or char_length(contact_email) <= 320)",
    );
    expect(migration).toContain(
      "source_path text check (source_path is null or char_length(source_path) <= 200)",
    );
    expect(migration).toContain(
      "status text not null default 'new'",
    );
    expect(migration).toContain(
      "check (status in ('new', 'reviewing', 'resolved', 'dismissed'))",
    );
    expect(migration).toContain("reviewer_notes text");
    expect(migration).toContain("reviewed_at timestamptz");
    expect(migration).toContain(
      "created_at timestamptz not null default now()",
    );

    expect(migration).toMatch(
      /create index if not exists feedback_submissions_status_created_at_idx\s+on public\.feedback_submissions \(status, created_at desc\);/,
    );
    expect(migration).toMatch(
      /create index if not exists feedback_submissions_reporter_user_id_idx\s+on public\.feedback_submissions \(reporter_user_id\)\s+where reporter_user_id is not null;/,
    );

    expect(migration).toContain(
      "alter table public.feedback_submissions enable row level security",
    );
    expect(migration).toContain(
      "revoke all on public.feedback_submissions from public, anon, authenticated",
    );

    expect(migration).toContain("create schema if not exists internal");
    expect(migration).toContain(
      "create or replace view internal.feedback_review",
    );
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("f.id");
    expect(migration).toContain("f.reporter_user_id");
    expect(migration).toContain("f.feedback_type");
    expect(migration).toContain("f.message");
    expect(migration).toContain("f.contact_email");
    expect(migration).toContain("f.source_path");
    expect(migration).toContain("f.status");
    expect(migration).toContain("f.reviewer_notes");
    expect(migration).toContain("f.reviewed_at");
    expect(migration).toContain("f.created_at");
    expect(migration).toContain("from public.feedback_submissions f");
    expect(migration).toContain("left join public.profiles p");
    expect(migration).toContain("on p.id = f.reporter_user_id");
    expect(migration).toContain("p.display_name as reporter_display_name");
    expect(migration).toContain(
      "revoke all on schema internal from public, anon, authenticated",
    );
    expect(migration).not.toMatch(
      /grant\s+[^;]*\bon\s+(?:table\s+)?internal\.feedback_review\b[^;]*\bto\s+[^;]*\b(?:public|anon|authenticated)\b/i,
    );
    expect(migration.trimEnd()).toMatch(
      /revoke all on internal\.feedback_review from public, anon, authenticated;$/,
    );
  });
});
