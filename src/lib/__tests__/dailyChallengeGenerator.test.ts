import { describe, expect, it } from "vitest";

import {
  generateDailyChallengeQuestions,
  scoreDailyChallengeSelection,
  selectDailyChallengeReplacement,
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

function makeSelection(
  questions: Array<
    [id: string, difficulty: QuestionSnapshot["difficulty"], sportName: string]
  > = [
    ["easy_nba", "easy", "NBA"],
    ["easy_nfl", "easy", "NFL"],
    ["medium_cbb", "medium", "CBB"],
    ["hard_mlb", "hard", "MLB"],
    ["hard_nhl", "hard", "NHL"],
  ],
) {
  return questions.map(([id, difficulty, sportName], index) => ({
    ...makeQuestion(id, difficulty, sportName),
    slot: index + 1,
  }));
}

describe("selectDailyChallengeReplacement", () => {
  it("selects the flagged slot difficulty without changing the selected lineup", () => {
    const selection = makeSelection();
    const replacement = makeQuestion("medium_nascar", "medium", "NASCAR");

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeQuestion("easy_wnba", "easy", "WNBA"),
          replacement,
          makeQuestion("hard_cfb", "hard", "CFB"),
        ],
      }),
    ).toEqual(replacement);
    expect(selection.map((question) => question.id)).toEqual([
      "easy_nba",
      "easy_nfl",
      "medium_cbb",
      "hard_mlb",
      "hard_nhl",
    ]);
  });

  it("excludes every selected question ID, including self-replacement", () => {
    const selection = makeSelection();
    const valid = makeQuestion("medium_nascar", "medium", "NASCAR");

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeQuestion("medium_cbb", "medium", "CBB"),
          makeQuestion("hard_mlb", "medium", "MLB"),
          valid,
        ],
      })?.id,
    ).toBe(valid.id);
  });

  it("avoids a recent question when a composition-equivalent fresh option exists", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeQuestion("recent_cfb", "medium", "CFB"),
          makeQuestion("fresh_cfb", "medium", "CFB"),
        ],
        recentQuestionIds: ["recent_cfb"],
      })?.id,
    ).toBe("fresh_cfb");
  });

  it("preserves NBA and NFL target coverage", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 1,
        candidates: [
          makeQuestion("fresh_cfb", "easy", "CFB"),
          makeQuestion("recent_nba", "easy", "NBA"),
        ],
        recentQuestionIds: ["recent_nba"],
      })?.id,
    ).toBe("recent_nba");
  });

  it("preserves sport diversity when a same-difficulty option can", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeQuestion("fresh_nba", "medium", "NBA"),
          makeQuestion("recent_cfb", "medium", "CFB"),
        ],
        recentQuestionIds: ["recent_cfb"],
      })?.id,
    ).toBe("recent_cfb");
  });

  it("preserves the max-two-per-sport condition when possible", () => {
    const selection = makeSelection([
      ["easy_nba", "easy", "NBA"],
      ["easy_nfl", "easy", "NFL"],
      ["medium_cbb", "medium", "CBB"],
      ["hard_nba", "hard", "NBA"],
      ["hard_nhl", "hard", "NHL"],
    ]);

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 5,
        candidates: [
          makeQuestion("fresh_nba", "hard", "NBA"),
          makeQuestion("recent_mlb", "hard", "MLB"),
        ],
        recentQuestionIds: ["recent_mlb"],
      })?.id,
    ).toBe("recent_mlb");
  });

  it("chooses a preserving candidate over a lexically earlier degrading candidate", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeQuestion("a_nba", "medium", "NBA"),
          makeQuestion("z_cfb", "medium", "CFB"),
        ],
      })?.id,
    ).toBe("z_cfb");
  });

  it("scores the resulting full five when removal changes composition", () => {
    const selection = makeSelection([
      ["easy_nba", "easy", "NBA"],
      ["easy_nfl", "easy", "NFL"],
      ["medium_nba", "medium", "NBA"],
      ["hard_mlb", "hard", "MLB"],
      ["hard_nhl", "hard", "NHL"],
    ]);

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeQuestion("fresh_nfl", "medium", "NFL"),
          makeQuestion("recent_cbb", "medium", "CBB"),
        ],
        recentQuestionIds: ["recent_cbb"],
      })?.id,
    ).toBe("recent_cbb");
  });

  it("uses question ID as a stable final tie-break independent of candidate order", () => {
    const selection = makeSelection();
    const candidates = [
      makeQuestion("z_cfb", "medium", "CFB"),
      makeQuestion("a_wnba", "medium", "WNBA"),
    ];
    const input = {
      selection,
      flaggedSlot: 3,
      candidates,
    };

    expect(selectDailyChallengeReplacement(input)?.id).toBe("a_wnba");
    expect(
      selectDailyChallengeReplacement({
        ...input,
        candidates: [...candidates].reverse(),
      })?.id,
    ).toBe("a_wnba");
  });

  it("returns null when no same-difficulty nonduplicate candidate exists", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeQuestion("medium_cbb", "medium", "CBB"),
          makeQuestion("easy_cfb", "easy", "CFB"),
        ],
      }),
    ).toBeNull();
  });

  it("returns null for an invalid flagged slot or invalid five-question selection", () => {
    const selection = makeSelection();
    const candidate = makeQuestion("medium_cfb", "medium", "CFB");

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 0,
        candidates: [candidate],
      }),
    ).toBeNull();
    expect(
      selectDailyChallengeReplacement({
        selection: selection.slice(0, 4),
        flaggedSlot: 3,
        candidates: [candidate],
      }),
    ).toBeNull();
    expect(
      selectDailyChallengeReplacement({
        selection: selection.map((question) => ({ ...question, slot: 1 })),
        flaggedSlot: 3,
        candidates: [candidate],
      }),
    ).toBeNull();
  });

  it("does not mutate the selection, candidates, or recent question IDs", () => {
    const selection = makeSelection();
    const candidates = [
      makeQuestion("z_cfb", "medium", "CFB"),
      makeQuestion("a_wnba", "medium", "WNBA"),
    ];
    const recentQuestionIds = ["z_cfb"];
    const selectionBefore = structuredClone(selection);
    const candidatesBefore = structuredClone(candidates);
    const recentBefore = [...recentQuestionIds];

    selectDailyChallengeReplacement({
      selection,
      flaggedSlot: 3,
      candidates,
      recentQuestionIds,
    });

    expect(selection).toEqual(selectionBefore);
    expect(candidates).toEqual(candidatesBefore);
    expect(recentQuestionIds).toEqual(recentBefore);
  });

  it("ignores candidates that are not ready and daily eligible", () => {
    const selection = makeSelection();
    const retired = {
      ...makeQuestion("a_cfb", "medium", "CFB"),
      status: "retired" as const,
    };
    const ineligible = {
      ...makeQuestion("b_wnba", "medium", "WNBA"),
      eligible_for_daily: false,
    };
    const valid = makeQuestion("z_nascar", "medium", "NASCAR");

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [retired, ineligible, valid],
      })?.id,
    ).toBe(valid.id);
  });
});
