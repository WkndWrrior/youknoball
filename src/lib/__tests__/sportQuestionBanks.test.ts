import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

type BankExpectation = {
  sport: string;
  slug: string;
  migration: string;
  requiredPrompts: string[];
  requiredSources: string[];
};

const banks: BankExpectation[] = [
  {
    sport: "NBA",
    slug: "nba",
    migration: "202606210001_nba_question_bank.sql",
    requiredPrompts: [
      "LeBron James was born and raised in what Ohio city?",
      "Who scored an NBA-record 37 points in one quarter while going 13-for-13 from the field?",
    ],
    requiredSources: [
      "https://www.basketball-reference.com/leaders/pts_career.html",
      "https://www.nba.com/news/history-finals-mvp",
      "https://www.basketball-reference.com/players/j/jamesle01.html",
      "https://www.basketball-reference.com/boxscores/201501230GSW.html",
    ],
  },
  {
    sport: "CBB",
    slug: "cbb",
    migration: "202606210002_cbb_question_bank.sql",
    requiredPrompts: [
      "In the 2015 Final Four, Kentucky entered 38-0 before losing to which 1 seed?",
      "Before the 1965-66 season, which future NBA star led the UCLA freshman team past the two-time defending champion UCLA varsity team?",
    ],
    requiredSources: [
      "https://www.sports-reference.com/cbb/postseason/men/2015-ncaa.html",
      "https://www.sports-reference.com/cbb/schools/ucla/1966.html",
      "https://www.sports-reference.com/cbb/leaders/men/pts-player-career.html",
      "https://www.ncaa.com/history/basketball-men/d1",
    ],
  },
  {
    sport: "NFL",
    slug: "nfl",
    migration: "202606210003_nfl_question_bank.sql",
    requiredPrompts: [
      "Who returned the opening kickoff of Super Bowl XLI (41) for a touchdown?",
      "Which quarterback from the 2018 NFL Draft class won NFL MVP twice by the end of the 2023 season?",
      "Super Bowl XLI (41)",
    ],
    requiredSources: [
      "https://www.pro-football-reference.com/super-bowl/",
      "https://www.pro-football-reference.com/leaders/pass_yds_career.htm",
      "https://www.pro-football-reference.com/years/2018/draft.htm",
      "https://www.pro-football-reference.com/awards/ap-nfl-mvp-award.htm",
    ],
  },
  {
    sport: "NHL",
    slug: "nhl",
    migration: "202606210004_nhl_question_bank.sql",
    requiredPrompts: [
      "Who is the NHL''s all-time leader in career regular-season goals?",
      "Which goalie has the most wins in NHL regular-season history?",
    ],
    requiredSources: [
      "https://www.hockey-reference.com/leaders/goals_career.html",
      "https://www.hockey-reference.com/leaders/points_career.html",
      "https://www.hockey-reference.com/leaders/wins_goalie_career.html",
      "https://www.hockey-reference.com/playoffs/",
    ],
  },
];

async function readMigration(fileName: string) {
  return readFile(
    path.join(process.cwd(), "supabase/migrations", fileName),
    "utf8",
  );
}

describe("sport question bank migrations", () => {
  it.each(banks)(
    "seeds 30 sourced $sport questions for daily and sport quizzes",
    async ({ slug, sport, migration, requiredPrompts, requiredSources }) => {
      const source = await readMigration(migration);

      expect(source.match(/\('easy',/g)).toHaveLength(10);
      expect(source.match(/\('medium',/g)).toHaveLength(10);
      expect(source.match(/\('hard',/g)).toHaveLength(10);
      expect(source).toContain(`'${slug}', '${sport}'`);
      expect(source).toContain("eligible_for_daily");
      expect(source).toContain("eligible_for_sport_quiz");
      expect(source).toContain("'ready'");
      expect(source).toContain("'ai_assisted'");
      expect(source).toContain("where not exists");

      for (const prompt of requiredPrompts) {
        expect(source).toContain(prompt);
      }

      for (const url of requiredSources) {
        expect(source).toContain(url);
      }
    },
  );
});
