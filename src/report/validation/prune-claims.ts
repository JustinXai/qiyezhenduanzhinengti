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
import type { GuardRuleCode } from "../../contracts/guard-types";
import { evidenceGuard } from "./evidence-guard";

const PRUNABLE_RULES: ReadonlySet<GuardRuleCode> = new Set([
  "TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT",
  "TRUTH_4_2_STRENGTH_NEEDS_SUPPORT",
  "TRUTH_4_3_OPPORTUNITY_NEEDS_SUPPORT",
  "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT",
]);

export interface PruneResult {
  report: DiagnosisReport;
  /** Claim ids removed because their verified support was insufficient. */
  prunedClaimIds: string[];
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
): PruneResult {
  let current = report;
  const pruned = new Set<string>();
  // Iterate: removing a claim can never create a new support violation, but the
  // loop is capped defensively.
  for (let i = 0; i < 8; i += 1) {
    const res = evidenceGuard({ report: current, relations, coverage });
    if (res.ok) break;
    const ids = new Set(
      res.violations
        .filter((v) => PRUNABLE_RULES.has(v.rule) && typeof v.claimId === "string")
        .map((v) => v.claimId as string),
    );
    if (ids.size === 0) break; // only hard-block violations remain — leave them
    for (const id of ids) pruned.add(id);
    current = removeClaims(current, ids);
  }
  return { report: current, prunedClaimIds: [...pruned] };
}
