// CTA (docs/REPORT_CONTRACT.md §8). All copy below is FROZEN and reproduced
// verbatim from the contract. Primary CTA "预约报告解读"; secondary CTA
// "获取企业GEO优化方案". The explanation text and the three 30-minute points
// are fixed. No forbidden promise language (docs/PRODUCT_TRUTH_RULES.md §9).

// INTEGRATION SEAM (Agent E API): the CTA buttons are presentation-only in this
// round. Wiring them to a lead/booking endpoint is Agent E's surface; when that
// lands, attach the handler/href here without changing the frozen copy.

const PRIMARY_CTA = "预约报告解读";
const SECONDARY_CTA = "获取企业GEO优化方案";

const CTA_DESCRIPTION =
  "我们将结合本报告与您的实际业务,进一步核验关键问题,并明确可实施的官网内容、客户问题覆盖、品牌知识和持续监测方案。";

const THIRTY_MIN_POINTS = [
  "核验报告中的关键结论是否符合企业实际;",
  "确定最值得优先处理的 3 件事;",
  "明确企业需提供什么、凡间AI可以交付什么,以及如何验收。",
] as const;

export function CtaSection() {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 text-white">
      <p className="text-sm leading-relaxed text-neutral-200">{CTA_DESCRIPTION}</p>

      <div className="mt-3 rounded-lg bg-neutral-800 p-3">
        <p className="text-xs font-semibold text-neutral-300">30 分钟解读会将帮助您:</p>
        <ol className="mt-1.5 space-y-1 text-xs text-neutral-300">
          {THIRTY_MIN_POINTS.map((point, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-neutral-500">{i + 1})</span>
              <span>{point}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          data-testid="primary-cta-footer"
          className="flex-1 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          {PRIMARY_CTA}
        </button>
        <button
          type="button"
          data-testid="secondary-cta"
          className="flex-1 rounded-lg border border-neutral-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          {SECONDARY_CTA}
        </button>
      </div>
    </div>
  );
}
