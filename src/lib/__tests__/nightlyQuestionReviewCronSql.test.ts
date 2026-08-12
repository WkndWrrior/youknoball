import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const cronPath = "supabase/cron/nightly_question_verification.sql";

describe("nightly question verification Supabase Cron deployment", () => {
  it("uses Vault-backed pg_cron and pg_net without literal credentials", async () => {
    const sql = await readFile(cronPath, "utf8");

    expect(sql).toContain("create extension if not exists pg_net");
    expect(sql).toContain("create extension if not exists pg_cron");
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).toContain("daily_review_site_url");
    expect(sql).toContain("daily_review_cron_secret");
    expect(sql).toContain("cron.unschedule");
    expect(sql).toContain("cron.schedule");
    expect(sql).toContain("'*/5 0-2,23 * * *'");
    expect(sql).toContain("net.http_post");
    expect(sql).toContain("'/api/cron/daily-question-review'");
    expect(sql).toContain("'Authorization'");
    expect(sql).toContain("'Bearer '");
    expect(sql).not.toMatch(/https:\/\/[a-z0-9.-]+/i);
    expect(sql).not.toContain("a-long-random-cron-secret");
  });

  it("fails deployment when either required Vault secret is absent or blank", async () => {
    const sql = await readFile(cronPath, "utf8");

    expect(sql).toContain("daily_review_site_url is missing or blank");
    expect(sql).toContain("daily_review_cron_secret is missing or blank");
  });

  it("requires the review site secret to be a bare HTTPS origin before scheduling", async () => {
    const sql = await readFile(cronPath, "utf8");

    expect(sql).toContain("daily_review_site_url must be a valid HTTPS origin");
    expect(sql).toMatch(/v_site_url\s*!~\*\s*'.*\^https:\/\//s);
    expect(sql).toMatch(/v_site_url\s*<>\s*btrim\(v_site_url\)/);
    expect(sql).toMatch(/\|\|\s*'\/api\/cron\/daily-question-review'/);
  });
});
