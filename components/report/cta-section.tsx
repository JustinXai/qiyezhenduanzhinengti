// CTA (docs/REPORT_CONTRACT.md §8). All copy is FROZEN; it is imported from the
// single product-copy source (src/product/customer-copy.ts) so it is never
// retyped here. No forbidden promise language (docs/PRODUCT_TRUTH_RULES.md §9).

// INTEGRATION SEAM (Agent E API): the CTA buttons are presentation-only in this
// round. Wiring them to a lead/booking endpoint is Agent E's surface; when that
// lands, attach the handler/href here without changing the frozen copy.

import {
  CTA_DESCRIPTION,
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_LABEL,
  THIRTY_MINUTE_HEADING,
  THIRTY_MINUTE_POINTS,
} from "../../src/product/customer-copy";

export function CtaSection({ limited = false }: { limited?: boolean }) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 text-white">
      <p className="text-sm leading-relaxed text-neutral-200">{CTA_DESCRIPTION}</p>

      <div className="mt-3 rounded-lg bg-neutral-800 p-3">
        <p className="text-xs font-semibold text-neutral-300">{THIRTY_MINUTE_HEADING}</p>
        <ol className="mt-1.5 space-y-1 text-xs text-neutral-300">
          {THIRTY_MINUTE_POINTS.map((point, i) => (
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
          {limited ? "补充企业信息并继续诊断" : PRIMARY_CTA_LABEL}
        </button>
        <button
          type="button"
          data-testid="secondary-cta"
          className="flex-1 rounded-lg border border-neutral-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          {SECONDARY_CTA_LABEL}
        </button>
      </div>
    </div>
  );
}
