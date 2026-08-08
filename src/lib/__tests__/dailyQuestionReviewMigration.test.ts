import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202608080001_nightly_question_verification.sql",
);

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: "single" | "double" | null = null;
  let dollarQuoteTag: string | null = null;
  let parenthesisDepth = 0;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const nextCharacter = sql[index + 1];
    current += character;

    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag.slice(1);
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      }
      continue;
    }

    if (quote === "single") {
      if (character === "'" && nextCharacter === "'") {
        current += nextCharacter;
        index += 1;
      } else if (character === "'") {
        quote = null;
      }
      continue;
    }

    if (quote === "double") {
      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter;
        index += 1;
      } else if (character === '"') {
        quote = null;
      }
      continue;
    }

    if (character === "$") {
      const dollarQuote = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(
        sql.slice(index),
      )?.[0];
      if (dollarQuote) {
        current += dollarQuote.slice(1);
        index += dollarQuote.length - 1;
        dollarQuoteTag = dollarQuote;
      }
    } else if (character === "'") {
      quote = "single";
    } else if (character === '"') {
      quote = "double";
    } else if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth -= 1;
      if (parenthesisDepth < 0) {
        throw new Error("SQL contains an unmatched closing parenthesis.");
      }
    } else if (character === ";" && parenthesisDepth === 0) {
      statements.push(current.trim());
      current = "";
    }
  }

  if (quote || dollarQuoteTag || parenthesisDepth !== 0 || current.trim()) {
    throw new Error("SQL contains an unterminated statement or delimiter.");
  }

  return statements;
}

