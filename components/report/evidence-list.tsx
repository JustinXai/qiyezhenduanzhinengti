import type { EvidenceViewModel } from "../../src/contracts";
import {
  MEASUREMENT_STATUS_LABELS,
  formatDate,
} from "./labels";
import { SourceTypeBadge, SupportLevelBadge } from "./badges";

type EvidenceItemView = EvidenceViewModel["items"][number];

/**
 * Evidence drawer (docs/PRODUCT_TRUTH_RULES.md §6). Default-collapsed via native
 * <details> (no client JS). URLs arrive already sanitised from the presentation
 * service. Each row shows: title, source domain, source type, authority level,
 * support level, fetched time, snippet, and the cleaned link.
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
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {item.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <SourceTypeBadge type={item.sourceType} />
                  <SupportLevelBadge level={item.supportLevel} />
                </span>
              </span>
              <span className="shrink-0 text-xs text-neutral-400 group-open:hidden">展开</span>
              <span className="hidden shrink-0 text-xs text-neutral-400 group-open:inline">收起</span>
            </summary>
            <div className="space-y-1.5 px-3 pb-3 text-xs text-neutral-600">
              <p className="text-neutral-700">{item.snippet}</p>
              <dl className="grid grid-cols-2 gap-1">
                <div>
                  <dt className="inline text-neutral-400">来源域名:</dt>{" "}
                  <dd className="inline">{item.sourceDomain}</dd>
                </div>
                <div>
                  <dt className="inline text-neutral-400">权威等级:</dt>{" "}
                  <dd className="inline">{item.authorityLevel}</dd>
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
                className="inline-block break-all text-sky-600 underline"
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
