import type { QuestionSnapshot } from "@/lib/dailyChallenge";
import type { SportQuizQuestion } from "@/lib/sportQuiz";
import { FIVE_QUESTION_DIFFICULTY_MIX } from "@/lib/server/dailyChallengeGenerator";

export type SportQuizGenerationInput = {
  candidates: QuestionSnapshot[];
  recentQuestionIds?: string[];
  random?: () => number;
};

function shuffled<T>(values: T[], random: () => number) {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomValue = Math.min(Math.max(random(), 0), 0.9999999999999999);
    const swapIndex = Math.floor(randomValue * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function generateSportQuizQuestions({
  candidates,
  recentQuestionIds = [],
  random = Math.random,
}: SportQuizGenerationInput): SportQuizQuestion[] | null {
  const recentIds = new Set(recentQuestionIds);
  const seenCandidateIds = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    if (seenCandidateIds.has(candidate.id)) {
      return false;
    }

    seenCandidateIds.add(candidate.id);
    return true;
  });

  const pools = new Map<QuestionSnapshot["difficulty"], QuestionSnapshot[]>();

  for (const difficulty of new Set(FIVE_QUESTION_DIFFICULTY_MIX)) {
    const candidatesAtDifficulty = uniqueCandidates.filter(
      (candidate) => candidate.difficulty === difficulty,
    );
    const fresh = candidatesAtDifficulty.filter(
      (candidate) => !recentIds.has(candidate.id),
    );
    const recent = candidatesAtDifficulty.filter((candidate) =>
      recentIds.has(candidate.id),
    );

    pools.set(difficulty, [
      ...shuffled(fresh, random),
      ...shuffled(recent, random),
    ]);
  }

  const selected: SportQuizQuestion[] = [];
  const usedIds = new Set<string>();

  for (const [index, difficulty] of FIVE_QUESTION_DIFFICULTY_MIX.entries()) {
    const candidate = pools
      .get(difficulty)
      ?.find((question) => !usedIds.has(question.id));

    if (!candidate) {
      return null;
    }

    usedIds.add(candidate.id);
    selected.push({
      ...candidate,
      slot: index + 1,
    });
  }

  return selected;
}
