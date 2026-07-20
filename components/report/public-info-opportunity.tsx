// ============================================================================
// Round-7: PublicInformationOpportunity 展示组件
// 来源于 docs/product/ROUND7_QUICK_FIRST_SME_CONVERSION.md §三
//
// PublicInformationOpportunity 特性：
// - 来源于 QuestionCoverageGapV1 的确定性映射
// - 不是正式 GEO Opportunity，不进入 Opportunity 统计
// - 不影响 Truth Guard 门槛
// - 必须使用限定语："在本次已检查的公开页面和搜索结果中……"
// ============================================================================

import type { PublicInformationOpportunity, PublicInformationAction } from "../../src/contracts";
import { PUBLIC_INFO_REQUIRED_QUALIFIER } from "../../src/product/customer-copy";

interface PublicInfoOpportunityCardProps {
  opportunity: PublicInformationOpportunity;
  /** 显示序号（1-based） */
  index: number;
}

/**
 * 公开信息完善机会卡片
 * 展示客户问题的覆盖情况和建议的补充动作
 */
export function PublicInfoOpportunityCard({ opportunity, index }: PublicInfoOpportunityCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-sky-200 bg-white shadow-sm">
      {/* 序号头部 */}
      <div className="flex items-center gap-3 bg-sky-50 px-3 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
          {index}
        </span>
        <p className="flex-1 text-sm font-medium text-sky-900 break-words">{opportunity.customerQuestion}</p>
      </div>

      {/* 内容主体 */}
      <div className="px-3 py-3">
        <p className="mb-2 text-xs text-neutral-500">
          {PUBLIC_INFO_REQUIRED_QUALIFIER}
          {opportunity.missingPublicInformation}
        </p>

        <div className="rounded-lg bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-700">建议补充</p>
          <p className="mt-0.5 text-sm leading-relaxed text-amber-900">{opportunity.suggestedContentAction}</p>
        </div>

        {opportunity.potentialBusinessValue && (
          <p className="mt-2 text-xs text-neutral-400">
            <span className="font-medium text-neutral-500">潜在价值：</span>
            {opportunity.potentialBusinessValue}
          </p>
        )}
      </div>
    </div>
  );
}

interface PublicInfoActionItemProps {
  action: PublicInformationAction;
  /** 显示序号（1-based） */
  index: number;
}

/**
 * 行动建议条目
 * 来源于 QuestionCoverageGap 的确定性映射
 * 标记为 PUBLIC_INFORMATION_ACTION，不是正式 GEO Opportunity
 */
export function PublicInfoActionItem({ action, index }: PublicInfoActionItemProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-medium text-amber-700">
        {index}
      </span>
      <div className="flex-1">
        <p className="text-sm text-neutral-800">{action.actionText}</p>
        {action.relatedQuestion && (
          <p className="mt-1 text-xs text-neutral-500">
            来自：{action.relatedQuestion}
          </p>
        )}
      </div>
    </div>
  );
}
