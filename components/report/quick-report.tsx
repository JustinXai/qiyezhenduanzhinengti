import type { QuickReportViewModel } from "../../src/contracts";
import { Section } from "./section";
import { ScoreHeadline } from "./score-card";
import { EvidenceTag } from "./badges";
import { AiSampleDisclaimer, AiTestCard } from "./ai-test-card";
import { IssueItem, OpportunityItem } from "./claim-card";
import { DemonstrationFixCard } from "./demonstration-fix";
import { Roadmap } from "./roadmap";
import { CtaSection } from "./cta-section";
import { formatDate } from "./labels";

interface QuickReportProps {
  vm: QuickReportViewModel;
  /** Switch to the full (Deep) diagnosis view — the "完整诊断入口" (§1). */
  onOpenDeep: () => void;
}

/**
 * Quick view — the default 8-module report (docs/REPORT_CONTRACT.md).
 * All selection/limits are already applied by the presentation service; this
 * component only renders. Mobile-first, target ≤ ~1800 visible Chinese chars.
 */
export function QuickReport({ vm, onOpenDeep }: QuickReportProps) {
  return (
    <div className="space-y-1">
      {/* Module 1 — 首屏决策摘要 */}
      <Section index={1} testId="quick-module-1" title="决策摘要">
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{vm.brandName}</h1>
            <p className="text-xs text-neutral-500">报告日期 {formatDate(vm.reportDate)}</p>
          </div>

          <ScoreHeadline overallScore={vm.overallScore} scoreCoverage={vm.scoreCoverage} />

          <p className="text-sm leading-relaxed text-neutral-800">{vm.headlineConclusion}</p>
          <p className="text-xs text-neutral-500">{vm.measurementStatusSummary}</p>

          <dl className="space-y-1.5 rounded-xl bg-neutral-50 p-3 text-xs">
            <HighlightRow label="已有优势" text={vm.topStrength?.statement} />
            <HighlightRow label="最优先问题" text={vm.topIssue?.statement} />
            <HighlightRow label="最优先机会" text={vm.topOpportunity?.statement} />
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="flex-1 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              预约报告解读
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
      </Section>

      {/* Module 2 — AI 现在怎么谈论企业 */}
      <Section index={2} testId="quick-module-2" title="AI 现在怎么谈论企业">
        {vm.aiVisibilitySamples.length > 0 ? (
          <>
            <AiSampleDisclaimer />
            <div className="mt-2 space-y-2">
              {vm.aiVisibilitySamples.map((test) => (
                <AiTestCard key={test.id} test={test} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500">本次暂无满足展示条件的有效 AI 问答样本。</p>
        )}
      </Section>

      {/* Module 3 — 竞品差距 (conditional) */}
      <Section index={3} testId="quick-module-3" title="竞品差距">
        {vm.competitorGapSummary.available ? (
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
        ) : (
          <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">
            {vm.competitorGapSummary.reason}
          </p>
        )}
      </Section>

      {/* Module 4 — 三个核心问题 */}
      <Section index={4} testId="quick-module-4" title="三个核心问题">
        {vm.coreIssues.length > 0 ? (
          <div className="space-y-2">
            {vm.coreIssues.map((issue) => (
              <IssueItem key={issue.id} issue={issue} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">本次没有达到发布标准的核心问题。</p>
        )}
      </Section>

      {/* Module 5 — 示范修复 (hidden entirely when null) */}
      {vm.demonstrationFix && (
        <Section index={5} testId="quick-module-5" title="示范修复" subtitle="仅示范优化方向,非最终交付内容">
          <DemonstrationFixCard fix={vm.demonstrationFix} />
        </Section>
      )}

      {/* Module 6 — Top 3 GEO 机会 */}
      <Section index={6} testId="quick-module-6" title="Top GEO 机会">
        {vm.geoOpportunities.length > 0 ? (
          <div className="space-y-2">
            {vm.geoOpportunities.map((opp) => (
              <OpportunityItem key={opp.id} opportunity={opp} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">本次没有达到发布标准的 GEO 机会。</p>
        )}
      </Section>

      {/* Module 7 — 三阶段路线图 */}
      <Section index={7} testId="quick-module-7" title="三阶段路线图">
        <Roadmap />
      </Section>

      {/* Module 8 — CTA */}
      <Section index={8} testId="quick-module-8" title="下一步">
        <CtaSection />
      </Section>
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
