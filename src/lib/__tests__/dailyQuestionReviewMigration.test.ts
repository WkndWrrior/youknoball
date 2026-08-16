import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202608080001_nightly_question_verification.sql",
);
const answerCorrectionMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202608150001_daily_review_answer_corrections.sql",
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
    expect(runsTable).toContain(
      "estimated_cost_usd = estimated_cost_microdollars::numeric / 1000000",
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
    expect(migration).toContain("verified_at timestamptz");
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
    expect(migration).toContain(
      "replacement_attempted boolean not null default false",
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
      "not replacement_attempted and replacement_question_id is null",
    );
    expect(itemsTable).toContain(
      "replacement_attempted and replacement_question_id is null",
    );
    expect(itemsTable).toContain(
      "jsonb_array_length(replacement_finding->'evidence') > 0",
    );
    expect(itemsTable).toContain(
      "review_status in ('pending', 'reviewing') and verdict is null",
    );
    expect(itemsTable).toContain(
      "review_status = 'failed' and (",
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

  it("stores bounded integer usage and an atomic private reservation ledger", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("cached_input_tokens integer not null default 0");
    expect(migration).toContain("cache_write_tokens integer not null default 0");
    expect(migration).toContain(
      "estimated_cost_microdollars bigint not null default 0",
    );
    expect(migration).toContain(
      "create table if not exists public.daily_question_review_reservations",
    );
    expect(migration).toContain(
      "reserved_microdollars bigint not null",
    );
    expect(migration).toContain(
      "check (reserved_microdollars between 0 and 9007199254740991)",
    );
    expect(migration).toMatch(
      /status = 'active'[\s\S]*reserved_microdollars > 0[\s\S]*actual_microdollars = 0/,
    );
    expect(migration).toContain(
      "actual_microdollars bigint not null default 0",
    );
    expect(migration).toContain(
      "run_cost_baseline_microdollars bigint not null default 0",
    );
    expect(migration).toContain(
      "check (status in ('active', 'reconciled', 'released', 'denied'))",
    );
    expect(migration).toMatch(
      /create unique index if not exists daily_question_review_reservations_active_challenge_unique[\s\S]*where status = 'active';/,
    );
    expect(migration).toMatch(
      /create unique index if not exists daily_question_review_reservations_denied_challenge_unique[\s\S]*where status = 'denied';/,
    );
    expect(migration).toContain(
      "alter table public.daily_question_review_reservations enable row level security",
    );
    expect(migration).toContain(
      "revoke all on public.daily_question_review_reservations from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update on public.daily_question_review_reservations to service_role",
    );
  });

  it("acquires and reconciles reservations atomically under a database lock", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const acquire = normalizedStatement(
      migration,
      "create or replace function public.acquire_daily_question_review_reservation",
    );
    const reconcile = normalizedStatement(
      migration,
      "create or replace function public.reconcile_daily_question_review_reservation",
    );

    expect(acquire).toContain("security definer");
    expect(acquire).toContain("set search_path = pg_catalog, public");
    expect(acquire).toContain("pg_advisory_xact_lock");
    expect(acquire).toContain(
      "p_required_reservation_microdollars = p_model_derived_reservation_microdollars",
    );
    expect(acquire).toContain(
      "p_model_derived_reservation_microdollars = 5040000",
    );
    expect(acquire).toMatch(
      /case when status = 'active' then reserved_microdollars else actual_microdollars end/,
    );
    expect(acquire).toContain(
      "v_committed_microdollars + p_required_reservation_microdollars > p_limit_microdollars",
    );
    expect(acquire).toContain(
      "on conflict (challenge_date, run_kind) where status = 'denied' do nothing",
    );
    expect(acquire).toContain("'denial_created', v_denial_created");
    expect(acquire).toContain("run_cost_baseline_microdollars");
    expect(acquire).toContain(
      "'run_cost_baseline_microdollars', v_existing.run_cost_baseline_microdollars",
    );
    expect(acquire).toContain(
      "'run_cost_baseline_microdollars', v_run_cost_baseline_microdollars",
    );
    expect(acquire).toContain("'reserved_microdollars', p_required_reservation_microdollars");
    expect(reconcile).toContain("security definer");
    expect(reconcile).toContain("pg_advisory_xact_lock");
    expect(reconcile).toContain("daily-question-review-reservation/");
    expect(reconcile).toContain("p_actual_microdollars = 0");
    expect(reconcile).toContain("from public.daily_question_review_runs");
    expect(reconcile).toContain("'outcome', 'bound'");
    expect(reconcile).toContain("p_actual_microdollars <= v_reservation.reserved_microdollars");
    expect(reconcile).toContain(
      "status = case when p_actual_microdollars = 0 then 'released' else 'reconciled' end",
    );

    for (const signature of [
      "public.acquire_daily_question_review_reservation(date, date, text, bigint, bigint, timestamptz, timestamptz, bigint, timestamptz)",
      "public.reconcile_daily_question_review_reservation(uuid, bigint, timestamptz)",
    ]) {
      expect(migration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated`,
      );
      expect(migration).toContain(
        `grant execute on function ${signature} to service_role`,
      );
    }
    expect(migration).not.toMatch(
      /grant execute on function public\.(?:acquire|reconcile)_daily_question_review_reservation[^;]*to (?:public|anon|authenticated)/,
    );
  });

  it("persists and atomically claims retryable budget-denial email delivery", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const claim = normalizedStatement(
      migration,
      "create or replace function public.claim_daily_question_review_budget_email",
    );

    expect(migration).toContain("budget_email_status text not null");
    expect(migration).toContain(
      "budget_email_status in ('not_applicable', 'pending', 'sending', 'sent', 'failed')",
    );
    expect(migration).toContain("budget_email_metadata jsonb not null");
    expect(claim).toContain("status = 'denied'");
    expect(claim).toContain("budget_email_status in ('pending', 'failed')");
    expect(claim).toContain("budget_email_status = 'sending'");
    expect(claim).toContain("clock_timestamp() - interval '15 minutes'");
    expect(claim).toContain(
      "(budget_email_metadata->>'attempts')::integer < 10",
    );
    expect(migration).toContain(
      "revoke all on function public.claim_daily_question_review_budget_email(date, timestamptz) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.claim_daily_question_review_budget_email(date, timestamptz) to service_role",
    );
  });

  it("atomically claims the oldest retryable prior budget-denial email", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const claim = normalizedStatement(
      migration,
      "create or replace function public.claim_oldest_daily_question_review_budget_email",
    );

    expect(migration).toContain("remaining_microdollars bigint");
    expect(claim).toContain("r.challenge_date < p_before_challenge_date");
    expect(claim).toContain("r.budget_email_status in ('pending', 'failed')");
    expect(claim).toContain("r.budget_email_status = 'sending'");
    expect(claim).toContain("clock_timestamp() - interval '15 minutes'");
    expect(claim).toContain("(r.budget_email_metadata->>'attempts')::integer < 10");
    expect(claim).toContain("order by r.challenge_date, r.created_at");
    expect(claim).toContain("for update skip locked");
    expect(migration).toContain(
      "revoke all on function public.claim_oldest_daily_question_review_budget_email(date, timestamptz) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.claim_oldest_daily_question_review_budget_email(date, timestamptz) to service_role",
    );
  });

  it("serializes run binding with zero-cost reservation release", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const guard = normalizedStatement(
      migration,
      "create or replace function public.guard_daily_question_review_run_reservation",
    );

    expect(guard).toContain("pg_advisory_xact_lock");
    expect(guard).toContain("daily-question-review-reservation/");
    expect(guard).toContain("status = 'active'");
    expect(guard).toContain("raise exception");
    expect(migration).toContain(
      "create trigger daily_question_review_runs_guard_reservation",
    );
  });

  it("finds the oldest recoverable prior review without exposing it to clients", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const recovery = normalizedStatement(
      migration,
      "create or replace function public.find_oldest_recoverable_daily_question_review",
    );

    expect(recovery).toContain("p_before_challenge_date date");
    expect(recovery).toContain("r.challenge_date < p_before_challenge_date");
    expect(recovery).toContain("r.status in ('preparing', 'running')");
    expect(recovery).toContain("r.email_status in ('pending', 'failed')");
    expect(recovery).toContain("r.email_status = 'sending'");
    expect(recovery).toContain(
      "r.updated_at <= clock_timestamp() - interval '15 minutes'",
    );
    expect(recovery).toContain(
      "(r.email_metadata->>'attempts')::integer < 10",
    );
    expect(recovery).toContain("order by r.challenge_date, r.created_at");
    expect(migration).toContain(
      "revoke all on function public.find_oldest_recoverable_daily_question_review(date) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.find_oldest_recoverable_daily_question_review(date) to service_role",
    );
  });

  it("atomically reclaims stale running reviews with a fenced lease", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const claim = normalizedStatement(
      migration,
      "create or replace function public.claim_daily_question_review_run",
    );
    const heartbeat = normalizedStatement(
      migration,
      "create or replace function public.heartbeat_daily_question_review_run",
    );

    expect(migration).toContain("claim_token uuid not null");
    expect(migration).toContain("heartbeat_at timestamptz not null");
    expect(migration).toContain("lease_expires_at timestamptz not null");
    expect(claim).toContain("security definer");
    expect(claim).toContain("for update");
    expect(claim).toContain("status = 'failed'");
    expect(claim).toContain("v_run.status in ('preparing', 'running')");
    expect(claim).toContain("lease_expires_at <= clock_timestamp()");
    expect(claim).toContain(
      "started_at = coalesce(v_run.started_at, p_claimed_at)",
    );
    expect(claim).toContain("claim_token = gen_random_uuid()");
    expect(heartbeat).toContain("security definer");
    expect(heartbeat).toContain("claim_token = p_claim_token");
    expect(heartbeat).toContain("lease_expires_at > p_heartbeat_at");
    expect(heartbeat).toContain("lease_expires_at > clock_timestamp()");

    for (const signature of [
      "public.claim_daily_question_review_run(date, date, timestamptz, timestamptz)",
      "public.heartbeat_daily_question_review_run(uuid, uuid, timestamptz, timestamptz)",
    ]) {
      expect(migration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated`,
      );
      expect(migration).toContain(
        `grant execute on function ${signature} to service_role`,
      );
    }
  });

  it("atomically persists token-fenced progress and finalizes from persisted totals", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const progress = normalizedStatement(
      migration,
      "create or replace function public.persist_daily_question_review_progress",
    );
    const finalize = normalizedStatement(
      migration,
      "create or replace function public.finalize_daily_question_review_run",
    );

    expect(migration).toContain(
      "create table if not exists public.daily_question_review_usage_events",
    );
    expect(migration).toContain("input_tokens integer not null");
    expect(migration).toContain("estimated_cost_microdollars bigint not null");
    expect(migration).toContain(
      "revoke all on public.daily_question_review_usage_events from public, anon, authenticated",
    );
    expect(progress).toContain("security definer");
    expect(progress).toContain("for update");
    expect(progress).toContain("claim_token = p_claim_token");
    expect(progress).toContain("lease_expires_at > p_heartbeat_at");
    expect(progress).toContain("lease_expires_at > clock_timestamp()");
    expect(progress).toContain("on conflict (id) do nothing");
    expect(progress).toContain("usage_applied");
    expect(progress).toContain("insert into public.daily_question_review_items");
    expect(progress).toContain("heartbeat_at = p_heartbeat_at");
    expect(progress).toContain("p_run_errors jsonb");
    expect(progress).toContain("p_replacement_attempted boolean");
    expect(progress).toContain("replacement_attempted = excluded.replacement_attempted");
    expect(progress).toContain("jsonb_array_length(p_run_errors) > 20");
    expect(progress).toContain("octet_length(p_run_errors::text) > 20000");
    expect(progress).toContain("errors = p_run_errors");
    expect(finalize).toContain("security definer");
    expect(finalize).toContain("claim_token = p_claim_token");
    expect(finalize).toContain("lease_expires_at > p_completed_at");
    expect(finalize).toContain("lease_expires_at > clock_timestamp()");
    expect(finalize).toContain(
      "v_reservation_actual_microdollars := v_run.estimated_cost_microdollars - v_reservation.run_cost_baseline_microdollars",
    );
    expect(finalize).toContain(
      "v_reservation_actual_microdollars := v_reservation.reserved_microdollars",
    );
    expect(finalize).toContain("review_status = 'failed'");
    expect(finalize).toContain("v_final_status := 'failed'");
    expect(finalize).not.toContain("p_errors jsonb");
    expect(finalize).not.toContain("errors = p_errors");
    expect(finalize).toContain(
      "v_reservation_actual_microdollars between 0 and v_reservation.reserved_microdollars",
    );

    for (const signature of [
      "public.persist_daily_question_review_progress(uuid, uuid, timestamptz, timestamptz, uuid, smallint, uuid, jsonb, text, jsonb, text, numeric, text, jsonb, jsonb, timestamptz, boolean, uuid, boolean, jsonb, jsonb, jsonb, uuid, text, integer, integer, integer, integer, integer, bigint)",
      "public.finalize_daily_question_review_run(uuid, uuid, uuid, text, timestamptz)",
    ]) {
      expect(migration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated`,
      );
      expect(migration).toContain(
        `grant execute on function ${signature} to service_role`,
      );
    }
  });

  it("claims review email delivery with a service-role-only atomic transition", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const claim = normalizedStatement(
      migration,
      "create or replace function public.claim_daily_question_review_email",
    );

    expect(claim).toContain("security definer");
    expect(claim).toContain("email_status in ('pending', 'failed')");
    expect(claim).toContain("clock_timestamp() - interval '15 minutes'");
    expect(claim).not.toContain(
      "updated_at <= p_attempted_at - interval '15 minutes'",
    );
    expect(claim).toContain("(email_metadata->>'attempts')::integer + 1");
    expect(claim).toContain("email_status = 'sending'");
    expect(migration).toContain(
      "revoke all on function public.claim_daily_question_review_email(uuid, timestamptz) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.claim_daily_question_review_email(uuid, timestamptz) to service_role",
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
    const statement = normalizedStatement(
      migration,
      "create or replace function public.publish_daily_challenge",
    );

    expect(migration).toMatch(
      /create or replace function public\.publish_daily_challenge\(\s*p_challenge_id uuid,\s*p_challenge_date date,\s*p_published_at timestamptz\s*\)\s*returns text/i,
    );
    expect(migration).toContain("security definer");
    expect(migration).toMatch(
      /from public\.daily_challenges[\s\S]*id = p_challenge_id[\s\S]*challenge_date = p_challenge_date[\s\S]*for update/,
    );
    expect(statement).toMatch(
      /from public\.daily_challenge_items i where i\.daily_challenge_id = p_challenge_id order by i\.slot for update/,
    );
    expect(statement.indexOf("from public.daily_challenges")).toBeLessThan(
      statement.indexOf("from public.daily_challenge_items i"),
    );
    expect(statement.indexOf("from public.daily_challenge_items i")).toBeLessThan(
      statement.indexOf("public.daily_challenge_is_complete(p_challenge_id)"),
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
    expect(migration).toContain("public.daily_challenge_text_is_valid(");
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

  it("uses one POSIX-whitespace-aware bounded text contract for draft payloads", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const helper = normalizedStatement(
      migration,
      "create or replace function public.daily_challenge_text_is_valid",
    );
    const completeness = normalizedStatement(
      migration,
      "create or replace function public.daily_challenge_is_complete",
    );
    const preparation = normalizedStatement(
      migration,
      "create or replace function public.prepare_daily_challenge_draft",
    );

    expect(helper).toContain("[[:space:]]");
    expect(helper).toContain("regexp_replace");
    expect(helper).toContain("p_require_nonempty");
    for (const statement of [completeness, preparation]) {
      expect(statement).toContain("public.daily_challenge_text_is_valid");
      expect(statement).not.toMatch(/char_length\(btrim\([^)]*question_text/);
      expect(statement).not.toMatch(/char_length\(btrim\([^)]*option_[abcd]/);
    }
    expect(migration).toMatch(
      /revoke all on function public\.daily_challenge_text_is_valid\(text, integer, boolean\)\s+from public, anon, authenticated/,
    );
  });

  it("resolves only the stored replacement while the challenge remains a draft", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const statement = normalizedStatement(
      migration,
      "create or replace function public.resolve_daily_question_review_item",
    );
    expect(statement).toContain("security definer");
    expect(statement).toContain("for update");
    expect(statement).toContain("replacement_eligible");
    expect(statement).toContain("replacement_question_id");
    expect(statement).toContain("status = 'ready'");
    expect(statement).toContain("eligible_for_daily");
    expect(statement).toContain("v_challenge.published_at is not null");
    expect(statement).toContain("v_challenge.status <> 'generated'");
    expect(statement).toContain("replacement_question_snapshot->>'difficulty'");
    expect(statement).toContain("question_snapshot->>'difficulty'");
    expect(statement).toContain("update public.daily_challenge_items");
    expect(statement).toContain("application_metadata");
    expect(migration).toMatch(
      /revoke all on function public\.resolve_daily_question_review_item\(uuid, date, text, uuid, uuid, timestamptz\)\s+from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.resolve_daily_question_review_item\(uuid, date, text, uuid, uuid, timestamptz\)\s+to service_role/,
    );
  });
});

describe("daily review answer correction migration", () => {
  it("adds an all-or-none answer correction claim lease", async () => {
    const migration = await readFile(answerCorrectionMigrationPath, "utf8");
    const normalized = migration.replace(/\s+/g, " ");

    expect(normalized).toContain(
      "add column answer_correction_claim_token uuid, add column answer_correction_claimed_by uuid, add column answer_correction_claimed_option text, add column answer_correction_claim_expires_at timestamptz",
    );
    expect(normalized).toContain(
      "constraint daily_question_review_items_answer_correction_claim_check",
    );
    expect(normalized).toContain(
      "answer_correction_claim_token is null and answer_correction_claimed_by is null and answer_correction_claimed_option is null and answer_correction_claim_expires_at is null",
    );
    expect(normalized).toContain(
      "answer_correction_claim_token is not null and answer_correction_claimed_by is not null and answer_correction_claimed_option in ('A', 'B', 'C', 'D') and answer_correction_claim_expires_at is not null",
    );
  });

  it("privately claims a bounded correction lease after finalized-run precheck and item-to-run locking", async () => {
    const migration = await readFile(answerCorrectionMigrationPath, "utf8");
    const claim = normalizedStatement(
      migration,
      "create or replace function public.claim_daily_question_review_answer_correction",
    );
    const signature =
      "public.claim_daily_question_review_answer_correction(uuid, date, text, uuid, uuid)";

    expect(claim).toContain("security definer");
    expect(claim).toContain("set search_path = pg_catalog, public");
    const initialItemRead = claim.indexOf(
      "select i.run_id into v_initial_run_id from public.daily_question_review_items i",
    );
    const runPrecheck = claim.indexOf(
      "select r.* into v_precheck_run from public.daily_question_review_runs r",
    );
    const itemLock = claim.indexOf(
      "select i.* into v_item from public.daily_question_review_items i",
    );
    const runLock = claim.indexOf(
      "select r.* into v_run from public.daily_question_review_runs r",
    );
    expect(initialItemRead).toBeGreaterThan(-1);
    expect(runPrecheck).toBeGreaterThan(initialItemRead);
    expect(itemLock).toBeGreaterThan(runPrecheck);
    expect(runLock).toBeGreaterThan(itemLock);
    expect(claim.slice(initialItemRead, itemLock)).not.toContain("for update");
    expect(claim.slice(itemLock, runLock)).toContain("for update");
    expect(claim.slice(runLock)).toContain("for update");
    expect(claim).toContain(
      "v_precheck_run.status not in ('completed', 'completed_with_flags')",
    );
    expect(claim).toContain("v_precheck_run.completed_at is null");
    expect(claim).toContain("v_item.run_id <> v_initial_run_id");
    expect(claim).toContain("v_item.review_status <> 'completed'");
    expect(claim).toContain("v_item.resolution <> 'pending'");
    expect(claim).toContain("v_item.verdict not in ('risk', 'unable_to_verify')");
    expect(claim).toContain("p_new_correct_option = v_old_correct_option");
    expect(claim).toContain("v_challenge.status <> 'generated'");
    expect(claim).toContain("v_challenge.published_at is not null");
    expect(claim).toContain("answer_correction_claim_expires_at > clock_timestamp()");
    expect(claim).toContain("'outcome', 'busy'");
    expect(claim).toContain("clock_timestamp() + interval '3 minutes'");
    expect(claim).toContain("answer_correction_claim_token = p_claim_token");
    expect(claim).toContain("answer_correction_claimed_by = p_claimed_by");
    expect(claim).toContain("answer_correction_claimed_option = p_new_correct_option");
    expect(migration).toContain(
      `revoke all on function ${signature} from public, anon, authenticated`,
    );
    expect(migration).toContain(
      `grant execute on function ${signature} to service_role`,
    );
  });

  it("releases only the matching answer correction claim token", async () => {
    const migration = await readFile(answerCorrectionMigrationPath, "utf8");
    const release = normalizedStatement(
      migration,
      "create or replace function public.release_daily_question_review_answer_correction",
    );
    const signature =
      "public.release_daily_question_review_answer_correction(uuid, uuid)";

    expect(release).toContain("security definer");
    expect(release).toContain("answer_correction_claim_token = p_claim_token");
    expect(release).toContain("answer_correction_claim_token = null");
    expect(release).toContain("answer_correction_claimed_by = null");
    expect(release).toContain("answer_correction_claimed_option = null");
    expect(release).toContain("answer_correction_claim_expires_at = null");
    expect(release).toContain("'outcome', 'released'");
    expect(release).toContain("'outcome', 'not_owned'");
    expect(migration).toContain(
      `revoke all on function ${signature} from public, anon, authenticated`,
    );
    expect(migration).toContain(
      `grant execute on function ${signature} to service_role`,
    );
  });

  it("safely replaces the unnamed resolution-state check with a named compatible constraint", async () => {
    const migration = await readFile(answerCorrectionMigrationPath, "utf8");
    const resolutionStateStart = migration.indexOf(
      "alter table public.daily_question_review_items",
    );
    const correctionFunctionStart = migration.indexOf(
      "create or replace function public.correct_daily_question_review_answer",
    );
    expect(resolutionStateStart).toBeGreaterThan(-1);
    expect(correctionFunctionStart).toBeGreaterThan(resolutionStateStart);
    const resolutionState = migration
      .slice(resolutionStateStart, correctionFunctionStart)
      .replace(/\s+/g, " ");

    expect(migration).toContain("from pg_catalog.pg_constraint c");
    expect(migration).toContain("c.contype = 'c'");
    for (const governedColumn of [
      "resolution",
      "resolved_by",
      "resolved_at",
      "applied_at",
      "application_metadata",
    ]) {
      expect(migration).toContain(
        `position('${governedColumn}' in pg_catalog.pg_get_constraintdef(c.oid)) > 0`,
      );
    }
    expect(migration).toContain(
      "coalesce(cardinality(v_resolution_constraint_names), 0) <> 1",
    );
    expect(migration).toContain(
      "raise exception 'Expected exactly one existing daily question review resolution-state check constraint.'",
    );
    expect(migration).toContain(
      "drop constraint %I",
    );

    expect(resolutionState).toContain(
      "alter table public.daily_question_review_items add constraint daily_question_review_items_resolution_state_check",
    );
    expect(resolutionState).toContain(
      "resolution = 'pending' and resolved_by is null and resolved_at is null and applied_at is null and application_metadata = '{}'::jsonb",
    );
    expect(resolutionState).toContain(
      "resolution = 'kept' and review_status = 'completed' and resolved_by is not null and resolved_at is not null and applied_at is null",
    );
    expect(resolutionState).toContain(
      "application_metadata = '{}'::jsonb",
    );
    expect(resolutionState).toMatch(
      /application_metadata \?& array\[\s*'action',\s*'previousCorrectOption',\s*'newCorrectOption'\s*\]/,
    );
    expect(resolutionState).toContain(
      "application_metadata - array['action', 'previousCorrectOption', 'newCorrectOption'] = '{}'::jsonb",
    );
    expect(resolutionState).toContain(
      "application_metadata->>'action' = 'correct_answer'",
    );
    expect(resolutionState).toContain(
      "application_metadata->>'previousCorrectOption' in ('A', 'B', 'C', 'D')",
    );
    expect(resolutionState).toContain(
      "application_metadata->>'newCorrectOption' in ('A', 'B', 'C', 'D')",
    );
    expect(resolutionState).toContain(
      "application_metadata->>'previousCorrectOption' <> application_metadata->>'newCorrectOption'",
    );
    expect(resolutionState).toContain("verdict = 'passed'");
    expect(resolutionState).toContain("jsonb_array_length(evidence) > 0");
    expect(resolutionState).toContain(
      "question_snapshot->>'correct_option' = application_metadata->>'newCorrectOption'",
    );
    expect(resolutionState).toContain(
      "resolution = 'replaced' and review_status = 'completed' and resolved_by is not null and resolved_at is not null and applied_at is not null and resolved_at >= created_at and applied_at >= resolved_at",
    );
  });

  it("creates a private service-role-only correction RPC", async () => {
    const migration = await readFile(answerCorrectionMigrationPath, "utf8");
    const correction = normalizedStatement(
      migration,
      "create or replace function public.correct_daily_question_review_answer",
    );
    const signature =
      "public.correct_daily_question_review_answer(uuid, uuid, date, text, uuid, text, numeric, text, jsonb, jsonb, timestamptz, uuid, timestamptz)";

    expect(correction).toContain("security definer");
    expect(correction).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain(
      `revoke all on function ${signature} from public, anon, authenticated`,
    );
    expect(migration).toContain(
      `grant execute on function ${signature} to service_role`,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.correct_daily_question_review_answer\([^;]+\) to (?:public|anon|authenticated)/i,
    );
  });

  it("locks and validates every row and normalized passed finding before mutation", async () => {
    const migration = await readFile(answerCorrectionMigrationPath, "utf8");
    const correction = normalizedStatement(
      migration,
      "create or replace function public.correct_daily_question_review_answer",
    );

    expect(migration).toMatch(
      /or\s+\(\s*case\s+when jsonb_typeof\(p_finding_conflicts\) = 'array'/,
    );
    expect(migration).toMatch(
      /or\s+\(\s*case\s+when jsonb_typeof\(p_finding_evidence\) = 'array'/,
    );

    expect(correction).toContain("p_new_correct_option not in ('A', 'B', 'C', 'D')");
    expect(correction).toContain("p_finding_verdict <> 'passed'");
    expect(correction).toContain("p_finding_confidence between 0 and 1");
    expect(correction).toContain(
      "char_length(btrim(p_finding_explanation)) between 1 and 2000",
    );
    expect(correction).toContain("jsonb_array_length(p_finding_conflicts) > 10");
    expect(correction).toContain("jsonb_array_length(p_finding_evidence) between 1 and 10");
    expect(correction).toContain(
      "evidence.value - array['url', 'title', 'excerpt', 'retrievedAt'] <> '{}'::jsonb",
    );
    expect(correction).toMatch(/select lower\(\s*substring/);
    expect(correction).toContain(
      "substring(evidence.value->>'url' from '^https://([^/?#]+)')",
    );
    expect(correction).toContain("approved_source.domain");
    expect(correction).toContain("evidence_authority.authority like '%.' || approved_source.domain");
    expect(correction).toContain(
      "evidence_authority.authority !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'",
    );
    const approvedDomainBlock = /from \(values ([\s\S]*?)\) as approved_source\(domain\)/.exec(
      correction,
    )?.[1];
    const approvedDomains = approvedDomainBlock
      ? Array.from(approvedDomainBlock.matchAll(/\('([^']+)'\)/g), (match) => match[1])
      : [];
    expect(approvedDomains).toEqual([
      "baseball-reference.com",
      "baseballhall.org",
      "basketball-reference.com",
      "espn.com",
      "goduke.com",
      "heisman.com",
      "hhof.com",
      "hockey-reference.com",
      "lsusports.net",
      "mlb.com",
      "nba.com",
      "ncaa.com",
      "nfl.com",
      "nhl.com",
      "osubeavers.com",
      "pro-football-reference.com",
      "sabr.org",
      "seahawks.com",
      "sports-reference.com",
      "uconnhuskies.com",
      "uhcougars.com",
    ]);
    const sourceFetcher = await readFile(
      path.join(process.cwd(), "src/lib/server/dailyQuestionSourceFetcher.ts"),
      "utf8",
    );
    const defaultDomainBlock = /const DEFAULT_APPROVED_SOURCE_DOMAINS = \[([\s\S]*?)\] as const;/.exec(
      sourceFetcher,
    )?.[1];
    const defaultDomains = defaultDomainBlock
      ? Array.from(defaultDomainBlock.matchAll(/"([^"]+)"/g), (match) => match[1])
      : [];
    expect(approvedDomains).toEqual(defaultDomains);
    expect(correction).toContain("p_finding_verified_at is null");
    const initialItemRead = correction.indexOf(
      "select i.run_id into v_initial_run_id from public.daily_question_review_items i",
    );
    const runPrecheck = correction.indexOf(
      "select r.* into v_precheck_run from public.daily_question_review_runs r",
    );
    const itemLock = correction.indexOf(
      "select i.* into v_item from public.daily_question_review_items i",
    );
    const runLock = correction.indexOf(
      "select r.* into v_run from public.daily_question_review_runs r",
    );
    expect(initialItemRead).toBeGreaterThan(-1);
    expect(runPrecheck).toBeGreaterThan(initialItemRead);
    expect(itemLock).toBeGreaterThan(runPrecheck);
    expect(runLock).toBeGreaterThan(itemLock);
    expect(correction.slice(initialItemRead, itemLock)).not.toContain("for update");
    expect(correction.slice(itemLock, runLock)).toContain("for update");
    expect(correction.slice(runLock)).toContain("for update");
    expect(correction).toContain(
      "v_precheck_run.status not in ('completed', 'completed_with_flags')",
    );
    expect(correction).toContain("v_precheck_run.completed_at is null");
    expect(correction).toContain("v_item.run_id <> v_initial_run_id");
    expect(correction).toContain("where r.id = v_item.run_id");
    expect(correction).toContain("v_run.challenge_date <> p_challenge_date");
    expect(correction).toContain(
      "v_run.daily_challenge_id <> v_item.daily_challenge_id",
    );
    expect(correction).toContain(
      "v_run.status not in ('completed', 'completed_with_flags')",
    );
    expect(correction).toContain("v_run.completed_at is null");
    expect(correction).toContain("v_item.review_status <> 'completed'");
    expect(correction).toContain("v_item.resolution <> 'pending'");
    expect(correction).toContain("v_item.verdict not in ('risk', 'unable_to_verify')");
    expect(correction).toContain(
      "v_item.answer_correction_claim_token is distinct from p_claim_token",
    );
    expect(correction).toContain(
      "v_item.answer_correction_claimed_option is distinct from p_new_correct_option",
    );
    expect(correction).toContain(
      "v_item.answer_correction_claimed_by is distinct from p_resolved_by",
    );
    expect(correction).toContain(
      "v_item.answer_correction_claim_expires_at is null or v_item.answer_correction_claim_expires_at <= clock_timestamp()",
    );
    expect(correction).toContain("v_challenge.status <> 'generated'");
    expect(correction).toContain("v_challenge.published_at is not null");
    expect(correction).toContain("p_new_correct_option = v_old_correct_option");
    expect(correction).toContain(
      "v_challenge_item.question_snapshot <> v_item.question_snapshot",
    );
    for (const canonicalField of [
      "question_text",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "difficulty",
      "source_notes",
    ]) {
      expect(correction).toContain(
        `v_question.${canonicalField} is distinct from v_item.question_snapshot->>'${canonicalField}'`,
      );
    }
    expect(correction).toContain(
      "v_question.correct_option is distinct from v_old_correct_option",
    );
    const questionLock = correction.indexOf(
      "select q.* into v_question from public.questions q",
    );
    const sportRead = correction.indexOf(
      "select s.* into v_sport from public.sports s",
    );
    const challengeItemLock = correction.indexOf(
      "select i.* into v_challenge_item from public.daily_challenge_items i",
    );
    expect(questionLock).toBeGreaterThan(itemLock);
    expect(sportRead).toBeGreaterThan(questionLock);
    expect(challengeItemLock).toBeGreaterThan(sportRead);
    expect(correction.slice(sportRead, challengeItemLock)).not.toContain("for update");
    expect(correction).toContain(
      "v_sport.slug is distinct from v_item.question_snapshot->'sport'->>'slug'",
    );
    expect(correction).toContain(
      "v_sport.name is distinct from v_item.question_snapshot->'sport'->>'name'",
    );
    expect(correction).toContain(
      "v_challenge_item.question_snapshot->>'correct_option' <> v_old_correct_option",
    );
    expect(correction).toContain(
      "v_challenge_item.question_id <> v_item.question_id",
    );
  });

  it("atomically corrects only answer fields, finding fields, and resolution audit data", async () => {
    const migration = await readFile(answerCorrectionMigrationPath, "utf8");
    const correction = normalizedStatement(
      migration,
      "create or replace function public.correct_daily_question_review_answer",
    );

    expect(correction).toContain("update public.questions");
    expect(correction).toContain("set correct_option = p_new_correct_option");
    expect(correction).toContain("update public.daily_challenge_items");
    expect(correction).toMatch(
      /jsonb_set\(\s*v_challenge_item\.question_snapshot, '\{correct_option\}', to_jsonb\(p_new_correct_option\), false\s*\)/,
    );
    expect(correction).toContain("update public.daily_question_review_items");
    expect(correction).toMatch(
      /jsonb_set\(\s*v_item\.question_snapshot, '\{correct_option\}', to_jsonb\(p_new_correct_option\), false\s*\)/,
    );
    expect(correction).toContain("verdict = 'passed'");
    expect(correction).toContain("resolution = 'kept'");
    expect(correction).toContain("resolved_by = p_resolved_by");
    expect(correction).toContain("resolved_at = p_resolved_at");
    expect(correction).toContain("answer_correction_claim_token = null");
    expect(correction).toContain("answer_correction_claimed_by = null");
    expect(correction).toContain("answer_correction_claimed_option = null");
    expect(correction).toContain("answer_correction_claim_expires_at = null");
    expect(correction).toContain("'action', 'correct_answer'");
    expect(correction).toContain("'previousCorrectOption', v_old_correct_option");
    expect(correction).toContain("'newCorrectOption', p_new_correct_option");
    expect(correction).toContain("'outcome', 'corrected'");
    for (const outcome of ["conflict", "not_draft", "missing"]) {
      expect(correction).toContain(`'outcome', '${outcome}'`);
    }
    expect(correction).not.toMatch(/set\s+question_text\s*=/i);
    expect(correction).not.toMatch(/set\s+option_[abcd]\s*=/i);
  });
});
