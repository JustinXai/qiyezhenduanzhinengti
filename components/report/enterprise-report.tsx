"use client";

import type { ReactNode } from "react";
import type { EnterpriseReportViewModel } from "../../src/contracts";
import { ScoreHeadline } from "./score-card";
import { EvidenceTag } from "./badges";
import { CtaSection } from "./cta-section";
import { Roadmap } from "./roadmap";
import { formatDate } from "./labels";
import { PRIMARY_CTA_LABEL, SECONDARY_CTA_LABEL, SERVICE_BRAND_NAME } from "../../src/product/customer-copy";
import { EvidenceView } from "./evidence-view";
import { useState } from "react";

// ============================================================================
// Round-9: Enterprise GEO Consulting Report
//
// Single unified report — no Quick/Deep tabs.
// All 9 modules visible by default; Evidence as expandable attachment.
// Visual style: consulting report PDF — 900px max, clean whitespace,
// enterprise-grade typography, minimal technical labels.
//
// 9-module structure:
//   1. 决策摘要
//   2. 企业现状分析
//   3. 客户决策问题分析
//   4. AI检索场景观察
//   5. GEO机会地图
//   6. 内容资产建设建议
//   7. 优先行动路线
//   8. 星媄数据服务方向
//   9. 证据附件
// ============================================================================

interface EnterpriseReportProps {
  vm: EnterpriseReportViewModel;
}

interface ReportSection {
  index: number;
  title: string;
  body: ReactNode;
}

