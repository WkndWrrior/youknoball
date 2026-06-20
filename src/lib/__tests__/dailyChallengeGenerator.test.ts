import { describe, expect, it } from "vitest";

import {
  generateDailyChallengeQuestions,
  scoreDailyChallengeSelection,
} from "@/lib/server/dailyChallengeGenerator";
import type { QuestionSnapshot } from "@/lib/dailyChallenge";

function makeQuestion(
  id: string,
  difficulty: QuestionSnapshot["difficulty"],
  sportName: string,
): QuestionSnapshot {
  return {
    id,
    difficulty,
    question_text: `${id} text`,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "A",
    sport: {
      id: `${sportName.toLowerCase()}_id`,
      slug: sportName.toLowerCase(),
      name: sportName,
      is_active: true,
      sort_order: 0,
      created_at: "2026-04-03T00:00:00Z",
    },
    status: "ready",
    eligible_for_daily: true,
    eligible_for_sport_quiz: true,
    authoring_method: "manual",
    source_notes: null,
    reviewed_at: "2026-04-03T00:00:00Z",
    created_at: "2026-04-03T00:00:00Z",
    updated_at: "2026-04-03T00:00:00Z",
  };
}

function selectedSports(result: ReturnType<typeof generateDailyChallengeQuestions>) {
  return result?.map((question) => question.sport.name) ?? [];
}

