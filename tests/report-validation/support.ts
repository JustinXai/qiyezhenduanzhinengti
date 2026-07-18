// Shared helpers for the report-validation guard tests (not a test file itself).
import type { DiagnosisReport } from "../../src/contracts";
import type { GuardResult, GuardRuleCode } from "../../src/contracts/guard-types";
import { buildSampleReport } from "../../src/fixtures/sample-report";

/**
 * A genuinely §4-valid report derived from the shared sample.
 *
 * FIXTURE SEAM: the frozen SAMPLE_DIAGNOSIS_REPORT under-supports its core
 * issues / opportunities — iss_1/iss_3/geo_1 cite only PARTIAL_SUPPORT and
 * iss_2/geo_2 cite only CONTEXT_ONLY, none of which meet PRODUCT_TRUTH_RULES
 * §4.1/§4.3/§4.4. We upgrade exactly those two evidence items to
 * DIRECT_SUPPORT here so the happy-path assertions run against a report that
 * actually satisfies §4. The upstream fixture fix is owned by the Supervisor
 * (src/fixtures is Supervisor-only); see agent-output/agent-b/CHECKPOINT.md.
 */
export function buildValidReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  const base = buildSampleReport();
  base.evidence = base.evidence.map((e) =>
    e.id === "ev_first_product" || e.id === "ev_observed_news"
      ? { ...e, supportLevel: "DIRECT_SUPPORT" as const }
      : e,
  );
  return { ...base, ...overrides };
}

/** Collect the rule codes from a guard result (empty when ok). */
export function codesOf(result: GuardResult): GuardRuleCode[] {
  return result.ok ? [] : result.violations.map((v) => v.rule);
}
