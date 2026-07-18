// ============================================================================
// Evidence Semantic Guard — docs/PRODUCT_TRUTH_RULES.md §4.
//
// Enforces (rule codes in src/contracts/guard-types.ts):
//   §4.1  a core issue needs >= 1 DIRECT_SUPPORT evidence
//   §4.2  a strength needs >= 1 DIRECT_SUPPORT, or >= 2 PARTIAL_SUPPORT
//   §4.3  a GEO opportunity needs >= 1 DIRECT_SUPPORT, or >= 2 PARTIAL_SUPPORT
//   §4.4  CONTEXT_ONLY evidence alone cannot support a core fact
//   §4.5  UNSUPPORTED evidence must not appear in a client report
//   §4.6  every referenced evidenceId must resolve (referential integrity)
//   §4.8  3+ GEO opportunities reusing an identical evidence set is blocked
//
// Not enforced here (documented seams):
//   §4.7  "no array[0] auto-fill" is a generation-time discipline (Agent D),
//         not detectable from the finished report data; there is deliberately
//         no rule code for it.
//   §4.9  "crawl/provider/index failure must not become a client core issue"
//         requires provenance the canonical report does not carry; no rule code.
//   §4.10/§4.11 (allow fewer items / never pad) are satisfied by construction:
//         this guard imposes no minimum counts.
// ============================================================================

import type { DiagnosisReport, EvidenceItem } from "../../contracts";
import type { GuardResult, GuardRuleCode, GuardViolation } from "../../contracts/guard-types";

type ClaimCategory = "coreIssue" | "strength" | "geoOpportunity";

interface EvaluatedClaim {
  id: string;
  category: ClaimCategory;
  evidenceIds: string[];
}

/** Minimum GEO opportunities sharing one evidence set that trips §4.8. */
export const DUPLICATE_OPPORTUNITY_THRESHOLD = 3;

const REQUIREMENT_RULE: Record<ClaimCategory, GuardRuleCode> = {
  coreIssue: "TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT",
  strength: "TRUTH_4_2_STRENGTH_NEEDS_SUPPORT",
  geoOpportunity: "TRUTH_4_3_OPPORTUNITY_NEEDS_SUPPORT",
};

export function evidenceGuard(report: DiagnosisReport): GuardResult {
  const violations: GuardViolation[] = [];
  const evidenceById = new Map<string, EvidenceItem>(report.evidence.map((e) => [e.id, e]));

  const claims: EvaluatedClaim[] = [
    ...report.coreIssues.map(
      (c): EvaluatedClaim => ({ id: c.id, category: "coreIssue", evidenceIds: c.evidenceIds }),
    ),
    ...report.strengths.map(
      (c): EvaluatedClaim => ({ id: c.id, category: "strength", evidenceIds: c.evidenceIds }),
    ),
    ...report.geoOpportunities.map(
      (c): EvaluatedClaim => ({ id: c.id, category: "geoOpportunity", evidenceIds: c.evidenceIds }),
    ),
  ];

  for (const claim of claims) {
    evaluateClaim(claim, evidenceById, violations);
  }

  checkDuplicateOpportunityEvidence(report, violations);

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

function evaluateClaim(
  claim: EvaluatedClaim,
  evidenceById: Map<string, EvidenceItem>,
  violations: GuardViolation[],
): void {
  const resolved: EvidenceItem[] = [];
  for (const id of claim.evidenceIds) {
    const ev = evidenceById.get(id);
    if (!ev) {
      violations.push({
        guard: "evidence",
        rule: "TRUTH_4_6_EVIDENCE_ID_NOT_FOUND",
        message: `${claim.category} ${claim.id} 引用了不存在的 Evidence:${id}`,
        claimType: claim.category,
        claimId: claim.id,
        evidenceIds: [id],
      });
    } else {
      resolved.push(ev);
    }
  }

  // §4.5 — UNSUPPORTED evidence must never reach a client report.
  const unsupported = resolved.filter((e) => e.supportLevel === "UNSUPPORTED");
  if (unsupported.length > 0) {
    violations.push({
      guard: "evidence",
      rule: "TRUTH_4_5_UNSUPPORTED_EVIDENCE_USED",
      message: `${claim.category} ${claim.id} 使用了 UNSUPPORTED Evidence:${unsupported
        .map((e) => e.id)
        .join(", ")}`,
      claimType: claim.category,
      claimId: claim.id,
      evidenceIds: unsupported.map((e) => e.id),
    });
  }

  // Support adequacy is judged on evidence that actually carries support.
  const usable = resolved.filter((e) => e.supportLevel !== "UNSUPPORTED");
  const direct = usable.filter((e) => e.supportLevel === "DIRECT_SUPPORT").length;
  const partial = usable.filter((e) => e.supportLevel === "PARTIAL_SUPPORT").length;
  const contextOnly = usable.filter((e) => e.supportLevel === "CONTEXT_ONLY").length;

  const meets = claim.category === "coreIssue" ? direct >= 1 : direct >= 1 || partial >= 2;
  if (meets) return;

  // §4.4 — the specific "only CONTEXT_ONLY backing a core fact" failure.
  if (contextOnly > 0 && direct === 0 && partial === 0) {
    violations.push({
      guard: "evidence",
      rule: "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT",
      message: `${claim.category} ${claim.id} 仅有 CONTEXT_ONLY 证据,不足以单独支撑核心事实`,
      claimType: claim.category,
      claimId: claim.id,
      evidenceIds: usable.map((e) => e.id),
    });
    return;
  }

  // §4.1 / §4.2 / §4.3 — general "did not reach the required support" failure.
  violations.push({
    guard: "evidence",
    rule: REQUIREMENT_RULE[claim.category],
    message: `${claim.category} ${claim.id} 未达到发布所需的证据支持等级(DIRECT=${direct}, PARTIAL=${partial})`,
    claimType: claim.category,
    claimId: claim.id,
    evidenceIds: claim.evidenceIds,
  });
}

// §4.8 — block when >= threshold GEO opportunities reuse the identical set.
function checkDuplicateOpportunityEvidence(
  report: DiagnosisReport,
  violations: GuardViolation[],
): void {
  const groups = new Map<string, string[]>();
  for (const opp of report.geoOpportunities) {
    if (opp.evidenceIds.length === 0) continue;
    const key = [...opp.evidenceIds].sort().join("|");
    const ids = groups.get(key) ?? [];
    ids.push(opp.id);
    groups.set(key, ids);
  }
  for (const [key, ids] of groups) {
    if (ids.length >= DUPLICATE_OPPORTUNITY_THRESHOLD) {
      violations.push({
        guard: "evidence",
        rule: "TRUTH_4_8_DUPLICATE_OPPORTUNITY_EVIDENCE_SET",
        message: `${ids.length} 个 GEO 机会复用了完全相同的 Evidence 集合:${ids.join(", ")}`,
        claimType: "geoOpportunity",
        evidenceIds: key.split("|"),
      });
    }
  }
}
