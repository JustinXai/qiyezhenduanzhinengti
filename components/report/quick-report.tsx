import type { ReactNode } from "react";
import type { QuickReportViewModel } from "../../src/contracts";
import { Section } from "./section";
import { ScoreHeadline } from "./score-card";
import { EvidenceTag } from "./badges";
import { AiSampleDisclaimer, AiTestCard } from "./ai-test-card";
import { IssueItem, OpportunityItem } from "./claim-card";
import { DemonstrationFixCard } from "./demonstration-fix";
import { Roadmap } from "./roadmap";
import { CtaSection } from "./cta-section";
import { formatDate, formatPercent } from "./labels";
import { PRIMARY_CTA_LABEL } from "../../src/product/customer-copy";

interface QuickReportProps {
  vm: QuickReportViewModel;
  /** Switch to the full (Deep) diagnosis view — the "完整诊断入口" (§1). */
  onOpenDeep: () => void;
}

interface QuickModule {
  key: string;
  title: string;
  subtitle?: string;
  body: ReactNode;
}

/**
 * Quick view (Round-5.1 中文成交版). Modules are built dynamically:
 *   - a module with nothing meaningful to say is OMITTED (no empty shell);
 *   - visible numbering is always contiguous (1..n);
 *   - titles reflect the REAL item count (never a fixed "三个核心问题").
 * All selection/limits are already applied by the presentation service.
 */
export function QuickReport({ vm, onOpenDeep }: QuickReportProps) {
  const modules: QuickModule[] = [];

  // 决策摘要 — always present.
  modules.push({
    key: "summary",
    title: "决策摘要",
    body: (
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{vm.brandName}</h1>
          <p className="text-xs text-neutral-500">报告日期 {formatDate(vm.reportDate)}</p>
        </div>

        <ScoreHeadline
          overallScore={vm.overallScore}
          scoreCoverage={vm.scoreCoverage}
          composition={vm.measurementComposition}
        />

        <p className="text-sm leading-relaxed text-neutral-800">{vm.headlineConclusion}</p>
        <p className="text-xs text-neutral-500">{vm.measurementStatusSummary}</p>
        {vm.estimationNotice && (
          <p
            data-testid="estimation-notice"
            className="rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800"
          >
            {vm.estimationNotice}
          </p>
        )}

        <dl className="space-y-1.5 rounded-xl bg-neutral-50 p-3 text-xs">
          <HighlightRow label="已有优势" text={vm.topStrength?.statement} />
          <HighlightRow label="最优先问题" text={vm.topIssue?.statement} />
          <HighlightRow label="最优先机会" text={vm.topOpportunity?.statement} />
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid="primary-cta"
            className="flex-1 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            {PRIMARY_CTA_LABEL}
          </button>
          <button
            type="button"
            onClick={onOpenDeep}
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
          >
            查看完整诊断
          </button>
        </div>
      </div>
    ),
  });

  // AI 现在怎么谈论企业 — only when有效样本存在.
  if (vm.aiVisibilitySamples.length > 0) {
    modules.push({
      key: "ai",
      title: "AI 现在怎么谈论企业",
      body: (
        <>
          <AiSampleDisclaimer />
          <div className="mt-2 space-y-2">
            {vm.aiVisibilitySamples.map((test) => (
              <AiTestCard key={test.id} test={test} />
            ))}
          </div>
        </>
      ),
    });
  }

  // 竞品差距 — gaps, or the restrained boundary note when竞品 was provided.
  if (vm.competitorGapSummary.available) {
    modules.push({
      key: "competitor",
      title: vm.competitorGapSummary.gaps.length > 1 ? "竞品差距" : "最明确的竞品差距",
      body: (
        <ul className="space-y-2">
          {vm.competitorGapSummary.gaps.map((gap) => (
            <li key={gap.id} className="rounded-xl border border-neutral-200 p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-sm font-semibold text-neutral-900">{gap.competitorName}</span>
                <EvidenceTag count={gap.evidenceIds.length} />
              </div>
              <p className="text-xs leading-relaxed text-neutral-700">{gap.gapStatement}</p>
            </li>
          ))}
        </ul>
      ),
    });
  } else if (vm.competitorGapSummary.reason.includes("已收到竞品输入")) {
    // Competitors were provided → the boundary explanation is meaningful content.
    modules.push({
      key: "competitor",
      title: "竞品差距",
      body: (
        <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">
          {vm.competitorGapSummary.reason}
        </p>
      ),
    });
  }

  // 核心问题 — dynamic title by real count; omitted entirely when none.
  if (vm.coreIssues.length > 0) {
    modules.push({
      key: "issues",
      title: vm.coreIssues.length === 1 ? "核心问题" : `核心问题(${vm.coreIssues.length}个)`,
      body: (
        <div className="space-y-2">
          {vm.coreIssues.map((issue) => (
            <IssueItem key={issue.id} issue={issue} />
          ))}
        </div>
      ),
    });
  }

  // 示范修复 — only when the module survived evidence rules.
  if (vm.demonstrationFix) {
    modules.push({
      key: "fix",
      title: "示范修复",
      subtitle: "仅示范优化方向,非最终交付内容",
      body: <DemonstrationFixCard fix={vm.demonstrationFix} />,
    });
  }

  // GEO 机会 — dynamic title; omitted when none survived.
  if (vm.geoOpportunities.length > 0) {
    modules.push({
      key: "geo",
      title:
        vm.geoOpportunities.length === 1
          ? "最值得优先的 GEO 机会"
          : `GEO 机会(${vm.geoOpportunities.length}个)`,
      body: (
        <div className="space-y-2">
          {vm.geoOpportunities.map((opp) => (
            <OpportunityItem key={opp.id} opportunity={opp} />
          ))}
        </div>
      ),
    });
  }

  modules.push({ key: "roadmap", title: "三阶段路线图", body: <Roadmap /> });
  modules.push({ key: "cta", title: "下一步", body: <CtaSection /> });

  return (
    <div className="space-y-1">
      {modules.map((mod, i) => (
        <Section
          key={mod.key}
          index={i + 1}
          testId={`quick-module-${mod.key}`}
          title={mod.title}
          subtitle={mod.subtitle}
        >
          {mod.body}
        </Section>
      ))}
    </div>
  );
}

function HighlightRow({ label, text }: { label: string; text?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold text-neutral-500">{label}</dt>
      <dd className="text-neutral-800">{text ?? "本次暂未识别"}</dd>
    </div>
  );
}

/** Re-exported for tests: percentage formatting shared with the headline. */
export { formatPercent };
