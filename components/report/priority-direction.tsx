// ============================================================================
// Round-7.1A: PriorityDirection card component
// 用于展示聚类后的优先完善方向
// ============================================================================

import type { PriorityDirection } from "../../src/contracts";

interface PriorityDirectionCardProps {
  direction: PriorityDirection;
  /** 显示序号（1-based） */
  index: number;
}

/**
 * 优先完善方向卡片
 * 展示聚类后的客户问题完善方向
 */
export function PriorityDirectionCard({ direction, index }: PriorityDirectionCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-sky-200 bg-white shadow-sm">
      {/* 序号头部 */}
      <div className="flex items-center gap-3 bg-sky-50 px-4 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
          {index}
        </span>
        <p className="flex-1 text-sm font-medium text-sky-900">{direction.directionTitle}</p>
      </div>

      {/* 内容主体 */}
      <div className="px-4 py-3.5 space-y-3">
        {/* 涵盖的客户问题 */}
        {direction.coveredQuestions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-neutral-500 mb-1.5">涵盖的客户问题</p>
            <ul className="space-y-1">
              {direction.coveredQuestions.map((q, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-neutral-700">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 建议建设的内容资产 */}
        <div className="rounded-lg bg-sky-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-sky-700">建议建设内容</p>
          <p className="mt-0.5 text-sm leading-relaxed text-sky-900">{direction.suggestedContentAsset}</p>
        </div>

        {/* 具体商业价值 */}
        {direction.businessValue && (
          <div className="text-xs text-neutral-600">
            <span className="font-medium text-neutral-500">商业价值：</span>
            <span>{direction.businessValue}</span>
          </div>
        )}
      </div>
    </div>
  );
}
