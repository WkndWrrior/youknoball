import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const postgresLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

const extractProceduralBody = (migration: string) => {
  expect(migration.match(/\bdo\s+\$\$/gi)).toHaveLength(1);
  expect(migration.match(/\bend\s+\$\$\s*;/gi)).toHaveLength(1);

  const wrapper = migration.match(
    /^\s*do\s+\$\$\s*declare\s+updated_count\s+integer\s*;\s*begin\s+([\s\S]*?)\s+end\s+\$\$\s*;\s*$/i,
  );

  expect(wrapper).not.toBeNull();
  return wrapper?.[1] ?? "";
};

const extractUpdateUnits = (proceduralBody: string) => {
  const starts = Array.from(
    proceduralBody.matchAll(/\bupdate\s+public\.questions\s+q\b/gi),
    (match) => match.index ?? -1,
  );

  return starts.map((start, index) =>
    proceduralBody.slice(start, starts[index + 1] ?? proceduralBody.length),
  );
};

type ParsedUpdateUnit = {
  setClause: string;
  predicate: string;
  guard: string;
};

const parseUpdateUnit = (unit: string): ParsedUpdateUnit => {
  const parsed = unit.match(
    /^update\s+public\.questions\s+q\s+set\s+([\s\S]*?)\s+from\s+public\.sports\s+s\s+(where[\s\S]*?);\s*(get\s+diagnostics[\s\S]*?end\s+if\s*;)\s*$/i,
  );

  expect(parsed).not.toBeNull();

  return {
    setClause: parsed?.[1] ?? "",
    predicate: parsed?.[2] ?? "",
    guard: parsed?.[3] ?? "",
  };
};

const findUpdateUnit = (units: ParsedUpdateUnit[], id: string) => {
  const matches = units.filter((unit) => unit.predicate.includes(id));

  expect(matches).toHaveLength(1);
  return matches[0] ?? { setClause: "", predicate: "", guard: "" };
};

type PolishAction = {
  id: string;
  sport: string;
  action: "rewrite" | "difficulty" | "retire";
  oldText: string;
  additionalPriorTexts?: string[];
  finalText?: string;
  finalDifficulty?: "easy" | "medium" | "hard";
  sourceUrls: string[];
};

