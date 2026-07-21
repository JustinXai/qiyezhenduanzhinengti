import type { ReactNode } from "react";
import type { QuickReportViewModel } from "../../src/contracts";
import { Section } from "./section";
import { ScoreHeadline } from "./score-card";
import { EvidenceTag } from "./badges";
import { DemonstrationFixCard } from "./demonstration-fix";
import { Roadmap } from "./roadmap";
import { CtaSection } from "./cta-section";
import { formatDate } from "./labels";
import { PRIMARY_CTA_LABEL } from "../../src/product/customer-copy";
import { QUICK_MODULE_TITLES } from "../../src/report/presentation/zh-labels";

// ============================================================================
// Round-8 FINAL Quick Report
//
// Final 6-module structure:
//   1. 决策摘要
//   2. 客户决策问题覆盖   ← QuestionCoverageStats from Assessments
//   3. 竞品观察          ← only when gaps exist
//   4. 优先完善方向      ← clustered from QCGaps, max 3
//   5. 建议推进路径      ← Roadmap
//   6. 下一步            ← CtaSection
//
// Removed:
//   - AI module (AI现在怎么谈论企业)
//   - 核心问题
//   - GEO机会
//   - 公开信息完善机会
//   - 独立行动建议模块
//
// Competitive gaps: hidden when { available: false }.
// Numbering: always contiguous over visible modules only.
// ============================================================================

interface QuickReportProps {
  vm: QuickReportViewModel;
  /** Switch to the full (Deep) diagnosis view. */
  onOpenDeep: () => void;
}

interface QuickModule {
  key: string;
  title: string;
  subtitle?: string;
  body: ReactNode;
}

export function QuickReport({ vm, onOpenDeep }: QuickReportProps) {
  const modules: QuickModule[] = [];

  // -------------------------------------------------------------------------
  // Module 1: 决策摘要
  // -------------------------------------------------------------------------
  modules.push({
    key: "summary",
    title: "决策摘要",
    body: (
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{vm.brandName}</h1>
          <p className="text-xs text-neutral-500">报告日期 {formatDate(vm.reportDate)}</p>
        </div>

        <p className="text-sm font-medium leading-relaxed text-neutral-900">
          {vm.headlineConclusion}
        </p>

        <ScoreHeadline
          overallScore={vm.overallScore}
          scoreCoverage={vm.scoreCoverage}
          composition={vm.measurementComposition}
        />

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
          {vm.topStrength && <HighlightRow label="已有优势" text={vm.topStrength.statement} />}
          {vm.topIssue && <HighlightRow label="最优先问题" text={vm.topIssue.statement} />}
          {vm.priorityDirections.length > 0 && (
            <HighlightRow label="优先完善方向" text={vm.priorityDirections[0]!.title} />
          )}
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

  // -------------------------------------------------------------------------
  // Module 2: 客户决策问题覆盖
  // -------------------------------------------------------------------------
  {
    const { total, supported, partial, unanswered } = vm.questionCoverageStats;
    modules.push({
      key: "question-coverage",
      title: QUICK_MODULE_TITLES.customerQuestionCoverage,
      body: (
        <div className="space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            <StatChip label="总问题" value={total} />
            <StatChip label="已覆盖" value={supported} tone="positive" />
            <StatChip label="部分覆盖" value={partial} tone="neutral" />
            <StatChip label="未覆盖" value={unanswered} tone="negative" />
          </div>

          {/* Restraint note — only when assessment count is uncertain. */}
          {vm.questionCoverageRestraintNote && (
            <p className="text-xs leading-relaxed text-neutral-500">
              {vm.questionCoverageRestraintNote}
            </p>
          )}
        </div>
      ),
    });
  }

  // -------------------------------------------------------------------------
  // Module 3: 竞品观察 — only when credible gaps exist
  // -------------------------------------------------------------------------
  if (vm.competitorGapSummary.available) {
    modules.push({
      key: "competitor",
      title: vm.competitorGapSummary.gaps.length === 1
        ? "最明确的竞品差距"
        : "竞品观察",
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

  // -------------------------------------------------------------------------
  // Module 4: 优先完善方向 — clustered from QCGaps, max 3
  // -------------------------------------------------------------------------
  if (vm.priorityDirections.length > 0) {
    modules.push({
      key: "priority",
      title: vm.priorityDirections.length === 1
        ? QUICK_MODULE_TITLES.priorityDirections
        : `${QUICK_MODULE_TITLES.priorityDirections}(${vm.priorityDirections.length}个)`,
      body: (
        <div className="space-y-3">
          {vm.priorityDirections.map((dir, idx) => (
            <PriorityDirectionCard key={dir.id} direction={dir} index={idx + 1} />
          ))}
        </div>
      ),
    });
  }

  // -------------------------------------------------------------------------
  // Module 5: 建议推进路径
  // -------------------------------------------------------------------------
  modules.push({
    key: "roadmap",
    title: QUICK_MODULE_TITLES.improvementPath,
    body: <Roadmap />,
  });

  // -------------------------------------------------------------------------
  // Module 6: 下一步
  // -------------------------------------------------------------------------
  modules.push({
    key: "cta",
    title: QUICK_MODULE_TITLES.nextSteps,
    body: <CtaSection />,
  });

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HighlightRow({ label, text }: { label: string; text?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold text-neutral-500">{label}</dt>
      <dd className="text-neutral-800">{text ?? "本次暂未识别"}</dd>
    </div>
  );
}

interface StatChipProps {
  label: string;
  value: number;
  tone?: "positive" | "neutral" | "negative";
}

function StatChip({ label, value, tone }: StatChipProps) {
  const toneClass =
    tone === "positive"
      ? "text-green-700 bg-green-50"
      : tone === "negative"
        ? "text-red-700 bg-red-50"
        : "text-neutral-700 bg-neutral-100";
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl p-2 ${toneClass}`}>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-[10px]">{label}</span>
    </div>
  );
}

interface PriorityDirectionCardProps {
  direction: NonNullable<QuickReportViewModel>["priorityDirections"][number];
  index: number;
}

function PriorityDirectionCard({ direction, index }: PriorityDirectionCardProps) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
          {index}
        </span>
        <h3 className="text-sm font-semibold text-neutral-900">{direction.title}</h3>
      </div>

      {/* 涵盖的客户问题 */}
      {direction.linkedQuestions.length > 0 && (
        <ul className="mb-3 space-y-1 pl-8">
          {direction.linkedQuestions.map((q, qi) => (
            <li key={qi} className="text-xs text-neutral-600">
              · {q}
            </li>
          ))}
        </ul>
      )}

      {/* 建议建设的内容资产 */}
      {direction.suggestedAsset && (
        <div className="mb-2 rounded-lg bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-800">建议建设：</p>
          <p className="mt-0.5 text-xs text-blue-900">{direction.suggestedAsset}</p>
        </div>
      )}

      {/* 具体商业价值 */}
      {direction.businessValue && (
        <p className="text-xs text-neutral-500">
          商业价值：{direction.businessValue}
        </p>
      )}
    </div>
  );
}
