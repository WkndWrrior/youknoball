import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("MLB question bank migration", () => {
  it("seeds 30 sourced MLB questions for daily and sport quizzes", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202606200001_mlb_question_bank.sql",
      ),
      "utf8",
    );

    expect(migration.match(/\('easy',/g)).toHaveLength(10);
    expect(migration.match(/\('medium',/g)).toHaveLength(10);
    expect(migration.match(/\('hard',/g)).toHaveLength(10);
    expect(migration).toContain("'mlb', 'MLB'");
    expect(migration).toContain("eligible_for_daily");
    expect(migration).toContain("eligible_for_sport_quiz");
    expect(migration).toContain("'ready'");
    expect(migration).toContain("'ai_assisted'");
    expect(migration).toContain("https://www.mlb.com/world-series/history/winners");
    expect(migration).toContain("https://baseballhall.org/hall-of-famers/ruth-babe");
    expect(migration).toContain("https://baseballhall.org/hall-of-famers/robinson-jackie");
    expect(migration).toContain("https://baseballhall.org/hall-of-famers/doby-larry");
    expect(migration).toContain("https://baseballhall.org/hall-of-famers/rivera-mariano");
    expect(migration).toContain("https://www.baseball-reference.com/leaders/HR_career.shtml");
    expect(migration).toContain("https://www.baseball-reference.com/leaders/H_career.shtml");
    expect(migration).toContain("https://www.baseball-reference.com/leaders/SO_p_career.shtml");
    expect(migration).toContain("https://www.baseball-reference.com/leaders/SB_career.shtml");
    expect(migration).toContain(
      "('hard', 'Who holds MLB''s single-season saves record with 62 saves in 2008?', 'Mariano Rivera'",
    );
    expect(migration).toContain(
      "Which dominant Yankees closer allowed only 11 earned runs across his postseason career?",
    );
    expect(migration.match(/, 'A', 'Verified against/g)).toHaveLength(8);
    expect(migration.match(/, 'B', 'Verified against/g)).toHaveLength(8);
    expect(migration.match(/, 'C', 'Verified against/g)).toHaveLength(7);
    expect(migration.match(/, 'D', 'Verified against/g)).toHaveLength(7);
    expect(migration).toContain("where not exists");
  });
});
