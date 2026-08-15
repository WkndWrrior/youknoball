import "server-only";

import type {
  DailyQuestionReviewEvidence,
  DailyQuestionVerificationFinding,
  QuestionAnswerOption,
} from "@/lib/dailyQuestionReview";
import { estimateDailyQuestionReviewCostMicrodollars } from "@/lib/server/dailyQuestionReviewBudget";
import {
  claimDailyQuestionReviewAnswerCorrection,
  correctDailyQuestionReviewAnswer,
  loadDailyQuestionReviewByDate,
  releaseDailyQuestionReviewAnswerCorrection,
} from "@/lib/server/dailyQuestionReviewRepository";
import {
  collectSavedSourceEvidence,
  type SourceEvidenceResult,
} from "@/lib/server/dailyQuestionSourceFetcher";
import {
  OpenAiQuestionVerifierError,
  verifyQuestionWithOpenAi,
  type OpenAiQuestionVerifierInput,
  type OpenAiQuestionVerifierResult,
} from "@/lib/server/openAiQuestionVerifier";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_MODEL = "gpt-5.6-terra";

type Review = NonNullable<Awaited<ReturnType<typeof loadDailyQuestionReviewByDate>>>;
type ClaimInput = Parameters<typeof claimDailyQuestionReviewAnswerCorrection>[1];
type ClaimResult = Awaited<ReturnType<typeof claimDailyQuestionReviewAnswerCorrection>>;
type ReleaseInput = Parameters<typeof releaseDailyQuestionReviewAnswerCorrection>[1];
type ReleaseResult = Awaited<ReturnType<typeof releaseDailyQuestionReviewAnswerCorrection>>;
type CorrectionInput = Parameters<typeof correctDailyQuestionReviewAnswer>[1];
type CorrectionRepositoryResult = Awaited<ReturnType<typeof correctDailyQuestionReviewAnswer>>;

export interface AdminDailyReviewCorrectionDependencies {
  model: string;
  loadReview: (challengeDate: string) => Promise<Review | null>;
  claimAnswer: (input: ClaimInput) => Promise<ClaimResult>;
  releaseClaim: (input: ReleaseInput) => Promise<ReleaseResult>;
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
      reason:
        | "resolved"
        | "not_flagged"
        | "unchanged"
        | "not_finalized"
        | "busy"
        | "stale"
        | "not_draft";
      finding?: DailyQuestionVerificationFinding;
      evidence?: DailyQuestionReviewEvidence[];
      estimatedCostMicrodollars?: number;
    }
  | ({ outcome: "verification_rejected" } & VerificationDetails)
  | {
      outcome: "verification_failed";
      estimatedCostMicrodollars: number;
      retryable: boolean;
    }
  | ({ outcome: "applied" } & VerificationDetails);

function productionDependencies(): AdminDailyReviewCorrectionDependencies {
  const client = supabaseAdmin();
  return {
    model: process.env.DAILY_REVIEW_OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    loadReview: (challengeDate) =>
      loadDailyQuestionReviewByDate(client, challengeDate),
    claimAnswer: (input) =>
      claimDailyQuestionReviewAnswerCorrection(client, input),
    releaseClaim: (input) =>
      releaseDailyQuestionReviewAnswerCorrection(client, input),
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
  if (!review) {
    return { outcome: "missing" };
  }
  const item = review.items.find((candidate) => candidate.id === input.reviewItemId);
  if (!item) {
    return { outcome: "missing" };
  }
  if (
    (review.run.status !== "completed" &&
      review.run.status !== "completed_with_flags") ||
    review.run.completedAt === null
  ) {
    return { outcome: "conflict", reason: "not_finalized" };
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

  const claim = await dependencies.claimAnswer({
    challengeDate: input.challengeDate,
    reviewItemId: input.reviewItemId,
    newCorrectOption: input.newCorrectOption,
    claimedBy: input.resolvedBy,
  });
  if (claim.outcome === "missing") {
    return { outcome: "missing" };
  }
  if (claim.outcome !== "claimed") {
    const reasons = {
      busy: "busy",
      conflict: "stale",
      not_draft: "not_draft",
      unchanged: "unchanged",
    } as const;
    return { outcome: "conflict", reason: reasons[claim.outcome] };
  }

  const proposedQuestion = {
    ...item.question,
    correct_option: input.newCorrectOption,
  };
  let claimConsumed = false;
  try {
    const savedEvidence = await dependencies.collectEvidence(
      item.question.source_notes,
    );
    let verification: OpenAiQuestionVerifierResult;
    try {
      verification = await dependencies.verifyQuestion({
        question: proposedQuestion,
        savedEvidence,
      });
    } catch (error) {
      if (!(error instanceof OpenAiQuestionVerifierError)) {
        throw error;
      }
      const estimatedCostMicrodollars = dependencies.estimateCost({
        model: dependencies.model,
        ...error.accounting.usage,
        webSearchCalls: error.accounting.webSearchCalls,
      });
      return {
        outcome: "verification_failed",
        estimatedCostMicrodollars,
        retryable: error.retryable,
      };
    }
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
      claimToken: claim.claimToken,
      newCorrectOption: input.newCorrectOption,
      finding: passedFinding,
      resolvedBy: input.resolvedBy,
    });
    if (result.outcome === "missing") {
      return { outcome: "missing" };
    }
    if (result.outcome === "conflict") {
      return { outcome: "conflict", reason: "stale", ...details };
    }
    if (result.outcome === "not_draft") {
      return { outcome: "conflict", reason: "not_draft", ...details };
    }
    claimConsumed = true;
    return { outcome: "applied", ...details };
  } finally {
    if (!claimConsumed) {
      try {
        await dependencies.releaseClaim({
          reviewItemId: input.reviewItemId,
          claimToken: claim.claimToken,
        });
      } catch {
        // Claim expiry is the fallback when best-effort cleanup fails.
      }
    }
  }
}
