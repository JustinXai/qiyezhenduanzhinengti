"use client";

import type { ReactNode } from "react";
import type { EnterpriseReportViewModel } from "../../src/contracts";
import { ScoreHeadline } from "./score-card";
import { formatDate } from "./labels";
import { PRIMARY_CTA_LABEL, SECONDARY_CTA_LABEL, SERVICE_BRAND_NAME } from "../../src/product/customer-copy";
import { EvidenceView } from "./evidence-view";
import { useState } from "react";

// ============================================================================
// Round-9.3: Enterprise GEO Consulting Report
// Single unified report — no Quick/Deep tabs.
//
// Key fixes (Round-9.3):
//   - Deduplicate enterprise status: single card
//   - Fix question count: show 5 input, 3 directions
//   - Fix information direction copy mapping
//   - Fix measurement composition labels
//   - Fix evidence Chinese labels
//   - Fix mobile density
// ============================================================================

interface EnterpriseReportProps {
  vm: EnterpriseReportViewModel;
}

export function EnterpriseReport({ vm }: EnterpriseReportProps) {
  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Report container: max-width 1000px, centered */}
      <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <p className="text-xs text-neutral-400">{SERVICE_BRAND_NAME}</p>
            <h1 className="mt-0.5 text-base font-semibold text-neutral-900">企业GEO诊断报告</h1>
          </div>
          <div className="text-right text-xs text-neutral-400">
            <div className="break-words">{vm.brandName}</div>
            <div className="mt-0.5">{formatDate(vm.reportDate)}</div>
          </div>
        </header>

        {/* Module 01: 决策摘要 */}
        <Section index={1} title="决策摘要" className="mb-4">
          {/* Two-column layout: left = summary, right = score */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            {/* Left: Brand + Summary + Highlights */}
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 break-words">{vm.brandName}</h2>
                <p className="mt-0.5 text-xs text-neutral-500">报告日期 {formatDate(vm.reportDate)}</p>
              </div>

              <p className="text-sm leading-[1.65] text-neutral-700">{vm.enterpriseStatusSummary}</p>

              {/* Key highlights: compact list */}
              <div className="rounded-lg bg-neutral-50 p-3 space-y-1.5 text-sm">
                {vm.topStrength && (
                  <HighlightItem label="已有优势" text={vm.topStrength.statement} />
                )}
                {vm.enterpriseStatusDescription && (
                  <HighlightItem label="公开识别" text={vm.enterpriseStatusDescription} />
                )}
              </div>
            </div>

            {/* Right: Score */}
            <div className="flex flex-col justify-center">
              <ScoreHeadline
                overallScore={vm.overallScore}
                scoreCoverage={vm.scoreCoverage}
                composition={vm.measurementComposition}
              />
              {vm.estimationNotice && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                  {vm.estimationNotice}
                </p>
              )}
            </div>
          </div>

          {/* CTA: full width */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-testid="primary-cta"
              className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              {PRIMARY_CTA_LABEL}
            </button>
            <button
              type="button"
              data-testid="secondary-cta"
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              {SECONDARY_CTA_LABEL}
            </button>
          </div>
        </Section>

        {/* Module 02: 企业现状分析 */}
        <Section index={2} title="企业现状分析" className="mb-4">
          {/* Single merged card */}
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="mb-1.5 text-xs font-semibold text-neutral-500">已识别的公开基础</h3>
            <p className="text-sm leading-[1.65] text-neutral-700">
              {vm.enterpriseStatusDescription ?? vm.topStrength?.statement ?? "企业已在公开渠道具备基础信息展示。"}
            </p>
          </div>
        </Section>

        {/* Module 03: 客户需求与信息机会 */}
        {vm.informationOpportunities.length > 0 && (
          <Section index={3} title="客户需求与信息机会" className="mb-4">
            {/* Overall judgment with correct counts */}
            <p className="mb-3 text-sm leading-[1.65] text-neutral-600">
              本次分析了{vm.inputQuestionCount}个客户关注问题，并归纳为{vm.informationDirectionCount}个重点信息方向。现有公开信息能够提供部分答案，但产品选择、品质保障和企业合作等内容仍缺少集中、清晰的回答入口。
            </p>
            <p className="mb-3 text-xs text-neutral-400">
              以下判断仅限本次已检查的公开页面和搜索结果。
            </p>
            {/* Two-column cards on desktop, single on mobile */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {vm.informationOpportunities.slice(0, 3).map((opp, i) => (
                <OpportunityCard key={i} opportunity={opp} index={i + 1} />
              ))}
            </div>
          </Section>
        )}

        {/* Module 04: 竞争环境与同行观察 (conditional) */}
        {vm.competitorObservations && vm.competitorObservations.length > 0 && (
          <Section index={4} title="竞争环境与同行观察" className="mb-4">
            <p className="mb-3 text-xs text-neutral-400">
              在本次公开检索范围内，对同行品牌的信息展示进行观察。
            </p>
            <div className="space-y-2">
              {vm.competitorObservations.map((obs, i) => (
                <CompetitorObservationCard key={i} observation={obs} />
              ))}
            </div>
          </Section>
        )}

        {/* Module 05: 重点内容资产方案 */}
        {vm.contentAssetPlans.length > 0 && (
          <Section index={vm.competitorObservations ? 5 : 4} title="重点内容资产方案" className="mb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vm.contentAssetPlans.map((plan, i) => (
                <AssetPlanCard key={i} plan={plan} index={i + 1} />
              ))}
            </div>
          </Section>
        )}

        {/* Module 06: 推进路线与星媄数据协作 */}
        <Section
          index={vm.competitorObservations ? 6 : (vm.contentAssetPlans.length > 0 ? 5 : 4)}
          title="推进路线与星媄数据协作"
          className="mb-4"
        >
          <RoadmapInline />
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <h3 className="mb-2 text-xs font-semibold text-neutral-500">星媄数据协作范围</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SERVICE_COLLAB_ITEMS.map((item, i) => (
                <div key={i} className="rounded bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Module 07: 证据附件 */}
        <Section
          index={vm.competitorObservations ? 7 : (vm.contentAssetPlans.length > 0 ? 6 : 5)}
          title="证据附件"
          className="mb-4"
        >
          <EvidenceSection evidence={vm.evidence} />
        </Section>

        {/* Footer */}
        <footer className="mt-6 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
          {SERVICE_BRAND_NAME} · 企业GEO诊断报告 · {formatDate(vm.reportDate)}
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  index: number;
  title: string;
  children: ReactNode;
  className?: string;
}

function Section({ index, title, children, className = "" }: SectionProps) {
  return (
    <section className={`rounded-xl border border-neutral-200 bg-white ${className}`}>
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
        <span className="text-xs font-medium text-neutral-400">{String(index).padStart(2, "0")}</span>
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function HighlightItem({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-xs text-neutral-500">{label}</span>
      <span className="flex-1 text-xs text-neutral-700">{text}</span>
    </div>
  );
}

function OpportunityCard({ opportunity, index }: { opportunity: EnterpriseReportViewModel["informationOpportunities"][number]; index: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
          {index}
        </span>
        <h3 className="flex-1 text-sm font-semibold text-neutral-900">{opportunity.title}</h3>
      </div>
      <dl className="space-y-1 text-xs">
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-neutral-500">客户关注</dt>
          <dd className="flex-1 text-neutral-700 break-words overflow-wrap-anywhere">{opportunity.customerQuestion}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-neutral-500">当前情况</dt>
          <dd className="flex-1 text-neutral-600 leading-[1.65]">{opportunity.currentStatus}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-neutral-500">建议资产</dt>
          <dd className="flex-1 text-neutral-700">{opportunity.suggestedAsset}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-neutral-500">商业价值</dt>
          <dd className="flex-1 text-neutral-600 leading-[1.65]">{opportunity.businessValue}</dd>
        </div>
      </dl>
    </div>
  );
}

function CompetitorObservationCard({ observation }: { observation: NonNullable<EnterpriseReportViewModel["competitorObservations"]>[number] }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-white p-2.5">
      <span className="mt-0.5 shrink-0 text-neutral-400">·</span>
      <div className="flex-1">
        <p className="text-xs font-medium text-neutral-700">{observation.dimension}</p>
        <p className="mt-0.5 text-xs text-neutral-600 leading-[1.65]">{observation.observation}</p>
      </div>
    </div>
  );
}

function AssetPlanCard({ plan, index }: { plan: EnterpriseReportViewModel["contentAssetPlans"][number]; index: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
          {String.fromCharCode(64 + index)}
        </span>
        <h3 className="flex-1 text-sm font-semibold text-neutral-900">{plan.title}</h3>
      </div>
      <ul className="space-y-0.5">
        {plan.suggestedAssets.map((asset, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-neutral-600">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
            <span>{asset}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-neutral-100 pt-1.5 text-xs text-neutral-500 leading-[1.65]">{plan.businessValue}</p>
    </div>
  );
}

function RoadmapInline() {
  const stages = [
    { goal: "整理企业事实与内容口径", output: "品牌、产品、品质和合作基础资料" },
    { goal: "建设客户决策内容", output: "产品指南、FAQ、品质说明、合作页面和案例内容" },
    { goal: "持续验证与迭代", output: "公开信息检查、客户问题复测和内容更新建议" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stages.map((stage, i) => (
        <div key={i} className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <span className="text-xs font-semibold text-neutral-700">阶段{i + 1}</span>
          </div>
          <p className="text-xs font-medium text-neutral-800">{stage.goal}</p>
          <p className="mt-1 text-xs text-neutral-500">输出：{stage.output}</p>
        </div>
      ))}
    </div>
  );
}

function EvidenceSection({ evidence }: { evidence: EnterpriseReportViewModel["evidence"] }) {
  const [expanded, setExpanded] = useState(false);

  // Count by source type with Chinese labels
  const sourceCounts = evidence.items.reduce<Record<string, number>>((acc, item) => {
    const labels: Record<string, string> = {
      FIRST_PARTY_EVIDENCE: "企业官方证据",
      OBSERVED_WEB_EVIDENCE: "公开网络证据",
      COMPETITOR_WEB_EVIDENCE: "竞品公开证据",
    };
    const label = labels[item.sourceType] ?? item.sourceType;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const sourceSummary = Object.entries(sourceCounts)
    .map(([type, count]) => `${count}条${type}`)
    .join(" · ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-neutral-500 transition hover:text-neutral-700"
      >
        <span>{expanded ? "收起" : `查看 ${evidence.items.length} 条证据（${sourceSummary}）`}</span>
      </button>
      {expanded && (
        <div className="mt-3">
          <EvidenceView vm={evidence} />
        </div>
      )}
    </div>
  );
}

const SERVICE_COLLAB_ITEMS = [
  "企业知识资产整理",
  "客户决策内容建设",
  "GEO内容体系规划",
  "持续诊断与优化建议",
];
