"use client";

import type { ReactNode } from "react";
import type { EnterpriseReportViewModel } from "../../src/contracts";
import { ScoreHeadline } from "./score-card";
import { CtaSection } from "./cta-section";
import { Roadmap } from "./roadmap";
import { formatDate } from "./labels";
import { PRIMARY_CTA_LABEL, SECONDARY_CTA_LABEL, SERVICE_BRAND_NAME } from "../../src/product/customer-copy";
import { EvidenceView } from "./evidence-view";
import { useState } from "react";

// ============================================================================
// Round-9.1 FINAL: Enterprise GEO Consulting Report
// Density and Mobile Readability Optimization
//
// Single unified report — no Quick/Deep tabs.
// Modules conditionally hidden when no valid content.
//
// 7-module structure:
//   01 决策摘要
//   02 企业现状分析
//   03 客户需求与信息机会
//   04 内容资产建设建议
//   05 优先行动路线
//   06 星媄数据服务方向
//   07 证据附件
//
// Semantic correction (Round-9.1):
//   - informationOpportunities from priorityDirections, NOT formal GEO opportunities
//   - 不得把公开信息完善方向伪装成正式GEO机会
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
        <header className="mb-5 flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <p className="text-xs text-neutral-400">{SERVICE_BRAND_NAME}</p>
            <h1 className="mt-0.5 text-base font-semibold text-neutral-900">企业GEO诊断报告</h1>
          </div>
          <div className="text-right text-xs text-neutral-400">
            <div>{vm.brandName}</div>
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

              <p className="text-sm leading-relaxed text-neutral-700">{vm.enterpriseStatusSummary}</p>

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
          {/* Two-column compact layout */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <h3 className="mb-1.5 text-xs font-semibold text-neutral-500">公开网络已识别</h3>
              <p className="text-sm text-neutral-700 leading-relaxed">{vm.enterpriseStatusDescription}</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <h3 className="mb-1.5 text-xs font-semibold text-neutral-500">已有基础</h3>
              <p className="text-sm text-neutral-700 leading-relaxed">
                {vm.topStrength?.statement ?? "企业已在公开渠道具备基础信息展示。"}
              </p>
            </div>
          </div>
        </Section>

        {/* Module 03: 客户需求与信息机会 */}
        {vm.informationOpportunities.length > 0 && (
          <Section index={3} title="客户需求与信息机会" className="mb-4">
            <p className="mb-3 text-xs text-neutral-500">
              以下信息机会来源于公开网络分析，反映客户在决策过程中关注的问题。
            </p>
            {/* Two-column cards on desktop, single on mobile */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {vm.informationOpportunities.slice(0, 3).map((opp, i) => (
                <OpportunityCard key={i} opportunity={opp} index={i + 1} />
              ))}
            </div>
          </Section>
        )}

        {/* Module 04: 内容资产建设建议 */}
        {vm.contentAssets.length > 0 && (
          <Section index={4} title="内容资产建设建议" className="mb-4">
            {/* Three-column on desktop, single on mobile */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {vm.contentAssets.map((asset, i) => (
                <AssetCard key={i} asset={asset} />
              ))}
            </div>
          </Section>
        )}

        {/* Module 05: 优先行动路线 */}
        <Section index={5} title="优先行动路线" className="mb-4">
          <Roadmap />
        </Section>

        {/* Module 06: 星媄数据服务方向 */}
        <Section index={6} title="星媄数据服务方向" className="mb-4">
          <p className="mb-3 text-xs text-neutral-500">
            {SERVICE_BRAND_NAME}可协助企业进行以下工作，具体方案需结合实际情况确认。
          </p>
          {/* 2x2 grid on desktop, single on mobile */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SERVICE_DIRECTIONS.map((d, i) => (
              <ServiceItem key={i} title={d.title} description={d.description} />
            ))}
          </div>
        </Section>

        {/* Module 07: 证据附件 */}
        <Section index={7} title="证据附件" className="mb-4">
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
          <dd className="flex-1 text-neutral-700 break-words">{opportunity.customerQuestion}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-neutral-500">当前情况</dt>
          <dd className="flex-1 text-neutral-600">{opportunity.currentStatus}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-neutral-500">建议资产</dt>
          <dd className="flex-1 text-neutral-700">{opportunity.suggestedAsset}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-neutral-500">商业价值</dt>
          <dd className="flex-1 text-neutral-600">{opportunity.businessValue}</dd>
        </div>
      </dl>
    </div>
  );
}

function AssetCard({ asset }: { asset: EnterpriseReportViewModel["contentAssets"][number] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
      <h4 className="mb-1 text-xs font-semibold text-neutral-700">{asset.category}</h4>
      <ul className="space-y-0.5">
        {asset.items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs text-neutral-600">
            <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-white p-2.5">
      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-600">
        ·
      </span>
      <div>
        <p className="text-xs font-medium text-neutral-800">{title}</p>
        <p className="mt-0.5 text-[11px] text-neutral-500">{description}</p>
      </div>
    </div>
  );
}

function EvidenceSection({ evidence }: { evidence: EnterpriseReportViewModel["evidence"] }) {
  const [expanded, setExpanded] = useState(false);

  // Count by source type
  const sourceCounts = evidence.items.reduce<Record<string, number>>((acc, item) => {
    const source = item.sourceType.replace(/_/g, "");
    acc[source] = (acc[source] || 0) + 1;
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

const SERVICE_DIRECTIONS: { title: string; description: string }[] = [
  { title: "企业知识资产整理", description: "梳理现有公开信息，识别信息缺口" },
  { title: "GEO内容体系建设", description: "规划面向客户决策问题的内容资产" },
  { title: "客户问题覆盖优化", description: "提供内容建设方向建议" },
  { title: "AI搜索表现分析", description: "持续监测AI搜索场景中的覆盖情况" },
];
