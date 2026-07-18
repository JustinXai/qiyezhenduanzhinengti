import type { DeepReportViewModel } from "../../src/contracts";
import { Section } from "./section";
import { ScoreBreakdown } from "./score-card";
import { EvidenceTag } from "./badges";
import { AiSampleDisclaimer, AiTestCard } from "./ai-test-card";
import { IssueItem, OpportunityItem, StrengthItem } from "./claim-card";

/**
 * Deep view (docs/REPORT_CONTRACT.md "Deep View"). Full company picture, five
 * scores, all VALID AI tests, all credible claims, conditional competitor
 * analysis and measurement notes. Still withholds SOW / pricing / provider
 * internals — those never enter the DeepReportViewModel in the first place.
 */
export function DeepReport({ vm }: { vm: DeepReportViewModel }) {
  const profile = vm.companyProfile;
  return (
    <div className="space-y-1">
      <Section title="企业画像">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <ProfileRow label="品牌名称" value={profile.brandName} />
          <ProfileRow label="官网" value={profile.website} />
          <ProfileRow label="行业" value={profile.industry} />
          <ProfileRow label="目标区域" value={profile.targetRegion} />
          <ProfileRow label="产品 / 服务" value={profile.productOrService} full />
          <ProfileRow
            label="竞品"
            value={profile.competitors.length > 0 ? profile.competitors.join("、") : "未提供"}
            full
          />
        </dl>

        {profile.unresolvedQuestions.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3">
            <p className="mb-1 text-xs font-semibold text-amber-800">待确认信息</p>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-900">
              {profile.unresolvedQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="五项评分" subtitle="权重固定,分数直接来自诊断,不在展示层重算">
        <ScoreBreakdown scores={vm.scores} />
      </Section>

      <Section title="AI 可见度诊断样本">
        {vm.aiVisibilityTests.length > 0 ? (
          <>
            <AiSampleDisclaimer />
            <div className="mt-2 space-y-2">
              {vm.aiVisibilityTests.map((test) => (
                <AiTestCard key={test.id} test={test} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500">本次暂无有效 AI 问答样本。</p>
        )}
      </Section>

      <Section title="企业优势">
        {vm.strengths.length > 0 ? (
          <div className="space-y-2">
            {vm.strengths.map((s) => (
              <StrengthItem key={s.id} strength={s} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">本次没有达到发布标准的优势。</p>
        )}
      </Section>

      <Section title="核心问题">
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

      <Section title="竞品分析" subtitle="仅在证据充分时展示">
        {vm.competitorGaps.length > 0 ? (
          <ul className="space-y-2">
            {vm.competitorGaps.map((gap) => (
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
          <p className="text-sm text-neutral-500">本次公开证据不足,暂不做确定性竞品比较。</p>
        )}
      </Section>

      <Section title="GEO 机会">
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

      <Section title="测量说明">
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-neutral-600">
          {vm.measurementNotes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function ProfileRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="text-sm text-neutral-800">{value}</dd>
    </div>
  );
}
