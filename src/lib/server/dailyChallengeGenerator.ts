import type { QuestionSnapshot } from "@/lib/dailyChallenge";

export const FIVE_QUESTION_DIFFICULTY_MIX = [
  "easy",
  "easy",
  "medium",
  "hard",
  "hard",
] as const;

export const DAILY_CHALLENGE_SLOT_DIFFICULTIES = FIVE_QUESTION_DIFFICULTY_MIX;

export type DailyChallengeGeneratorCandidate = QuestionSnapshot;

export type GeneratedDailyChallengeQuestion = QuestionSnapshot & {
  slot: number;
};

export type DailyChallengeGenerationInput = {
  candidates: DailyChallengeGeneratorCandidate[];
  recentQuestionIds?: string[];
};

export type DailyChallengeReplacementInput = {
  selection: readonly GeneratedDailyChallengeQuestion[];
  flaggedSlot: number;
  candidates: readonly DailyChallengeGeneratorCandidate[];
  recentQuestionIds?: readonly string[] | ReadonlySet<string>;
};

type PartialSelection = {
  questions: GeneratedDailyChallengeQuestion[];
  usedQuestionIds: Set<string>;
};

type SelectionScore = {
  targetSportCoverage: number;
  targetQuestionCount: number;
  uniqueSportCount: number;
  overLimitCount: number;
  freshnessScore: number;
};

const TARGET_SPORTS = new Set(["NBA", "NFL"]);
const MAX_CANDIDATES_PER_SLOT = 12;

function normalizeSportName(value: string) {
  return value.trim().toUpperCase();
}

function getFreshnessScore(
  questionId: string,
  recentQuestionIdRanks: Map<string, number>,
) {
  const rank = recentQuestionIdRanks.get(questionId);
  if (rank === undefined) {
    return 1_000;
  }

  return Math.max(0, 100 - rank);
}

function getSelectionScore(
  selection: GeneratedDailyChallengeQuestion[],
  recentQuestionIdRanks: Map<string, number>,
): SelectionScore {
  const sportCounts = new Map<string, number>();
  const targetSportsSeen = new Set<string>();
  let freshnessScore = 0;
  let targetQuestionCount = 0;

  for (const question of selection) {
    const sportName = normalizeSportName(question.sport.name);
    sportCounts.set(sportName, (sportCounts.get(sportName) ?? 0) + 1);
    freshnessScore += getFreshnessScore(question.id, recentQuestionIdRanks);

    if (TARGET_SPORTS.has(sportName)) {
      targetQuestionCount += 1;
      targetSportsSeen.add(sportName);
    }
  }

  let overLimitCount = 0;
  for (const count of sportCounts.values()) {
    if (count > 2) {
      overLimitCount += count - 2;
    }
  }

  return {
    targetSportCoverage: targetSportsSeen.size,
    targetQuestionCount,
    uniqueSportCount: sportCounts.size,
    overLimitCount,
    freshnessScore,
  };
}

function compareSelectionScore(left: SelectionScore, right: SelectionScore) {
  if (left.targetSportCoverage !== right.targetSportCoverage) {
    return left.targetSportCoverage - right.targetSportCoverage;
  }

  if (left.uniqueSportCount !== right.uniqueSportCount) {
    return left.uniqueSportCount - right.uniqueSportCount;
  }

  if (left.overLimitCount !== right.overLimitCount) {
    return right.overLimitCount - left.overLimitCount;
  }

  if (left.targetQuestionCount !== right.targetQuestionCount) {
    return left.targetQuestionCount - right.targetQuestionCount;
  }

  return left.freshnessScore - right.freshnessScore;
}

function rankCandidate(
  candidate: DailyChallengeGeneratorCandidate,
  recentQuestionIdRanks: Map<string, number>,
  availableTargetSports: Set<string>,
) {
  const sportName = normalizeSportName(candidate.sport.name);
  const freshnessScore = getFreshnessScore(candidate.id, recentQuestionIdRanks);
  const targetScore = availableTargetSports.has(sportName) ? 100 : 0;

  return freshnessScore + targetScore;
}

