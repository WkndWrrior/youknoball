import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("CFB question bank migration", () => {
  it("seeds 30 sourced CFB questions for daily and sport quizzes", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202606070001_cfb_question_bank.sql",
      ),
      "utf8",
    );

    expect(migration.match(/\('easy',/g)).toHaveLength(10);
    expect(migration.match(/\('medium',/g)).toHaveLength(10);
    expect(migration.match(/\('hard',/g)).toHaveLength(10);
    expect(migration).toContain("'cfb', 'CFB'");
    expect(migration).toContain("eligible_for_daily");
    expect(migration).toContain("eligible_for_sport_quiz");
    expect(migration).toContain("true,");
    expect(migration).toContain("'ready'");
    expect(migration).toContain("'ai_assisted'");
    expect(migration).toContain("https://www.heisman.com/heisman-winners/");
    expect(migration).toContain("https://www.heisman.com/about-the-heisman/milestones/");
    expect(migration).toContain("https://www.heisman.com/age-and-the-heisman/");
    expect(migration).toContain(
      "https://www.ncaa.com/news/football/article/2017-11-06/college-football-history-heres-when-1st-game-was-played",
    );
    expect(migration).toContain(
      "https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history",
    );
    expect(migration).toContain(
      "https://www.ncaa.com/news/ncaa/article/2020-01-31/college-football-history-notable-firsts-and-milestones",
    );
    expect(migration).toContain(
      "('hard', 'Who was the first junior to win the Heisman Trophy?', 'Doc Blanchard'",
    );
    expect(migration.match(/, 'A', 'Verified against/g)).toHaveLength(8);
    expect(migration.match(/, 'B', 'Verified against/g)).toHaveLength(8);
    expect(migration.match(/, 'C', 'Verified against/g)).toHaveLength(7);
    expect(migration.match(/, 'D', 'Verified against/g)).toHaveLength(7);
    expect(migration).toContain("where not exists");
  });
});
