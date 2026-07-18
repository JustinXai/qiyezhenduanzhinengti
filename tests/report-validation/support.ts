// Shared helpers for the report-validation guard tests (not a test file itself).
import type { DiagnosisReport } from "../../src/contracts";
import type { GuardResult, GuardRuleCode } from "../../src/contracts/guard-types";
import { buildSampleReport } from "../../src/fixtures/sample-report";

/**
 * A §4-valid report to build guard scenarios from. The Supervisor corrected
 * src/fixtures/sample-report.ts so the shared SAMPLE_DIAGNOSIS_REPORT already
 * satisfies PRODUCT_TRUTH_RULES §4 (every claim cites DIRECT_SUPPORT evidence),
 * so this is now just a mutable deep clone with optional overrides. Tests that
 * need an under-supported claim add their own PARTIAL/CONTEXT_ONLY evidence.
 */
export function buildValidReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  return { ...buildSampleReport(), ...overrides };
}

/** Collect the rule codes from a guard result (empty when ok). */
export function codesOf(result: GuardResult): GuardRuleCode[] {
  return result.ok ? [] : result.violations.map((v) => v.rule);
}