const actions: PolishAction[] = [
  {
    id: "535678e8-85db-4138-9285-b12facb06904",
    sport: "nba",
    action: "rewrite",
    oldText:
      "When the banner-count debates start, which franchise sits atop NBA history for most championships?",
    finalText:
      "Which NBA franchise won 11 championships in 13 seasons from 1957 through 1969?",
    sourceUrls: [
      "https://www.nba.com/celtics/news/sidebar/misc-20220105-sam-jones-was-winner-gentleman-and-mr-clutch",
    ],
  },
  {
    id: "815c13f4-889a-4c17-a6b6-ec2c6c6a41c8",
    sport: "nba",
    action: "rewrite",
    oldText: "Which player was nicknamed The Round Mound of Rebound?",
    finalText: 'Which NBA star was nicknamed "The Round Mound of Rebound"?',
    finalDifficulty: "easy",
    sourceUrls: ["https://www.nba.com/news/history-nba-legend-charles-barkley"],
  },
  {
    id: "f1b74737-81d6-48c8-a4e1-e62b688d0ff4",
    sport: "nba",
    action: "difficulty",
    oldText: "Who won 2019 NBA Finals MVP with the Toronto Raptors?",
    finalDifficulty: "medium",
    sourceUrls: ["https://www.nba.com/news/history-finals-mvp-winners"],
  },
  {
    id: "f971d39f-1d55-453d-848f-a19f174b368e",
    sport: "nba",
    action: "rewrite",
    oldText: "Who is the NBA's all-time regular-season scoring leader?",
    finalText:
      "Who became the NBA's all-time regular-season scoring leader on February 7, 2023?",
    sourceUrls: [
      "https://www.nba.com/news/lebron-james-sets-all-time-scoring-record-nba",
    ],
  },
  {
    id: "a3b3dcfb-ff7c-4c4f-a89a-1e4e0ad8cfd3",
    sport: "nba",
    action: "rewrite",
    oldText:
      "Before the Chosen One headlines and NBA title runs, LeBron James grew up in what Ohio city?",
    additionalPriorTexts: [
      "LeBron James was born and raised in what Ohio city?",
    ],
    finalText:
      'Before "The Chosen One" headlines and NBA title runs, LeBron James grew up in what Ohio city?',
    sourceUrls: ["https://www.nba.com/news/starting-5-dec-30-2024"],
  },
  {
    id: "737b713f-b98c-44b7-b7d0-abe2577b4a09",
    sport: "cbb",
    action: "rewrite",
    oldText:
      "Which Big East school shocked Georgetown in the 1985 NCAA title game as an 8 seed?",
    additionalPriorTexts: [
      "Which Big East school won the 1985 national championship as an 8 seed?",
    ],
    finalText:
      "Which Big East school shocked Georgetown in the 1985 NCAA men's basketball title game as an 8 seed?",
    sourceUrls: [
      "https://www.ncaa.com/basketball-men/d1/villanova-college-basketball-championships-complete-history",
    ],
  },
  {
    id: "7226d02d-c30b-4d9c-a43d-83ae81f5bde9",
    sport: "cbb",
    action: "rewrite",
    oldText: "Who led Houston over UCLA in the 1968 Game of the Century?",
    finalText:
      'Who scored 39 points to lead Houston past UCLA in college basketball\'s 1968 "Game of the Century"?',
    sourceUrls: [
      "https://uhcougars.com/news/2023/2/10/general-transcendent-trailblazer-forever-cougar-elvin-hayes",
    ],
  },
  {
    id: "c6d8b26c-e08a-4c48-984b-59d67a790000",
    sport: "cbb",
    action: "retire",
    oldText:
      "In the 1985 NCAA title-game upset, Villanova defeated which defending champion?",
    sourceUrls: [
      "https://www.ncaa.com/basketball-men/d1/villanova-college-basketball-championships-complete-history",
    ],
  },
  {
    id: "b8889027-4618-45fd-a9b4-4ae44efd2398",
    sport: "cbb",
    action: "rewrite",
    oldText: "Which team beat Kentucky to win the 2012 national championship?",
    finalText:
      "Which team did Kentucky beat to win the 2012 NCAA men's basketball championship?",
    sourceUrls: [
      "https://www.ncaa.com/news/basketball-men/article/2020-05-11/2012-ncaa-tournament-bracket-scores-stats-records",
    ],
  },
  {
    id: "5423a49d-d5d7-4872-9526-3cc035c16a07",
    sport: "nfl",
    action: "rewrite",
    oldText:
      "Before becoming Minnesota's star receiver, Justin Jefferson was drafted by which team in 2020?",
    finalText:
      "Which NFL team selected LSU receiver Justin Jefferson with the 22nd pick of the 2020 draft?",
    sourceUrls: ["https://www.nfl.com/draft/tracker/2020/rounds/1"],
  },
  {
    id: "4a0c2441-2e3b-425a-8fb8-8ace8c037611",
    sport: "nfl",
    action: "rewrite",
    oldText: "Which franchise is nicknamed America's Team?",
    finalText: 'Which NFL franchise is nicknamed "America\'s Team"?',
    sourceUrls: [
      "https://www.nfl.com/news/packers-jaguars-among-america-s-team-candidates-after-boys-0ap3000000961379",
    ],
  },
  {
    id: "ae679d0a-6067-4646-8d5a-5eee965fad45",
    sport: "nfl",
    action: "rewrite",
    oldText:
      "Which quarterback led the Greatest Show on Turf Rams to victory in Super Bowl XXXIV (34)?",
    finalText:
      'Which quarterback led the "Greatest Show on Turf" Rams to victory in Super Bowl XXXIV (34)?',
    sourceUrls: [
      "https://www.nfl.com/photos/greatest-show-on-turf-0ap2000000362117",
    ],
  },
  {
    id: "f395e563-5a9d-4489-87bd-b798e3171f10",
    sport: "nfl",
    action: "rewrite",
    oldText:
      "Who produced the Beast Quake touchdown run for Seattle in the 2010 playoffs?",
    finalText:
      'Who produced the "Beast Quake" touchdown run for Seattle in the 2010 playoffs?',
    sourceUrls: [
      "https://www.seahawks.com/news/reliving-the-beast-quake-game-10-years-later",
    ],
  },
  {
    id: "c2aafb44-7663-4931-8384-b7c7ecabf099",
    sport: "nfl",
    action: "rewrite",
    oldText: "Which team beat Buffalo in the Wide Right game, Super Bowl XXV (25)?",
    finalText:
      'Which team beat Buffalo in the "Wide Right" game, Super Bowl XXV (25)?',
    sourceUrls: [
      "https://www.nfl.com/photos/super-bowl-memories-09000d5d82667042",
    ],
  },
  {
    id: "f210fcb0-e997-45d5-8e7b-bb9089baedd9",
    sport: "nfl",
    action: "rewrite",
    oldText:
      "Which Eagles quarterback caught the Philly Special touchdown in Super Bowl LII (52)?",
    finalText:
      'Which Eagles player caught the "Philly Special" touchdown in Super Bowl LII (52)?',
    sourceUrls: [
      "https://www.nfl.com/100/originals/100-greatest/detail.html?slug=plays-10",
    ],
  },
  {
    id: "d20244b4-13fb-4a33-acbb-2c7591d6d345",
    sport: "nfl",
    action: "rewrite",
    oldText: "Who scored the first touchdown in Super Bowl history?",
    finalText: "Who scored the first touchdown in Super Bowl I (1)?",
    sourceUrls: [
      "https://www.nfl.com/photos/max-mcgee-1932-2007-09000d5d80376fbb",
    ],
  },
  {
    id: "3b21ecd5-4433-4459-9f56-18d7e1134c77",
    sport: "nfl",
    action: "rewrite",
    oldText: "The first Super Bowl belonged to which franchise?",
    additionalPriorTexts: ["Which team won Super Bowl I (1)?"],
    finalText: "Which franchise won Super Bowl I (1)?",
    sourceUrls: ["https://www.nfl.com/photos/super-bowl-i-09000d5d8020f107"],
  },
  {
    id: "484c1b5c-5eab-46e9-8eb4-1395d8594482",
    sport: "nfl",
    action: "rewrite",
    oldText:
      "On the Giants' wild final drive in Super Bowl XLII (42), who came down with the Helmet Catch?",
    additionalPriorTexts: [
      "Who caught the Helmet Catch in Super Bowl XLII (42)?",
    ],
    finalText:
      'On the Giants\' wild final drive in Super Bowl XLII (42), who came down with the "Helmet Catch"?',
    sourceUrls: [
      "https://www.nfl.com/100/originals/100-greatest/detail.html?slug=plays-3",
    ],
  },
  {
    id: "bfcff20c-ae61-4188-a9a8-b2eb9fdcb5da",
    sport: "cfb",
    action: "retire",
    oldText: "Oklahoma's record major-college winning streak stopped at what number?",
    sourceUrls: [
      "https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history",
    ],
  },
  {
    id: "98d47501-9167-4d9f-9f2b-7e69ad0005a0",
    sport: "cfb",
    action: "rewrite",
    oldText: "Johnny Football won the 2012 Heisman while playing for which school?",
    additionalPriorTexts: [
      "Which school did Johnny Manziel represent when he won the 2012 Heisman Trophy?",
    ],
    finalText: '"Johnny Football" won the 2012 Heisman while playing for which school?',
    sourceUrls: [
      "https://www.heisman.com/articles/this-week-in-heisman-history-johnny-manziel-sets-sec-total-offense-mark-in-victory-over-arkansas/",
    ],
  },
  {
    id: "051d193c-b8a1-4d2d-888b-631a9bcdc0da",
    sport: "cfb",
    action: "rewrite",
    oldText:
      "Which Heisman winner also took his Oregon State Beavers to the NCAA basketball Final Four?",
    additionalPriorTexts: [
      "Which Heisman winner also played in the NCAA basketball Final Four?",
    ],
    finalText:
      "Which Heisman Trophy winner also played in the 1963 NCAA men's basketball Final Four?",
    sourceUrls: [
      "https://www.heisman.com/heisman-winners/terry-baker/",
      "https://osubeavers.com/honors/hall-of-fame/terry--baker/154",
    ],
  },
  {
    id: "9e138209-3ae9-4ec2-bc15-0cfe16121edb",
    sport: "mlb",
    action: "rewrite",
    oldText:
      "Which Hall of Famer was nicknamed the Bambino and the Sultan of Swat?",
    finalText:
      'Which Baseball Hall of Famer was nicknamed "the Bambino" and "the Sultan of Swat"?',
    sourceUrls: ["https://baseballhall.org/hall-of-famers/ruth-babe"],
  },
  {
    id: "1f3f79a2-5e04-4c60-99f3-98005743442e",
    sport: "mlb",
    action: "rewrite",
    oldText: "Who won MLB's most recent batting Triple Crown in 2012?",
    finalText:
      "Who ended a 45-year drought by winning MLB's batting Triple Crown in 2012?",
    sourceUrls: ["https://www.mlb.com/news/a-look-at-baseball-triple-crown-winners"],
  },
  {
    id: "2702b046-3b1d-4b78-b557-d14301d30a6c",
    sport: "mlb",
    action: "difficulty",
    oldText: "Who set MLB's consecutive games played record at 2,632?",
    finalDifficulty: "medium",
    sourceUrls: ["https://baseballhall.org/hall-of-famers/ripken-cal"],
  },
  {
    id: "99038afd-d614-4788-9e2a-c866b755db0e",
    sport: "mlb",
    action: "rewrite",
    oldText: "Which team won the 1955 World Series for Brooklyn's first championship?",
    finalText:
      "Which franchise finally broke through for its first World Series championship in 1955?",
    sourceUrls: ["https://www.mlb.com/postseason/history/1955"],
  },
  {
    id: "9aab2901-c4e4-469c-8ab7-7e58fd21a09f",
    sport: "mlb",
    action: "difficulty",
    oldText: "Who holds MLB's single-season home run record with 73 in 2001?",
    finalDifficulty: "medium",
    sourceUrls: ["https://www.mlb.com/news/mlb-single-season-home-run-record"],
  },
  {
    id: "9135ed53-9166-4d0b-92b4-e9349c6e6179",
    sport: "mlb",
    action: "rewrite",
    oldText:
      "Which former MLB franchise moved from Montreal to Washington before the 2005 season?",
    finalText:
      "Which MLB franchise relocated to Washington, D.C., and became the Nationals before the 2005 season?",
    sourceUrls: ["https://www.mlb.com/nationals/history/timeline-2000s"],
  },
  {
    id: "96942dc2-29e1-4fa2-b08e-9f7118f299cc",
    sport: "mlb",
    action: "difficulty",
    oldText: "Which club won the first modern World Series in 1903?",
    finalDifficulty: "medium",
    sourceUrls: [
      "https://www.mlb.com/news/first-world-series-appearance-for-every-mlb-team",
    ],
  },
  {
    id: "9c4c6d5c-e401-4385-9dc0-f5e7081d6d72",
    sport: "mlb",
    action: "rewrite",
    oldText: "In the 1951 pennant race, who hit the Shot Heard Round the World?",
    additionalPriorTexts: ["Who hit the 1951 Shot Heard Round the World?"],
    finalText:
      'In the decisive Game 3 of the 1951 NL pennant tiebreaker, who hit the "Shot Heard Round the World"?',
    sourceUrls: [
      "https://www.mlb.com/news/history-of-mlb-tiebreaker-games-c202246862",
    ],
  },
  {
    id: "0ffd45c7-8d3e-49d4-bc7d-a525526c001b",
    sport: "mlb",
    action: "rewrite",
    oldText:
      "After the final out of the Fall Classic, what trophy goes to the World Series champion?",
    finalText:
      'After the final out of the "Fall Classic," what trophy goes to the World Series champion?',
    sourceUrls: [
      "https://www.mlb.com/glossary/miscellaneous/commissioners-trophy",
    ],
  },
  {
    id: "f8a4a870-5132-4408-b2d1-99802c937754",
    sport: "nhl",
    action: "rewrite",
    oldText: "Who scored the fastest hat trick in NHL history?",
    finalText:
      "Who scored the fastest hat trick in NHL history, firing three goals in just 21 seconds?",
    sourceUrls: [
      "https://www.nhl.com/news/bill-mosienko-scores-fastest-hat-trick-in-nhl-history-290802314",
    ],
  },
  {
    id: "4bed1358-a5dd-47b9-acbc-00b3eccbe57d",
    sport: "nhl",
    action: "rewrite",
    oldText:
      "After chasing Gretzky's mark for years, who now sits atop the NHL regular-season career goals list?",
    additionalPriorTexts: [
      "Who is the NHL's all-time leader in career regular-season goals?",
    ],
    finalText:
      "Who broke Wayne Gretzky's NHL record of 894 regular-season goals in April 2025?",
    sourceUrls: [
      "https://www.nhl.com/news/alex-ovechkin-passes-wayne-gretzky-for-nhl-goals-record",
    ],
  },
  {
    id: "f4f00303-8bc9-47df-9ee4-3e1361583f71",
    sport: "nhl",
    action: "difficulty",
    oldText:
      "Which expansion team crashed all the way into the Stanley Cup Final in its first season?",
    additionalPriorTexts: [
      "Which expansion team reached the Stanley Cup Final in its inaugural 2017-18 season?",
    ],
    finalDifficulty: "medium",
    sourceUrls: [
      "https://www.nhl.com/news/golden-knights-magic-runs-out-in-stanley-cup-final-against-capitals-299000478",
    ],
  },
];

