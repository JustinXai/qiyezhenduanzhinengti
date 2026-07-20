import type { ReactNode } from "react";
import type { QuickReportViewModel } from "../../src/contracts";
import { Section } from "./section";
import { ScoreHeadline } from "./score-card";
import { EvidenceTag } from "./badges";
import { IssueItem, OpportunityItem } from "./claim-card";
import { DemonstrationFixCard } from "./demonstration-fix";
import { Roadmap } from "./roadmap";
import { CtaSection } from "./cta-section";
import { formatDate, formatPercent } from "./labels";
import { PRIMARY_CTA_LABEL } from "../../src/product/customer-copy";
import { QUICK_MODULE_TITLES, COVERAGE_STATUS_LABEL } from "../../src/report/presentation/zh-labels";
import { PriorityDirectionCard } from "./priority-direction";

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
 * Quick view (Round-7.1A 精简版). Modules are built dynamically:
 *   - a module with nothing meaningful to say is OMITTED (no empty shell);
 *   - visible numbering is always contiguous (1..n);
 *   - titles reflect the REAL item count.
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
        {(vm.topStrength || vm.topIssue || vm.topOpportunity) && (
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

  // 客户决策问题覆盖 — only when there are questions or restrained message
  if (vm.keyCustomerQuestions.length > 0 || vm.questionCoverageStats.totalQuestions > 0 || vm.questionCoverageRestrainedMessage) {
    modules.push({
      key: "question-coverage",
      title: QUICK_MODULE_TITLES.questionCoverage,
      body: (
        <div className="space-y-4">
          {vm.questionCoverageRestrainedMessage ? (
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              {vm.questionCoverageRestrainedMessage}
            </p>
          ) : (
            <>
              {/* 统计摘要 */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="本次检查" value={vm.questionCoverageStats.totalQuestions} />
                <StatCard label="充分覆盖" value={vm.questionCoverageStats.fullySupportedCount} tone="positive" />
                <StatCard label="部分覆盖" value={vm.questionCoverageStats.partiallySupportedCount} tone="warning" />
                <StatCard label="待补充" value={vm.questionCoverageStats.unansweredCount} tone="danger" />
              </div>

              {/* 关键问题列表 */}
              <div className="space-y-2">
                {vm.keyCustomerQuestions.map((q) => (
                  <QuestionCard key={q.questionId} question={q} />
                ))}
              </div>
            </>
          )}
        </div>
      ),
    });
  }

  // 条件性竞品观察 — only when formal gaps pass Truth Policy
  if (vm.competitorGapSummary.available) {
    modules.push({
      key: "competitor",
      title: QUICK_MODULE_TITLES.competitorObservation,
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

  // Round-7.1A: 优先完善方向 — merged from QuestionCoverageGap clustering
  if (vm.priorityDirections.length > 0) {
    modules.push({
      key: "priority",
      title: QUICK_MODULE_TITLES.priorityDirections,
      body: (
        <div className="space-y-2">
          {vm.priorityDirections.map((dir, idx) => (
            <PriorityDirectionCard key={idx} direction={dir} index={idx + 1} />
          ))}
        </div>
      ),
    });
  }

  // 建议推进路径 — compressed single module
  modules.push({ key: "roadmap", title: QUICK_MODULE_TITLES.roadmap, body: <Roadmap /> });

  // 下一步
  modules.push({ key: "cta", title: QUICK_MODULE_TITLES.nextSteps, body: <CtaSection /> });

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

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const bgColors = {
    neutral: "bg-neutral-100",
    positive: "bg-emerald-50",
    warning: "bg-amber-50",
    danger: "bg-red-50",
  };
  const textColors = {
    neutral: "text-neutral-900",
    positive: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
  };

  return (
    <div className={`rounded-lg ${bgColors[tone]} p-3 text-center`}>
      <p className={`text-2xl font-bold ${textColors[tone]}`}>{value}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function QuestionCard({ question }: { question: QuickReportViewModel["keyCustomerQuestions"][number] }) {
  const statusColors = {
    FULLY_SUPPORTED: "bg-emerald-100 text-emerald-700",
    PARTIALLY_SUPPORTED: "bg-amber-100 text-amber-700",
    UNANSWERED: "bg-red-100 text-red-700",
  };

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[question.coverageStatus]}`}>
          {COVERAGE_STATUS_LABEL[question.coverageStatus]}
        </span>
        <p className="flex-1 text-sm font-medium text-neutral-900">{question.questionText}</p>
      </div>
      <div className="px-4 py-3">
        <div className="space-y-2">
          <div className="text-xs">
            <span className="font-medium text-neutral-500">当前公开信息情况：</span>
            <span className="text-neutral-700">{question.publicInfoSituation}</span>
          </div>
          <div className="text-xs">
            <span className="font-medium text-neutral-500">建议补充：</span>
            <span className="text-neutral-700">{question.suggestedContentType}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Re-exported for tests: percentage formatting shared with the headline. */
export { formatPercent };
