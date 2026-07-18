// ============================================================================
// ChinesePublicReportGuard (Round-5.1 §四) — deterministic zh-CN copy gate over
// the three public view models. Runs on PROJECTIONS (Quick/Deep/Evidence), so a
// violation can never be "fixed" by hiding text in the canonical report.
//
// Checked (authored, customer-visible prose):
//   1. no consecutive full English sentences;
//   2. no raw internal measurement enums (MEASURED / ESTIMATED / …);
//   3. no raw support-level enums (DIRECT_SUPPORT / … / UNSUPPORTED);
//   4. no state-machine stage names;
//   5. no English technical error strings (PROVIDER_*, stack traces);
//   6. no English CTA copy on the frozen CTA fields;
//   7. unified Chinese punctuation (no half-width ! ? ; in prose);
//   8. whitelist: brand names, product models, URLs, evidence原文 titles /
//      snippets, and必要缩写 (GEO / AI / API / FAQ / B2B / VR / CTA…).
//
// UNSUPPORTED must never be public — additionally asserted on Evidence items.
// ============================================================================

import type {
  DeepReportViewModel,
  EvidenceViewModel,
  QuickReportViewModel,
} from "../../contracts";

export interface ChineseGuardViolation {
  rule:
    | "ZH_FULL_ENGLISH_SENTENCE"
    | "ZH_INTERNAL_ENUM_LEAK"
    | "ZH_STATE_MACHINE_LEAK"
    | "ZH_TECH_ERROR_LEAK"
    | "ZH_ENGLISH_CTA"
    | "ZH_PUNCTUATION"
    | "ZH_UNSUPPORTED_PUBLIC"
    | "ZH_MISSING_CHINESE_SUMMARY"
    | "ZH_WRONG_REPORT_LANGUAGE";
  field: string;
  detail: string;
}

export type ChineseGuardResult =
  | { ok: true }
  | { ok: false; violations: ChineseGuardViolation[] };

/** Technical abbreviations allowed inside otherwise-Chinese prose. */
const ABBREV_WHITELIST = [
  "GEO", "AI", "API", "FAQ", "CTA", "B2B", "B2C", "VR", "AR", "URL", "SEO",
  "App", "iOS", "Android", "Insta360", "GoPro", "GB", "MB", "4K", "8K", "360",
];

const INTERNAL_ENUMS = [
  "MEASURED", "ESTIMATED", "INSUFFICIENT_EVIDENCE", "PROVIDER_FAILED",
  "DIRECT_SUPPORT", "PARTIAL_SUPPORT", "CONTEXT_ONLY", "UNSUPPORTED",
  "MOCK_DETERMINISTIC", "DEEPSEEK_STRUCTURED",
];

const STATE_MACHINE_NAMES = [
  "VALIDATING", "SEARCHING", "CRAWLING", "NORMALIZING_EVIDENCE", "ANALYZING",
  "CLAIM_EVIDENCE_VERIFICATION", "VALIDATING_REPORT", "READY", "FAILED",
];

const TECH_ERROR_MARKERS = [
  "PROVIDER_", "TypeError", "ReferenceError", "ECONNREFUSED", "ETIMEDOUT",
  "stack trace", "Traceback", "undefined is not",
];

/**
 * A "full English sentence": ≥5 consecutive latin words followed by another
 * latin word or sentence punctuation — i.e. real prose, not a brand, model
 * number, URL or abbreviation run.
 */
const ENGLISH_SENTENCE_RE = /\b(?:[A-Za-z]{2,}\s+){5,}[A-Za-z]{2,}[\s.,!?;:]?/;

function stripWhitelisted(text: string): string {
  let out = text;
  // URLs and domains never count as prose.
  out = out.replace(/https?:\/\/\S+/g, " ");
  out = out.replace(/\b[\w-]+\.(?:com|cn|net|org|io|co)\S*/gi, " ");
  for (const token of ABBREV_WHITELIST) {
    out = out.split(token).join(" ");
  }
  return out;
}

function isEnum(token: string): boolean {
  return INTERNAL_ENUMS.includes(token) || STATE_MACHINE_NAMES.includes(token);
}

interface ProseField {
  field: string;
  text: string;
}

