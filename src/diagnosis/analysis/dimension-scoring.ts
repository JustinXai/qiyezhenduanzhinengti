// Stage: programmatic scoring of the four non-AI dimensions.
//
// docs/SCORE_CONTRACT.md + docs/PRODUCT_TRUTH_RULES.md: the LLM must NOT emit the
// numeric score. DeepSeek only rates a fixed rubric of criteria PRESENT / PARTIAL /
// ABSENT per dimension; the 0–100 score, measurementStatus and confidence are all
// derived here by deterministic formula from those ratings + the referenced
// evidence quality. `aiVisibility` is scored separately (see ai-visibility.ts).

import type { EvidenceItem, ScoreDimension } from "../../contracts";
import { parseStageJson, type StageParseResult } from "../../providers/deepseek";
import {
  clamp,
  indexEvidence,
  resolveEvidenceIds,
  round2,
  type EvidenceIndex,
} from "./evidence-index";
import {
  DimensionSignalsStageOutput,
  type CriterionRating,
  type DimensionSignal,
} from "./stage-schemas";

/** Non-AI scored dimensions. `aiVisibility` is intentionally excluded here. */
export type NonAiDimensionKey =
  | "companyClarity"
  | "websiteCompleteness"
  | "customerQuestionCoverage"
  | "trustEvidence";

/**
 * Fixed rubric per dimension. The score is fully determined by ratings for THESE
 * keys — a criterion the model omits counts as ABSENT — so the mapping from LLM
 * signal to number is stable and reproducible regardless of how many entries the
 * model returned.
 */
export const DIMENSION_RUBRICS: Record<NonAiDimensionKey, readonly string[]> = {
  companyClarity: ["brandIdentityClear", "offeringClear", "targetCustomerClear", "valuePropositionClear"],
  websiteCompleteness: ["productInfo", "companyBackground", "contactChannel", "processOrPricing", "caseOrProof"],
  customerQuestionCoverage: ["purchaseDecisionQuestions", "comparisonQuestions", "deliveryAndAfterSales", "structuredFaq"],
  trustEvidence: ["thirdPartyCredentials", "verifiableCases", "mediaOrPublicMentions", "customerTestimonials"],
};

const RATING_VALUE: Record<CriterionRating, number> = { PRESENT: 1, PARTIAL: 0.5, ABSENT: 0 };

function scoreFromRubric(rubricKeys: readonly string[], signal: DimensionSignal): number {
  const byKey = new Map<string, CriterionRating>();
  for (const c of signal.criteria) byKey.set(c.key, c.rating);
  let sum = 0;
  for (const key of rubricKeys) {
    const rating = byKey.get(key) ?? "ABSENT";
    sum += RATING_VALUE[rating];
  }
  return Math.round((sum / rubricKeys.length) * 100);
}

function isStrongEvidence(item: EvidenceItem): boolean {
  if (item.supportLevel === "DIRECT_SUPPORT") return true;
  if (item.supportLevel === "PARTIAL_SUPPORT" && item.sourceType === "FIRST_PARTY_EVIDENCE") return true;
  return false;
}

function confidenceFromEvidence(ids: readonly string[], index: EvidenceIndex): number {
  let raw = 0;
  for (const id of ids) {
    const item = index.get(id);
    if (!item) continue;
    if (item.supportLevel === "DIRECT_SUPPORT") raw += 0.35;
    else if (item.supportLevel === "PARTIAL_SUPPORT") raw += 0.15;
    else if (item.supportLevel === "CONTEXT_ONLY") raw += 0.05;
  }
  return round2(clamp(raw, 0, 0.95));
}

function scoreOneDimension(
  rubricKeys: readonly string[],
  signal: DimensionSignal,
  index: EvidenceIndex,
): ScoreDimension {
  const evidenceIds = resolveEvidenceIds(signal.evidenceIds, index);

  // No resolvable evidence → cannot measure or estimate. score stays null (not 0).
  if (evidenceIds.length === 0) {
    return { score: null, measurementStatus: "INSUFFICIENT_EVIDENCE", confidence: 0, evidenceIds: [] };
  }

  const hasStrong = evidenceIds.some((id) => {
    const item = index.get(id);
    return item ? isStrongEvidence(item) : false;
  });
  const measurementStatus = hasStrong ? "MEASURED" : "ESTIMATED";

  const score = scoreFromRubric(rubricKeys, signal);
  let confidence = confidenceFromEvidence(evidenceIds, index);
  // Estimated dimensions rest on weaker evidence → cap stated confidence.
  if (measurementStatus === "ESTIMATED") confidence = round2(Math.min(confidence, 0.6));

  return { score, measurementStatus, confidence, evidenceIds };
}

export type NonAiScoreBlock = Record<NonAiDimensionKey, ScoreDimension>;

export function scoreNonAiDimensions(
  evidence: readonly EvidenceItem[],
  deepSeekJson: unknown,
): StageParseResult<NonAiScoreBlock> {
  const parsed = parseStageJson("dimension_signals", DimensionSignalsStageOutput, deepSeekJson);
  if (!parsed.ok) return parsed;

  const index = indexEvidence(evidence);
  const s = parsed.value;
  const value: NonAiScoreBlock = {
    companyClarity: scoreOneDimension(DIMENSION_RUBRICS.companyClarity, s.companyClarity, index),
    websiteCompleteness: scoreOneDimension(DIMENSION_RUBRICS.websiteCompleteness, s.websiteCompleteness, index),
    customerQuestionCoverage: scoreOneDimension(
      DIMENSION_RUBRICS.customerQuestionCoverage,
      s.customerQuestionCoverage,
      index,
    ),
    trustEvidence: scoreOneDimension(DIMENSION_RUBRICS.trustEvidence, s.trustEvidence, index),
  };
  return { ok: true, value };
}