function dedupeAndLimitCandidates(
  candidates: DailyChallengeGeneratorCandidate[],
  recentQuestionIdRanks: Map<string, number>,
  availableTargetSports: Set<string>,
) {
  const seen = new Set<string>();

  const dedupedCandidates = candidates
    .filter((candidate) => {
      if (seen.has(candidate.id)) {
        return false;
      }

      seen.add(candidate.id);
      return true;
    })
    .sort((left, right) => {
      const scoreDelta =
        rankCandidate(right, recentQuestionIdRanks, availableTargetSports) -
        rankCandidate(left, recentQuestionIdRanks, availableTargetSports);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.id.localeCompare(right.id);
    });

  const selected: DailyChallengeGeneratorCandidate[] = [];
  const selectedIds = new Set<string>();
  const sportRepresentativeIds = new Set<string>();

  for (const sportName of TARGET_SPORTS) {
    if (!availableTargetSports.has(sportName)) {
      continue;
    }

    const targetSportCandidate = dedupedCandidates.find(
      (candidate) => normalizeSportName(candidate.sport.name) === sportName,
    );

    if (!targetSportCandidate || selectedIds.has(targetSportCandidate.id)) {
      continue;
    }

    sportRepresentativeIds.add(sportName);
    selected.push(targetSportCandidate);
    selectedIds.add(targetSportCandidate.id);

    if (selected.length === MAX_CANDIDATES_PER_SLOT) {
      return selected;
    }
  }

  for (const candidate of dedupedCandidates) {
    const sportName = normalizeSportName(candidate.sport.name);
    if (sportRepresentativeIds.has(sportName)) {
      continue;
    }

    sportRepresentativeIds.add(sportName);
    selected.push(candidate);
    selectedIds.add(candidate.id);

    if (selected.length === MAX_CANDIDATES_PER_SLOT) {
      return selected;
    }
  }

  for (const candidate of dedupedCandidates) {
    if (selectedIds.has(candidate.id)) {
      continue;
    }

    selected.push(candidate);
    selectedIds.add(candidate.id);

    if (selected.length === MAX_CANDIDATES_PER_SLOT) {
      break;
    }
  }

  return selected.slice(0, MAX_CANDIDATES_PER_SLOT);
}

function searchBestSelection(
  slotIndex: number,
  slotCandidates: DailyChallengeGeneratorCandidate[][],
  current: PartialSelection,
  recentQuestionIdRanks: Map<string, number>,
  best: { score: SelectionScore | null; questions: GeneratedDailyChallengeQuestion[] | null },
) {
  if (slotIndex === slotCandidates.length) {
    const score = getSelectionScore(current.questions, recentQuestionIdRanks);

    if (!best.score || compareSelectionScore(score, best.score) > 0) {
      best.score = score;
      best.questions = current.questions.slice();
    }

    return;
  }

  const slot = slotIndex + 1;
  const candidates = slotCandidates[slotIndex];

  for (const candidate of candidates) {
    if (current.usedQuestionIds.has(candidate.id)) {
      continue;
    }

    current.usedQuestionIds.add(candidate.id);
    current.questions.push({
      ...candidate,
      slot,
    });

    searchBestSelection(
      slotIndex + 1,
      slotCandidates,
      current,
      recentQuestionIdRanks,
      best,
    );

    current.questions.pop();
    current.usedQuestionIds.delete(candidate.id);
  }
}

export function generateDailyChallengeQuestions({
  candidates,
  recentQuestionIds = [],
}: DailyChallengeGenerationInput): GeneratedDailyChallengeQuestion[] | null {
  const recentQuestionIdRanks = new Map<string, number>();
  recentQuestionIds.forEach((questionId, index) => {
    if (!recentQuestionIdRanks.has(questionId)) {
      recentQuestionIdRanks.set(questionId, index);
    }
  });

  const availableTargetSports = new Set(
    candidates
      .map((candidate) => normalizeSportName(candidate.sport.name))
      .filter((sportName) => TARGET_SPORTS.has(sportName)),
  );

  const slotCandidates = DAILY_CHALLENGE_SLOT_DIFFICULTIES.map((difficulty) =>
    dedupeAndLimitCandidates(
      candidates.filter((candidate) => candidate.difficulty === difficulty),
      recentQuestionIdRanks,
      availableTargetSports,
    ),
  );

  if (slotCandidates.some((slot) => slot.length === 0)) {
    return null;
  }

  const best: { score: SelectionScore | null; questions: GeneratedDailyChallengeQuestion[] | null } = {
    score: null,
    questions: null,
  };

  searchBestSelection(
    0,
    slotCandidates,
    {
      questions: [],
      usedQuestionIds: new Set(),
    },
    recentQuestionIdRanks,
    best,
  );

  return best.questions;
}

