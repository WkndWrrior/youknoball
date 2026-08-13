import { describe, expect, it } from "vitest";

import {
  generateDailyChallengeQuestions,
  isDailyChallengeReplacementValid,
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

function questionId(seed: number) {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function makeReplacementQuestion(
  seed: number,
  difficulty: QuestionSnapshot["difficulty"],
  sportName: string,
) {
  return makeQuestion(questionId(seed), difficulty, sportName);
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

  it("ranks fresh questions above older repeats and older repeats above newer repeats", () => {
    const base = [
      { ...makeQuestion("easy_nba", "easy", "NBA"), slot: 1 },
      { ...makeQuestion("easy_nfl", "easy", "NFL"), slot: 2 },
      { ...makeQuestion("medium_cbb", "medium", "CBB"), slot: 3 },
      { ...makeQuestion("hard_mlb", "hard", "MLB"), slot: 4 },
    ];
    const recentQuestionIds = ["newest_repeat", "older_repeat"];
    const freshScore = scoreDailyChallengeSelection(
      [...base, { ...makeQuestion("fresh", "hard", "NHL"), slot: 5 }],
      recentQuestionIds,
    ).freshnessScore;
    const olderScore = scoreDailyChallengeSelection(
      [
        ...base,
        { ...makeQuestion("older_repeat", "hard", "NHL"), slot: 5 },
      ],
      recentQuestionIds,
    ).freshnessScore;
    const newestScore = scoreDailyChallengeSelection(
      [
        ...base,
        { ...makeQuestion("newest_repeat", "hard", "NHL"), slot: 5 },
      ],
      recentQuestionIds,
    ).freshnessScore;

    expect(freshScore).toBeGreaterThan(olderScore);
    expect(olderScore).toBeGreaterThan(newestScore);
  });

  it("uses newest-first history to prefer an older repeat in generation", () => {
    const result = generateDailyChallengeQuestions({
      candidates: [
        makeQuestion("newest_easy", "easy", "NBA"),
        makeQuestion("older_easy", "easy", "NBA"),
        makeQuestion("easy_nfl", "easy", "NFL"),
        makeQuestion("medium_cbb", "medium", "CBB"),
        makeQuestion("hard_mlb", "hard", "MLB"),
        makeQuestion("hard_nhl", "hard", "NHL"),
      ],
      recentQuestionIds: ["newest_easy", "older_easy"],
    });

    expect(result?.map((question) => question.id)).toContain("older_easy");
    expect(result?.map((question) => question.id)).not.toContain("newest_easy");
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
    [seed: number, difficulty: QuestionSnapshot["difficulty"], sportName: string]
  > = [
    [1, "easy", "NBA"],
    [2, "easy", "NFL"],
    [3, "medium", "CBB"],
    [4, "hard", "MLB"],
    [5, "hard", "NHL"],
  ],
) {
  return questions.map(([seed, difficulty, sportName], index) => ({
    ...makeReplacementQuestion(seed, difficulty, sportName),
    slot: index + 1,
  }));
}

describe("selectDailyChallengeReplacement", () => {
  it("revalidates stored replacements for difficulty, freshness, uniqueness, and composition", () => {
    const selection = makeSelection();
    const valid = { ...makeReplacementQuestion(10, "medium", "CFB"), slot: 3 };
    expect(isDailyChallengeReplacementValid({ selection, flaggedSlot: 3, replacement: valid })).toBe(true);
    expect(isDailyChallengeReplacementValid({
      selection,
      flaggedSlot: 3,
      replacement: valid,
      recentQuestionIds: [valid.id],
    })).toBe(false);
    expect(isDailyChallengeReplacementValid({
      selection,
      flaggedSlot: 1,
      replacement: { ...makeReplacementQuestion(11, "easy", "CFB"), slot: 1 },
    })).toBe(false);
  });

  it("selects the flagged slot difficulty without changing the selected lineup", () => {
    const selection = makeSelection();
    const replacement = makeReplacementQuestion(10, "medium", "NASCAR");

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeReplacementQuestion(11, "easy", "WNBA"),
          replacement,
          makeReplacementQuestion(12, "hard", "CFB"),
        ],
      }),
    ).toEqual(replacement);
    expect(selection.map((question) => question.id)).toEqual(
      [1, 2, 3, 4, 5].map(questionId),
    );
  });

  it("excludes every selected question ID, including self-replacement", () => {
    const selection = makeSelection();
    const valid = makeReplacementQuestion(10, "medium", "NASCAR");

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeReplacementQuestion(3, "medium", "CBB"),
          makeReplacementQuestion(4, "medium", "MLB"),
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
          makeReplacementQuestion(10, "medium", "CFB"),
          makeReplacementQuestion(11, "medium", "CFB"),
        ],
        recentQuestionIds: [questionId(10)],
      })?.id,
    ).toBe(questionId(11));
  });

  it("returns null when every otherwise-valid replacement is recent", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeReplacementQuestion(10, "medium", "CFB"),
          makeReplacementQuestion(11, "medium", "CFB"),
        ],
        recentQuestionIds: [questionId(10), questionId(11)],
      }),
    ).toBeNull();
  });

  it("returns null when the only fresh option would reduce target coverage", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 1,
        candidates: [
          makeReplacementQuestion(10, "easy", "CFB"),
          makeReplacementQuestion(11, "easy", "NBA"),
        ],
        recentQuestionIds: [questionId(11)],
      }),
    ).toBeNull();
  });

  it("returns null when the only fresh option would reduce sport diversity", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeReplacementQuestion(10, "medium", "NBA"),
          makeReplacementQuestion(11, "medium", "CFB"),
        ],
        recentQuestionIds: [questionId(11)],
      }),
    ).toBeNull();
  });

  it("returns null when the only fresh option would exceed the sport limit", () => {
    const selection = makeSelection([
      [1, "easy", "NBA"],
      [2, "easy", "NFL"],
      [3, "medium", "CBB"],
      [4, "hard", "NBA"],
      [5, "hard", "NHL"],
    ]);

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 5,
        candidates: [
          makeReplacementQuestion(10, "hard", "NBA"),
          makeReplacementQuestion(11, "hard", "MLB"),
        ],
        recentQuestionIds: [questionId(11)],
      }),
    ).toBeNull();
  });

  it("chooses a preserving candidate over a lexically earlier degrading candidate", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeReplacementQuestion(10, "medium", "NBA"),
          makeReplacementQuestion(99, "medium", "CFB"),
        ],
      })?.id,
    ).toBe(questionId(99));
  });

  it("selects a fresh preserving option when removal changes composition", () => {
    const selection = makeSelection([
      [1, "easy", "NBA"],
      [2, "easy", "NFL"],
      [3, "medium", "NBA"],
      [4, "hard", "MLB"],
      [5, "hard", "NHL"],
    ]);

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeReplacementQuestion(10, "medium", "NFL"),
          makeReplacementQuestion(11, "medium", "CBB"),
        ],
        recentQuestionIds: [questionId(11)],
      })?.id,
    ).toBe(questionId(10));
  });

  it("uses question ID as a stable final tie-break independent of candidate order", () => {
    const selection = makeSelection();
    const candidates = [
      makeReplacementQuestion(99, "medium", "CFB"),
      makeReplacementQuestion(10, "medium", "WNBA"),
    ];
    const input = {
      selection,
      flaggedSlot: 3,
      candidates,
    };

    expect(selectDailyChallengeReplacement(input)?.id).toBe(questionId(10));
    expect(
      selectDailyChallengeReplacement({
        ...input,
        candidates: [...candidates].reverse(),
      })?.id,
    ).toBe(questionId(10));
  });

  it("returns null when no same-difficulty nonduplicate candidate exists", () => {
    const selection = makeSelection();

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [
          makeReplacementQuestion(3, "medium", "CBB"),
          makeReplacementQuestion(10, "easy", "CFB"),
        ],
      }),
    ).toBeNull();
  });

  it("returns null for an invalid flagged slot or invalid five-question selection", () => {
    const selection = makeSelection();
    const candidate = makeReplacementQuestion(10, "medium", "CFB");

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
      makeReplacementQuestion(99, "medium", "CFB"),
      makeReplacementQuestion(10, "medium", "WNBA"),
    ];
    const recentQuestionIds = [questionId(99)];
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
      ...makeReplacementQuestion(10, "medium", "CFB"),
      status: "retired" as const,
    };
    const ineligible = {
      ...makeReplacementQuestion(11, "medium", "WNBA"),
      eligible_for_daily: false,
    };
    const valid = makeReplacementQuestion(12, "medium", "NASCAR");

    expect(
      selectDailyChallengeReplacement({
        selection,
        flaggedSlot: 3,
        candidates: [retired, ineligible, valid],
      })?.id,
    ).toBe(valid.id);
  });

  it.each([
    ["non-UUID ID", { id: "not-a-uuid" }],
    ["blank question text", { question_text: "   " }],
    ["oversized question text", { question_text: "x".repeat(1001) }],
    ["blank option A", { option_a: "" }],
    ["oversized option D", { option_d: "x".repeat(501) }],
    ["invalid correct option", { correct_option: "E" }],
    ["invalid difficulty", { difficulty: "expert" }],
    ["blank sport slug", { sport: { slug: "", name: "CFB" } }],
    ["blank sport name", { sport: { slug: "cfb", name: " " } }],
    ["oversized sport slug", { sport: { slug: "x".repeat(51), name: "CFB" } }],
    ["oversized sport name", { sport: { slug: "cfb", name: "x".repeat(101) } }],
    ["invalid source notes", { source_notes: { url: "https://ncaa.com" } }],
    ["oversized source notes", { source_notes: "x".repeat(4001) }],
  ])("rejects a replacement candidate with %s", (_label, overrides) => {
    const valid = makeReplacementQuestion(10, "medium", "CFB");
    const candidate = {
      ...valid,
      ...overrides,
      sport:
        "sport" in overrides
          ? { ...valid.sport, ...overrides.sport }
          : valid.sport,
    } as QuestionSnapshot;

    expect(
      selectDailyChallengeReplacement({
        selection: makeSelection(),
        flaggedSlot: 3,
        candidates: [candidate],
      }),
    ).toBeNull();
  });

  it("excludes every duplicated candidate ID independent of input order", () => {
    const firstDuplicate = makeReplacementQuestion(10, "medium", "NBA");
    const conflictingDuplicate = makeReplacementQuestion(10, "medium", "CFB");
    const safeFallback = makeReplacementQuestion(11, "medium", "NASCAR");
    const candidates = [firstDuplicate, conflictingDuplicate, safeFallback];

    expect(
      selectDailyChallengeReplacement({
        selection: makeSelection(),
        flaggedSlot: 3,
        candidates,
      })?.id,
    ).toBe(safeFallback.id);
    expect(
      selectDailyChallengeReplacement({
        selection: makeSelection(),
        flaggedSlot: 3,
        candidates: [...candidates].reverse(),
      })?.id,
    ).toBe(safeFallback.id);
  });
});
