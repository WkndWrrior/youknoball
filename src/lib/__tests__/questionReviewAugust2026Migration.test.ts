import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const postgresLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

const extractQuestionReviewUnits = (migration: string) => {
  const starts = Array.from(
    migration.matchAll(/\bupdate\s+public\.questions\s+q\b/gi),
    (match) => match.index ?? -1,
  );

  return starts.map((start, index) =>
    migration.slice(start, starts[index + 1] ?? migration.length),
  );
};

const extractQuestionReviewUnit = (migration: string, id: string) => {
  const unit = extractQuestionReviewUnits(migration).find((candidate) =>
    candidate.includes(id),
  );

  expect(unit).toBeDefined();
  return unit ?? "";
};

describe("August 2026 question review migration", () => {
  it("locks the approved question updates and guarded fallbacks", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/202608010002_question_review_updates.sql",
      ),
      "utf8",
    );

    const updates = [
      {
        id: "101635c2-dbd2-4384-b954-a8e5bf9594c6",
        sport: "cbb",
        priorText:
          "Which team beat UCLA in the 1974 national semifinals before winning the title?",
        finalText:
          "In the 1974 NCAA men's basketball semifinals, which team ended UCLA's run of seven straight national titles with a double-overtime win, then claimed the championship?",
        sourceUrl:
          "https://www.ncaa.com/news/basketball-men/article/2020-05-18/1974-ncaa-tournament-bracket-scores-stats-records",
        changesDifficulty: false,
      },
      {
        id: "12a9ce1c-9b4b-4e15-a65f-1084b2f43c08",
        sport: "cfb",
        priorText:
          "Which matchup was the first college football game broadcast on radio?",
        finalText:
          "In 1921, which college football rivalry matchup became the first game broadcast on radio?",
        sourceUrl:
          "https://www.ncaa.com/news/ncaa/article/2020-01-31/college-football-history-notable-firsts-and-milestones",
        changesDifficulty: false,
      },
      {
        id: "13724d84-8706-4948-a263-60971cf8158c",
        sport: "cbb",
        priorText:
          "Which school won the 1997 national title behind freshman Mike Bibby?",
        finalText:
          "Which school won the 1997 NCAA men's basketball title behind freshman phenom Mike Bibby, knocking off three No. 1 seeds along the way?",
        sourceUrl:
          "https://www.ncaa.com/news/basketball-men/article/2020-05-08/1997-ncaa-tournament-bracket-scores-stats-records",
        changesDifficulty: false,
      },
      {
        id: "169f5245-60ed-46cb-9049-541cdd528d86",
        sport: "cbb",
        priorText: "Coach K built a dynasty on which college basketball campus?",
        additionalPriorTexts: [
          "Mike Krzyzewski became a coaching legend at which school?",
        ],
        finalText: '"Coach K" built a dynasty on which college basketball campus?',
        sourceUrl: "https://goduke.com/staff-directory/mike-krzyzewski/159",
        changesDifficulty: false,
      },
      {
        id: "16e44025-d542-421e-b95e-5e787fed003c",
        sport: "cfb",
        priorText:
          "Which program owns the major-college record 47-game winning streak?",
        finalText:
          "Which college football program owns the major-college record with a 47-game winning streak from 1953 to 1957?",
        sourceUrl:
          "https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history",
        changesDifficulty: true,
      },
      {
        id: "1b866dd0-732e-4139-a468-8ed397768104",
        sport: "cbb",
        priorText:
          "Who is the all-time leading scorer in Division I men's basketball?",
        finalText:
          "Without a 3-point line or shot clock, which player scored 3,667 points in just three varsity seasons to become Division I men's basketball's all-time leading scorer?",
        sourceUrl:
          "https://lsusports.net/news/2018/02/28/211703254",
        changesDifficulty: true,
      },
      {
        id: "1e5f8ca2-2864-475e-a365-372071f0323c",
        sport: "cfb",
        priorText: "Who was the first West Coast player to win the Heisman Trophy?",
        finalText:
          "Which Portland, Oregon, high school product became the first player from the West Coast to win the Heisman Trophy in 1962?",
        sourceUrl: "https://www.heisman.com/heisman-winners/terry-baker/",
        changesDifficulty: false,
      },
      {
        id: "664e8135-bf10-4642-94fd-b4209a302c51",
        sport: "cbb",
        priorText: "Who coached UConn through its dominant 2023 men's title run?",
        finalText:
          "After a 31-8 season and six double-digit NCAA tournament wins, who coached UConn to the 2023 men's basketball national title?",
        sourceUrl:
          "https://uconnhuskies.com/news/2023/4/3/mens-basketball-uconn-wins-march-madness-with-76-59-smothering-of-sdsu",
        changesDifficulty: false,
      },
    ];

    for (const update of updates) {
      const unit = extractQuestionReviewUnit(migration, update.id);
      const finalLiteral = postgresLiteral(update.finalText);
      const sportLiteral = postgresLiteral(update.sport);
      const idLiteral = postgresLiteral(update.id);
      const textFallbackPattern = [
        update.priorText,
        ...("additionalPriorTexts" in update
          ? update.additionalPriorTexts
          : []),
      ]
        .map(
          (priorText) =>
            `q\\.question_text\\s*=\\s*${escapeRegExp(postgresLiteral(priorText))}`,
        )
        .join("\\s+or\\s+");

      expect(unit).toMatch(/from\s+public\.sports\s+s/i);
      expect(unit).toContain(`question_text = ${finalLiteral}`);
      expect(unit).toMatch(
        new RegExp(
          `where\\s+q\\.sport_id\\s*=\\s*s\\.id\\s+and\\s+s\\.slug\\s*=\\s*${escapeRegExp(sportLiteral)}\\s+and\\s+q\\.status\\s*=\\s*'ready'\\s+and\\s*\\(\\s*q\\.id\\s*=\\s*${escapeRegExp(idLiteral)}\\s*::uuid\\s+or\\s+${textFallbackPattern}\\s*\\)`,
          "i",
        ),
      );

      if (update.changesDifficulty) {
        expect(unit).toMatch(/\bdifficulty\s*=\s*'medium'/);
      } else {
        expect(unit).not.toMatch(/\bdifficulty\s*=/);
      }

      expect(unit).toMatch(
        new RegExp(
          `source_notes\\s*=\\s*[^;]*${escapeRegExp(update.sourceUrl)}`,
          "i",
        ),
      );
      expect(unit).toContain("reviewed_at = timezone('utc', now())");
      expect(unit).toContain("updated_at = timezone('utc', now())");
      expect(unit.match(/get diagnostics updated_count = row_count;/g)).toHaveLength(1);
      expect(unit).toMatch(
        /if\s+updated_count\s*<>\s*1\s+then[\s\S]*?raise\s+exception[\s\S]*?updated_count[\s\S]*?end\s+if\s*;/i,
      );
    }

    expect(migration).not.toContain("0905e82a-abcb-4861-84cc-8e3e0509d079");
    expect(migration).not.toContain(
      "Which player hit the 1989 playoff shot over Craig Ehlo?",
    );
    expect(migration).not.toContain("Michael Jordan");
    expect(migration).not.toContain("Craig Ehlo");
    expect(migration).not.toContain("14e2c0ff-1cc2-4b0d-9b32-801acfa77883");
  });
});
