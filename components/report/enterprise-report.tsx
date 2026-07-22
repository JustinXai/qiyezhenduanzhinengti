"use client";

import type { ReactNode } from "react";
import type { EnterpriseReportViewModel, LimitedReportDataV1 } from "../../src/contracts";
import { ScoreHeadline } from "./score-card";
import { formatDate } from "./labels";
import { PRIMARY_CTA_LABEL, SECONDARY_CTA_LABEL, SERVICE_BRAND_NAME } from "../../src/product/customer-copy";
import { EvidenceView } from "./evidence-view";
import { useState } from "react";
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
        className="flex items-center gap-2 text-[14px] text-stone-500 transition hover:text-stone-700"
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
  "舆情与口碑问题整理",
  "客户决策内容建设",
  "GEO内容体系规划",
  "持续诊断与优化建议",
];

function LimitedEnterpriseReport({ vm }: EnterpriseReportProps) {
  const limited = vm.limitedReport!;
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
  return (
    <div className="min-h-screen bg-[#f7f8f4] pb-20 text-[16px] leading-[1.75] text-stone-800 md:text-[17px] md:leading-[1.72]">
      <div className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-2 border-b border-emerald-900/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[14px] font-medium text-emerald-800">{SERVICE_BRAND_NAME}</p>
            <p className="mt-1 text-[14px] text-stone-500">企业GEO诊断报告</p>
          </div>
          <p className="text-[14px] text-stone-500">报告日期 {formatDate(report.overview.reportDate)}</p>
        </header>

        <CustomerSection index={1} title="GEO诊断总览" className="mb-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <div>
                <h1 className="break-words text-[27px] font-semibold leading-[1.18] text-stone-950 md:text-[34px]">
                  {report.overview.companyName}
                </h1>
                <div className="mt-3 flex flex-wrap gap-2 text-[14px] text-stone-600">
                  <span className="rounded bg-emerald-50 px-3 py-1">{report.overview.industry}</span>
                  <span className="rounded bg-emerald-50 px-3 py-1">{report.overview.region}</span>
                </div>
              </div>
              <p className="text-[17px] leading-[1.72] text-stone-700">
                {customerSummary()}
              </p>
              <div className="rounded-lg border border-emerald-900/10 bg-emerald-50 p-4">
                <p className="text-[14px] font-medium text-emerald-900">当前建议先启动的一件事</p>
                <p className="mt-2 text-[16px] leading-[1.7] text-stone-800">
                  优先完成企业信任信息、核心服务说明和客户高频问题内容的统一梳理，让客户在搜索后能更快理解企业、建立信任并发起咨询。
                </p>
              </div>
              {reputationSummary.negativeSignalCount > 0 ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <p className="text-[14px] font-medium text-rose-800">舆情提醒</p>
                  <p className="mt-2 text-[16px] leading-[1.7] text-stone-800">
                    公开舆情中已出现{reputationSummary.issueThemes.map((item) => item.theme).join("、")}相关信息，需要及时整理事实、处理状态和统一回应口径。
                  </p>
                </div>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <CustomerButton primary>预约报告解读</CustomerButton>
                <CustomerButton>获取首期建设方案</CustomerButton>
                <CustomerButton muted>补充企业资料</CustomerButton>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-900/10 bg-white p-5">
              <p className="text-[14px] text-stone-500">GEO公开信息基础指数</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-[56px] font-semibold leading-none text-emerald-800">{report.score.overall ?? "未评分"}</span>
                <span className="pb-2 text-[18px] text-stone-500">/100</span>
              </div>
              <p className="mt-2 text-[19px] font-semibold text-stone-900">{report.score.level}</p>
              <div className="mt-5 space-y-3">
                {dimensions.map((dimension) => (
                  <NormalizedScoreBar key={dimension.id} label={shortDimensionTitle(dimension.title)} score={normalizedScore(dimension.score, dimension.maxScore)} />
                ))}
              </div>
              <p className="mt-4 text-[14px] leading-[1.65] text-stone-500">
                该指数用于判断企业公开信息是否容易被客户和AI检索、理解和引用，不代表企业实际服务质量、市场份额或AI平台官方排名。
              </p>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-[19px] font-semibold text-stone-950">最影响客户决策的三个问题</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {topPainPoints.map((item) => <PainPointCard key={item.title} item={item} />)}
            </div>
          </div>
        </CustomerSection>

        <ReputationCustomerSection report={report} dimension={dimensions[1]} />

        <CustomerSection index={3} title="GEO与行业、客户决策分析" className="mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {industryCards(report.industryAnalysis).map((item) => <InsightCard key={item.title} title={item.title} body={item.body} />)}
          </div>
        </CustomerSection>

        <CustomerSection index={4} title="公开信源与内容资产诊断" className="mb-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DimensionSummary dimension={dimensions[0]} conclusion={dimensionConclusion("sourceFoundation")} />
            <DimensionSummary dimension={dimensions[2]} conclusion={dimensionConclusion("contentAssets")} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {report.sourceFoundationRows.slice(0, 3).map((row) => <DiagnosticCard key={`source-${row.sourceType}`} row={{ title: row.sourceType, status: row.status, current: row.finding, impact: row.decisionImpact, action: row.optimization }} />)}
            {report.contentAssetRows.slice(0, 3).map((row) => <DiagnosticCard key={`content-${row.item}`} row={{ title: row.item, status: statusFromScore(row.score), current: row.currentStatus, impact: row.impact, action: row.recommendation }} />)}
          </div>
        </CustomerSection>

        <DimensionCustomerSection index={5} title="客户搜索与AI问答准备度" dimension={dimensions[3]} conclusion={dimensionConclusion("customerScenarios")} rows={report.customerScenarioRows.slice(0, 5).map((row) => ({ title: row.scenario, status: row.answerability, current: row.question, impact: row.impact, action: row.recommendedContent }))} />

        <TrustConversionSection
          trustDimension={dimensions[4]}
          conversionDimension={dimensions[5]}
          trustRows={report.trustRiskRows.slice(0, 4).map((row) => ({ title: row.item, status: statusFromScore(row.score), current: row.currentStatus, impact: row.impact, action: row.recommendation }))}
          conversionRows={report.trustRiskRows.slice(4, 8).map((row) => ({ title: row.item, status: statusFromScore(row.score), current: row.currentStatus, impact: row.impact, action: row.recommendation }))}
        />

        <CustomerSection index={7} title="核心GEO问题深度诊断" className="mb-6">
          <PrioritySummary groups={priorityGroups} />
          <div className="mt-4 space-y-4">{report.coreIssues.slice(0, 3).map((issue) => <IssueBlock key={issue.title} issue={issue} />)}</div>
        </CustomerSection>

        <CustomerSection index={8} title="GEO建设方案" className="mb-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{report.contentPlans.map((plan) => <PlanBlock key={plan.title} plan={plan} />)}</div>
        </CustomerSection>

        <CustomerSection index={9} title="30/60/90天执行路线与合作方式" className="mb-6">
          <p className="mb-4 rounded-lg bg-emerald-50 p-4 text-[16px] leading-[1.7] text-stone-800">
            首期启动建议：优先完成企业事实确认、核心信任信息整理和客户高频问题建设，再进入持续内容发布和复测。
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{report.roadmap.map((stage) => <RoadmapStage key={stage.stage} stage={stage} />)}</div>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CooperationCard />
            <XingmeiDeliveryCard />
          </div>
          <p className="mt-5 rounded-lg bg-stone-50 p-4 text-[14px] leading-[1.7] text-stone-500">
            报告判断基于本次公开检索范围；未发现表示当前公开渠道中未检索到清晰信息，不代表企业现实中一定不存在相关资料。
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <CustomerButton primary>预约报告解读</CustomerButton>
            <CustomerButton>获取首期建设方案</CustomerButton>
            <CustomerButton muted>补充企业资料</CustomerButton>
          </div>
        </CustomerSection>

        <CustomerSection index={10} title="证据附件" className="mb-6">
          <EvidenceSection evidence={vm.evidence} />
        </CustomerSection>

        <footer className="mt-6 border-t border-emerald-900/10 pt-4 text-center text-[14px] text-stone-500">{SERVICE_BRAND_NAME} · 企业GEO诊断报告 · {formatDate(vm.reportDate)}</footer>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-emerald-900/10 bg-[#f7f8f4]/95 px-4 py-3 backdrop-blur sm:hidden">
        <button type="button" className="w-full rounded-lg bg-emerald-800 px-4 py-3 text-[16px] font-semibold text-white">预约报告解读</button>
      </div>
    </div>
  );
}

function customerSummary() {
  return "当前企业已经具备部分公开信息基础，但客户在进一步了解服务、专业能力、流程和咨询方式时，仍难以从公开渠道获得完整答案。建议优先统一企业信任信息和核心服务内容，再逐步覆盖客户高频问题。";
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

function NormalizedScoreBar({ label, score }: { label: string; score: number | null }) {
  const pct = score ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[15px]">
        <span className="text-stone-700">{label}</span>
        <span className="font-semibold text-emerald-800">{score === null ? "未检查" : `${score}分`}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded bg-emerald-100">
        <div className="h-full rounded bg-emerald-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CustomerSection({ index, title, children, className = "" }: SectionProps) {
  return (
    <section className={`rounded-lg border border-emerald-900/10 bg-white ${className}`}>
      <div className="border-b border-emerald-900/10 px-4 py-4 md:px-5">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-emerald-700">{String(index).padStart(2, "0")}</span>
          <h2 className="text-[23px] font-semibold leading-[1.25] text-stone-950 md:text-[26px]">{title}</h2>
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

function ReputationCustomerSection({ report, dimension }: { report: NonNullable<LimitedReportDataV1["mvpReport"]>; dimension: Dimension }) {
  const summary = buildReputationReportSummary(report.reputation);
  return (
    <CustomerSection index={2} title="舆情与口碑诊断" className="mb-6">
      <div className="mb-4 rounded-lg bg-emerald-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[19px] font-semibold text-stone-950">舆情与口碑 {normalizedScore(dimension?.score, dimension?.maxScore) ?? "未检查"}分</p>
          <p className="text-[14px] text-stone-500">风险等级 {reputationRiskLabel(summary.riskLevel)}</p>
        </div>
        <p className="mt-2 text-[16px] leading-[1.72] text-stone-700">客户结论：{summary.summary}</p>
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((row) => <DiagnosticCard key={`${title}-${row.title}-${row.current}`} row={row} />)}
      </div>
    </CustomerSection>
  );
}

function TrustConversionSection({ trustDimension, conversionDimension, trustRows, conversionRows }: { trustDimension: Dimension; conversionDimension: Dimension; trustRows: CustomerRow[]; conversionRows: CustomerRow[] }) {
  return (
    <CustomerSection index={6} title="信任与咨询转化诊断" className="mb-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <DimensionSummary dimension={trustDimension} conclusion={dimensionConclusion("trustInformation")} />
          <div className="mt-4 grid grid-cols-1 gap-4">{trustRows.map((row) => <DiagnosticCard key={`trust-${row.title}`} row={row} />)}</div>
        </div>
        <div>
          <DimensionSummary dimension={conversionDimension} conclusion={dimensionConclusion("conversionPath")} />
          <div className="mt-4 grid grid-cols-1 gap-4">{conversionRows.map((row) => <DiagnosticCard key={`conversion-${row.title}`} row={row} />)}</div>
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

function IssueBlock({ issue }: { issue: NonNullable<LimitedReportDataV1["mvpReport"]>["coreIssues"][number] }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[18px] font-semibold text-stone-950 md:text-[19px]">{issue.title}</h3>
        <div className="flex items-center gap-2 text-[14px]">
          <span className="font-medium text-rose-700">{issue.severity}</span>
          <span className="rounded bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">{priorityLabel(issue.priority)}</span>
        </div>
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

function RoadmapStage({ stage }: { stage: NonNullable<LimitedReportDataV1["mvpReport"]>["roadmap"][number] }) {
  const target = stage.stage === "0-30天" ? "统一企业事实和核心信任信息" : stage.stage === "31-60天" ? "补齐服务内容、客户问题和咨询入口" : "持续发布、复测和优化";
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="text-[18px] font-semibold text-stone-950 md:text-[19px]">{stage.stage}</h3>
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
  return <button type="button" className={`rounded-lg px-5 py-3 text-[16px] font-semibold transition ${style}`}>{children}</button>;
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
  return priority === "P0" ? "优先处理" : priority === "P1" ? "重点完善" : "持续建设";
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
