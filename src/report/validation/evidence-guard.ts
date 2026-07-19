// ============================================================================
// Evidence Semantic Guard — docs/PRODUCT_TRUTH_RULES.md §4.
//
// ROUND-3 CHANGE: §4 is now decided from verified ClaimEvidenceRelations, NOT
// from EvidenceItem.supportLevel. The canonical report's per-item supportLevel is
// a source-property default assigned at normalization time and no longer carries
// per-claim semantic meaning; the semantic support of each (Claim, Evidence) pair
// comes from the ClaimEvidenceVerifier (src/diagnosis/verification) and is passed
// in here as the sole basis for the publish decision.
//
// Enforces (rule codes in src/contracts/guard-types.ts):
//   §4.1  a positive core issue needs >= 1 DIRECT_SUPPORT relation
//   §4.2  a strength needs >= 1 DIRECT_SUPPORT, or >= 2 PARTIAL_SUPPORT relations
//   §4.3  a GEO opportunity needs >= 1 DIRECT_SUPPORT, or >= 2 PARTIAL_SUPPORT
//   §4.4  CONTEXT_ONLY relations alone cannot support a core fact
//   §4.5  a relation judged UNSUPPORTED must not back a published claim
//   §4.6  every cited candidate evidence id must resolve AND be verified
//   §4.8  3+ GEO opportunities reusing an identical RELATION set is blocked
//
// NEGATIVE / MISSING claims (缺少 / 未覆盖 / 落后 …): never provable by a single
// page. They require a measurement boundary (EvidenceCoverage.boundaryEstablished)
// and at least one coverage-backed relation (basis MEASUREMENT_BOUNDARY). Without
// coverage they are rejected — a bounded "本次已检查的公开页面中未发现……" claim
// may publish, an unbounded absolute-fact negative may not.
// ============================================================================

import type { DiagnosisReport } from "../../contracts";
import type {
  ClaimEvidenceRelation,
  EvidenceCoverage,
} from "../../contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../../contracts/independent-support-source";
import type { GuardResult, GuardRuleCode, GuardViolation } from "../../contracts/guard-types";
import { extractVerifiableClaims } from "../../diagnosis/verification";
import {
  evaluateClaimPublication,
  negativeScopeTextFromReport,
  publicationSourceContextFromReport,
  type ClaimPublicationCoverageScope,
  type ClaimPublicationDecision,
} from "./claim-publication-policy";
import { competitorGapHasVerifiedOfficialSupport } from "./competitor-gap-policy";

type GatedKind = "coreIssue" | "strength" | "geoOpportunity";

/** Minimum GEO opportunities sharing one relation set that trips §4.8. */
export const DUPLICATE_OPPORTUNITY_THRESHOLD = 3;

const REQUIREMENT_RULE: Record<GatedKind, GuardRuleCode> = {
  coreIssue: "TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT",
  strength: "TRUTH_4_2_STRENGTH_NEEDS_SUPPORT",
  geoOpportunity: "TRUTH_4_3_OPPORTUNITY_NEEDS_SUPPORT",
};

export interface EvidenceGuardInput {
  report: DiagnosisReport;
  relations: readonly ClaimEvidenceRelation[];
  coverage: EvidenceCoverage;
  /** Explicit entity resolution for source independence; legacy callers default safely. */
  sourceContext?: ClaimPublicationSourceContext;
  coverageScope?: ClaimPublicationCoverageScope;
}