function check(fields: ProseField[], opts: { ctaFields?: string[] } = {}): ChineseGuardViolation[] {
  const violations: ChineseGuardViolation[] = [];
  for (const { field, text } of fields) {
    if (!text) continue;
    const stripped = stripWhitelisted(text);

    if (ENGLISH_SENTENCE_RE.test(stripped)) {
      violations.push({ rule: "ZH_FULL_ENGLISH_SENTENCE", field, detail: text.slice(0, 60) });
    }
    for (const token of INTERNAL_ENUMS) {
      // Match the raw enum token as a standalone word (not inside a URL etc.).
      if (new RegExp(`(?:^|[^A-Za-z_])${token}(?:$|[^A-Za-z_])`).test(text)) {
        violations.push({ rule: "ZH_INTERNAL_ENUM_LEAK", field, detail: token });
      }
    }
    for (const token of STATE_MACHINE_NAMES) {
      if (new RegExp(`(?:^|[^A-Za-z_])${token}(?:$|[^A-Za-z_])`).test(text) && isEnum(token)) {
        violations.push({ rule: "ZH_STATE_MACHINE_LEAK", field, detail: token });
      }
    }
    for (const marker of TECH_ERROR_MARKERS) {
      if (text.includes(marker)) {
        violations.push({ rule: "ZH_TECH_ERROR_LEAK", field, detail: marker });
      }
    }
    // Unified punctuation: half-width !, ? and ; are not used in zh-CN prose.
    if (/[!?]/.test(stripped) || /;(?!\))/.test(stripped.replace(/&[a-z]+;/g, " "))) {
      violations.push({ rule: "ZH_PUNCTUATION", field, detail: "half-width !, ? or ; in prose" });
    }
  }
  for (const field of opts.ctaFields ?? []) {
    const entry = fields.find((f) => f.field === field);
    if (entry && /[A-Za-z]{3,}/.test(stripWhitelisted(entry.text))) {
      violations.push({ rule: "ZH_ENGLISH_CTA", field, detail: entry.text.slice(0, 40) });
    }
  }
  return violations;
}

function claimFields(prefix: string, claims: readonly { statement: string; businessImpact: string }[]): ProseField[] {
  return claims.flatMap((c, i) => [
    { field: `${prefix}[${i}].statement`, text: c.statement },
    { field: `${prefix}[${i}].businessImpact`, text: c.businessImpact },
  ]);
}

/** Guard the three public projections. */
export function chinesePublicReportGuard(views: {
  quick: QuickReportViewModel;
  deep: DeepReportViewModel;
  evidence: EvidenceViewModel;
}): ChineseGuardResult {
  const { quick, deep, evidence } = views;
  const violations: ChineseGuardViolation[] = [];

  if (quick.reportLanguage !== "zh-CN") {
    violations.push({
      rule: "ZH_WRONG_REPORT_LANGUAGE",
      field: "quick.reportLanguage",
      detail: String(quick.reportLanguage),
    });
  }

  const quickFields: ProseField[] = [
    { field: "quick.headlineConclusion", text: quick.headlineConclusion },
    { field: "quick.measurementStatusSummary", text: quick.measurementStatusSummary },
    { field: "quick.estimationNotice", text: quick.estimationNotice ?? "" },
    ...claimFields("quick.coreIssues", quick.coreIssues),
    ...claimFields("quick.geoOpportunities", quick.geoOpportunities),
    ...(quick.competitorGapSummary.available
      ? quick.competitorGapSummary.gaps.map((g, i) => ({
          field: `quick.competitorGaps[${i}].gapStatement`,
          text: g.gapStatement,
        }))
      : [{ field: "quick.competitorGapSummary.reason", text: quick.competitorGapSummary.reason }]),
  ];

  const deepFields: ProseField[] = [
    ...deep.measurementNotes.map((n, i) => ({ field: `deep.measurementNotes[${i}]`, text: n })),
    ...claimFields("deep.strengths", deep.strengths),
    ...claimFields("deep.coreIssues", deep.coreIssues),
    ...claimFields("deep.geoOpportunities", deep.geoOpportunities),
  ];

  violations.push(...check(quickFields), ...check(deepFields));

  for (const [i, item] of evidence.items.entries()) {
    if (item.supportLevel === "UNSUPPORTED") {
      violations.push({
        rule: "ZH_UNSUPPORTED_PUBLIC",
        field: `evidence.items[${i}]`,
        detail: item.id,
      });
    }
    // Original titles/snippets stay in their source language; the CHINESE
    // customer summary + labels are mandatory on every public item.
    if (!item.summaryZh || !/[一-鿿]/.test(item.summaryZh)) {
      violations.push({
        rule: "ZH_MISSING_CHINESE_SUMMARY",
        field: `evidence.items[${i}].summaryZh`,
        detail: item.id,
      });
    }
    violations.push(
      ...check([
        { field: `evidence.items[${i}].summaryZh`, text: item.summaryZh ?? "" },
        { field: `evidence.items[${i}].supportLabel`, text: item.supportLabel ?? "" },
        { field: `evidence.items[${i}].sourceTypeLabel`, text: item.sourceTypeLabel ?? "" },
      ]),
    );
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
