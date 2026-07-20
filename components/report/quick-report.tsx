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
import { QUICK_MODULE_TITLES } from "../../src/report/presentation/zh-labels";
import { PublicInfoOpportunityCard, PublicInfoActionItem } from "./public-info-opportunity";

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
      <div className="space-y-4">
        {/* 报告品牌头部 */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{vm.brandName}</h1>
            <p className="mt-0.5 text-xs text-neutral-400">企业诊断报告 · {formatDate(vm.reportDate)}</p>
          </div>
          <div className="hidden sm:block">
            <div className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Quick 快速版
            </div>
          </div>
        </div>

        {/* §十 固定决策顺序: 1.一句话结论 → 2.评分与测量构成 → 问题/机会 → CTA */}
        <div className="rounded-xl border-l-4 border-neutral-900 bg-neutral-50 px-4 py-3">
          <p className="text-sm font-medium leading-relaxed text-neutral-900">
            {vm.headlineConclusion}
          </p>
        </div>

        <ScoreHeadline
          overallScore={vm.overallScore}
          scoreCoverage={vm.scoreCoverage}
          composition={vm.measurementComposition}
        />

        <div className="space-y-1.5">
          {vm.estimationNotice && (
            <p
              data-testid="estimation-notice"
              className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700"
            >
              {vm.estimationNotice}
            </p>
          )}
          <p className="text-xs text-neutral-400">{vm.measurementStatusSummary}</p>
        </div>

        {/* 关键洞察列表 */}
        {(vm.topStrength || vm.topIssue || vm.topOpportunity || vm.topPublicInformationOpportunity) && (
          <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              关键洞察
            </p>
            {vm.topStrength && (
              <HighlightRow label="已有优势" text={vm.topStrength.statement} highlight="positive" />
            )}
            {vm.topIssue && (
              <HighlightRow label="最优先问题" text={vm.topIssue.statement} highlight="warning" />
            )}
            {vm.topOpportunity && (
              <HighlightRow label="最优先机会" text={vm.topOpportunity.statement} highlight="info" />
            )}
            {vm.topPublicInformationOpportunity && (
              <HighlightRow
                label="最优先补充"
                text={vm.topPublicInformationOpportunity.suggestedContentAction}
                highlight="muted"
              />
            )}
          </div>
        )}

        {/* 首屏主 CTA */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
          <button
            type="button"
            data-testid="primary-cta"
            className="flex-1 rounded-xl bg-neutral-900 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 hover:shadow"
          >
            {PRIMARY_CTA_LABEL}
          </button>
          <button
            type="button"
            onClick={onOpenDeep}
            className="flex-1 rounded-xl border border-neutral-300 bg-white px-5 py-3.5 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:border-neutral-400 hover:bg-neutral-50"
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

  // Round-7: 公开信息完善机会 — 最多3个
  if (vm.publicInformationOpportunities.length > 0) {
    modules.push({
      key: "public-info",
      title:
        vm.publicInformationOpportunities.length === 1
          ? QUICK_MODULE_TITLES.publicInfoOpportunities
          : `${QUICK_MODULE_TITLES.publicInfoOpportunities}(${vm.publicInformationOpportunities.length}个)`,
      body: (
        <div className="space-y-2">
          {vm.publicInformationOpportunities.map((opp, idx) => (
            <PublicInfoOpportunityCard key={opp.relatedQuestionId} opportunity={opp} index={idx + 1} />
          ))}
        </div>
      ),
    });
  }

  // Round-7: 行动建议 — 来源于 QuestionCoverageGap 的确定性映射
  if (vm.publicInformationActions.length > 0) {
    modules.push({
      key: "actions",
      title: QUICK_MODULE_TITLES.actionSuggestions,
      body: (
        <div className="space-y-2">
          {vm.publicInformationActions.map((action, idx) => (
            <PublicInfoActionItem key={idx} action={action} index={idx + 1} />
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

function HighlightRow({
  label,
  text,
  highlight,
}: {
  label: string;
  text?: string;
  highlight?: "positive" | "warning" | "info" | "muted";
}) {
  const dotColors = {
    positive: "bg-emerald-400",
    warning: "bg-amber-400",
    info: "bg-sky-400",
    muted: "bg-neutral-400",
  };

  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-1.5 shrink-0">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${highlight ? dotColors[highlight] : "bg-neutral-300"}`} />
      </div>
      <div className="flex-1">
        <span className="text-xs font-semibold text-neutral-500">{label}</span>
        <p className="mt-0.5 text-sm text-neutral-800">{text ?? "本次暂未识别"}</p>
      </div>
    </div>
  );
}

/** Re-exported for tests: percentage formatting shared with the headline. */
export { formatPercent };