describe("generateDailyChallengeQuestions", () => {
  it("uses easy, easy, medium, hard, hard slot difficulty", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("q1", "easy", "NBA"),
        makeQuestion("q2", "easy", "NHL"),
        makeQuestion("q3", "medium", "NFL"),
        makeQuestion("q4", "hard", "MLB"),
        makeQuestion("q5", "hard", "CBB"),
      ],
      recentQuestionIds: [],
    });

    expect(result?.map((question) => question.difficulty)).toEqual([
      "easy",
      "easy",
      "medium",
      "hard",
      "hard",
    ]);
  });

  it("includes NBA and NFL when possible", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("q1", "easy", "NBA"),
        makeQuestion("q2", "easy", "NHL"),
        makeQuestion("q3", "medium", "NFL"),
        makeQuestion("q4", "medium", "MLB"),
        makeQuestion("q5", "hard", "CBB"),
        makeQuestion("q6", "hard", "NHL"),
      ],
      recentQuestionIds: [],
    });

    expect(selectedSports(result)).toContain("NBA");
    expect(selectedSports(result)).toContain("NFL");
  });

  it("scores NBA plus NFL above NBA twice when the rest of the lineup ties", () => {
    const nbaDuplicateLineup = [
      { ...makeQuestion("easy_nba_1", "easy", "NBA"), slot: 1 },
      { ...makeQuestion("easy_nba_2", "easy", "NBA"), slot: 2 },
      { ...makeQuestion("medium_cbb_1", "medium", "CBB"), slot: 3 },
      { ...makeQuestion("hard_mlb_1", "hard", "MLB"), slot: 4 },
      { ...makeQuestion("hard_nhl_1", "hard", "NHL"), slot: 5 },
    ];
    const nbaNflLineup = [
      { ...makeQuestion("easy_nba_1", "easy", "NBA"), slot: 1 },
      { ...makeQuestion("easy_nfl_1", "easy", "NFL"), slot: 2 },
      { ...makeQuestion("medium_cbb_1", "medium", "CBB"), slot: 3 },
      { ...makeQuestion("hard_mlb_1", "hard", "MLB"), slot: 4 },
      { ...makeQuestion("hard_mlb_2", "hard", "MLB"), slot: 5 },
    ];

    expect(scoreDailyChallengeSelection(nbaNflLineup).targetSportCoverage).toBeGreaterThan(
      scoreDailyChallengeSelection(nbaDuplicateLineup).targetSportCoverage,
    );
  });

  it("keeps NBA and NFL candidates in the real generator path when a slot pool exceeds the pruning limit", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("easy_nba_1", "easy", "NBA"),
        makeQuestion("easy_nba_2", "easy", "NBA"),
        makeQuestion("easy_nba_3", "easy", "NBA"),
        makeQuestion("easy_nba_4", "easy", "NBA"),
        makeQuestion("easy_nba_5", "easy", "NBA"),
        makeQuestion("easy_nba_6", "easy", "NBA"),
        makeQuestion("easy_nba_7", "easy", "NBA"),
        makeQuestion("easy_nba_8", "easy", "NBA"),
        makeQuestion("easy_nba_9", "easy", "NBA"),
        makeQuestion("easy_nba_10", "easy", "NBA"),
        makeQuestion("easy_nba_11", "easy", "NBA"),
        makeQuestion("easy_nba_12", "easy", "NBA"),
        makeQuestion("easy_nfl_1", "easy", "NFL"),
        makeQuestion("medium_cbb_1", "medium", "CBB"),
        makeQuestion("hard_mlb_1", "hard", "MLB"),
        makeQuestion("hard_nhl_1", "hard", "NHL"),
        makeQuestion("hard_nascar_1", "hard", "NASCAR"),
      ],
      recentQuestionIds: ["easy_nfl_1"],
    });

    expect(selectedSports(result)).toContain("NBA");
    expect(selectedSports(result)).toContain("NFL");
  });

  it("keeps stale NBA and NFL candidates available when fresher non-target sports fill a large bucket", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("easy_nba_1", "easy", "NBA"),
        makeQuestion("easy_nfl_1", "easy", "NFL"),
        makeQuestion("easy_nhl_1", "easy", "NHL"),
        makeQuestion("easy_mlb_1", "easy", "MLB"),
        makeQuestion("easy_cbb_1", "easy", "CBB"),
        makeQuestion("easy_cfb_1", "easy", "CFB"),
        makeQuestion("easy_wnba_1", "easy", "WNBA"),
        makeQuestion("easy_mls_1", "easy", "MLS"),
        makeQuestion("easy_ufc_1", "easy", "UFC"),
        makeQuestion("easy_f1_1", "easy", "F1"),
        makeQuestion("easy_pga_1", "easy", "PGA"),
        makeQuestion("easy_nascar_1", "easy", "NASCAR"),
        makeQuestion("easy_ncaaw_1", "easy", "NCAAW"),
        makeQuestion("medium_cbb_1", "medium", "CBB"),
        makeQuestion("hard_mlb_1", "hard", "MLB"),
        makeQuestion("hard_nhl_1", "hard", "NHL"),
      ],
      recentQuestionIds: ["easy_nba_1", "easy_nfl_1"],
    });

    expect(selectedSports(result)).toContain("NBA");
    expect(selectedSports(result)).toContain("NFL");
  });

  it("keeps a non-target sport candidate available when a large slot bucket needs it for balance", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("easy_nba_1", "easy", "NBA"),
        makeQuestion("easy_nba_2", "easy", "NBA"),
        makeQuestion("easy_nba_3", "easy", "NBA"),
        makeQuestion("easy_nba_4", "easy", "NBA"),
        makeQuestion("easy_nba_5", "easy", "NBA"),
        makeQuestion("easy_nba_6", "easy", "NBA"),
        makeQuestion("easy_nba_7", "easy", "NBA"),
        makeQuestion("easy_nba_8", "easy", "NBA"),
        makeQuestion("easy_nba_9", "easy", "NBA"),
        makeQuestion("easy_nba_10", "easy", "NBA"),
        makeQuestion("easy_nba_11", "easy", "NBA"),
        makeQuestion("easy_nba_12", "easy", "NBA"),
        makeQuestion("easy_cbb_1", "easy", "CBB"),
        makeQuestion("medium_nfl_1", "medium", "NFL"),
        makeQuestion("medium_nba_1", "medium", "NBA"),
        makeQuestion("hard_nba_1", "hard", "NBA"),
        makeQuestion("hard_nfl_1", "hard", "NFL"),
      ],
      recentQuestionIds: [],
    });

    expect(selectedSports(result)).toContain("CBB");
    expect(new Set(selectedSports(result)).size).toBeGreaterThanOrEqual(3);
  });

  it("prefers the more balanced lineup over extra NBA and NFL duplicates in the real generator path", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("easy_nba_1", "easy", "NBA"),
        makeQuestion("easy_nfl_1", "easy", "NFL"),
        makeQuestion("easy_nba_2", "easy", "NBA"),
        makeQuestion("easy_cbb_1", "easy", "CBB"),
        makeQuestion("medium_nfl_1", "medium", "NFL"),
        makeQuestion("medium_cbb_1", "medium", "CBB"),
        makeQuestion("hard_mlb_1", "hard", "MLB"),
        makeQuestion("hard_nhl_1", "hard", "NHL"),
        makeQuestion("hard_mlb_2", "hard", "MLB"),
        makeQuestion("hard_nhl_2", "hard", "NHL"),
      ],
      recentQuestionIds: [],
    });

    expect(result?.map((question) => question.id)).toEqual([
      "easy_nba_1",
      "easy_nfl_1",
      "medium_cbb_1",
      "hard_mlb_1",
      "hard_nhl_1",
    ]);
  });

  it("reaches at least three sports total when possible", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("q1", "easy", "NBA"),
        makeQuestion("q2", "easy", "NFL"),
        makeQuestion("q3", "medium", "MLB"),
        makeQuestion("q4", "hard", "CBB"),
        makeQuestion("q5", "hard", "NHL"),
      ],
      recentQuestionIds: [],
    });

    expect(new Set(selectedSports(result)).size).toBeGreaterThanOrEqual(3);
  });

  it("can select MLB as a normal non-target variety sport", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("easy_nba_1", "easy", "NBA"),
        makeQuestion("easy_nfl_1", "easy", "NFL"),
        makeQuestion("medium_mlb_1", "medium", "MLB"),
        makeQuestion("medium_nba_1", "medium", "NBA"),
        makeQuestion("hard_nba_1", "hard", "NBA"),
        makeQuestion("hard_nfl_1", "hard", "NFL"),
        makeQuestion("hard_cbb_1", "hard", "CBB"),
      ],
      recentQuestionIds: [],
    });

    expect(selectedSports(result)).toContain("MLB");
  });

  it("does not count MLB as an NBA or NFL priority target", () => {
    const nbaMlbLineup = [
      { ...makeQuestion("easy_nba_1", "easy", "NBA"), slot: 1 },
      { ...makeQuestion("easy_mlb_1", "easy", "MLB"), slot: 2 },
      { ...makeQuestion("medium_cbb_1", "medium", "CBB"), slot: 3 },
      { ...makeQuestion("hard_nhl_1", "hard", "NHL"), slot: 4 },
      { ...makeQuestion("hard_cfb_1", "hard", "CFB"), slot: 5 },
    ];
    const nbaNflLineup = [
      { ...makeQuestion("easy_nba_1", "easy", "NBA"), slot: 1 },
      { ...makeQuestion("easy_nfl_1", "easy", "NFL"), slot: 2 },
      { ...makeQuestion("medium_cbb_1", "medium", "CBB"), slot: 3 },
      { ...makeQuestion("hard_nhl_1", "hard", "NHL"), slot: 4 },
      { ...makeQuestion("hard_cfb_1", "hard", "CFB"), slot: 5 },
    ];

    expect(scoreDailyChallengeSelection(nbaMlbLineup).targetSportCoverage).toBe(1);
    expect(scoreDailyChallengeSelection(nbaNflLineup).targetSportCoverage).toBe(2);
  });

  it("keeps no sport above two questions when possible", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("q1", "easy", "NBA"),
        makeQuestion("q2", "easy", "NBA"),
        makeQuestion("q3", "medium", "NHL"),
        makeQuestion("q4", "hard", "NFL"),
        makeQuestion("q5", "hard", "MLB"),
        makeQuestion("q6", "easy", "CBB"),
        makeQuestion("q7", "medium", "CBB"),
      ],
      recentQuestionIds: [],
    });

    const sportCounts = selectedSports(result).reduce<Record<string, number>>(
      (counts, sport) => {
        counts[sport] = (counts[sport] ?? 0) + 1;
        return counts;
      },
      {},
    );

    expect(Math.max(...Object.values(sportCounts))).toBeLessThanOrEqual(2);
  });

  it("prefers fresher questions over recently used ones", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("recent_easy", "easy", "NBA"),
        makeQuestion("fresh_easy", "easy", "NBA"),
        makeQuestion("medium_1", "medium", "NFL"),
        makeQuestion("medium_2", "medium", "MLB"),
        makeQuestion("hard_1", "hard", "CBB"),
        makeQuestion("hard_2", "hard", "NHL"),
      ],
      recentQuestionIds: ["recent_easy"],
    });

    expect(result?.[0]?.id).toBe("fresh_easy");
  });

  it("still returns five questions when sport mix must weaken", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("q1", "easy", "NBA"),
        makeQuestion("q2", "easy", "NBA"),
        makeQuestion("q3", "medium", "NFL"),
        makeQuestion("q4", "hard", "NBA"),
        makeQuestion("q5", "hard", "NFL"),
      ],
      recentQuestionIds: [],
    });

    expect(result).toHaveLength(5);
  });
});