export function EnterpriseReport({ vm }: EnterpriseReportProps) {
  const sections: ReportSection[] = [];

  // -------------------------------------------------------------------------
  // Module 1: 决策摘要
  // -------------------------------------------------------------------------
  sections.push({
    index: 1,
    title: "决策摘要",
    body: (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{vm.brandName}</h1>
          <p className="mt-1 text-sm text-neutral-500">报告日期 {formatDate(vm.reportDate)}</p>
        </div>

        <p className="text-base leading-relaxed text-neutral-800">
          {vm.enterpriseStatusSummary}
        </p>

        <ScoreHeadline
          overallScore={vm.overallScore}
          scoreCoverage={vm.scoreCoverage}
          composition={vm.measurementComposition}
        />

        {vm.estimationNotice && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {vm.estimationNotice}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid="primary-cta"
            className="flex-1 rounded-lg bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            {PRIMARY_CTA_LABEL}
          </button>
          <button
            type="button"
            data-testid="secondary-cta"
            className="flex-1 rounded-lg border border-neutral-300 px-6 py-3.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
          >
            {SECONDARY_CTA_LABEL}
          </button>
        </div>
      </div>
    ),
  });

  // -------------------------------------------------------------------------
  // Module 2: 企业现状分析
  // -------------------------------------------------------------------------
  sections.push({
    index: 2,
    title: "企业现状分析",
    body: (
      <div className="space-y-4">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">企业信息基础</h3>
          <p className="text-sm leading-relaxed text-neutral-700">
            {vm.enterpriseStatusDescription}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">业务理解</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-neutral-500">行业</dt>
              <dd className="text-neutral-800">烘焙食品、休闲食品</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-neutral-500">品牌</dt>
              <dd className="text-neutral-800">{vm.brandName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-neutral-500">信息基础</dt>
              <dd className="text-neutral-800">官网已有品牌介绍、产品体系、质量研发等板块内容</dd>
            </div>
          </dl>
        </div>
      </div>
    ),
  });

  // -------------------------------------------------------------------------
  // Module 3: 客户决策问题分析
  // -------------------------------------------------------------------------
  {
    const { total, supported, partial, unanswered } = vm.questionCoverageStats;
    sections.push({
      index: 3,
      title: "客户决策问题分析",
      body: (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="总问题" value={total} />
            <StatCard label="完整覆盖" value={supported} tone="positive" />
            <StatCard label="部分覆盖" value={partial} tone="neutral" />
            <StatCard label="待补充" value={unanswered} tone="negative" />
          </div>
          <div className="space-y-3">
            {vm.customerQuestions.map((q, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-neutral-900">{q.questionText}</p>
                  <CoverageBadge status={q.coverageStatus} />
                </div>
                <dl className="mt-2 space-y-1.5 border-t border-neutral-100 pt-2 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-neutral-500">当前信息</dt>
                    <dd className="text-neutral-600">{q.currentInformation}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-neutral-500">完善方向</dt>
                    <dd className="text-neutral-600">{q.improvementDirection}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      ),
    });
  }

  // -------------------------------------------------------------------------
  // Module 4: AI检索场景观察
  // -------------------------------------------------------------------------
  sections.push({
    index: 4,
    title: "AI检索场景观察",
    body: (
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">
          以下内容用于观察：企业在公开网络的信息是否能够支撑客户常见问题。并非对AI推荐结果的评价。
        </p>
        {vm.aiObservations.length > 0 ? (
          <div className="space-y-3">
            {vm.aiObservations.map((obs, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 p-4">
                <div className="mb-2 text-sm font-medium text-neutral-900">{obs.questionText}</div>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-medium text-neutral-500">当前情况</dt>
                    <dd className="text-neutral-600">{obs.currentStatus}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-medium text-neutral-500">建议</dt>
                    <dd className="text-neutral-600">{obs.suggestedAsset}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">本次检查的问题已有充分公开信息支撑。</p>
        )}
      </div>
    ),
  });

  // -------------------------------------------------------------------------
  // Module 5: GEO机会地图
  // -------------------------------------------------------------------------
  sections.push({
    index: 5,
    title: "GEO机会地图",
    body: (
      <div className="space-y-4">
        {vm.geoOpportunities.length > 0 ? (
          <div className="space-y-3">
            {vm.geoOpportunities.map((opp, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {i + 1}
                  </span>
                  <h3 className="text-base font-semibold text-neutral-900">{opp.title}</h3>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-medium text-neutral-500">客户问题</dt>
                    <dd className="text-neutral-700">{opp.customerQuestion}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-medium text-neutral-500">当前状态</dt>
                    <dd className="text-neutral-600">{opp.currentStatus}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-medium text-neutral-500">建议资产</dt>
                    <dd className="text-neutral-600">{opp.suggestedAsset}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 font-medium text-neutral-500">商业价值</dt>
                    <dd className="text-neutral-600">{opp.businessValue}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">暂未识别到明确的GEO机会，建议结合企业实际情况进一步分析。</p>
        )}
      </div>
    ),
  });

  // -------------------------------------------------------------------------
  // Module 6: 内容资产建设建议
  // -------------------------------------------------------------------------
  sections.push({
    index: 6,
    title: "内容资产建设建议",
    body: (
      <div className="space-y-3">
        {vm.contentAssets.length > 0 ? (
          <div className="space-y-3">
            {vm.contentAssets.map((asset, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 p-4">
                <h3 className="mb-2 text-sm font-semibold text-neutral-800">{asset.category}</h3>
                <ul className="space-y-1">
                  {asset.items.map((item, ji) => (
                    <li key={ji} className="flex items-center gap-2 text-sm text-neutral-600">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">建议结合企业实际情况定制内容建设方案。</p>
        )}
      </div>
    ),
  });

  // -------------------------------------------------------------------------
  // Module 7: 优先行动路线
  // -------------------------------------------------------------------------
  sections.push({
    index: 7,
    title: "优先行动路线",
    body: <Roadmap />,
  });

  // -------------------------------------------------------------------------
  // Module 8: 星媄数据服务方向
  // -------------------------------------------------------------------------
  sections.push({
    index: 8,
    title: "星媄数据服务方向",
    body: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutral-700">
          {SERVICE_BRAND_NAME}可协助企业进行以下方面的工作，具体实施方案需结合企业实际情况进一步确认。
        </p>
        <div className="space-y-2.5">
          {SERVICE_DIRECTIONS.map((d, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600">
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-neutral-800">{d.title}</p>
                <p className="mt-0.5 text-neutral-600">{d.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  });

  // -------------------------------------------------------------------------
  // Module 9: 证据附件（默认折叠）
  // -------------------------------------------------------------------------
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  sections.push({
    index: 9,
    title: "证据附件",
    body: (
      <div>
        <button
          type="button"
          onClick={() => setEvidenceExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-neutral-600 transition hover:text-neutral-900"
        >
          <span className="text-xs">{evidenceExpanded ? "收起" : `查看 ${vm.evidence.items.length} 条证据`}</span>
        </button>
        {evidenceExpanded && (
          <div className="mt-4">
            <EvidenceView vm={vm.evidence} />
          </div>
        )}
      </div>
    ),
  });

  return (
    <div className="mx-auto min-h-screen bg-neutral-50">
      {/* Report header */}
      <div className="bg-white">
        <div className="mx-auto max-w-[900px] px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-400">{SERVICE_BRAND_NAME}</p>
              <h1 className="mt-0.5 text-lg font-semibold text-neutral-900">企业GEO诊断报告</h1>
            </div>
            <p className="text-right text-xs text-neutral-400">
              {vm.brandName}<br />
              {formatDate(vm.reportDate)}
            </p>
          </div>
        </div>
      </div>

      {/* Report body */}
      <div className="mx-auto max-w-[900px] space-y-6 px-6 py-8">
        {sections.map((section) => (
          <ReportSectionCard key={section.index} index={section.index} title={section.title}>
            {section.body}
          </ReportSectionCard>
        ))}
      </div>

      {/* Report footer */}
      <div className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-[900px] px-6 py-6">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{SERVICE_BRAND_NAME} · 企业GEO诊断报告</span>
            <span>报告日期 {formatDate(vm.reportDate)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReportSectionCard({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-neutral-400">{String(index).padStart(2, "0")}</span>
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "positive" | "neutral" | "negative" }) {
  const cls =
    tone === "positive"
      ? "bg-green-50 text-green-800"
      : tone === "negative"
        ? "bg-red-50 text-red-700"
        : "bg-neutral-100 text-neutral-700";
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl p-3 ${cls}`}>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="mt-0.5 text-[10px]">{label}</span>
    </div>
  );
}

function CoverageBadge({ status }: { status: string }) {
  const cls =
    status === "完整覆盖"
      ? "bg-green-100 text-green-700"
      : status === "部分覆盖"
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

const SERVICE_DIRECTIONS: { title: string; description: string }[] = [
  { title: "企业知识资产整理", description: "协助企业梳理和结构化现有公开信息，识别信息缺口。" },
  { title: "GEO内容体系建设", description: "规划并建设面向客户决策问题的内容资产，提升AI搜索可见度。" },
  { title: "客户问题覆盖优化", description: "针对高价值客户问题，提供内容建设方向建议。" },
  { title: "AI搜索表现持续分析", description: "持续监测企业公开信息在AI搜索场景中的覆盖情况。" },
];