export function scoreDailyChallengeSelection(
  selection: GeneratedDailyChallengeQuestion[],
  recentQuestionIds: string[] = [],
) {
  const recentQuestionIdRanks = new Map<string, number>();
  recentQuestionIds.forEach((questionId, index) => {
    if (!recentQuestionIdRanks.has(questionId)) {
      recentQuestionIdRanks.set(questionId, index);
    }
  });

  return getSelectionScore(selection, recentQuestionIdRanks);
}

function isValidDailyChallengeSelection(
  selection: readonly GeneratedDailyChallengeQuestion[],
) {
  if (selection.length !== DAILY_CHALLENGE_SLOT_DIFFICULTIES.length) {
    return false;
  }

  const questionIds = new Set<string>();

  return selection.every((question, index) => {
    if (
      question.slot !== index + 1 ||
      question.difficulty !== DAILY_CHALLENGE_SLOT_DIFFICULTIES[index] ||
      question.id.trim().length === 0 ||
      questionIds.has(question.id)
    ) {
      return false;
    }

    questionIds.add(question.id);
    return true;
  });
}

function preservesSelectionComposition(
  candidateScore: SelectionScore,
  baselineScore: SelectionScore,
) {
  return (
    candidateScore.targetSportCoverage >= baselineScore.targetSportCoverage &&
    candidateScore.uniqueSportCount >= baselineScore.uniqueSportCount &&
    candidateScore.overLimitCount <= baselineScore.overLimitCount
  );
}

export function selectDailyChallengeReplacement({
  selection,
  flaggedSlot,
  candidates,
  recentQuestionIds = [],
}: DailyChallengeReplacementInput): DailyChallengeGeneratorCandidate | null {
  if (
    !Number.isInteger(flaggedSlot) ||
    flaggedSlot < 1 ||
    flaggedSlot > DAILY_CHALLENGE_SLOT_DIFFICULTIES.length ||
    !isValidDailyChallengeSelection(selection)
  ) {
    return null;
  }

  const flaggedQuestion = selection[flaggedSlot - 1];
  const selectedQuestionIds = new Set(selection.map((question) => question.id));
  const recentIds = Array.from(recentQuestionIds);
  const eligibleCandidates = candidates
    .filter(
      (candidate) =>
        candidate.difficulty === flaggedQuestion.difficulty &&
        candidate.status === "ready" &&
        candidate.eligible_for_daily &&
        !selectedQuestionIds.has(candidate.id),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  if (eligibleCandidates.length === 0) {
    return null;
  }

  const baselineScore = scoreDailyChallengeSelection(
    selection.map((question) => ({ ...question })),
    recentIds,
  );
  const scoredCandidates = eligibleCandidates.map((candidate) => {
    const resultingSelection = selection.map((question, index) =>
      index === flaggedSlot - 1
        ? { ...candidate, slot: flaggedSlot }
        : { ...question },
    );

    return {
      candidate,
      score: scoreDailyChallengeSelection(resultingSelection, recentIds),
    };
  });
  const preservingCandidates = scoredCandidates.filter(({ score }) =>
    preservesSelectionComposition(score, baselineScore),
  );
  const rankedCandidates =
    preservingCandidates.length > 0 ? preservingCandidates : scoredCandidates;

  return rankedCandidates.reduce((best, current) =>
    compareSelectionScore(current.score, best.score) > 0 ? current : best,
  ).candidate;
}
