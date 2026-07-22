// ============================================================================
// Post-verification claim pruning (Round-3 §六 negative-claim policy).
//
// A claim that fails the SUPPORT-LEVEL rules — most importantly a negative /
// missing claim with no measurement boundary (coverage) — must NOT block an
// otherwise-valid report. Per PRODUCT_TRUTH_RULES §4 + Round-3 §六 it is DROPPED
// (可以进入 NEEDS_CONFIRMATION 或直接移除) so the report can still reach READY
// carrying only the claims the ClaimEvidenceVerifier actually backs.
//
// This intentionally does NOT prune integrity (§4.6), UNSUPPORTED-used (§4.5) or
// duplicate-relation-set (§4.8) violations — those indicate a pipeline/verifier
// fault (or an attack) and remain HARD blocks for the deterministic publish guard.
// ============================================================================

import type { DiagnosisReport } from "../../contracts";
import type {
  ClaimEvidenceRelation,
  EvidenceCoverage,
} from "../../contracts/claim-evidence";
import type {
  ClaimPruneReasonCode,
  DroppedClaimRecord,
} from "../../contracts/claim-reason-codes";
import type { GuardRuleCode } from "../../contracts/guard-types";
import type { ClaimPublicationSourceContext } from "../../contracts/independent-support-source";
import { evidenceGuard } from "./evidence-guard";
import type { ClaimPublicationCoverageScope } from "./claim-publication-policy";
import type { CompetitorGapPublicationContextById } from "./competitor-gap-publication-policy";

/** Map a prunable guard rule (+violation text) onto a §七 reason code. */
function reasonCodeFor(rule: GuardRuleCode, message: string): ClaimPruneReasonCode {
  const competitorGapReasons: Partial<Record<GuardRuleCode, ClaimPruneReasonCode>> = {
    COMPETITOR_GAP_UNVERIFIED_COMPETITOR_ASSERTION:
      "UNVERIFIED_COMPETITOR_ASSERTION",
    COMPETITOR_GAP_MISSING_COMPETITOR_OFFICIAL_RELATION:
      "MISSING_COMPETITOR_OFFICIAL_RELATION",
    COMPETITOR_GAP_MISSING_CURRENT_COMPANY_RELATION:
      "MISSING_CURRENT_COMPANY_RELATION",
    COMPETITOR_GAP_COMPETITOR_ENTITY_NOT_RESOLVED:
      "COMPETITOR_ENTITY_NOT_RESOLVED",
    COMPETITOR_GAP_COMPARISON_DIMENSION_MISMATCH:
      "COMPARISON_DIMENSION_MISMATCH",
    COMPETITOR_GAP_COMPETITOR_COVERAGE_NOT_ESTABLISHED:
      "COMPETITOR_COVERAGE_NOT_ESTABLISHED",
  };
  const competitorGapReason = competitorGapReasons[rule];
  if (competitorGapReason) return competitorGapReason;
  if (/coverage|边界|覆盖/i.test(message)) return "COVERAGE_NOT_ESTABLISHED";
  if (rule === "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT") return "INSUFFICIENT_INDEPENDENT_SUPPORT";
  return "INSUFFICIENT_INDEPENDENT_SUPPORT";
}

function kindOfClaimId(id: string): string {
  if (id.startsWith("str_")) return "strength";
  if (id.startsWith("iss_")) return "coreIssue";
  if (id.startsWith("geo_")) return "geoOpportunity";
  if (id.startsWith("gap_")) return "competitorGap";
  return "claim";
}

const PRUNABLE_RULES: ReadonlySet<GuardRuleCode> = new Set([
  "TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT",
  "TRUTH_4_2_STRENGTH_NEEDS_SUPPORT",
  "TRUTH_4_3_OPPORTUNITY_NEEDS_SUPPORT",
  "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT",
  "COMPETITOR_GAP_MISSING_COMPETITOR_OFFICIAL_RELATION",
  "COMPETITOR_GAP_MISSING_CURRENT_COMPANY_RELATION",
  "COMPETITOR_GAP_COMPETITOR_ENTITY_NOT_RESOLVED",
  "COMPETITOR_GAP_COMPARISON_DIMENSION_MISMATCH",
  "COMPETITOR_GAP_COMPETITOR_COVERAGE_NOT_ESTABLISHED",
]);

export interface PruneUnsupportedClaimsOptions {
  sourceContext?: ClaimPublicationSourceContext;
  coverageScope?: ClaimPublicationCoverageScope;
  competitorGapContexts?: CompetitorGapPublicationContextById;
}

export interface PruneResult {
  report: DiagnosisReport;
  /** Claim ids removed because their verified support was insufficient. */
  prunedClaimIds: string[];
  /** Round-5.1 §七: why each claim was pruned (content-yield diagnostics). */
  pruned: DroppedClaimRecord[];
}

function removeClaims(report: DiagnosisReport, ids: Set<string>): DiagnosisReport {
  return {
    ...report,
    strengths: report.strengths.filter((c) => !ids.has(c.id)),
    coreIssues: report.coreIssues.filter((c) => !ids.has(c.id)),
    geoOpportunities: report.geoOpportunities.filter((c) => !ids.has(c.id)),
    competitorGaps: report.competitorGaps.filter((c) => !ids.has(c.id)),
  };
}

export function pruneUnsupportedClaims(
  report: DiagnosisReport,
  relations: readonly ClaimEvidenceRelation[],
  coverage: EvidenceCoverage,
  options: PruneUnsupportedClaimsOptions = {},
): PruneResult {
  let current = report;
  const pruned = new Set<string>();
  const records = new Map<string, DroppedClaimRecord>();
  // Iterate: removing a claim can never create a new support violation, but the
  // loop is capped defensively.
  for (let i = 0; i < 8; i += 1) {
    const res = evidenceGuard({
      report: current,
      relations,
      coverage,
      sourceContext: options.sourceContext,
      coverageScope: options.coverageScope,
      competitorGapContexts: options.competitorGapContexts,
    });
    if (res.ok) break;
    const prunable = res.violations.filter(
      (v) => PRUNABLE_RULES.has(v.rule) && typeof v.claimId === "string",
    );
    const ids = new Set(prunable.map((v) => v.claimId as string));
    if (ids.size === 0) break; // only hard-block violations remain — leave them
    for (const v of prunable) {
      const id = v.claimId as string;
      if (!records.has(id)) {
        records.set(id, {
          kind: kindOfClaimId(id),
          ref: id,
          reasonCode: reasonCodeFor(v.rule, v.message),
        });
      }
    }
    for (const id of ids) pruned.add(id);
    current = removeClaims(current, ids);
  }
  return { report: current, prunedClaimIds: [...pruned], pruned: [...records.values()] };
}