describe("question bank polish migration", () => {
  it("locks every accepted rewrite, difficulty change, and retirement", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202608010003_question_bank_polish.sql",
      ),
      "utf8",
    );
    const proceduralBody = extractProceduralBody(migration);
    const units = extractUpdateUnits(proceduralBody).map(parseUpdateUnit);

    expect(units).toHaveLength(actions.length);

    for (const action of actions) {
      const { setClause, predicate, guard } = findUpdateUnit(units, action.id);
      const sportLiteral = postgresLiteral(action.sport);
      const idLiteral = postgresLiteral(action.id);
      const oldTextLiteral = postgresLiteral(action.oldText);
      const constrainedPredicate = predicate.match(
        new RegExp(
          `where\\s+q\\.sport_id\\s*=\\s*s\\.id\\s+and\\s+s\\.slug\\s*=\\s*${escapeRegExp(sportLiteral)}\\s+and\\s+q\\.status\\s*=\\s*'ready'\\s+and\\s*\\(\\s*([\\s\\S]*?)\\s*\\)\\s*$`,
          "i",
        ),
      );

      expect(constrainedPredicate).not.toBeNull();

      const targetAlternatives = constrainedPredicate?.[1] ?? "";
      expect(targetAlternatives).toMatch(
        new RegExp(
          `^q\\.id\\s*=\\s*${escapeRegExp(idLiteral)}\\s*::uuid`,
          "i",
        ),
      );
      expect(targetAlternatives).toMatch(
        new RegExp(
          `\\bor\\s+q\\.question_text\\s*=\\s*${escapeRegExp(oldTextLiteral)}`,
          "i",
        ),
      );

      for (const priorText of action.additionalPriorTexts ?? []) {
        expect(targetAlternatives).toMatch(
          new RegExp(
            `\\bor\\s+q\\.question_text\\s*=\\s*${escapeRegExp(postgresLiteral(priorText))}`,
            "i",
          ),
        );
      }

      expect(
        targetAlternatives.match(/\bor\s+q\.question_text\s*=/gi),
      ).toHaveLength(1 + (action.additionalPriorTexts?.length ?? 0));

      if (action.finalText) {
        expect(setClause).toContain(
          `question_text = ${postgresLiteral(action.finalText)}`,
        );
      } else {
        expect(setClause).not.toMatch(/\bquestion_text\s*=/i);
      }

      if (action.finalDifficulty) {
        expect(setClause).toContain(`difficulty = '${action.finalDifficulty}'`);
      } else {
        expect(setClause).not.toMatch(/\bdifficulty\s*=/i);
      }

      if (action.action === "retire") {
        expect(setClause).toContain("status = 'retired'");
        expect(setClause).toContain("eligible_for_daily = false");
        expect(setClause).toContain("eligible_for_sport_quiz = false");
        expect(setClause.match(/\bstatus\s*=/gi)).toHaveLength(1);
        expect(setClause.match(/\beligible_for_daily\s*=/gi)).toHaveLength(1);
        expect(setClause.match(/\beligible_for_sport_quiz\s*=/gi)).toHaveLength(
          1,
        );
      } else {
        for (const protectedStateColumn of [
          "status",
          "eligible_for_daily",
          "eligible_for_sport_quiz",
        ]) {
          expect(setClause).not.toMatch(
            new RegExp(`\\b${protectedStateColumn}\\b`, "i"),
          );
        }
      }

      for (const protectedColumn of [
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_option",
      ]) {
        expect(setClause).not.toMatch(
          new RegExp(`\\b${protectedColumn}\\b`, "i"),
        );
      }

      for (const sourceUrl of action.sourceUrls) {
        expect(setClause).toMatch(
          new RegExp(
            `source_notes\\s*=\\s*'[^']*${escapeRegExp(sourceUrl)}[^']*'`,
            "i",
          ),
        );
      }

      expect(setClause).toContain("reviewed_at = timezone('utc', now())");
      expect(setClause).toContain("updated_at = timezone('utc', now())");
      expect(
        guard.match(/get diagnostics updated_count = row_count;/gi),
      ).toHaveLength(1);
      expect(guard.match(/if\s+updated_count\s*<>\s*1\s+then/gi)).toHaveLength(1);
      expect(guard.match(/raise\s+exception/gi)).toHaveLength(1);
      expect(guard).toMatch(
        new RegExp(
          `raise\\s+exception\\s+'[^']*${escapeRegExp(action.id)}[^']*'`,
          "i",
        ),
      );
      expect(guard).toMatch(
        /get diagnostics updated_count = row_count;\s*if\s+updated_count\s*<>\s*1\s+then\s*raise\s+exception\s+'[^']*'\s*,\s*updated_count\s*;\s*end\s+if\s*;/i,
      );
    }
  });

  it("excludes the approved batch and protected canonical rows", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202608010003_question_bank_polish.sql",
      ),
      "utf8",
    );
    const excludedValues = [
      "101635c2-dbd2-4384-b954-a8e5bf9594c6",
      "12a9ce1c-9b4b-4e15-a65f-1084b2f43c08",
      "13724d84-8706-4948-a263-60971cf8158c",
      "169f5245-60ed-46cb-9049-541cdd528d86",
      "16e44025-d542-421e-b95e-5e787fed003c",
      "1b866dd0-732e-4139-a468-8ed397768104",
      "1e5f8ca2-2864-475e-a365-372071f0323c",
      "664e8135-bf10-4642-94fd-b4209a302c51",
      "14e2c0ff-1cc2-4b0d-9b32-801acfa77883",
      "0905e82a-abcb-4861-84cc-8e3e0509d079",
      "In Game 5 of the 1989 Eastern Conference first round, which player hit the wonderful series-winning shot over Craig Ehlo?",
    ];

    for (const excludedValue of excludedValues) {
      expect(migration).not.toContain(excludedValue);
    }
  });
});
