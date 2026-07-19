import type { EvidenceCoverage } from "../../contracts/claim-evidence";
import { classifyPolarity } from "../verification";
import type { EvidenceIndex } from "./evidence-index";
import type { ClaimsStageOutput } from "./stage-schemas";

export const APPROVED_NEGATIVE_OPPORTUNITY_PREFIX =
  "本次已检查的公开页面和搜索结果中未发现";

export const OPPORTUNITY_BANNED_PHRASES = [
  "显著提升",
  "快速抢占",
  "必然增长",
  "全面领先",
  "保证排名",
  "竞品已经积累",
] as const;

export type OpportunityCopyPrune =
  | {
      reasonCode: "NO_MEASUREMENT_COVERAGE";
      guardRule: "COVERAGE_NOT_ESTABLISHED";
      coverageStatus: "NOT_ESTABLISHED";
    }
  | {
      reasonCode: "MISSING_COVERAGE_PREFIX";
      guardRule: "SCOPE_LIMITATION_MISSING";
      coverageStatus: "SCOPE_LIMITATION_MISSING";
    }
  | {
      reasonCode: "BANNED_OR_OVERPROMISING_COPY";
      guardRule: "OPPORTUNITY_BANNED_COPY";
      coverageStatus: "NOT_REQUIRED" | "ESTABLISHED_AND_BOUNDED";
    }
  | {
      reasonCode: "UNVERIFIED_COMPETITOR_ASSERTION";
      guardRule: "OPPORTUNITY_COMPETITOR_ASSERTION_UNVERIFIED";
      coverageStatus: "NOT_REQUIRED" | "ESTABLISHED_AND_BOUNDED";
    }
  | {
      reasonCode: "GENERIC_OR_UNACTIONABLE";
      guardRule: "OPPORTUNITY_ACTION_NOT_SPECIFIC";
      coverageStatus: "NOT_REQUIRED" | "ESTABLISHED_AND_BOUNDED";
    };

type OpportunityCandidate = ClaimsStageOutput["geoOpportunities"][number];

function candidateText(item: OpportunityCandidate): string {
  return [
    item.statement,
    item.businessImpact,
    item.customerQuestion,
    item.contentGap,
    item.recommendedAction,
    item.priorityReason,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function coverageForCopy(
  negative: boolean,
  coverage: EvidenceCoverage | undefined,
): "NOT_REQUIRED" | "ESTABLISHED_AND_BOUNDED" {
  return negative && coverage?.boundaryEstablished === true
    ? "ESTABLISHED_AND_BOUNDED"
    : "NOT_REQUIRED";
}

/**
 * Candidate-level copy guard. It returns a prune reason instead of rejecting
 * the whole stage so bad generation still contributes to quality statistics.
 */
export function inspectOpportunityCopy(
  item: OpportunityCandidate,
  evidence: EvidenceIndex,
  coverage?: EvidenceCoverage,
): OpportunityCopyPrune | null {
  const negative =
    classifyPolarity({ kind: "geoOpportunity", text: item.contentGap }) === "NEGATIVE_MISSING";
  if (coverage !== undefined && negative && coverage.boundaryEstablished !== true) {
    return {
      reasonCode: "NO_MEASUREMENT_COVERAGE",
      guardRule: "COVERAGE_NOT_ESTABLISHED",
      coverageStatus: "NOT_ESTABLISHED",
    };
  }
  if (
    coverage !== undefined &&
    negative &&
    !item.contentGap.trim().startsWith(APPROVED_NEGATIVE_OPPORTUNITY_PREFIX)
  ) {
    return {
      reasonCode: "MISSING_COVERAGE_PREFIX",
      guardRule: "SCOPE_LIMITATION_MISSING",
      coverageStatus: "SCOPE_LIMITATION_MISSING",
    };
  }

  const text = candidateText(item).replace(/\s+/g, "");
  if (text.includes("竞品已经积累")) {
    return {
      reasonCode: "UNVERIFIED_COMPETITOR_ASSERTION",
      guardRule: "OPPORTUNITY_COMPETITOR_ASSERTION_UNVERIFIED",
      coverageStatus: coverageForCopy(negative, coverage),
    };
  }
  if (OPPORTUNITY_BANNED_PHRASES.some((phrase) => text.includes(phrase))) {
    return {
      reasonCode: "BANNED_OR_OVERPROMISING_COPY",
      guardRule: "OPPORTUNITY_BANNED_COPY",
      coverageStatus: coverageForCopy(negative, coverage),
    };
  }

  const makesCompetitorAssertion = /竞品.{0,12}(?:领先|优势|积累|覆盖|完善|成熟|更多)/u.test(text);
  const hasCompetitorEvidence = item.evidenceIds.some(
    (id) => evidence.get(id)?.sourceType === "COMPETITOR_WEB_EVIDENCE",
  );
  if (makesCompetitorAssertion && !hasCompetitorEvidence) {
    return {
      reasonCode: "UNVERIFIED_COMPETITOR_ASSERTION",
      guardRule: "OPPORTUNITY_COMPETITOR_ASSERTION_UNVERIFIED",
      coverageStatus: coverageForCopy(negative, coverage),
    };
  }

  if (
    coverage !== undefined &&
    (item.recommendedAction === undefined ||
      item.recommendedAction.trim().length < 8 ||
      /^(?:多发|增加|优化|完善)内容[。.!！]?$/u.test(item.recommendedAction.trim()))
  ) {
    return {
      reasonCode: "GENERIC_OR_UNACTIONABLE",
      guardRule: "OPPORTUNITY_ACTION_NOT_SPECIFIC",
      coverageStatus: coverageForCopy(negative, coverage),
    };
  }
  return null;
}
