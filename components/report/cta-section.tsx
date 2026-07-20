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

export function CtaSection() {
  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm leading-relaxed text-neutral-700">{CTA_DESCRIPTION}</p>
      </div>

      <div className="space-y-2.5 rounded-xl border border-neutral-100 bg-neutral-50/80 p-3.5">
        <p className="text-xs font-semibold text-neutral-600">{THIRTY_MINUTE_HEADING}</p>
        <ol className="space-y-1.5">
          {THIRTY_MINUTE_POINTS.map((point, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-500">
                {i + 1}
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <button
          type="button"
          data-testid="primary-cta-footer"
          className="flex-1 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 hover:shadow"
        >
          {PRIMARY_CTA_LABEL}
        </button>
        <button
          type="button"
          data-testid="secondary-cta"
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:border-neutral-400 hover:bg-neutral-50"
        >
          {SECONDARY_CTA_LABEL}
        </button>
      </div>
    </div>
  );
}
