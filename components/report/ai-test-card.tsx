import type { AIVisibilityTest } from "../../src/contracts";
import { ACCURACY_LABELS, RECOMMENDATION_LABELS } from "./labels";
import { Badge } from "./badges";

const CATEGORY_LABELS: Record<AIVisibilityTest["questionCategory"], string> = {
  PURCHASE_DECISION: "采购决策",
  COMPETITOR_COMPARISON: "竞品比较",
  BRAND_DIRECT: "品牌直接",
  OTHER: "其他",
};

/**
 * One AI visibility sample (docs/PRODUCT_TRUTH_RULES.md §8). Only VALID tests
 * are ever passed in by the presentation service. All values are read straight
 * from the Canonical test — never re-interpreted here.
 */
export function AiTestCard({ test }: { test: AIVisibilityTest }) {
  return (
    <article className="rounded-xl border border-neutral-200 p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{CATEGORY_LABELS[test.questionCategory]}</Badge>
        <Badge tone={test.brandMentioned ? "positive" : "warning"}>
          {test.brandMentioned ? "已提及品牌" : "未提及品牌"}
        </Badge>
      </div>
      <p className="text-sm font-medium text-neutral-900">{test.question}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        {test.accuracy && <span>回答准确度:{ACCURACY_LABELS[test.accuracy]}</span>}
        {test.recommendationStrength && (
          <span>推荐强度:{RECOMMENDATION_LABELS[test.recommendationStrength]}</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-neutral-400">模型 {test.modelUsed}</p>
    </article>
  );
}

/** The mandatory framing note reused wherever AI samples are shown. */
export function AiSampleDisclaimer() {
  return (
    <p className="mt-2 rounded-lg bg-neutral-50 p-2.5 text-[11px] leading-relaxed text-neutral-500">
      以下为当前模型、当前时间、当前问题集下的诊断样本,用于观察 AI 如何谈论企业;
      不是豆包 / 元宝 / Kimi 等多平台监测,也不代表全网 AI 推荐率或市场份额。
    </p>
  );
}
