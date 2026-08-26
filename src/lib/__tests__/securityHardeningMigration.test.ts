import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("security hardening migration", () => {
  it("removes direct authenticated writes to server-owned game tables", async () => {
    const migration = await readFile(
      new URL(
        "../../../supabase/migrations/202608200001_security_hardening.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain(
      "revoke insert on public.daily_attempts from authenticated",
    );
    expect(migration).toContain(
      "revoke insert on public.daily_attempt_starts from authenticated",
    );
    expect(migration).toContain(
      "revoke insert on public.leaderboard_groups from authenticated",
    );
    expect(migration).toContain(
      "revoke insert on public.leaderboard_group_members from authenticated",
    );
    expect(migration).toContain("drop policy if exists daily_attempts_insert_own");
    expect(migration).toContain("drop policy if exists daily_attempt_starts_insert_own");
  });

  it("makes group creation atomic and service-role only", async () => {
    const migration = await readFile(
      new URL(
        "../../../supabase/migrations/202608200001_security_hardening.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain(
      "create or replace function public.create_leaderboard_group_for_owner",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
