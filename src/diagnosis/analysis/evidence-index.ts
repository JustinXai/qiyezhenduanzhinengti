// Evidence lookup + referential-integrity helpers shared by the analysis stages.
//
// PRODUCT_TRUTH_RULES §4.6 requires every referenced evidence id to exist, and
// §4.7 forbids `array[0]` auto-backfill. These helpers therefore only ever FILTER
// unknown ids out — they never invent or substitute one.

import type { EvidenceItem, EvidenceSupportLevel } from "../../contracts";

export type EvidenceIndex = ReadonlyMap<string, EvidenceItem>;

export function indexEvidence(evidence: readonly EvidenceItem[]): EvidenceIndex {
  const map = new Map<string, EvidenceItem>();
  for (const item of evidence) {
    map.set(item.id, item);
  }
  return map;
}

/** Keep only ids that resolve to a real evidence item, preserving order + dedup. */
export function resolveEvidenceIds(
  ids: readonly string[],
  index: EvidenceIndex,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (index.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function supportLevelsOf(
  ids: readonly string[],
  index: EvidenceIndex,
): EvidenceSupportLevel[] {
  const out: EvidenceSupportLevel[] = [];
  for (const id of ids) {
    const item = index.get(id);
    if (item) out.push(item.supportLevel);
  }
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