export function evidenceGuard(input: EvidenceGuardInput): GuardResult {
  const { report, relations, coverage } = input;
  const violations: GuardViolation[] = [];
  const sourceContext = publicationSourceContextFromReport(
    report,
    coverage,
    input.sourceContext,
  );

  const relationsByClaim = new Map<string, ClaimEvidenceRelation[]>();
  for (const r of relations) {
    const list = relationsByClaim.get(r.claimId) ?? [];
    list.push(r);
    relationsByClaim.set(r.claimId, list);
  }

  // The shared ClaimPublicationPolicy handles the three threshold-gated kinds;
  // competitor gaps are checked separately against their stricter §4.9 source rule.
  const claims = extractVerifiableClaims(report).filter(
    (c): c is typeof c & { kind: GatedKind } => c.kind !== "competitorGap",
  );

  for (const claim of claims) {
    evaluateClaim(
      claim,
      negativeScopeTextFromReport(report, claim.kind, claim.id),
      relationsByClaim.get(claim.id) ?? [],
      report.evidence,
      coverage,
      sourceContext,
      input.coverageScope,
      violations,
    );
  }

  for (const gap of report.competitorGaps) {
    if (
      !competitorGapHasVerifiedOfficialSupport({
        report,
        gapId: gap.id,
        relations,
      })
    ) {
      violations.push({
        guard: "evidence",
        rule: "TRUTH_4_9_COMPETITOR_ASSERTION_NEEDS_CONFIRMED_EVIDENCE",
        message: `competitorGap ${gap.id} 缺少已确认的竞品官网证据关系`,
        claimType: "competitorGap",
        claimId: gap.id,
        evidenceIds: gap.evidenceIds,
      });
    }
  }

  checkDuplicateOpportunityRelations(report, relationsByClaim, violations);

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

function evaluateClaim(
  claim: { id: string; kind: GatedKind; text: string; candidateEvidenceIds: string[] },
  negativeScopeText: string,
  rels: ClaimEvidenceRelation[],
  evidence: DiagnosisReport["evidence"],
  coverage: EvidenceCoverage,
  sourceContext: ClaimPublicationSourceContext,
  coverageScope: ClaimPublicationCoverageScope | undefined,
  violations: GuardViolation[],
): void {
  const result = evaluateClaimPublication({
    claim: {
      id: claim.id,
      kind: claim.kind,
      text: claim.text,
      negativeScopeText,
      evidenceIds: claim.candidateEvidenceIds,
    },
    relations: rels,
    evidence,
    coverage,
    sourceContext,
    coverageScope,
  });
  if (result.outcome === "PUBLISH") return;

  violations.push({
    guard: "evidence",
    rule: guardRuleForDecision(claim.kind, result),
    message: `${claim.kind} ${claim.id} 未通过统一发布策略(${result.rule}; DIRECT=${result.directCount}, PARTIAL=${result.partialCount}, CONTEXT=${result.contextCount}, INDEPENDENT_PARTIAL_SOURCES=${result.independentPartialSourceCount}, COVERAGE=${result.coverageStatus})`,
    claimType: claim.kind,
    claimId: claim.id,
    evidenceIds: claim.candidateEvidenceIds,
  });
}

function guardRuleForDecision(
  kind: GatedKind,
  result: ClaimPublicationDecision,
): GuardRuleCode {
  if (result.rule === "EVIDENCE_REFERENCE_INVALID") {
    return "TRUTH_4_6_EVIDENCE_ID_NOT_FOUND";
  }
  if (result.rule === "UNSUPPORTED_EVIDENCE") {
    return "TRUTH_4_5_UNSUPPORTED_EVIDENCE_USED";
  }
  if (result.rule === "CONTEXT_ONLY_INSUFFICIENT") {
    return "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT";
  }
  return REQUIREMENT_RULE[kind];
}

// §4.8 — block when >= threshold GEO opportunities reuse the identical relation
// set (same evidence ids + same verified support levels).
function checkDuplicateOpportunityRelations(
  report: DiagnosisReport,
  relationsByClaim: Map<string, ClaimEvidenceRelation[]>,
  violations: GuardViolation[],
): void {
  const groups = new Map<string, string[]>();
  for (const opp of report.geoOpportunities) {
    const rels = relationsByClaim.get(opp.id) ?? [];
    if (rels.length === 0) continue;
    const key = rels
      .map((r) => `${r.evidenceId}:${r.supportLevel}`)
      .sort()
      .join("|");
    const ids = groups.get(key) ?? [];
    ids.push(opp.id);
    groups.set(key, ids);
  }
  for (const [key, ids] of groups) {
    if (ids.length >= DUPLICATE_OPPORTUNITY_THRESHOLD) {
      violations.push({
        guard: "evidence",
        rule: "TRUTH_4_8_DUPLICATE_OPPORTUNITY_EVIDENCE_SET",
        message: `${ids.length} 个 GEO 机会复用了完全相同的证据关系集合:${ids.join(", ")}`,
        claimType: "geoOpportunity",
        evidenceIds: [...new Set(key.split("|").map((k) => k.split(":")[0]!))],
      });
    }
  }
}
