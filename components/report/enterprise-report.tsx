"use client";

import type { ReactNode } from "react";
import type { EnterpriseReportViewModel, LimitedReportDataV1, ReputationAndPublicOpinionSnapshotV1 } from "../../src/contracts";
import { ScoreHeadline } from "./score-card";
import { formatDate } from "./labels";
import { PRIMARY_CTA_LABEL, SECONDARY_CTA_LABEL, SERVICE_BRAND_NAME } from "../../src/product/customer-copy";
import { useEffect, useState } from "react";
import { buildReputationReportSummary, type ReputationEvidenceSummary } from "../../src/diagnosis/reputation/report-summary";

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
  if (vm.executionMode === "LIMITED_PUBLIC_SCAN" && vm.limitedReport) {
    return <LimitedEnterpriseReport vm={vm} />;
  }
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
          <FullSalesReadinessBlock vm={vm} />
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
  id?: string;
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

function FullSalesReadinessBlock({ vm }: { vm: EnterpriseReportViewModel }) {
  const rows = buildFullSalesReadinessRows(vm);
  return (
    <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700">销售判断</p>
          <h3 className="mt-1 text-base font-semibold text-neutral-900">GEO成交准备度</h3>
        </div>
        <p className="max-w-[360px] text-xs leading-relaxed text-neutral-500">
          报告要回答客户为什么现在需要买GEO服务，而不是只看分数。
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <article key={row.title} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-neutral-900">{row.title}</h4>
              <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-500">{row.status}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-600">{row.salesImpact}</p>
            <p className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-xs font-medium leading-relaxed text-emerald-900">
              首期应搭配服务：{row.servicePackage}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function buildFullSalesReadinessRows(vm: EnterpriseReportViewModel) {
  const hasMeasuredAi = vm.measurementComposition.measuredWeight > 0;
  const hasContentPlans = vm.contentAssetPlans.length > 0;
  const hasCompetitorSignal = Boolean(vm.competitorObservations && vm.competitorObservations.length > 0);
  return [
    {
      title: "AI可见度曝光",
      status: hasMeasuredAi ? "已纳入诊断" : "需持续复测",
      salesImpact: "企业需要把品牌事实、服务解释和客户问题整理成稳定页面，才有机会被AI和搜索正确引用。",
      servicePackage: "AI问题库、品牌事实页、服务页、阶段复测",
    },
    {
      title: "舆情与信任阻力",
      status: "必须保留",
      salesImpact: "客户搜索后是否继续咨询，取决于公开舆情、案例、资质、服务边界和回应机制是否能消除顾虑。",
      servicePackage: "舆情核实、信任内容资产、公开回应入口",
    },
    {
      title: "客户决策阻力",
      status: hasContentPlans ? "已有方向" : "需补内容",
      salesImpact: "如果客户关心的问题没有公开答案，销售就要反复解释，成交周期会被拉长。",
      servicePackage: "客户FAQ、适合人群说明、案例与交付页",
    },
    {
      title: "竞争与转化路径",
      status: hasCompetitorSignal ? "已有观察" : "证据不足",
      salesImpact: "客户会拿同行公开信息做比较；企业也需要清晰咨询入口，把搜索曝光转成可跟进线索。",
      servicePackage: "同行信源对照、咨询入口页、销售链接包",
    },
  ];
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
    { goal: "整理企业事实与内容口径", output: "品牌、课程服务、信任依据和咨询基础资料" },
    { goal: "建设客户决策内容", output: "课程说明、FAQ、服务保障、咨询入口和案例内容" },
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
  const [filter, setFilter] = useState("全部");

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
  const filters = ["全部", "企业自身", "新闻媒体", "公开风险", "其他来源"];
  const filteredItems = evidence.items.filter((item) => evidenceFilterMatch(item, filter));

  return (
    <>
      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-[16px] font-semibold text-slate-800">
          查看 {evidence.items.length} 条证据（{sourceSummary}）
        </summary>
        <div>
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`rounded border px-3 py-1.5 text-[14px] ${filter === item ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {filteredItems.length > 0 ? filteredItems.map((item) => <CompactEvidenceRow key={item.id} item={item} />) : (
                <p className="p-4 text-[14px] text-slate-500">当前筛选下暂无证据。</p>
              )}
            </div>
          </div>
        </div>
      </details>
      <div className="hidden print:block">
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {evidence.items.map((item) => <CompactEvidenceRow key={`print-${item.id}`} item={item} />)}
        </div>
      </div>
    </>
  );
}

type EvidenceItemForDisplay = EnterpriseReportViewModel["evidence"]["items"][number];

function evidenceFilterMatch(item: EvidenceItemForDisplay, filter: string) {
  const text = `${item.title} ${item.sourceDomain} ${item.summaryZh ?? ""}`;
  if (filter === "全部") return true;
  if (filter === "企业自身") return item.sourceType === "FIRST_PARTY_EVIDENCE";
  if (filter === "新闻媒体") return /新闻|媒体|news|sina|sohu|163|qq/.test(text);
  if (filter === "公开风险") return /风险|司法|投诉|纠纷|退费|案件|处罚/.test(text);
  return item.sourceType !== "FIRST_PARTY_EVIDENCE" && !/新闻|媒体|风险|司法|投诉|纠纷|退费|案件|处罚/.test(text);
}

function CompactEvidenceRow({ item }: { item: EvidenceItemForDisplay }) {
  return (
    <article className="grid grid-cols-1 gap-2 p-4 text-[14px] leading-[1.6] md:grid-cols-[minmax(0,1fr)_190px]">
      <div className="min-w-0">
        <h3 className="break-words font-semibold text-slate-950 [overflow-wrap:anywhere]">{item.title}</h3>
        <p className="mt-1 text-slate-600">{item.summaryZh ?? item.snippet}</p>
        <a className="mt-2 inline-block break-all font-medium text-slate-700 underline underline-offset-4 [overflow-wrap:anywhere]" href={item.url} target="_blank" rel="noreferrer">
          原文链接
        </a>
      </div>
      <dl className="space-y-1 text-slate-500">
        <CompactMeta label="来源" value={item.sourceDomain} />
        <CompactMeta label="日期" value={item.fetchedAt.slice(0, 10)} />
        <CompactMeta label="类型" value={item.sourceTypeLabel ?? item.sourceType} />
        <CompactMeta label="追溯" value={item.url ? "已保留原文链接" : "需人工核验"} />
      </dl>
    </article>
  );
}

function CompactMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-2">
      <dt>{label}</dt>
      <dd className="break-words text-slate-700 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

const SERVICE_COLLAB_ITEMS = [
  "企业知识资产整理",
  "舆情与口碑问题整理",
  "客户决策内容建设",
  "GEO内容体系规划",
  "持续诊断与优化建议",
];

function LimitedEnterpriseReport({ vm }: EnterpriseReportProps) {
  const limited = vm.limitedReport!;
  const activeSectionId = useActiveSection(SECTION_IDS);
  const report = limited.mvpReport;
  if (!report) {
    return <LegacyLimitedEnterpriseReport vm={vm} />;
  }
  const dimensions = report.score.dimensions;
  const reputationSummary = buildReputationReportSummary(report.reputation);
  const topPainPoints = report.coreIssues.slice(0, 3).map((issue) => ({
    title: issue.title,
    customerImpact: customerImpactForIssue(issue.title),
    action: issue.direction,
  }));
  const priorityGroups = {
    priority: report.coreIssues.filter((issue) => issue.priority === "P0"),
    improvement: report.coreIssues.filter((issue) => issue.priority === "P1"),
    continuous: report.coreIssues.filter((issue) => issue.priority === "P2"),
  };
  const hasHighReputationRisk = reputationSummary.negativeSignalCount > 0 && reputationSummary.riskLevel === "HIGH";
  const firstRecommendedAction = hasHighReputationRisk
    ? "先核实公开风险信息并建立统一说明入口。"
    : "优先完成企业信任信息、核心服务说明和客户高频问题内容的统一梳理，让客户在搜索后能更快理解企业、建立信任并发起咨询。";
  const weightedFoundationScore = weightedPublicFoundationScore(dimensions);
  const reputationScore = normalizedScore(dimensions[1]?.score, dimensions[1]?.maxScore);
  const buildingDimensions = [dimensions[0], dimensions[2], dimensions[3], dimensions[4], dimensions[5]].filter((dimension): dimension is NonNullable<Dimension> => Boolean(dimension));
  if (report.score.overall === null) {
    return (
      <InsufficientEvidenceGEOPage
        companyName={report.overview.companyName}
        industry={report.overview.industry}
        region={report.overview.region}
        reportDate={report.overview.reportDate}
        readinessScore={limited.readinessScore}
        contentPlans={report.contentPlans}
        roadmap={report.roadmap}
        requestedMaterials={limited.requestedMaterials}
        reputation={report.reputation}
      />
    );
  }
  const navGroups = reportNavGroups();
  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-[16px] leading-[1.75] text-slate-800 md:text-[17px] md:leading-[1.72] print:bg-white print:pb-0">
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between print:border-slate-300">
          <div>
            <p className="text-[14px] font-medium text-slate-700">{SERVICE_BRAND_NAME}</p>
            <p className="mt-1 text-[14px] text-slate-500">企业公开信息基础扫描</p>
          </div>
          <p className="text-[14px] text-slate-500">扫描日期 {formatDate(report.overview.reportDate)}</p>
        </header>

        <div className="sticky top-0 z-10 mb-5 lg:hidden print:hidden">
          <MobileNav groups={navGroups} activeId={activeSectionId} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="sticky top-5 hidden h-fit rounded-lg border border-slate-200 bg-white p-4 lg:block print:hidden">
            <p className="text-[13px] font-semibold text-slate-500">报告目录</p>
            <nav className="mt-3 space-y-3">
              {navGroups.map((group) => (
                <a
                  key={group.href}
                  href={group.href}
                  className={`block rounded border px-2 py-2 text-[14px] transition ${activeSectionId === group.href.slice(1) ? "border-slate-900 bg-slate-900 text-white" : "border-transparent text-slate-700 hover:bg-slate-50"}`}
                >
                  <span className={`font-semibold ${activeSectionId === group.href.slice(1) ? "text-white" : "text-slate-900"}`}>{group.index}</span> {group.title}
                  <span className={`mt-1 block text-[12px] leading-[1.45] ${activeSectionId === group.href.slice(1) ? "text-slate-200" : "text-slate-500"}`}>{group.children.join(" / ")}</span>
                </a>
              ))}
            </nav>
          </aside>

          <main className="min-w-0">
        <CustomerSection id="overview" index={1} title="诊断总览" className="mb-6">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <div>
                <h1 className="break-words text-[28px] font-semibold leading-[1.16] text-slate-950 md:text-[38px]">
                  {report.overview.companyName}
                </h1>
                <div className="mt-3 flex flex-wrap gap-2 text-[14px] text-slate-600">
                  <span className="rounded border border-slate-200 bg-white px-3 py-1">{report.overview.industry}</span>
                  <span className="rounded border border-slate-200 bg-white px-3 py-1">{report.overview.region}</span>
                </div>
              </div>
              <div className="xl:hidden">
                <HeroMetricStack
                  overallScore={report.score.overall}
                  scoreLevel={report.score.level}
                  reputationScore={reputationScore}
                  riskLevel={reputationSummary.riskLevel}
                  weightedScore={weightedFoundationScore}
                  hasCriticalRisk={hasHighReputationRisk}
                />
              </div>
              <p className="max-w-[760px] text-[17px] leading-[1.72] text-slate-700">
                {customerSummary(hasHighReputationRisk)}
              </p>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[14px] font-semibold text-slate-500">第一优先行动</p>
                <p className="mt-2 text-[19px] font-semibold leading-[1.45] text-slate-950">
                  {firstRecommendedAction}
                </p>
              </div>
              <CtaRow hasHighReputationRisk={hasHighReputationRisk} />
            </div>

            <div className="hidden space-y-4 xl:block">
              <HeroMetricStack
                overallScore={report.score.overall}
                scoreLevel={report.score.level}
                reputationScore={reputationScore}
                riskLevel={reputationSummary.riskLevel}
                weightedScore={weightedFoundationScore}
                hasCriticalRisk={hasHighReputationRisk}
              />
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-[19px] font-semibold text-stone-950">最影响客户决策的三个问题</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {topPainPoints.map((item) => <PainPointCard key={item.title} item={item} />)}
            </div>
          </div>
        </CustomerSection>

        <CustomerSection id="scores" index={2} title="评分结构" className="mb-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-950">公开信息建设能力</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {buildingDimensions.map((dimension) => <DimensionScoreCard key={dimension.id} dimension={dimension} />)}
              </div>
            </div>
            <div>
              <h3 className="text-[18px] font-semibold text-slate-950">客户信任风险</h3>
              <ReputationRiskScoreCard dimension={dimensions[1]} riskLevel={reputationSummary.riskLevel} />
            </div>
          </div>
        </CustomerSection>

        <ReputationCustomerSection index={3} id="reputation" report={report} dimension={dimensions[1]} />

        <CustomerSection id="geo-foundation" index={4} title="GEO与行业、客户决策分析" className="mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {industryCards(report.industryAnalysis).map((item) => <InsightCard key={item.title} title={item.title} body={item.body} />)}
          </div>
        </CustomerSection>

        <CustomerSection index={5} title="公开信源与内容资产诊断" className="mb-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DimensionSummary dimension={dimensions[0]} conclusion={dimensionConclusion("sourceFoundation")} />
            <DimensionSummary dimension={dimensions[2]} conclusion={dimensionConclusion("contentAssets")} />
          </div>
          <CollapsibleDiagnostics
            title="查看公开信源与内容资产逐项检查"
            rows={[
              ...report.sourceFoundationRows.slice(0, 3).map((row) => ({ title: row.sourceType, status: row.status, current: row.finding, impact: row.decisionImpact, action: row.optimization })),
              ...report.contentAssetRows.slice(0, 3).map((row) => ({ title: row.item, status: statusFromScore(row.score), current: row.currentStatus, impact: row.impact, action: row.recommendation })),
            ]}
          />
        </CustomerSection>

        <DimensionCustomerSection index={6} title="客户搜索与AI问答准备度" dimension={dimensions[3]} conclusion={dimensionConclusion("customerScenarios")} rows={report.customerScenarioRows.slice(0, 5).map((row) => ({ title: row.scenario, status: row.answerability, current: row.question, impact: row.impact, action: row.recommendedContent }))} />

        <TrustConversionSection
          index={7}
          trustDimension={dimensions[4]}
          conversionDimension={dimensions[5]}
          trustRows={dimensionRowsFromFindings(dimensions[4])}
          conversionRows={dimensionRowsFromFindings(dimensions[5])}
        />

        <CustomerSection id="action-plan" index={8} title="核心GEO问题深度诊断" className="mb-6">
          <PrioritySummary groups={priorityGroups} />
          <div className="mt-4 space-y-4">{report.coreIssues.slice(0, 3).map((issue) => <IssueBlock key={issue.title} issue={issue} />)}</div>
        </CustomerSection>

        <CustomerSection index={9} title="GEO建设方案与30/60/90天路线" className="mb-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{report.contentPlans.map((plan) => <PlanBlock key={plan.title} plan={plan} />)}</div>
          <p className="my-5 rounded-lg bg-emerald-50 p-4 text-[16px] leading-[1.7] text-stone-800">
            首期启动建议：优先完成企业事实确认、核心信任信息整理和客户高频问题建设，再进入持续内容发布和复测。
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{report.roadmap.map((stage, index) => <RoadmapStage key={stage.stage} stage={stage} index={index} />)}</div>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CooperationCard />
            <XingmeiDeliveryCard />
          </div>
          <p className="mt-5 rounded-lg bg-stone-50 p-4 text-[14px] leading-[1.7] text-stone-500">
            报告判断基于本次公开检索范围；未发现表示当前公开渠道中未检索到清晰信息，不代表企业现实中一定不存在相关资料。
          </p>
          <div className="mt-5">
            <CtaRow hasHighReputationRisk={hasHighReputationRisk} />
          </div>
        </CustomerSection>

        <CustomerSection id="evidence" index={10} title="证据附件" className="mb-6">
          <EvidenceSection evidence={vm.evidence} />
        </CustomerSection>

        <footer className="mt-6 border-t border-emerald-900/10 pt-4 text-center text-[14px] text-stone-500">{SERVICE_BRAND_NAME} · 企业GEO诊断报告 · {formatDate(vm.reportDate)}</footer>
          </main>
        </div>
      </div>
    </div>
  );
}

function InsufficientEvidenceGEOPage({
  companyName,
  industry,
  region,
  reportDate,
  readinessScore,
  contentPlans,
  roadmap,
  requestedMaterials,
  reputation,
}: {
  companyName: string;
  industry: string;
  region: string;
  readinessScore: LimitedReportDataV1["readinessScore"];
  contentPlans: NonNullable<LimitedReportDataV1["mvpReport"]>["contentPlans"];
  roadmap: NonNullable<LimitedReportDataV1["mvpReport"]>["roadmap"];
  requestedMaterials: LimitedReportDataV1["requestedMaterials"];
  reputation?: ReputationAndPublicOpinionSnapshotV1;
  reportDate: string;
}) {
  const primaryPlans = contentPlans.slice(0, 4);
  const materials = requestedMaterials.slice(0, 6);
  const salesReadinessRows = buildLimitedSalesReadinessRows(reputation);
  const situation = limitedReportSituation(readinessScore, reputation);
  return (
    <div className="min-h-screen bg-slate-50 pb-16 text-[16px] leading-[1.75] text-slate-800 md:text-[17px] md:leading-[1.72] print:bg-white">
      <div className="mx-auto max-w-[980px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[14px] font-medium text-slate-700">{SERVICE_BRAND_NAME}</p>
            <p className="mt-1 text-[14px] text-slate-500">企业GEO建设启动建议</p>
          </div>
          <p className="text-[14px] text-slate-500">生成日期 {formatDate(reportDate)}</p>
        </header>

        <main className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-[680px]">
                <p className="text-[14px] font-semibold text-rose-700">风险警示 · {situation.label} · 暂不生成诊断报告</p>
                <h1 className="mt-2 break-words text-[28px] font-semibold leading-[1.18] text-slate-950 md:text-[38px]">
                  {companyName} 需要先补齐可被客户和AI引用的公开资料基础
                </h1>
                <div className="mt-3 flex flex-wrap gap-2 text-[14px] text-slate-600">
                  <span className="rounded border border-slate-200 bg-white px-3 py-1">{industry}</span>
                  <span className="rounded border border-slate-200 bg-white px-3 py-1">{region}</span>
                </div>
                <p className="mt-4 text-[18px] leading-[1.75] text-slate-700">
                  {situation.summary}
                </p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-950 lg:w-[280px]">
                <p className="text-[14px] font-semibold">当前客户感知风险</p>
                <p className="mt-2 text-[40px] font-semibold leading-none">{situation.riskScore}</p>
                <p className="mt-1 text-[13px] font-medium text-rose-700">非经营评分，是公开信息成交阻力判断</p>
                <div className="mt-3 h-2 overflow-hidden rounded bg-white">
                  <div className="h-full rounded bg-rose-700" style={{ width: `${situation.riskScore}%` }} />
                </div>
                <p className="mt-3 text-[15px] font-semibold leading-[1.55]">{situation.primaryAction}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CustomerButton primary>预约GEO建设沟通</CustomerButton>
              <CustomerButton>获取企业GEO优化方案</CustomerButton>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6">
            <h2 className="text-[23px] font-semibold leading-[1.25] text-slate-950 md:text-[26px]">这属于哪一种GEO成交风险</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <SituationCard active={situation.kind === "NO_DATA"} title="1. 资料缺失型" body="客户和AI找不到足够资料，不能判断企业是谁、做什么、凭什么可信。重点不是打低分，而是先把可被引用的数字化信源建起来。" />
              <SituationCard active={situation.kind === "BAD_REPUTATION"} title="2. 舆情阻断型" body="客户能搜到企业，但负面、投诉、退费或争议信息更醒目。先处理事实核实、回应说明和信任修复，否则曝光越多阻力越大。" />
              <SituationCard active={situation.kind === "LOW_VISIBILITY"} title="3. 可见度不足型" body="企业有部分资料，舆情也不算差，但AI和客户问题覆盖弱。需要建设内容资产、FAQ、案例和咨询路径，把曝光转成咨询。" />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[14px] font-semibold text-emerald-800">销售判断</p>
                <h2 className="mt-1 text-[23px] font-semibold leading-[1.25] text-slate-950 md:text-[26px]">GEO成交准备度缺口</h2>
              </div>
              <p className="max-w-[360px] text-[15px] leading-[1.65] text-slate-500">
                报告要回答客户为什么现在需要买GEO服务，而不是只看分数。
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              {salesReadinessRows.map((row) => (
                <div key={row.title} className="grid grid-cols-1 border-b border-slate-200 last:border-b-0 lg:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_220px]">
                  <div className="bg-slate-50 p-4">
                    <p className="text-[16px] font-semibold text-slate-950">{row.title}</p>
                    <p className="mt-1 text-[13px] font-medium text-slate-500">{row.status}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-[13px] font-semibold text-slate-500">当前缺口</p>
                    <p className="mt-1 text-[15px] leading-[1.65] text-slate-700">{row.currentGap}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-[13px] font-semibold text-slate-500">为什么影响成交</p>
                    <p className="mt-1 text-[15px] leading-[1.65] text-slate-700">{row.salesImpact}</p>
                  </div>
                  <div className="bg-emerald-50 p-4">
                    <p className="text-[13px] font-semibold text-emerald-800">首期应搭配服务</p>
                    <p className="mt-1 text-[15px] font-medium leading-[1.65] text-emerald-950">{row.servicePackage}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6">
            <h2 className="text-[23px] font-semibold leading-[1.25] text-slate-950 md:text-[26px]">首期GEO服务应该先做什么</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {primaryPlans.map((plan) => <PlanBlock key={plan.title} plan={plan} />)}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6">
            <h2 className="text-[23px] font-semibold leading-[1.25] text-slate-950 md:text-[26px]">30/60/90天GEO建设计划</h2>
            <p className="mt-2 text-[16px] leading-[1.7] text-slate-600">
              这不是内部项目排期，而是给客户看的建设路径：先解决“看不到”，再解决“看不懂、不信任”，最后进入持续复测。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {roadmap.map((stage, index) => <RoadmapStage key={stage.stage} stage={stage} index={index} />)}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6">
            <h2 className="text-[23px] font-semibold leading-[1.25] text-slate-950 md:text-[26px]">企业只需要先准备这些材料</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {materials.map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-[16px] font-medium text-slate-800">
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-[16px] leading-[1.7] text-stone-800">
              建设完成后，再用同一套公开资料进行正式GEO诊断、客户问题覆盖检查和AI问答样本测试，报告才有可解释、可复测、可执行的价值。
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6">
            <h2 className="text-[23px] font-semibold leading-[1.25] text-slate-950 md:text-[26px]">星媄数据可以交付什么</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <CooperationCard />
              <XingmeiDeliveryCard />
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CustomerButton primary>预约GEO建设沟通</CustomerButton>
              <CustomerButton>获取企业GEO优化方案</CustomerButton>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function buildLimitedSalesReadinessRows(reputation?: ReputationAndPublicOpinionSnapshotV1) {
  const hasReputationRisk = Boolean(reputation && reputation.complaintSignals.length > 0 && reputation.riskLevel !== "UNKNOWN");
  return [
    {
      title: "AI可见度曝光",
      status: "需要先建信源",
      currentGap: "公开资料还没有形成稳定、结构化、可引用的企业事实页和客户问题答案页。",
      salesImpact: "AI和搜索只能引用已公开、可抓取、表达清楚的内容；信息分散时，客户问AI也难得到正确介绍。",
      servicePackage: "品牌事实页 + AI问答内容库 + 阶段复测",
    },
    {
      title: "舆情与信任阻力",
      status: hasReputationRisk ? "优先核实" : "仍需建设",
      currentGap: hasReputationRisk
        ? "本次公开检索已经出现客户可见风险信号，需要先核实事实、处理状态和公开回应口径。"
        : "本次未形成明确负面结论，但公开正向口碑、案例、服务边界和回应机制仍不足。",
      salesImpact: hasReputationRisk
        ? "客户搜索到风险信息后，会先暂停咨询或要求销售解释；没有统一回应入口会直接拉高成交阻力。"
        : "没有负面不等于足够可信；高客单服务仍需要案例、团队、边界和公开评价来降低顾虑。",
      servicePackage: hasReputationRisk ? "舆情核实 + 回应说明页 + 信任修复内容" : "信任内容资产 + 案例评价结构 + 服务边界说明",
    },
    {
      title: "客户决策阻力",
      status: "解释链不足",
      currentGap: "客户还难以一次看清企业主体、服务对象、具体交付、团队依据、收费边界和隐私规则。",
      salesImpact: "这些问题不在公开页面被回答，销售就要反复人工解释，客户也更容易转去比较信息更完整的同行。",
      servicePackage: "项目页 + FAQ + 适合人群/不适合人群说明",
    },
    {
      title: "咨询转化路径",
      status: "入口需重建",
      currentGap: "公开入口没有把客户从了解、判断、提问自然带到预约咨询或首访诊断。",
      salesImpact: "客户即使产生兴趣，也缺少明确下一步；这会让曝光停留在浏览，不能沉淀成可跟进线索。",
      servicePackage: "咨询入口页 + 首访诊断表 + 销售链接包",
    },
  ];
}

function SituationCard({ active, title, body }: { active: boolean; title: string; body: string }) {
  return (
    <article className={`rounded-lg border p-4 ${active ? "border-rose-200 bg-rose-50 text-rose-950" : "border-slate-200 bg-white text-slate-800"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[18px] font-semibold md:text-[19px]">{title}</h3>
        {active && <span className="rounded bg-white px-2.5 py-1 text-[13px] font-semibold text-rose-800">当前状态</span>}
      </div>
      <p className={`mt-2 text-[16px] leading-[1.72] ${active ? "text-rose-900" : "text-slate-600"}`}>{body}</p>
    </article>
  );
}

function limitedReportSituation(
  readinessScore: LimitedReportDataV1["readinessScore"],
  reputation?: ReputationAndPublicOpinionSnapshotV1,
) {
  const hasReputationRisk = Boolean(reputation && reputation.complaintSignals.length > 0 && reputation.riskLevel !== "UNKNOWN");
  if (hasReputationRisk) {
    return {
      kind: "BAD_REPUTATION" as const,
      label: "舆情阻断型",
      riskScore: 90,
      primaryAction: "先做舆情核实、回应口径和信任修复，再扩大AI曝光。",
      summary: "本次公开资料还不足以支撑正式诊断，同时已经出现客户可见的风险或争议信号。对企业来说，问题不是简单低分，而是客户搜索后可能先看到阻力：如果没有统一回应、事实说明和信任内容，AI可见度越高，客户疑虑也会被同步放大。",
    };
  }
  if (readinessScore.checkedWeight < 0.35 || readinessScore.score === null) {
    return {
      kind: "NO_DATA" as const,
      label: "资料缺失型",
      riskScore: 85,
      primaryAction: "先把企业事实、服务说明、信任依据和咨询入口做成可引用信源。",
      summary: "本次公开资料不足以支撑一份可信诊断报告。对企业来说，这不是分数问题，而是数字化和网络化基础还没有形成：客户搜索时难以一次看清企业是谁、提供什么、是否可信、如何咨询；AI问答也缺少稳定、可引用的企业事实材料。",
    };
  }
  return {
    kind: "LOW_VISIBILITY" as const,
    label: "可见度不足型",
    riskScore: 72,
    primaryAction: "围绕客户高频问题补齐内容资产，并持续复测AI问答表现。",
    summary: "企业已经有一定公开资料，也没有形成高风险舆情结论，但客户和AI仍难以获得完整、结构化、可引用的答案。此时报告重点应从基础建档转向客户问题覆盖、服务内容表达、案例信任和咨询转化路径建设。",
  };
}

function customerSummary(hasHighReputationRisk = false) {
  if (hasHighReputationRisk) {
    return "当前公开搜索中已经出现可能影响客户信任和报名决策的企业风险信息，同时课程、师资、收费和服务说明仍不完整。建议第一阶段先核实风险信息、整理处理状态和公开说明，再建设课程内容、客户问答和咨询入口。";
  }
  return "当前企业已经具备部分公开信息基础，但客户在进一步了解服务、专业能力、流程和咨询方式时，仍难以从公开渠道获得完整答案。建议优先统一企业信任信息和核心服务内容，再逐步覆盖客户高频问题。";
}

const SECTION_IDS = ["overview", "reputation", "geo-foundation", "action-plan", "evidence"] as const;

function useActiveSection(ids: readonly string[]) {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-20% 0px -60% 0px",
        threshold: [0.2, 0.45, 0.7],
      },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}

function reportNavGroups() {
  return [
    { index: "01", title: "诊断总览", href: "#overview", children: ["综合指数", "第一行动"] },
    { index: "02", title: "风险与信任", href: "#reputation", children: ["舆情与口碑", "信任与咨询转化"] },
    { index: "03", title: "GEO建设基础", href: "#geo-foundation", children: ["行业与客户决策", "公开信源与内容资产", "客户搜索与AI问答"] },
    { index: "04", title: "问题与行动方案", href: "#action-plan", children: ["核心问题", "GEO建设方案", "30/60/90天路线"] },
    { index: "05", title: "证据附件", href: "#evidence", children: ["证据列表"] },
  ];
}

function MobileNav({ groups, activeId }: { groups: ReturnType<typeof reportNavGroups>; activeId: string }) {
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white/95 p-2 backdrop-blur">
      {groups.map((group) => (
        <a
          key={group.href}
          href={group.href}
          className={`shrink-0 rounded border px-3 py-2 text-[14px] font-medium transition ${activeId === group.href.slice(1) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}
        >
          {group.index} {group.title}
        </a>
      ))}
    </nav>
  );
}

function CtaRow({ hasHighReputationRisk }: { hasHighReputationRisk: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <CustomerButton primary>{hasHighReputationRisk ? "获取舆情核实清单与首期信任修复方案" : "预约报告解读"}</CustomerButton>
      <CustomerButton>{hasHighReputationRisk ? "预约报告解读" : "获取首期建设方案"}</CustomerButton>
      <a href="#evidence" className="text-[15px] font-medium text-slate-500 underline underline-offset-4">补充企业资料</a>
    </div>
  );
}

function HeroMetricStack({
  overallScore,
  scoreLevel,
  reputationScore,
  riskLevel,
  weightedScore,
  hasCriticalRisk,
}: {
  overallScore: number | null;
  scoreLevel: string;
  reputationScore: number | null;
  riskLevel: string;
  weightedScore: number | null;
  hasCriticalRisk: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_168px] xl:grid-cols-1">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[14px] font-semibold text-slate-500">综合诊断指数</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-[58px] font-semibold leading-none text-slate-950 md:text-[64px]">{overallScore ?? "未评分"}</span>
            {overallScore !== null && <span className="pb-2 text-[20px] text-slate-500">/100</span>}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100">
            <div className="h-full rounded bg-slate-800" style={{ width: `${overallScore ?? 0}%` }} />
          </div>
          <p className="mt-3 text-[19px] font-semibold text-slate-900">
            {overallScore === null ? "证据不足，暂不评分" : scoreLevel}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-1 xl:grid-cols-1">
          <SnapshotPill label="公开建设" value={weightedScore === null ? "未评分" : `${weightedScore}分`} tone="slate" />
          <SnapshotPill label="风险等级" value={reputationRiskLabel(riskLevel)} tone="rose" />
        </div>
      </div>

      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-rose-800">舆情与口碑</p>
            <p className="mt-1 text-[28px] font-semibold leading-none text-rose-950">{reputationScore === null ? "未评分" : `${reputationScore}分`}</p>
          </div>
          <span className="rounded bg-white px-2.5 py-1 text-[13px] font-semibold text-rose-800">客户搜索与信任风险：{reputationRiskLabel(riskLevel)}</span>
        </div>
      </div>

      <ScoreExplanation weightedScore={weightedScore} overallScore={overallScore} hasCriticalRisk={hasCriticalRisk} />
    </div>
  );
}

function SnapshotPill({ label, value, tone }: { label: string; value: string; tone: "slate" | "rose" }) {
  const style = tone === "rose"
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : "border-slate-200 bg-slate-50 text-slate-900";
  return (
    <div className={`rounded-lg border p-3 ${style}`}>
      <p className="text-[12px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-[18px] font-semibold">{value}</p>
    </div>
  );
}

function ScoreExplanation({ weightedScore, overallScore, hasCriticalRisk }: { weightedScore: number | null; overallScore: number | null; hasCriticalRisk: boolean }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 print:hidden">
      <summary className="cursor-pointer text-[15px] font-semibold text-slate-700">查看评分说明</summary>
      <div className="mt-3 space-y-2 text-[14px] leading-[1.65] text-slate-600">
        <MetricLine label="基础加权结果" value={weightedScore === null ? "未评分" : `${weightedScore}分`} />
        <MetricLine label="关键风险校正" value={hasCriticalRisk ? "P0信任风险触发综合分上限40分" : "未触发关键风险上限"} />
        <MetricLine label="最终综合诊断指数" value={overallScore === null ? "未评分" : `${overallScore}分`} />
        <p>{overallScore === null ? "当前证据覆盖不足，系统不会输出综合诊断指数；请补充官网、正文页面或可核验公开来源后复测。" : "综合分不是六项简单平均，而是包含维度权重；P0关键风险会触发上限。本评分用于诊断启发，不是第三方权威评级。"}</p>
      </div>
    </details>
  );
}

function DimensionScoreCard({ dimension }: { dimension: NonNullable<Dimension> }) {
  const score = normalizedScore(dimension.score, dimension.maxScore);
  const stats = dimensionStats(dimension);
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold leading-[1.35] text-slate-950">{shortDimensionTitle(dimension.title)}</h3>
            <p className="mt-1 text-[13px] text-slate-500">{stats}</p>
          </div>
          <span className="text-[20px] font-semibold text-slate-900">{score === null ? "未查" : `${score}分`}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full rounded bg-teal-700" style={{ width: `${score ?? 0}%` }} />
        </div>
      </summary>
      <div className="mt-4 space-y-2">
        {dimension.findings.map((finding) => (
          <div key={finding.title} className="rounded border border-slate-100 bg-slate-50 p-3 text-[14px] leading-[1.55]">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-slate-800">{finding.title}</span>
              <span className="shrink-0 text-slate-500">{finding.score === null ? "未查" : `${finding.score}分`}</span>
            </div>
            <p className="mt-1 text-slate-600">{finding.currentStatus}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function ReputationRiskScoreCard({ dimension, riskLevel }: { dimension: Dimension; riskLevel: string }) {
  const score = normalizedScore(dimension?.score, dimension?.maxScore);
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold leading-[1.35] text-rose-950">舆情与口碑</h3>
          <p className="mt-1 text-[13px] text-rose-700">客户搜索与信任风险：{reputationRiskLabel(riskLevel)}</p>
        </div>
        <span className="text-[22px] font-semibold text-rose-950">{score === null ? "未查" : `${score}分`}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded bg-white">
        <div className="h-full rounded bg-rose-700" style={{ width: `${score ?? 0}%` }} />
      </div>
    </div>
  );
}

function dimensionStats(dimension: NonNullable<Dimension>) {
  const checked = dimension.findings.filter((finding) => finding.score !== null).length;
  const missing = dimension.findings.filter((finding) => finding.status === "NOT_FOUND_IN_CHECKED_SCOPE").length;
  const partial = dimension.findings.filter((finding) => finding.status === "PARTIALLY_FOUND").length;
  const clear = dimension.findings.filter((finding) => finding.status === "CLEARLY_FOUND").length;
  return `共检查${checked}项，${missing}项明显不足，${partial}项需要完善，${clear}项已有基础`;
}

const SCORE_WEIGHTS: Record<string, number> = {
  sourceFoundation: 0.2,
  reputationAndPublicOpinion: 0.2,
  contentAssets: 0.2,
  customerScenarios: 0.15,
  trustInformation: 0.15,
  conversionPath: 0.1,
};

function weightedPublicFoundationScore(dimensions: NonNullable<LimitedReportDataV1["mvpReport"]>["score"]["dimensions"]): number | null {
  let weighted = 0;
  let weightSum = 0;
  for (const dimension of dimensions) {
    const score = normalizedScore(dimension.score, dimension.maxScore);
    const weight = SCORE_WEIGHTS[dimension.id] ?? 0;
    if (score === null || weight <= 0) continue;
    weighted += score * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? Math.round(weighted / weightSum) : null;
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded bg-stone-50 px-3 py-2">
      <span>{label}</span>
      <span className="font-semibold text-stone-950">{value}</span>
    </div>
  );
}

function normalizedScore(score: number | null | undefined, max: number | undefined) {
  if (score === null || score === undefined || !max) return null;
  return Math.round((score / max) * 100);
}

function shortDimensionTitle(title: string) {
  return title
    .replace("基础信源与企业身份", "基础信源")
    .replace("服务或产品内容资产", "内容资产")
    .replace("客户搜索场景覆盖", "客户搜索场景")
    .replace("舆情与口碑", "舆情与口碑");
}

function CustomerSection({ id, index, title, children, className = "" }: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-5 rounded-lg border border-slate-200 bg-white ${className} print:break-inside-avoid`}>
      <div className="border-b border-slate-200 px-4 py-4 md:px-5">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-slate-500">{String(index).padStart(2, "0")}</span>
          <h2 className="text-[23px] font-semibold leading-[1.25] text-slate-950 md:text-[26px]">{title}</h2>
        </div>
      </div>
      <div className="p-4 md:p-5">
        {children}
      </div>
    </section>
  );
}

type Dimension = NonNullable<LimitedReportDataV1["mvpReport"]>["score"]["dimensions"][number] | undefined;
type CustomerRow = { title: string; status: string; current: string; impact: string; action: string };

function ReputationCustomerSection({ id, index, report, dimension }: { id?: string; index: number; report: NonNullable<LimitedReportDataV1["mvpReport"]>; dimension: Dimension }) {
  const summary = buildReputationReportSummary(report.reputation);
  return (
    <CustomerSection id={id} index={index} title="舆情与口碑诊断" className="mb-6">
      <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[19px] font-semibold text-stone-950">舆情与口碑 {normalizedScore(dimension?.score, dimension?.maxScore) ?? "未检查"}分</p>
          <p className="text-[14px] text-stone-500">风险等级 {reputationRiskLabel(summary.riskLevel)}</p>
        </div>
        <p className="mt-2 text-[16px] leading-[1.72] text-stone-700">客户结论：{summary.summary}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[14px] text-stone-600 md:grid-cols-5">
          <span>检索覆盖 {summary.searchCoverageConfidence}</span>
          <span>名称匹配 {summary.nameMatchConfidence}</span>
          <span>主体确认 {summary.underlyingEntityConfidence}</span>
          <span>事件归属 {summary.eventAttributionConfidence}</span>
          <span>事实具体性 {summary.factualSpecificityConfidence}</span>
          <span>客户可见度 {summary.customerVisibilityConfidence}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-[14px] text-stone-700 md:grid-cols-3">
          <MetricLine label="底层风险线索" value={`${summary.underlyingNegativeEventCount}类`} />
          <MetricLine label="客户可见入口" value={`${summary.customerVisibleEntryCount}个`} />
          <MetricLine label="可追溯原始来源" value={`${summary.independentOriginalSourceCount}个`} />
        </div>
      </div>

      {summary.issueThemes.length > 0 ? (
        <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4">
          <h3 className="text-[18px] font-semibold text-stone-950">主要舆情情况</h3>
          <div className="mt-3 space-y-2 text-[16px] leading-[1.72] text-stone-700">
            {summary.issueThemes.map((item) => (
              <p key={item.theme}><span className="font-medium text-stone-950">{item.theme}</span>：发现 {item.count} 条相关信息，{item.summary}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4 text-[16px] leading-[1.72] text-stone-700">
        <p>{summary.deductionExplanation}</p>
        <p className="mt-2">
          {summary.responseSignalCount > 0
            ? "公开渠道中发现企业回应或处理信息，但尚未形成集中、统一的公开说明。"
            : "本次暂未发现集中、清晰的企业公开回应。"}
        </p>
      </div>

      <details className="rounded-lg border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer text-[16px] font-semibold text-emerald-900">查看舆情依据（{summary.matchedEvidenceCount} 条）</summary>
        <div className="mt-4 grid grid-cols-1 gap-4">
          {summary.representativeEvidence.length > 0 ? (
            summary.representativeEvidence.map((item) => <ReputationEvidenceCard key={`${item.url}-${item.title}`} item={item} />)
          ) : (
            <p className="text-[16px] leading-[1.72] text-stone-700">本次公开检索暂未匹配到相关证据；这不等于现实中不存在舆情，建议后续持续复查。</p>
          )}
        </div>
      </details>
    </CustomerSection>
  );
}

function ReputationEvidenceCard({ item }: { item: ReputationEvidenceSummary }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="break-words text-[18px] font-semibold leading-[1.35] text-stone-950 [overflow-wrap:anywhere] md:text-[19px]">{item.title}</h3>
        <span className="w-fit rounded bg-stone-100 px-2.5 py-1 text-[14px] font-medium text-stone-700">{item.evidenceType}</span>
      </div>
      <dl className="mt-3 space-y-3 text-[16px] leading-[1.72]">
        <DetailRow label="来源" value={`${item.sourceCategory} · ${item.source}`} />
        <DetailRow label="日期" value={item.date ?? "未标注日期"} />
        <DetailRow label="摘要" value={item.summary} />
      </dl>
      <a className="mt-3 inline-block break-all text-[15px] font-medium text-emerald-800 underline underline-offset-2 [overflow-wrap:anywhere]" href={item.url} target="_blank" rel="noreferrer">
        查看原文链接
      </a>
    </article>
  );
}

function DimensionCustomerSection({ index, title, dimension, conclusion, rows }: { index: number; title: string; dimension: Dimension; conclusion: string; rows: CustomerRow[] }) {
  return (
    <CustomerSection index={index} title={title} className="mb-6">
      <div className="mb-4 rounded-lg bg-emerald-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[19px] font-semibold text-stone-950">{shortDimensionTitle(dimension?.title ?? title)} {normalizedScore(dimension?.score, dimension?.maxScore) ?? "未检查"}分</p>
          <p className="text-[14px] text-stone-500">板块综合评分</p>
        </div>
        <p className="mt-2 text-[16px] leading-[1.72] text-stone-700">客户结论：{conclusion}</p>
      </div>
      <CollapsibleDiagnostics title={`查看${title}逐项检查`} rows={rows} />
    </CustomerSection>
  );
}

function TrustConversionSection({ index, trustDimension, conversionDimension, trustRows, conversionRows }: { index: number; trustDimension: Dimension; conversionDimension: Dimension; trustRows: CustomerRow[]; conversionRows: CustomerRow[] }) {
  return (
    <CustomerSection index={index} title="信任与咨询转化诊断" className="mb-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <DimensionSummary dimension={trustDimension} conclusion={dimensionConclusion("trustInformation")} />
          <CollapsibleDiagnostics title="查看信任信息逐项检查" rows={trustRows} />
        </div>
        <div>
          <DimensionSummary dimension={conversionDimension} conclusion={dimensionConclusion("conversionPath")} />
          <CollapsibleDiagnostics title="查看咨询转化逐项检查" rows={conversionRows} />
        </div>
      </div>
    </CustomerSection>
  );
}

function DimensionSummary({ dimension, conclusion }: { dimension: Dimension; conclusion: string }) {
  return (
    <div className="rounded-lg bg-emerald-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[19px] font-semibold text-stone-950">{shortDimensionTitle(dimension?.title ?? "诊断板块")} {normalizedScore(dimension?.score, dimension?.maxScore) ?? "未检查"}分</p>
        <p className="text-[14px] text-stone-500">板块综合评分</p>
      </div>
      <p className="mt-2 text-[16px] leading-[1.72] text-stone-700">客户结论：{conclusion}</p>
    </div>
  );
}

function DiagnosticCard({ row }: { row: CustomerRow }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="break-words text-[18px] font-semibold leading-[1.35] text-stone-950 md:text-[19px]">{row.title}</h3>
        <span className="w-fit rounded bg-stone-100 px-2.5 py-1 text-[14px] font-medium text-stone-700">{customerStatus(row.status)}</span>
      </div>
      <dl className="mt-3 space-y-3 text-[16px] leading-[1.72]">
        <DetailRow label="当前发现" value={row.current} />
        <DetailRow label="客户影响" value={row.impact} />
        <DetailRow label="建议动作" value={row.action} />
      </dl>
    </article>
  );
}

function CollapsibleDiagnostics({ title, rows }: { title: string; rows: CustomerRow[] }) {
  const missing = rows.filter((row) => /未发现|无法回答|基本无法|需要回应/.test(row.status)).length;
  const partial = rows.filter((row) => /部分|只能部分|已发现/.test(row.status)).length;
  const clear = rows.filter((row) => /清晰/.test(row.status)).length;
  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-[16px] font-semibold text-slate-800">
        {title}
        <span className="ml-2 text-[13px] font-normal text-slate-500">共{rows.length}项，{missing}项明显不足，{partial}项需要完善，{clear}项已有基础</span>
      </summary>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((row) => <DiagnosticCard key={`${title}-${row.title}-${row.current}`} row={row} />)}
      </div>
    </details>
  );
}

function dimensionRowsFromFindings(dimension: Dimension): CustomerRow[] {
  return (dimension?.findings ?? []).map((finding) => ({
    title: finding.title,
    status: statusFromScore(finding.score),
    current: finding.currentStatus,
    impact: finding.impact,
    action: finding.recommendation,
  }));
}

function IssueBlock({ issue }: { issue: NonNullable<LimitedReportDataV1["mvpReport"]>["coreIssues"][number] }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[18px] font-semibold text-stone-950 md:text-[19px]">{issue.title}</h3>
        <PriorityBadge priority={issue.priority} />
      </div>
      <dl className="mt-3 space-y-3 text-[16px] leading-[1.72]">
        <DetailRow label="问题本质" value={issue.essence} />
        <DetailRow label="为何处理" value={customerImpactForIssue(issue.title)} />
        <DetailRow label="建设动作" value={issue.direction} />
      </dl>
    </article>
  );
}

function PlanBlock({ plan }: { plan: NonNullable<LimitedReportDataV1["mvpReport"]>["contentPlans"][number] }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[18px] font-semibold text-stone-950 md:text-[19px]">{plan.title}</h3>
      </div>
      <dl className="mt-3 space-y-3 text-[16px] leading-[1.72]">
        <DetailRow label="建设内容" value={plan.buildContent} />
        <DetailRow label="解决问题" value={plan.solvesProblem} />
        <DetailRow label="建议载体" value={plan.recommendedCarrier} />
        <DetailRow label="星媄交付" value={plan.deliverables.slice(0, 2).join("、")} />
      </dl>
    </article>
  );
}

function RoadmapStage({ stage, index }: { stage: NonNullable<LimitedReportDataV1["mvpReport"]>["roadmap"][number]; index: number }) {
  const target = stage.stage === "0-30天" ? "统一企业事实和核心信任信息" : stage.stage === "31-60天" ? "补齐服务内容、客户问题和咨询入口" : "持续发布、复测和优化";
  return (
    <article className="relative rounded-lg border border-slate-200 bg-white p-4 before:absolute before:left-5 before:top-10 before:hidden before:h-[calc(100%-2.5rem)] before:w-px before:bg-slate-200 sm:before:block lg:before:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[13px] font-semibold text-white">{index + 1}</span>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">阶段 {index + 1}</p>
            <h3 className="text-[18px] font-semibold text-stone-950 md:text-[19px]">{stage.stage}</h3>
          </div>
        </div>
        <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-600 sm:inline-flex">{target}</span>
      </div>
      <dl className="mt-3 space-y-3 text-[16px] leading-[1.72]">
        <DetailRow label="目标" value={target} />
        <DetailRow label="企业配合" value={stage.companyActions[0] ?? ""} />
        <DetailRow label="星媄动作" value={stage.xingmeiDeliverables[0] ?? ""} />
        <DetailRow label="完成标志" value={stage.acceptanceCriteria[0] ?? ""} />
      </dl>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[82px_1fr] sm:gap-3">
      <dt className="text-[14px] font-medium text-stone-500">{label}</dt>
      <dd className="break-words text-stone-700 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function CustomerButton({ children, primary = false, muted = false }: { children: ReactNode; primary?: boolean; muted?: boolean }) {
  const style = primary
    ? "bg-emerald-800 text-white hover:bg-emerald-900"
    : muted
      ? "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
      : "border border-emerald-800 bg-white text-emerald-900 hover:bg-emerald-50";
  return <button type="button" className={`min-h-12 rounded-lg px-5 py-3 text-[16px] font-semibold transition ${style}`}>{children}</button>;
}

function PriorityBadge({ priority }: { priority: "P0" | "P1" | "P2" }) {
  const style = priority === "P0"
    ? "bg-rose-50 text-rose-800 border-rose-200"
    : priority === "P1"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-700 border-slate-200";
  return <span className={`rounded border px-2.5 py-1 text-[14px] font-semibold ${style}`}>{priorityLabel(priority)}</span>;
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="text-[18px] font-semibold text-stone-950 md:text-[19px]">{title}</h3>
      <p className="mt-2 text-[16px] leading-[1.72] text-stone-700">{body}</p>
    </article>
  );
}

function PainPointCard({ item }: { item: { title: string; customerImpact: string; action: string } }) {
  return (
    <article className="rounded-lg border border-rose-100 bg-rose-50/50 p-4">
      <h3 className="text-[18px] font-semibold text-stone-950 md:text-[19px]">{item.title}</h3>
      <dl className="mt-3 space-y-3 text-[16px] leading-[1.72]">
        <DetailRow label="客户影响" value={item.customerImpact} />
        <DetailRow label="建议动作" value={item.action} />
      </dl>
    </article>
  );
}

function PrioritySummary({ groups }: { groups: { priority: Array<{ title: string }>; improvement: Array<{ title: string }>; continuous: Array<{ title: string }> } }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <MiniPriority title="先做事项" items={groups.priority.map((item) => item.title)} />
      <MiniPriority title="重点完善" items={groups.improvement.map((item) => item.title)} />
      <MiniPriority title="持续建设" items={groups.continuous.map((item) => item.title)} />
    </div>
  );
}

function MiniPriority({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg bg-emerald-50 p-4">
      <p className="text-[18px] font-semibold text-stone-950">{title}</p>
      <p className="mt-2 text-[16px] leading-[1.7] text-stone-700">{items.length > 0 ? items.join("、") : "暂无"}</p>
    </div>
  );
}

function CooperationCard() {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="text-[19px] font-semibold text-stone-950">企业需要配合什么</h3>
      <p className="mt-3 text-[16px] leading-[1.72] text-stone-700">
        企业只需配合提供与主体、服务、团队、流程、案例和现有公开渠道相关的资料。具体资料清单将在项目启动后，由星媄数据根据企业实际情况整理，无需一次性准备全部内容。
      </p>
      <p className="mt-2 text-[14px] text-stone-500">涉及敏感信息时，可以脱敏后提供。</p>
    </article>
  );
}

function XingmeiDeliveryCard() {
  const items = [
    ["企业公开信息梳理", "整理企业主体、服务、团队和信任信息，形成统一的公开知识基础。"],
    ["舆情与口碑问题整理", "整理投诉、退款、争议主题和企业可公开回应口径，形成信任修复内容。"],
    ["客户问题内容体系", "围绕客户真实决策问题，建设能够被理解和引用的问答与内容。"],
    ["重点页面和内容规划", "明确首期需要建设的页面、内容主题和公开入口。"],
    ["持续诊断与优化", "完成建设后持续复测公开信息和客户问题覆盖情况。"],
  ];
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="text-[19px] font-semibold text-stone-950">星媄数据可以帮助完成什么</h3>
      <div className="mt-3 space-y-3">
        {items.map(([title, body]) => (
          <div key={title}>
            <p className="text-[16px] font-semibold text-emerald-900">{title}</p>
            <p className="text-[15px] leading-[1.65] text-stone-600">{body}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function industryCards(items: string[]) {
  return [
    { title: "客户如何选择", body: items[0] ?? "客户会先确认企业身份、服务内容和咨询方式。" },
    { title: "哪些信息影响信任", body: items[1] ?? "主体、团队、服务流程和保障内容会影响客户是否继续咨询。" },
    { title: "优先建设什么", body: items[2] ?? "优先建设企业信任信息、服务说明和客户高频问题内容。" },
  ];
}

function dimensionConclusion(id: string) {
  const map: Record<string, string> = {
    sourceFoundation: "客户能够检索到部分企业信息，但目前缺少统一、清晰、容易确认的官方信息入口。",
    contentAssets: "现有公开内容能够提供部分基础介绍，但还不足以完整说明服务项目、专业团队、流程和注意事项。",
    customerScenarios: "客户直接搜索企业名称时可以获得部分信息，但进一步询问具体服务、流程和信任问题时，公开答案仍不完整。",
    trustInformation: "客户可以看到部分企业信息，但专业能力、服务依据和保障内容尚未形成集中展示。",
    conversionPath: "客户产生兴趣后，仍需要通过多个渠道确认联系方式、预约流程、收费边界和后续服务。",
  };
  return map[id] ?? "当前公开信息已有基础，但仍需要进一步集中整理。";
}

function customerStatus(status: string) {
  if (/需要回应/.test(status)) return "需要回应";
  if (/清晰|可清晰/.test(status)) return "信息较清晰";
  if (/部分|只能部分/.test(status)) return "已发现部分信息";
  if (/未发现|无法回答|基本无法/.test(status)) return "本次检索暂未发现";
  if (/未检查|尚未/.test(status)) return "本次尚未检查";
  return status;
}

function reputationRiskLabel(level: string | undefined) {
  if (level === "HIGH") return "高";
  if (level === "MEDIUM") return "中";
  if (level === "LOW") return "低";
  return "未检查";
}

function statusFromScore(score: number | null) {
  if (score === null) return "本次尚未检查";
  if (score >= 100) return "信息较清晰";
  if (score > 0) return "已发现部分信息";
  return "本次检索暂未发现";
}

function priorityLabel(priority: "P0" | "P1" | "P2") {
  return priority === "P0" ? "P0 立即处理" : priority === "P1" ? "P1 重点完善" : "P2 持续建设";
}

function customerImpactForIssue(title: string) {
  const map: Record<string, string> = {
    基础信源体系薄弱: "客户找到企业后，仍需要在多个入口之间确认企业主体、地址和官方信息，增加继续咨询前的判断成本。",
    服务内容资产不足: "客户想了解具体服务时，难以一次看清项目、流程和注意事项，容易停留在比较和观望阶段。",
    客户问题覆盖不足: "客户提出真实问题时，公开渠道给不出完整答案，会降低客户继续询问和预约的意愿。",
    信任信息不完整: "客户无法集中看到主体、专业团队和服务依据，信任建立速度会变慢。",
    咨询转化路径不清晰: "客户产生兴趣后，还要反复确认联系方式、预约流程和收费边界，下一步行动不够顺畅。",
    本地语义关联不足: "客户用地区和服务项目搜索时，企业信息与本地服务场景的连接不够集中，影响快速理解。",
    公开负面舆情影响品牌信任: "客户在搜索企业口碑时会同步看到投诉、退款或争议信息，如果缺少企业解释，会削弱继续咨询的信任感。",
    企业对投诉与争议信息缺少公开回应: "客户看到争议后找不到处理路径和服务边界说明，容易把个别争议理解为系统性风险。",
  };
  return map[title] ?? "客户需要花更多时间确认企业信息，影响理解、信任和下一步咨询。";
}

function LegacyLimitedEnterpriseReport({ vm }: EnterpriseReportProps) {
  const limited = vm.limitedReport!;
  const readiness = limited.readinessScore;
  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-4 flex items-center justify-between border-b border-neutral-200 pb-4">
          <div><p className="text-xs text-neutral-400">{SERVICE_BRAND_NAME}</p><h1 className="mt-0.5 text-base font-semibold text-neutral-900">企业GEO诊断报告</h1></div>
          <div className="text-right text-xs text-neutral-400"><div className="break-words">{vm.brandName}</div><div className="mt-0.5">{formatDate(vm.reportDate)}</div></div>
        </header>
        <Section index={1} title="GEO诊断总览" className="mb-4">
          <p className="text-sm leading-[1.65] text-neutral-700">{readiness.summary}</p>
        </Section>
      </div>
    </div>
  );
}
