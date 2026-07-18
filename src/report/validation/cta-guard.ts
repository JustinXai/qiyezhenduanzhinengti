// ============================================================================
// CTA / copy guard — docs/PRODUCT_TRUTH_RULES.md §9 and docs/REPORT_CONTRACT.md §8.
//
//   - banned-phrase (and simple whitespace-alias) scan across client-facing
//     report copy (and Quick copy when supplied),
//   - primary / secondary CTA labels must be the frozen literals,
//   - Quick visible-character budget (~1800 CJK chars, mobile-first).
//
// The canonical DiagnosisReport carries no CTA label fields (labels are frozen
// literals injected at the Quick projection), so label + budget checks only run
// when a Quick view model / cta labels are supplied. The banned-phrase scan
// always runs over the report.
// ============================================================================

import type { DiagnosisReport, QuickReportViewModel } from "../../contracts";
import type { GuardResult, GuardViolation } from "../../contracts/guard-types";
import {
  BANNED_MARKETING_PHRASES,
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_LABEL,
} from "../../product/customer-copy";

/**
 * docs/REPORT_CONTRACT.md §8 — frozen CTA labels. Sourced from the single
 * product-copy module (src/product/customer-copy.ts) so the guard validates
 * the exact literals the UI renders. Re-exported for existing importers.
 */
export { PRIMARY_CTA_LABEL, SECONDARY_CTA_LABEL };

/** docs/REPORT_CONTRACT.md — Quick target ~1800 visible CJK characters. */
export const QUICK_CHARACTER_BUDGET = 1800;

/** docs/PRODUCT_TRUTH_RULES.md §9 — banned marketing phrases (single source). */
export const BANNED_PHRASES: readonly string[] = BANNED_MARKETING_PHRASES;

export interface CtaGuardInput {
  report: DiagnosisReport;
  quick?: QuickReportViewModel;
  cta?: { primaryLabel: string; secondaryLabel: string };
}

const stripWhitespace = (s: string): string => s.replace(/\s+/g, "");
const NORMALISED_BANNED = BANNED_PHRASES.map((p) => ({ phrase: p, needle: stripWhitespace(p) }));

