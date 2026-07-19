// ============================================================================
// Publish guard — the single publish-time validation entry point.
//
// Aggregates every report-level guard via combineGuardResults:
//   - evidenceGuard       (PRODUCT_TRUTH_RULES §4)
//   - crossFieldGuard     (score consistency, demonstrationFix evidence)
//   - ctaGuard            (§9 banned copy, frozen CTA labels, Quick budget)
//   - viewModelEvidenceGuard  — only when view models are supplied, so callers
//     that publish straight from the canonical report don't need projections.
//
// One green result here == the report is safe to publish. Callers should treat
// a non-ok result as a hard block and surface result.violations.
// ============================================================================

import type { DiagnosisReport } from "../../contracts";
import type {
  ClaimEvidenceRelation,
  EvidenceCoverage,
} from "../../contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../../contracts/independent-support-source";
import type { GuardResult } from "../../contracts/guard-types";
import { combineGuardResults } from "../../contracts/guard-types";
import { evidenceGuard } from "./evidence-guard";
import {
  crossFieldGuard,
  viewModelEvidenceGuard,
  type ReportViewModels,
} from "./cross-field-guard";
import { ctaGuard } from "./cta-guard";
import type { ClaimPublicationCoverageScope } from "./claim-publication-policy";

export interface PublishGuardInput {
  report: DiagnosisReport;
  /**
   * Verified Claim–Evidence relations — the SOLE basis for the §4 support
   * decision (ROUND-3). Produced by the ClaimEvidenceVerifier stage.
   */
  relations: readonly ClaimEvidenceRelation[];
  /** The run's measurement boundary — required to gate negative/missing claims. */
  coverage: EvidenceCoverage;
  sourceContext?: ClaimPublicationSourceContext;
  coverageScope?: ClaimPublicationCoverageScope;
  /** Optional Quick/Deep/Evidence projections to validate alongside the report. */
  viewModels?: ReportViewModels;
  /** Optional CTA labels to check against the frozen literals. */
  cta?: { primaryLabel: string; secondaryLabel: string };
}

export function publishGuard(input: PublishGuardInput): GuardResult {
  const { report, relations, coverage, sourceContext, coverageScope, viewModels, cta } = input;

  const results: GuardResult[] = [
    evidenceGuard({ report, relations, coverage, sourceContext, coverageScope }),
    crossFieldGuard(report),
    ctaGuard({ report, quick: viewModels?.quick, cta }),
  ];

  if (viewModels) {
    results.push(viewModelEvidenceGuard(report, viewModels));
  }

  return combineGuardResults(...results);
}