function normalizedStatement(sql: string, prefix: string): string {
  const statement = splitSqlStatements(sql).find((candidate) =>
    candidate.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  if (!statement) {
    throw new Error(`Missing SQL statement: ${prefix}`);
  }

  return statement.replace(/\s+/g, " ");
}

describe("nightly question verification migration", () => {
  it("contains structurally balanced, terminated SQL statements", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const statements = splitSqlStatements(migration);

    expect(statements.length).toBeGreaterThanOrEqual(20);
    expect(
      statements.some((statement) =>
        statement.startsWith(
          "create table if not exists public.daily_question_review_runs",
        ),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.startsWith(
          "create table if not exists public.daily_question_review_items",
        ),
      ),
    ).toBe(true);
  });

  it("creates private review run storage with bounded operational metadata", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain(
      "create table if not exists public.daily_question_review_runs",
    );
    expect(migration).toMatch(
      /daily_challenge_id uuid not null references public\.daily_challenges \(id\) on delete cascade/,
    );
    expect(migration).toContain("review_date date not null");
    expect(migration).toContain("challenge_date date not null");
    expect(migration).toContain(
      "check (status in ('preparing', 'running', 'completed', 'completed_with_flags', 'failed'))",
    );
    expect(migration).not.toContain("'partial'");
    expect(migration).not.toContain("'budget_blocked'");
    expect(migration).toContain("run_kind text not null default 'scheduled'");
    expect(migration).toContain("check (run_kind in ('scheduled'))");
    expect(migration).toContain("model text not null");
    expect(migration).toContain("verifier_version text not null");
    expect(migration).toMatch(/\bstarted_at timestamptz,/);
    expect(migration).toContain("completed_at timestamptz");
    expect(migration).toContain("input_tokens integer not null default 0");
    expect(migration).toContain("output_tokens integer not null default 0");
    expect(migration).toContain("search_count integer not null default 0");
    expect(migration).toContain("estimated_cost_usd numeric(12, 6) not null default 0");
    expect(migration).toContain("email_status text not null default 'pending'");
    expect(migration).toContain(
      "check (email_status in ('pending', 'sending', 'sent', 'failed'))",
    );
    expect(migration).toContain("email_sent_at timestamptz");
    expect(migration).toContain(
      "errors jsonb not null default '[]'::jsonb",
    );
    expect(migration).toContain("jsonb_array_length(errors) <= 20");
    expect(migration).toContain(
      "email_metadata jsonb not null default",
    );
    expect(migration).toContain("jsonb_typeof(email_metadata) = 'object'");
    expect(migration).toContain("(email_metadata->>'attempts')::integer between 0 and 10");
    expect(migration).toContain(
      "email_metadata->'failure' ?& array['code', 'message', 'occurredAt']",
    );
    expect(migration).toContain(
      "char_length(email_metadata->'failure'->>'message') between 1 and 1000",
    );
    expect(migration).toContain("unique (review_date, run_kind)");
    expect(migration).toContain("unique (challenge_date, run_kind)");
    expect(migration).toContain("check (review_date < challenge_date)");
    expect(migration).toContain(
      "comment on table public.daily_question_review_runs",
    );
    expect(migration).toMatch(
      /comment on table public\.daily_question_review_runs is\s+'[^']*Service-role-only[^']*';/,
    );
  });

  it("enforces coherent run and email lifecycle timestamps", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const runsTable = normalizedStatement(
      migration,
      "create table if not exists public.daily_question_review_runs",
    );

    expect(runsTable).toContain("started_at timestamptz,");
    expect(runsTable).not.toContain("started_at timestamptz not null");
    expect(runsTable).toContain(
      "status = 'preparing' and started_at is null and completed_at is null",
    );
    expect(runsTable).toContain(
      "status = 'running' and started_at is not null and completed_at is null",
    );
    expect(runsTable).toContain(
      "status in ('completed', 'completed_with_flags') and started_at is not null and completed_at is not null",
    );
    expect(runsTable).toContain(
      "status = 'failed' and completed_at is not null",
    );
    expect(runsTable).toContain(
      "email_status = 'pending' and email_sent_at is null",
    );
    expect(runsTable).toContain(
      "email_status = 'sending' and email_sent_at is null",
    );
    expect(runsTable).toContain(
      "email_status = 'sending' and email_sent_at is null and (email_metadata->>'attempts')::integer >= 1 and jsonb_typeof(email_metadata->'providerMessageId') = 'null' and jsonb_typeof(email_metadata->'lastAttemptAt') = 'string' and jsonb_typeof(email_metadata->'failure') = 'null'",
    );
    expect(runsTable).toContain(
      "email_status = 'sent' and email_sent_at is not null",
    );
    expect(runsTable).toContain(
      "email_metadata->>'providerMessageId' is not null",
    );
    expect(runsTable).toContain(
      "email_status = 'failed' and email_sent_at is null",
    );
    expect(runsTable).toContain(
      "jsonb_typeof(email_metadata->'failure') = 'object'",
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
    expect(migration).toMatch(
      /question_snapshot \?& array\[\s*'id',\s*'question_text',\s*'option_a',\s*'option_b',\s*'option_c',\s*'option_d',\s*'correct_option',\s*'sport',\s*'difficulty',\s*'source_notes'\s*\]/,
    );
    expect(migration).toContain(
      "jsonb_typeof(question_snapshot->'question_text') = 'string'",
    );
    expect(migration).toContain(
      "jsonb_typeof(question_snapshot->'sport') = 'object'",
    );
    expect(migration).toContain(
      "question_snapshot->>'difficulty' in ('easy', 'medium', 'hard')",
    );
    expect(migration).toContain(
      "question_snapshot->>'correct_option' in ('A', 'B', 'C', 'D')",
    );
    expect(migration).toContain(
      "char_length(question_snapshot->>'source_notes') <= 4000",
    );
    expect(migration).toContain("review_status text not null default 'pending'");
    expect(migration).toContain(
      "check (review_status in ('pending', 'reviewing', 'completed', 'failed'))",
    );
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
    expect(migration).toContain("jsonb_array_length(conflicts) <= 10");
    expect(migration).toContain(
      "source_fetch_results jsonb not null default '[]'::jsonb",
    );
    expect(migration).toContain(
      "jsonb_array_length(source_fetch_results) <= 20",
    );
    expect(migration).toContain("evidence jsonb not null default '[]'::jsonb");
    expect(migration).toContain("jsonb_array_length(evidence) <= 10");
    expect(migration).toMatch(
      /replacement_question_id uuid references public\.questions \(id\) on delete restrict/,
    );
    expect(migration).toContain("replacement_question_snapshot jsonb");
    expect(migration).toMatch(
      /replacement_question_snapshot \?& array\[\s*'id',\s*'question_text',\s*'option_a',\s*'option_b',\s*'option_c',\s*'option_d',\s*'correct_option',\s*'sport',\s*'difficulty',\s*'source_notes'\s*\]/,
    );
    expect(migration).toContain("replacement_finding jsonb");
    expect(migration).toContain(
      "replacement_eligible boolean not null default false",
    );
    expect(migration).toContain("resolution text not null default 'pending'");
    expect(migration).toContain(
      "check (resolution in ('pending', 'kept', 'replaced'))",
    );
    expect(migration).toMatch(
      /resolved_by uuid references auth\.users \(id\) on delete restrict/,
    );
    expect(migration).toContain("resolved_at timestamptz");
    expect(migration).toContain("application_metadata jsonb not null default '{}'::jsonb");
    expect(migration).toContain("applied_at timestamptz");
    expect(migration).toContain("unique (run_id, slot)");
    expect(migration).toMatch(
      /verdict = 'unable_to_verify'\s+or jsonb_array_length\(evidence\) > 0/,
    );
    expect(migration).toContain("unique (id, daily_challenge_id)");
    expect(migration).toMatch(
      /foreign key \(run_id, daily_challenge_id\)\s+references public\.daily_question_review_runs \(id, daily_challenge_id\)\s+on delete cascade/,
    );
    expect(migration).toContain(
      "comment on table public.daily_question_review_items",
    );
    expect(migration).toMatch(
      /comment on table public\.daily_question_review_items is\s+'[^']*Service-role-only[^']*';/,
    );
  });

  it("enforces snapshot, replacement, and audit consistency", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const itemsTable = normalizedStatement(
      migration,
      "create table if not exists public.daily_question_review_items",
    );

    expect(itemsTable).toContain(
      "(question_snapshot->>'id')::uuid = question_id",
    );
    expect(itemsTable).toContain(
      "(replacement_question_snapshot->>'id')::uuid = replacement_question_id",
    );
    expect(itemsTable).toContain(
      "(replacement_finding->>'questionId')::uuid = replacement_question_id",
    );
    expect(itemsTable).toContain(
      "replacement_question_snapshot->>'difficulty' = question_snapshot->>'difficulty'",
    );
    expect(itemsTable).toContain(
      "replacement_finding->>'verdict' = 'passed'",
    );
    expect(itemsTable).toContain(
      "jsonb_array_length(replacement_finding->'evidence') > 0",
    );
    expect(itemsTable).toContain(
      "review_status in ('pending', 'reviewing', 'failed') and verdict is null",
    );
    expect(itemsTable).toContain(
      "review_status = 'completed' and verdict is not null",
    );
    expect(itemsTable).toContain(
      "resolution = 'pending' and resolved_by is null and resolved_at is null and applied_at is null",
    );
    expect(itemsTable).toContain(
      "resolution = 'kept' and review_status = 'completed' and resolved_by is not null and resolved_at is not null and applied_at is null",
    );
    expect(itemsTable).toContain(
      "resolution = 'replaced' and review_status = 'completed' and resolved_by is not null and resolved_at is not null and applied_at is not null",
    );
  });

  it("links each run challenge id to its immutable challenge date", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const runsTable = normalizedStatement(
      migration,
      "create table if not exists public.daily_question_review_runs",
    );

    expect(migration).toMatch(
      /create unique index if not exists daily_challenges_id_challenge_date_unique\s+on public\.daily_challenges \(id, challenge_date\);[\s\S]*create table if not exists public\.daily_question_review_runs/,
    );
    expect(runsTable).toContain(
      "foreign key (daily_challenge_id, challenge_date) references public.daily_challenges (id, challenge_date) on delete cascade",
    );
  });

  it("adds indexes and keeps the tables and internal review view private", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(
      /create index if not exists daily_question_review_runs_status_review_date_idx\s+on public\.daily_question_review_runs \(status, review_date desc\);/,
    );
    expect(migration).toMatch(
      /create index if not exists daily_question_review_items_run_verdict_idx\s+on public\.daily_question_review_items \(run_id, verdict\);/,
    );
    expect(migration).toMatch(
      /create index if not exists daily_question_review_items_run_status_idx\s+on public\.daily_question_review_items \(run_id, review_status\);/,
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
    expect(migration).not.toContain("join public.questions q");
    expect(migration).not.toContain("join public.sports s");
    expect(migration).toContain(
      "i.question_snapshot->'sport'->>'slug' as sport",
    );
    expect(migration).toContain(
      "i.question_snapshot->'sport'->>'name' as sport_name",
    );
    expect(migration).toContain(
      "i.question_snapshot->>'difficulty' as difficulty",
    );
    expect(migration).toContain(
      "revoke all on internal.daily_question_review from public, anon, authenticated",
    );
    expect(migration).toMatch(
      /comment on view internal\.daily_question_review is\s+'[^']*Service-role-only[^']*';/,
    );
    expect(migration).not.toMatch(
      /grant\s+[^;]*\bon\s+(?:table\s+)?(?:public\.(?:daily_question_review_runs|daily_question_review_items)|internal\.daily_question_review)\b[^;]*\bto\s+[^;]*\b(?:public|anon|authenticated)\b/i,
    );
    expect(migration).toContain(
      "grant select, insert, update on public.daily_question_review_runs to service_role",
    );
    expect(migration).toContain(
      "grant select, insert, update on public.daily_question_review_items to service_role",
    );
    expect(migration).toContain(
      "grant usage on schema internal to service_role",
    );
    expect(migration).toContain(
      "grant select on internal.daily_question_review to service_role",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:all|delete)[^;]*daily_question_review_(?:runs|items)[^;]*service_role/i,
    );
  });

  it("maintains updated_at with the established trigger function", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(
      /drop trigger if exists daily_question_review_runs_set_updated_at\s+on public\.daily_question_review_runs;\s+create trigger daily_question_review_runs_set_updated_at\s+before update on public\.daily_question_review_runs\s+for each row\s+execute function public\.set_updated_at\(\);/,
    );
    expect(migration).toMatch(
      /drop trigger if exists daily_question_review_items_set_updated_at\s+on public\.daily_question_review_items;\s+create trigger daily_question_review_items_set_updated_at\s+before update on public\.daily_question_review_items\s+for each row\s+execute function public\.set_updated_at\(\);/,
    );
  });

  it("publishes only complete generated challenges through a service-role-only RPC", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(
      /create or replace function public\.publish_daily_challenge\(\s*p_challenge_id uuid,\s*p_challenge_date date,\s*p_published_at timestamptz\s*\)\s*returns text/i,
    );
    expect(migration).toContain("security definer");
    expect(migration).toMatch(
      /from public\.daily_challenges[\s\S]*id = p_challenge_id[\s\S]*challenge_date = p_challenge_date[\s\S]*for update/,
    );
    expect(migration).toContain("count(distinct i.slot)");
    expect(migration).toContain("min(i.slot)");
    expect(migration).toContain("max(i.slot)");
    expect(migration).toContain("count(distinct i.question_id)");
    expect(migration).toContain(
      "i.question_snapshot->>'id' = i.question_id::text",
    );
    expect(migration).toContain(
      "i.question_snapshot->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
    );
    expect(migration).toMatch(
      /i\.question_snapshot \?& array\[[\s\S]*'question_text'[\s\S]*'correct_option'[\s\S]*'source_notes'[\s\S]*\]/,
    );
    expect(migration).toContain("jsonb_typeof(i.question_snapshot->'sport') = 'object'");
    expect(migration).toContain("btrim(i.question_snapshot->>'question_text') <> ''");
    expect(migration).toContain("return 'incomplete'");
    expect(migration).toContain("return 'conflict'");
    expect(migration).toContain("return 'published'");
    expect(migration).toMatch(
      /if p_published_at is null then\s+return 'conflict';/,
    );
    expect(migration).toMatch(
      /update public\.daily_challenges[\s\S]*set status = 'published',[\s\S]*published_at = p_published_at/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.publish_daily_challenge\(uuid, date, timestamptz\)\s+from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.publish_daily_challenge\(uuid, date, timestamptz\)\s+to service_role/,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.publish_daily_challenge\([^;]+\) to (?:public|anon|authenticated)/i,
    );
  });

  it("prepares the challenge row and all five immutable items in one service-role transaction", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const statement = normalizedStatement(
      migration,
      "create or replace function public.prepare_daily_challenge_draft",
    );

    expect(statement).toMatch(
      /prepare_daily_challenge_draft\( p_challenge_date date, p_generation_method text, p_rules_version text, p_generated_at timestamptz, p_items jsonb \) returns jsonb/i,
    );
    expect(statement).toContain("security definer");
    expect(statement).toContain("set search_path = public, pg_temp");
    expect(statement).toContain("jsonb_array_length(p_items) <> 5");
    expect(statement).toContain("count(distinct case");
    expect(statement).toContain("then (item->>'slot')::smallint");
    expect(statement).toContain("count(distinct lower(item->>'question_id'))");
    expect(statement).toContain(
      "item->'question_snapshot'->>'id' = item->>'question_id'",
    );
    expect(statement).toContain("insert into public.daily_challenges");
    expect(statement).toContain("insert into public.daily_challenge_items");
    expect(statement).toContain("when unique_violation");
    expect(statement).toMatch(/where c\.challenge_date = p_challenge_date[\s\S]*for update/);
    expect(statement).toContain("'outcome', 'created'");
    expect(statement).toContain("'outcome', 'existing'");
    expect(statement).toContain("'outcome', 'conflict'");
    expect(statement).toContain("'outcome', 'incomplete'");
    expect(statement).not.toContain("status = 'published'");
    expect(statement).not.toContain("published_at =");
    expect(migration).toMatch(
      /revoke all on function public\.prepare_daily_challenge_draft\(date, text, text, timestamptz, jsonb\)\s+from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.prepare_daily_challenge_draft\(date, text, text, timestamptz, jsonb\)\s+to service_role/,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.prepare_daily_challenge_draft\([^;]+\) to (?:public|anon|authenticated)/i,
    );
  });

  it("cleans stale incomplete drafts atomically without deleting a completed race winner", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const statement = normalizedStatement(
      migration,
      "create or replace function public.cleanup_stale_daily_challenge",
    );

    expect(statement).toMatch(
      /cleanup_stale_daily_challenge\( p_challenge_id uuid, p_challenge_date date, p_generated_at timestamptz \) returns jsonb/i,
    );
    expect(statement).toContain("security definer");
    expect(statement).toContain("set search_path = public, pg_temp");
    expect(statement).toMatch(/where c\.id = p_challenge_id[\s\S]*for update/);
    expect(statement).toContain("challenge_date_value <> p_challenge_date");
    expect(statement).toContain(
      "challenge_generated_at is distinct from p_generated_at",
    );
    expect(statement).toContain("public.daily_challenge_is_complete(p_challenge_id)");
    expect(statement).toContain("delete from public.daily_challenges");
    expect(statement).toContain("'outcome', 'deleted'");
    expect(statement).toContain("'outcome', 'complete'");
    expect(statement).toContain("'outcome', 'conflict'");
    expect(statement).toContain("'outcome', 'missing'");
    expect(migration).toMatch(
      /revoke all on function public\.cleanup_stale_daily_challenge\(uuid, date, timestamptz\)\s+from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cleanup_stale_daily_challenge\(uuid, date, timestamptz\)\s+to service_role/,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.cleanup_stale_daily_challenge\([^;]+\) to (?:public|anon|authenticated)/i,
    );
  });
});
