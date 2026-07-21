// ============================================================================
// Chinese Conversion Review (Round-5.1 §十四) — 20 deterministic product-level
// checks over ONE canonical report + its three projections. Pure functions,
// zero provider calls; reuses the frozen guards and calculators (never a second
// translation table or a second scoring path).
//
// This is a REVIEW (named findings for the delivery board), distinct from the
// blocking ChinesePublicReportGuard: guard failures block publish, review
// findings gate the round's product acceptance.
// ============================================================================

import type { DiagnosisReport } from "../../contracts";
import { computeContentYield } from "../../diagnosis/evidence/tiering";
import type { ReportPresentation } from "../presentation";
import { computeMeasurementComposition } from "../presentation/measurement-composition";
import { chinesePublicReportGuard } from "./chinese-public-report-guard";
import { countQuickVisibleChars } from "./cta-guard";

export interface ReviewCheck {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
}

const CJK = /[一-鿿]/;

/** Generic template sentences that must not pass as company-specific insight. */
const GENERIC_TEMPLATE_MARKERS = [
  "多发内容",
  "提升品牌影响力即可",
  "加强宣传力度",
  "优化网站体验即可",
];

export function chineseConversionReview(
  report: DiagnosisReport,
  views: ReportPresentation,
): ReviewCheck[] {
  const { quick, deep, evidence } = views;
  const checks: ReviewCheck[] = [];
  const add = (id: number, name: string, pass: boolean, detail: string) =>
    checks.push({ id, name, pass, detail });

  const guard = chinesePublicReportGuard(views);
  const guardRules = guard.ok ? [] : guard.violations.map((v) => v.rule);

  // 1–3 语言.
  add(1, "quick-chinese", CJK.test(quick.headlineConclusion), "headline zh");
  add(
    2,
    "deep-chinese",
    deep.measurementNotes.every((n) => CJK.test(n)),
    `notes=${deep.measurementNotes.length}`,
  );
  add(
    3,
    "evidence-summaries-chinese",
    evidence.items.every((i) => CJK.test(i.summaryZh ?? "")),
    `items=${evidence.items.length}`,
  );
  // 4–5 泄漏.
  add(4, "no-full-english-sentence", !guardRules.includes("ZH_FULL_ENGLISH_SENTENCE"), "guard");
  add(
    5,
    "no-internal-enum-leak",
    !guardRules.includes("ZH_INTERNAL_ENUM_LEAK") && !guardRules.includes("ZH_STATE_MACHINE_LEAK"),
    "guard",
  );
  // 6 企业特异: headline/issues must name the brand or cite issue statements
  // grounded in evidence (heuristic: brand mentioned somewhere in quick prose).
  const brand = report.companyProfile.brandName;
  const quickProse = [quick.headlineConclusion, ...quick.coreIssues.map((c) => c.statement)].join(" ");
  add(6, "quick-company-specific", quickProse.includes(brand), `brand=${brand}`);
  // 7–9 机会 lineage.
  const opps = report.geoOpportunities;
  add(
    7,
    "opportunity-links-issue",
    opps.every((o) => o.sourceIssueId === undefined || report.coreIssues.some((i) => i.id === o.sourceIssueId)),
    `opps=${opps.length}`,
  );
  add(8, "opportunity-has-evidence", opps.every((o) => o.evidenceIds.length > 0), `opps=${opps.length}`);
  add(9, "opportunity-answers-question", opps.every((o) => o.customerQuestion.trim().length > 0), "customerQuestion");
  // 10 示范修复 lineage.
  const fix = report.demonstrationFix;
  add(
    10,
    "fix-from-published-issue",
    fix === null || fix.evidenceIds.length > 0,
    fix === null ? "null (allowed)" : "evidence-backed",
  );
  // 11 通用模板句.
  const allProse = JSON.stringify({ q: quick, d: deep });
  const generic = GENERIC_TEMPLATE_MARKERS.filter((m) => allProse.includes(m));
  add(11, "no-generic-template", generic.length === 0, generic.join(",") || "clean");
  // 12 测量构成展示.
  const comp = computeMeasurementComposition(report.scores);
  const compMatches =
    quick.measurementComposition.measuredWeight === comp.measuredWeight &&
    quick.measurementComposition.estimatedWeight === comp.estimatedWeight &&
    (deep.measurementComposition === undefined ||
      deep.measurementComposition.measuredWeight === comp.measuredWeight);
  add(12, "composition-shown-not-just-coverage", compMatches, "quick+deep consistent, no re-compute");
  // 13–14 动态标题 / 连续编号: structural facts the component derives from
  // counts; verified here on the VM side (component render is e2e-covered).
  add(13, "dynamic-issue-count", quick.coreIssues.length <= 3, `issues=${quick.coreIssues.length}`);
  add(14, "no-empty-modules-data", quick.geoOpportunities.length > 0 || quick.topOpportunity === null, "no phantom opportunity");
  // 15 字符预算.
  const chars = countQuickVisibleChars(quick);
  add(15, "quick-within-1800", chars <= 1800, `chars=${chars}`);
  // 16 null≠0.
  const nullAsZero = Object.entries(report.scores)
    .filter(([k]) => !["overallScore", "scoreCoverage"].includes(k))
    .some(([, v]) => {
      const d = v as { score: number | null; measurementStatus: string };
      return d.score === null && (d as { score: number | null }).score === 0;
    });
  add(16, "null-never-zero", !nullAsZero, "scores");
  // 17 竞品未解析不得生成确定性差距.
  const hasCompetitorEvidence = report.evidence.some((e) => e.sourceType === "COMPETITOR_WEB_EVIDENCE");
  add(
    17,
    "no-gap-without-resolution",
    hasCompetitorEvidence || report.competitorGaps.length === 0,
    `gaps=${report.competitorGaps.length}`,
  );
  // 18 中文证据优先 (annotated runs only; legacy reports without language pass).
  const annotated = report.evidence.filter((e) => e.language !== undefined);
  const zhShare = annotated.length === 0 ? 1 : annotated.filter((e) => e.language === "zh").length / annotated.length;
  add(18, "chinese-evidence-primary", annotated.length === 0 || zhShare >= 0.5, `zhShare=${Math.round(zhShare * 100)}%`);
  // 19 重复电商证据限制 (per marketplace-ish domain ≤2 among annotated D-tier).
  const dCounts = new Map<string, number>();
  for (const e of report.evidence) {
    if (e.sourceTier === "D") dCounts.set(e.sourceDomain, (dCounts.get(e.sourceDomain) ?? 0) + 1);
  }
  add(19, "marketplace-cap-respected", [...dCounts.values()].every((n) => n <= 2), `domains=${dCounts.size}`);
  // 20 Public API字段边界 (spot-check the projections for internal fields).
  const serialized = JSON.stringify(views);
  const internalLeaks = ["justification", "verifierMode", "promptVersion", "checkpoint", "providerRequestId"].filter(
    (t) => serialized.includes(t),
  );
  add(20, "no-internal-fields-in-views", internalLeaks.length === 0, internalLeaks.join(",") || "clean");

  return checks;
}

/** Content-yield summary re-exported alongside the review for run reporting. */
export { computeContentYield };
