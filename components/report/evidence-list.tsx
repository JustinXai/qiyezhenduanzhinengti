import type { EvidenceViewModel } from "../../src/contracts";
import {
  MEASUREMENT_STATUS_LABELS,
  authorityLabel,
  formatDate,
} from "./labels";
import { SourceTypeBadge, SupportLevelBadge } from "./badges";

type EvidenceItemView = EvidenceViewModel["items"][number];

/**
 * Evidence drawer (docs/PRODUCT_TRUTH_RULES.md §6). Default-collapsed via native
 * <details> (no client JS). URLs arrive already sanitised from the presentation
 * service. Each row shows: title, source domain, source type, authority level,
 * support level, fetched time, snippet, and the cleaned link.
 *
 * Collapsed state shows: title, source type badge, support level badge, language
 * label, source domain, and a "查看来源" link.
 *
 * Internal fields withheld from public view: Verifier reason, confidence, prompt
 * version, request ID, token count, internal hash.
 */
export function EvidenceList({ items }: { items: readonly EvidenceItemView[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">本次没有可展示的证据条目。</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <details className="group rounded-xl border border-neutral-200 open:bg-neutral-50">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-2 p-3">
              {/* Left: title + badges */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {item.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <SourceTypeBadge type={item.sourceType} />
                  <SupportLevelBadge level={item.supportLevel} />
                  {item.languageLabel && (
                    <span className="inline-flex items-center rounded-full bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                      {item.languageLabel}
                    </span>
                  )}
                </span>
              </span>
              {/* Right: expand hint + source domain when collapsed */}
              <span className="shrink-0 space-y-0.5 text-right">
                <span className="block text-xs text-neutral-400 group-open:hidden">
                  展开
                </span>
                <span className="hidden text-xs text-neutral-400 group-open:inline">
                  收起
                </span>
                <span className="block truncate text-[11px] text-neutral-400 group-open:hidden max-w-[120px]">
                  {item.sourceDomain}
                </span>
              </span>
            </summary>
            <div className="space-y-1.5 px-3 pb-3 text-xs text-neutral-600">
              {item.summaryZh && (
                <p className="font-medium text-neutral-800">{item.summaryZh}</p>
              )}
              <p className="text-neutral-700">{item.snippet}</p>
              <dl className="grid grid-cols-2 gap-1">
                <div>
                  <dt className="inline text-neutral-400">来源域名:</dt>{" "}
                  <dd className="inline">{item.sourceDomain}</dd>
                </div>
                <div>
                  <dt className="inline text-neutral-400">权威等级:</dt>{" "}
                  <dd className="inline">{authorityLabel(item.authorityLevel)}</dd>
                </div>
                <div>
                  <dt className="inline text-neutral-400">获取时间:</dt>{" "}
                  <dd className="inline">{formatDate(item.fetchedAt)}</dd>
                </div>
              </dl>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-block max-w-full break-words text-sky-600 underline"
              >
                {item.url}
              </a>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Small helper kept exported for reuse in Deep's evidence attachment header. */
export function measurementStatusLabel(status: keyof typeof MEASUREMENT_STATUS_LABELS) {
  return MEASUREMENT_STATUS_LABELS[status];
}
