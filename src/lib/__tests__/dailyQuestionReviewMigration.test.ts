import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202608080001_nightly_question_verification.sql",
);

describe("nightly question verification migration", () => {
  it("creates private review run storage with bounded operational metadata", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain(
      "create table if not exists public.daily_question_review_runs",
    );
    expect(migration).toMatch(
      /daily_challenge_id uuid not null references public\.daily_challenges \(id\) on delete cascade/,
    );
    expect(migration).toContain("challenge_date date not null");
    expect(migration).toContain(
      "check (status in ('running', 'completed', 'partial', 'failed', 'budget_blocked'))",
    );
    expect(migration).toContain("run_kind text not null default 'scheduled'");
    expect(migration).toContain("check (run_kind in ('scheduled'))");
    expect(migration).toContain("model text not null");
    expect(migration).toContain("verifier_version text not null");
    expect(migration).toContain("started_at timestamptz not null");
    expect(migration).toContain("completed_at timestamptz");
    expect(migration).toContain("input_tokens integer not null default 0");
    expect(migration).toContain("output_tokens integer not null default 0");
    expect(migration).toContain("search_count integer not null default 0");
    expect(migration).toContain("estimated_cost_usd numeric(12, 6) not null default 0");
    expect(migration).toContain("email_status text not null default 'pending'");
    expect(migration).toContain(
      "check (email_status in ('pending', 'sent', 'failed'))",
    );
    expect(migration).toContain("email_sent_at timestamptz");
    expect(migration).toContain(
      "error_message text check (error_message is null or char_length(error_message) <= 2000)",
    );
    expect(migration).toContain("unique (challenge_date, run_kind)");
    expect(migration).toContain(
      "comment on table public.daily_question_review_runs",
    );
  });

  it("creates review item storage with snapshots, findings, and resolutions", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain(
      "create table if not exists public.daily_question_review_items",
    );
    expect(migration).toMatch(
      /run_id uuid not null references public\.daily_question_review_runs \(id\) on delete cascade/,
    );
    expect(migration).toMatch(
      /daily_challenge_id uuid not null references public\.daily_challenges \(id\) on delete cascade/,
    );
    expect(migration).toContain("slot smallint not null check (slot between 1 and 5)");
    expect(migration).toMatch(
      /question_id uuid not null references public\.questions \(id\) on delete restrict/,
    );
    expect(migration).toContain("question_snapshot jsonb not null");
    expect(migration).toContain(
      "check (verdict in ('passed', 'risk', 'unable_to_verify'))",
    );
    expect(migration).toContain(
      "confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1)",
    );
    expect(migration).toContain(
      "explanation text check (explanation is null or char_length(explanation) <= 2000)",
    );
    expect(migration).toContain("conflicts jsonb not null default '[]'::jsonb");
    expect(migration).toContain(
      "source_fetch_results jsonb not null default '[]'::jsonb",
    );
    expect(migration).toContain("evidence jsonb not null default '[]'::jsonb");
    expect(migration).toMatch(
      /replacement_question_id uuid references public\.questions \(id\) on delete restrict/,
    );
    expect(migration).toContain("replacement_question_snapshot jsonb");
    expect(migration).toContain("replacement_finding jsonb");
    expect(migration).toContain("resolution text not null default 'pending'");
    expect(migration).toContain(
      "check (resolution in ('pending', 'kept', 'replaced'))",
    );
    expect(migration).toMatch(
      /resolved_by uuid references auth\.users \(id\) on delete set null/,
    );
    expect(migration).toContain("resolved_at timestamptz");
    expect(migration).toContain("application_metadata jsonb not null default '{}'::jsonb");
    expect(migration).toContain("applied_at timestamptz");
    expect(migration).toContain("unique (run_id, slot)");
    expect(migration).toContain("unique (id, daily_challenge_id)");
    expect(migration).toMatch(
      /foreign key \(run_id, daily_challenge_id\)\s+references public\.daily_question_review_runs \(id, daily_challenge_id\)\s+on delete cascade/,
    );
    expect(migration).toContain(
      "comment on table public.daily_question_review_items",
    );
  });

  it("adds indexes and keeps the tables and internal review view private", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(
      /create index if not exists daily_question_review_runs_status_challenge_date_idx\s+on public\.daily_question_review_runs \(status, challenge_date desc\);/,
    );
    expect(migration).toMatch(
      /create index if not exists daily_question_review_items_run_verdict_idx\s+on public\.daily_question_review_items \(run_id, verdict\);/,
    );
    expect(migration).toMatch(
      /create index if not exists daily_question_review_items_resolution_idx\s+on public\.daily_question_review_items \(resolution, created_at desc\);/,
    );
    expect(migration).toContain(
      "alter table public.daily_question_review_runs enable row level security",
    );
    expect(migration).toContain(
      "alter table public.daily_question_review_items enable row level security",
    );
    expect(migration).toContain(
      "revoke all on public.daily_question_review_runs from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on public.daily_question_review_items from public, anon, authenticated",
    );
    expect(migration).toContain("create schema if not exists internal");
    expect(migration).toContain(
      "revoke all on schema internal from public, anon, authenticated",
    );
    expect(migration).toContain(
      "create or replace view internal.daily_question_review",
    );
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("from public.daily_question_review_runs r");
    expect(migration).toContain("join public.daily_question_review_items i");
    expect(migration).toContain("join public.questions q");
    expect(migration).toContain("join public.sports s");
    expect(migration).toContain(
      "revoke all on internal.daily_question_review from public, anon, authenticated",
    );
    expect(migration).not.toMatch(
      /grant\s+[^;]*\bon\s+(?:table\s+)?(?:public\.(?:daily_question_review_runs|daily_question_review_items)|internal\.daily_question_review)\b[^;]*\bto\s+[^;]*\b(?:public|anon|authenticated)\b/i,
    );
  });
});
