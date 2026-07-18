// Shared helpers for the report-validation guard tests (not a test file itself).
import type { DiagnosisReport } from "../../src/contracts";
import type {
  ClaimEvidenceRelation,
  EvidenceCoverage,
} from "../../src/contracts/claim-evidence";
import { deriveCoverage } from "../../src/contracts/claim-evidence";
import type { GuardResult, GuardRuleCode } from "../../src/contracts/guard-types";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import {
  createDeterministicVerifier,
  verifyReport,
} from "../../src/diagnosis/verification";

/**
 * A §4-valid report to build guard scenarios from. Mutable deep clone of the
 * shared SAMPLE_DIAGNOSIS_REPORT.
 */
export function buildValidReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  return { ...buildSampleReport(), ...overrides };
}

/** Deterministic measurement boundary for a report (first-party pages checked). */
export function coverageOf(report: DiagnosisReport): EvidenceCoverage {
  return deriveCoverage({
    evidence: report.evidence,
    firstPartyDomains: ["example-equip.com"],
    executedQueries: ["q1", "q2"],
  });
}

/** Run the deterministic verifier over a report → the relations a real run feeds the guard. */
export async function verifiedRelations(
  report: DiagnosisReport,
  coverage: EvidenceCoverage = coverageOf(report),
): Promise<ClaimEvidenceRelation[]> {
  const res = await verifyReport({
    report,
    coverage,
    strategy: createDeterministicVerifier(),
  });
  return res.relations;
}

/** Build a single relation with sensible defaults. */
export function rel(partial: Partial<ClaimEvidenceRelation> = {}): ClaimEvidenceRelation {
  return {
    claimId: "iss_1",
    claimKind: "coreIssue",
    evidenceId: "ev_first_product",
    supportLevel: "PARTIAL_SUPPORT",
    confidence: 0.6,
    justification: "test",
    basis: "MEASUREMENT_BOUNDARY",
    verifierMode: "MOCK_DETERMINISTIC",
    verifierVersion: "test.v1",
    ...partial,
  };
}

/** Collect the rule codes from a guard result (empty when ok). */
export function codesOf(result: GuardResult): GuardRuleCode[] {
  return result.ok ? [] : result.violations.map((v) => v.rule);
}
