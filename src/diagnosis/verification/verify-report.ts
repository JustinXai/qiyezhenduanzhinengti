// ============================================================================
// verifyReport — extract candidate claims from a canonical report, run a
// VerifierStrategy over each (Claim, Evidence) candidate pair, apply the shared
// deterministic clamp, and emit persisted-shape ClaimEvidenceRelations.
//
// Referential integrity is enforced here, not trusted from the strategy:
//   - a verdict referencing an evidence id NOT in the claim's candidate set is
//     dropped and recorded as an illegal id (real model guard — test 6);
//   - a verdict referencing an id that resolves to no EvidenceItem is likewise
//     illegal (test 5).
// The verifier never invents evidence, edits claims, or returns URLs.
// ============================================================================

import type { DiagnosisReport, EvidenceItem } from "../../contracts";
import type {
  ClaimEvidenceRelation,
  EvidenceCoverage,
} from "../../contracts/claim-evidence";
import type { ProviderUsageSample } from "../orchestration/state-machine";
import { classifyPolarity } from "./classify";
import { clampVerdict } from "./clamp";
import type { VerifiableClaim, VerifierStrategy, VerifyReportResult } from "./types";

/** Reduce every claim-bearing entity in the report to a VerifiableClaim.
 *
 * Defensive against a not-yet-canonically-validated report (verification runs
 * before the VALIDATING_REPORT Zod parse in the state machine): a malformed
 * report simply yields no claims, and the canonical parse catches the shape. */
export function extractVerifiableClaims(report: DiagnosisReport): VerifiableClaim[] {
  const claims: VerifiableClaim[] = [];
  const coreIssues = Array.isArray(report.coreIssues) ? report.coreIssues : [];
  const strengths = Array.isArray(report.strengths) ? report.strengths : [];
  const geoOpportunities = Array.isArray(report.geoOpportunities) ? report.geoOpportunities : [];
  const competitorGaps = Array.isArray(report.competitorGaps) ? report.competitorGaps : [];

  for (const c of coreIssues) {
    claims.push({
      id: c.id,
      kind: "coreIssue",
      text: `${c.statement} ${c.businessImpact} ${c.fixDirection}`,
      candidateEvidenceIds: [...c.evidenceIds],
    });
  }
  for (const s of strengths) {
    claims.push({
      id: s.id,
      kind: "strength",
      text: `${s.statement} ${s.businessImpact}`,
      candidateEvidenceIds: [...s.evidenceIds],
    });
  }
  for (const g of geoOpportunities) {
    claims.push({
      id: g.id,
      kind: "geoOpportunity",
      text: `${g.statement} ${g.businessImpact} ${g.customerQuestion} ${g.contentGap}`,
      candidateEvidenceIds: [...g.evidenceIds],
    });
  }
  for (const gap of competitorGaps) {
    claims.push({
      id: gap.id,
      kind: "competitorGap",
      text: `${gap.competitorName} ${gap.gapStatement}`,
      candidateEvidenceIds: [...gap.evidenceIds],
    });
  }
  return claims;
}

export interface VerifyReportInput {
  report: DiagnosisReport;
  coverage: EvidenceCoverage;
  strategy: VerifierStrategy;
}

/**
 * Verify every candidate (Claim, Evidence) pair in the report.
 * Returns persisted-shape relations plus provider-usage samples (budget seam).
 */
export async function verifyReport(input: VerifyReportInput): Promise<VerifyReportResult> {
  const { report, coverage, strategy } = input;
  const evidenceList = Array.isArray(report.evidence) ? report.evidence : [];
  const evidenceById = new Map<string, EvidenceItem>(evidenceList.map((e) => [e.id, e]));
  const claims = extractVerifiableClaims(report);

  const relations: ClaimEvidenceRelation[] = [];
  const usage: ProviderUsageSample[] = [];
  const illegalEvidenceIds: string[] = [];

  for (const claim of claims) {
    const candidateIdSet = new Set(claim.candidateEvidenceIds);
    const candidates: EvidenceItem[] = [];
    for (const id of claim.candidateEvidenceIds) {
      const ev = evidenceById.get(id);
      if (ev) candidates.push(ev);
      else illegalEvidenceIds.push(id); // candidate id resolves to no evidence
    }

    const polarity = classifyPolarity({ kind: claim.kind, text: claim.text });
    const result = await strategy.assess({ claim, polarity, candidates, coverage });
    if (result.usage) usage.push(...result.usage);

    for (const raw of result.verdicts) {
      // The strategy may only speak about evidence in the candidate set that
      // actually resolves. Anything else is an illegal reference — never trusted.
      if (!candidateIdSet.has(raw.evidenceId) || !evidenceById.has(raw.evidenceId)) {
        illegalEvidenceIds.push(raw.evidenceId);
        continue;
      }
      const evidence = evidenceById.get(raw.evidenceId)!;
      const clamped = clampVerdict(raw, evidence, polarity, coverage);
      relations.push({
        claimId: claim.id,
        claimKind: claim.kind,
        evidenceId: raw.evidenceId,
        supportLevel: clamped.supportLevel,
        confidence: clamped.confidence,
        justification: clamped.justification,
        basis: clamped.basis,
        verifierMode: strategy.mode,
        verifierVersion: strategy.version,
      });
    }
  }

  return {
    ok: illegalEvidenceIds.length === 0,
    relations,
    usage,
    illegalEvidenceIds,
  };
}
