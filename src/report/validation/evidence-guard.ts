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
import type { GuardResult, GuardRuleCode, GuardViolation } from "../../contracts/guard-types";
import { classifyPolarity, extractVerifiableClaims } from "../../diagnosis/verification";

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
}

export function evidenceGuard(input: EvidenceGuardInput): GuardResult {
  const { report, relations, coverage } = input;
  const violations: GuardViolation[] = [];
  const evidenceIds = new Set(report.evidence.map((e) => e.id));

  const relationsByClaim = new Map<string, ClaimEvidenceRelation[]>();
  for (const r of relations) {
    const list = relationsByClaim.get(r.claimId) ?? [];
    list.push(r);
    relationsByClaim.set(r.claimId, list);
  }

  // Only the three gated claim kinds are publish-gated (competitorGaps are
  // verified for traceability but not §4-gated, preserving prior behavior).
  const claims = extractVerifiableClaims(report).filter(
    (c): c is typeof c & { kind: GatedKind } => c.kind !== "competitorGap",
  );

  for (const claim of claims) {
    evaluateClaim(claim, relationsByClaim.get(claim.id) ?? [], evidenceIds, coverage, violations);
  }

  checkDuplicateOpportunityRelations(report, relationsByClaim, violations);

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

function evaluateClaim(
  claim: { id: string; kind: GatedKind; text: string; candidateEvidenceIds: string[] },
  rels: ClaimEvidenceRelation[],
  evidenceIds: Set<string>,
  coverage: EvidenceCoverage,
  violations: GuardViolation[],
): void {
  const polarity = classifyPolarity({ kind: claim.kind, text: claim.text });

  // §4.6 — referential + verification integrity.
  let integrityBroken = false;
  for (const id of claim.candidateEvidenceIds) {
    if (!evidenceIds.has(id)) {
      integrityBroken = true;
      violations.push({
        guard: "evidence",
        rule: "TRUTH_4_6_EVIDENCE_ID_NOT_FOUND",
        message: `${claim.kind} ${claim.id} 引用了不存在的 Evidence:${id}`,
        claimType: claim.kind,
        claimId: claim.id,
        evidenceIds: [id],
      });
    } else if (!rels.some((r) => r.evidenceId === id)) {
      integrityBroken = true;
      violations.push({
        guard: "evidence",
        rule: "TRUTH_4_6_EVIDENCE_ID_NOT_FOUND",
        message: `${claim.kind} ${claim.id} 的候选证据 ${id} 缺少验证关系(未经 Claim–Evidence 验证)`,
        claimType: claim.kind,
        claimId: claim.id,
        evidenceIds: [id],
      });
    }
  }
  for (const r of rels) {
    if (!evidenceIds.has(r.evidenceId)) {
      integrityBroken = true;
      violations.push({
        guard: "evidence",
        rule: "TRUTH_4_6_EVIDENCE_ID_NOT_FOUND",
        message: `${claim.kind} ${claim.id} 的关系引用了不存在的 Evidence:${r.evidenceId}`,
        claimType: claim.kind,
        claimId: claim.id,
        evidenceIds: [r.evidenceId],
      });
    }
  }
  if (integrityBroken) return;

  // §4.5 — an UNSUPPORTED relation must never back a published claim.
  const unsupported = rels.filter((r) => r.supportLevel === "UNSUPPORTED");
  if (unsupported.length > 0) {
    violations.push({
      guard: "evidence",
      rule: "TRUTH_4_5_UNSUPPORTED_EVIDENCE_USED",
      message: `${claim.kind} ${claim.id} 存在被判定为 UNSUPPORTED 的证据关系:${unsupported
        .map((r) => r.evidenceId)
        .join(", ")}`,
      claimType: claim.kind,
      claimId: claim.id,
      evidenceIds: unsupported.map((r) => r.evidenceId),
    });
  }

  const usable = rels.filter((r) => r.supportLevel !== "UNSUPPORTED");
  const direct = usable.filter((r) => r.supportLevel === "DIRECT_SUPPORT").length;
  const partial = usable.filter((r) => r.supportLevel === "PARTIAL_SUPPORT").length;
  const contextOnly = usable.filter((r) => r.supportLevel === "CONTEXT_ONLY").length;

  if (polarity === "NEGATIVE_MISSING") {
    const coverageBacked = usable.filter(
      (r) =>
        r.basis === "MEASUREMENT_BOUNDARY" &&
        (r.supportLevel === "PARTIAL_SUPPORT" || r.supportLevel === "DIRECT_SUPPORT"),
    ).length;
    if (coverage.boundaryEstablished && coverageBacked >= 1) return; // satisfied

    if (!coverage.boundaryEstablished) {
      violations.push({
        guard: "evidence",
        rule: REQUIREMENT_RULE[claim.kind],
        message: `${claim.kind} ${claim.id} 为负面/缺失型判断,但本次没有建立测量边界(coverage 未建立),不得作为客户事实发布`,
        claimType: claim.kind,
        claimId: claim.id,
        evidenceIds: claim.candidateEvidenceIds,
      });
      return;
    }
    // Coverage exists but nothing coverage-backed (only context / non-first-party).
    violations.push({
      guard: "evidence",
      rule: "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT",
      message: `${claim.kind} ${claim.id} 为负面/缺失型判断,缺少受控范围内首方页面的边界支持,不足以单独支撑`,
      claimType: claim.kind,
      claimId: claim.id,
      evidenceIds: usable.map((r) => r.evidenceId),
    });
    return;
  }

  // Positive enterprise-capability claim.
  const meets = claim.kind === "coreIssue" ? direct >= 1 : direct >= 1 || partial >= 2;
  if (meets) return;

  if (contextOnly > 0 && direct === 0 && partial === 0) {
    violations.push({
      guard: "evidence",
      rule: "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT",
      message: `${claim.kind} ${claim.id} 仅有 CONTEXT_ONLY 关系,不足以单独支撑核心事实`,
      claimType: claim.kind,
      claimId: claim.id,
      evidenceIds: usable.map((r) => r.evidenceId),
    });
    return;
  }

  violations.push({
    guard: "evidence",
    rule: REQUIREMENT_RULE[claim.kind],
    message: `${claim.kind} ${claim.id} 未达到发布所需的证据支持等级(DIRECT=${direct}, PARTIAL=${partial})`,
    claimType: claim.kind,
    claimId: claim.id,
    evidenceIds: claim.candidateEvidenceIds,
  });
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