export function ctaGuard(input: CtaGuardInput): GuardResult {
  const violations: GuardViolation[] = [];

  // --- banned-phrase / alias scan (whitespace-insensitive) --------------------
  const fields = collectReportTexts(input.report);
  if (input.quick) fields.push(...collectQuickTexts(input.quick));

  for (const { where, value } of fields) {
    const haystack = stripWhitespace(value);
    for (const { phrase, needle } of NORMALISED_BANNED) {
      if (haystack.includes(needle)) {
        violations.push({
          guard: "cta",
          rule: "CTA_BANNED_PHRASE",
          message: `检测到禁用文案「${phrase}」于 ${where}`,
        });
      }
    }
  }

  // --- frozen CTA label literals ---------------------------------------------
  if (input.cta) {
    if (input.cta.primaryLabel !== PRIMARY_CTA_LABEL) {
      violations.push({
        guard: "cta",
        rule: "CTA_PRIMARY_LABEL_MISMATCH",
        message: `主 CTA 必须为「${PRIMARY_CTA_LABEL}」,实际为「${input.cta.primaryLabel}」`,
      });
    }
    if (input.cta.secondaryLabel !== SECONDARY_CTA_LABEL) {
      violations.push({
        guard: "cta",
        rule: "CTA_SECONDARY_LABEL_MISMATCH",
        message: `次 CTA 必须为「${SECONDARY_CTA_LABEL}」,实际为「${input.cta.secondaryLabel}」`,
      });
    }
  }

  // --- Quick visible-character budget ----------------------------------------
  if (input.quick) {
    const count = countQuickVisibleChars(input.quick);
    if (count > QUICK_CHARACTER_BUDGET) {
      violations.push({
        guard: "cta",
        rule: "CTA_QUICK_CHARACTER_BUDGET_EXCEEDED",
        message: `Quick 可见字符 ${count} 超出预算 ${QUICK_CHARACTER_BUDGET}`,
      });
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

interface Field {
  where: string;
  value: string;
}

function collectReportTexts(report: DiagnosisReport): Field[] {
  const fields: Field[] = [];
  const push = (where: string, value: string | undefined): void => {
    if (value) fields.push({ where, value });
  };

  const p = report.companyProfile;
  push("companyProfile.productOrService", p.productOrService);
  p.unresolvedQuestions.forEach((q, i) => push(`companyProfile.unresolvedQuestions[${i}]`, q));

  report.strengths.forEach((s, i) => {
    push(`strengths[${i}].statement`, s.statement);
    push(`strengths[${i}].businessImpact`, s.businessImpact);
  });
  report.coreIssues.forEach((c, i) => {
    push(`coreIssues[${i}].statement`, c.statement);
    push(`coreIssues[${i}].businessImpact`, c.businessImpact);
    push(`coreIssues[${i}].fixDirection`, c.fixDirection);
  });
  report.geoOpportunities.forEach((g, i) => {
    push(`geoOpportunities[${i}].statement`, g.statement);
    push(`geoOpportunities[${i}].businessImpact`, g.businessImpact);
    push(`geoOpportunities[${i}].customerQuestion`, g.customerQuestion);
    push(`geoOpportunities[${i}].contentGap`, g.contentGap);
  });
  report.competitorGaps.forEach((g, i) => push(`competitorGaps[${i}].gapStatement`, g.gapStatement));
  report.aiVisibilityTests.forEach((t, i) => push(`aiVisibilityTests[${i}].question`, t.question));

  const demo = report.demonstrationFix;
  if (demo) {
    push("demonstrationFix.currentIssue", demo.currentIssue);
    push("demonstrationFix.suggestedAssetType", demo.suggestedAssetType);
    push("demonstrationFix.before", demo.before);
    push("demonstrationFix.after", demo.after);
    push("demonstrationFix.whyBetter", demo.whyBetter);
    push("demonstrationFix.customerConfirmationNeeded", demo.customerConfirmationNeeded);
    push("demonstrationFix.geoTeamDeliverable", demo.geoTeamDeliverable);
  }
  return fields;
}

function collectQuickTexts(quick: QuickReportViewModel): Field[] {
  const fields: Field[] = [];
  fields.push({ where: "quick.headlineConclusion", value: quick.headlineConclusion });
  fields.push({ where: "quick.measurementStatusSummary", value: quick.measurementStatusSummary });
  if (!quick.competitorGapSummary.available) {
    fields.push({ where: "quick.competitorGapSummary.reason", value: quick.competitorGapSummary.reason });
  }
  return fields;
}

/** Sum of visible (whitespace-stripped) characters across Quick display copy. */
export function countQuickVisibleChars(quick: QuickReportViewModel): number {
  const parts: string[] = [quick.headlineConclusion, quick.measurementStatusSummary];

  const claimTexts = (c: {
    statement: string;
    businessImpact: string;
    fixDirection?: string;
    customerQuestion?: string;
    contentGap?: string;
  }): string[] =>
    [c.statement, c.businessImpact, c.fixDirection, c.customerQuestion, c.contentGap].filter(
      (v): v is string => typeof v === "string",
    );

  if (quick.topStrength) parts.push(...claimTexts(quick.topStrength));
  if (quick.topIssue) parts.push(...claimTexts(quick.topIssue));
  if (quick.topOpportunity) parts.push(...claimTexts(quick.topOpportunity));
  quick.coreIssues.forEach((c) => parts.push(...claimTexts(c)));
  quick.geoOpportunities.forEach((c) => parts.push(...claimTexts(c)));
  quick.aiVisibilitySamples.forEach((t) => parts.push(t.question));

  if (quick.competitorGapSummary.available) {
    quick.competitorGapSummary.gaps.forEach((g) => parts.push(g.gapStatement));
  } else {
    parts.push(quick.competitorGapSummary.reason);
  }

  const demo = quick.demonstrationFix;
  if (demo) {
    parts.push(
      demo.currentIssue,
      demo.suggestedAssetType,
      demo.before,
      demo.after,
      demo.whyBetter,
      demo.customerConfirmationNeeded,
      demo.geoTeamDeliverable,
      demo.disclaimer,
    );
  }

  return parts.reduce((sum, s) => sum + [...stripWhitespace(s)].length, 0);
}
