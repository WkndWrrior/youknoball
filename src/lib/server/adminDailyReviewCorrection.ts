import "server-only";

import type {
  DailyQuestionReviewEvidence,
  DailyQuestionVerificationFinding,
  QuestionAnswerOption,
} from "@/lib/dailyQuestionReview";
import { estimateDailyQuestionReviewCostMicrodollars } from "@/lib/server/dailyQuestionReviewBudget";
import {
  correctDailyQuestionReviewAnswer,
  loadDailyQuestionReviewByDate,
} from "@/lib/server/dailyQuestionReviewRepository";
import {
  collectSavedSourceEvidence,
  type SourceEvidenceResult,
} from "@/lib/server/dailyQuestionSourceFetcher";
import {
  verifyQuestionWithOpenAi,
  type OpenAiQuestionVerifierInput,
  type OpenAiQuestionVerifierResult,
} from "@/lib/server/openAiQuestionVerifier";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_MODEL = "gpt-5.6-terra";

type Review = NonNullable<Awaited<ReturnType<typeof loadDailyQuestionReviewByDate>>>;
type CorrectionInput = Parameters<typeof correctDailyQuestionReviewAnswer>[1];
type CorrectionRepositoryResult = Awaited<ReturnType<typeof correctDailyQuestionReviewAnswer>>;

export interface AdminDailyReviewCorrectionDependencies {
  model: string;
  loadReview: (challengeDate: string) => Promise<Review | null>;
  collectEvidence: (
    sourceNotes: string | null | undefined,
  ) => Promise<SourceEvidenceResult[]>;
  verifyQuestion: (
    input: OpenAiQuestionVerifierInput,
  ) => Promise<OpenAiQuestionVerifierResult>;
  estimateCost: typeof estimateDailyQuestionReviewCostMicrodollars;
  correctAnswer: (input: CorrectionInput) => Promise<CorrectionRepositoryResult>;
}

export interface AdminDailyReviewCorrectionInput {
  challengeDate: string;
  reviewItemId: string;
  newCorrectOption: QuestionAnswerOption;
  resolvedBy: string;
}

interface VerificationDetails {
  finding: DailyQuestionVerificationFinding;
  evidence: DailyQuestionReviewEvidence[];
  estimatedCostMicrodollars: number;
}

export type AdminDailyReviewCorrectionResult =
  | { outcome: "missing" }
  | {
      outcome: "conflict";
      reason: "resolved" | "not_flagged" | "unchanged" | "stale" | "not_draft";
    }
  | ({ outcome: "verification_rejected" } & VerificationDetails)
  | ({ outcome: "applied" } & VerificationDetails);

function productionDependencies(): AdminDailyReviewCorrectionDependencies {
  const client = supabaseAdmin();
  return {
    model: process.env.DAILY_REVIEW_OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    loadReview: (challengeDate) =>
      loadDailyQuestionReviewByDate(client, challengeDate),
    collectEvidence: collectSavedSourceEvidence,
    verifyQuestion: verifyQuestionWithOpenAi,
    estimateCost: estimateDailyQuestionReviewCostMicrodollars,
    correctAnswer: (input) => correctDailyQuestionReviewAnswer(client, input),
  };
}

export async function verifyAndCorrectAdminDailyReviewAnswer(
  input: AdminDailyReviewCorrectionInput,
  dependencies: AdminDailyReviewCorrectionDependencies = productionDependencies(),
): Promise<AdminDailyReviewCorrectionResult> {
  const review = await dependencies.loadReview(input.challengeDate);
  const item = review?.items.find((candidate) => candidate.id === input.reviewItemId);
  if (!item) {
    return { outcome: "missing" };
  }
  if (item.resolution !== "pending") {
    return { outcome: "conflict", reason: "resolved" };
  }
  if (
    !item.finding ||
    (item.finding.verdict !== "risk" && item.finding.verdict !== "unable_to_verify")
  ) {
    return { outcome: "conflict", reason: "not_flagged" };
  }
  if (item.question.correct_option === input.newCorrectOption) {
    return { outcome: "conflict", reason: "unchanged" };
  }

  const proposedQuestion = {
    ...item.question,
    correct_option: input.newCorrectOption,
  };
  const savedEvidence = await dependencies.collectEvidence(
    item.question.source_notes,
  );
  const verification = await dependencies.verifyQuestion({
    question: proposedQuestion,
    savedEvidence,
  });
  const estimatedCostMicrodollars = dependencies.estimateCost({
    model: dependencies.model,
    ...verification.usage,
    webSearchCalls: verification.webSearchCalls,
  });
  const finding = verification.finding;
  const details: VerificationDetails = {
    finding,
    evidence: finding.evidence,
    estimatedCostMicrodollars,
  };

  if (finding.verdict !== "passed" || finding.evidence.length === 0) {
    return { outcome: "verification_rejected", ...details };
  }
  const passedFinding = { ...finding, verdict: finding.verdict };

  const result = await dependencies.correctAnswer({
    challengeDate: input.challengeDate,
    reviewItemId: input.reviewItemId,
    newCorrectOption: input.newCorrectOption,
    finding: passedFinding,
    resolvedBy: input.resolvedBy,
  });
  if (result.outcome === "missing") {
    return { outcome: "missing" };
  }
  if (result.outcome === "conflict") {
    return { outcome: "conflict", reason: "stale" };
  }
  if (result.outcome === "not_draft") {
    return { outcome: "conflict", reason: "not_draft" };
  }
  return { outcome: "applied", ...details };
}
