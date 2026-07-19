import type { EvidenceItem } from "../../contracts";

const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "co.uk",
  "org.uk",
  "com.au",
  "com.hk",
  "com.sg",
]);

function hostname(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\.$/u, "");
  if (!trimmed) return "";
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname
      .toLowerCase()
      .replace(/\.$/u, "");
  } catch {
    return trimmed.split("/")[0]?.replace(/^www\./u, "") ?? "";
  }
}

/** Registrable/root-domain approximation used only for independence counting. */
export function evidenceRootDomain(item: EvidenceItem): string {
  const host = hostname(item.normalizedDomain ?? item.sourceDomain);
  if (!host) return "";
  const labels = host.replace(/^www\./u, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const suffix2 = labels.slice(-2).join(".");
  return MULTI_LABEL_PUBLIC_SUFFIXES.has(suffix2)
    ? labels.slice(-3).join(".")
    : labels.slice(-2).join(".");
}

export function countIndependentEvidenceDomains(
  evidenceIds: readonly string[],
  evidence: readonly EvidenceItem[],
): number {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return new Set(
    evidenceIds
      .map((id) => byId.get(id))
      .filter((item): item is EvidenceItem => item !== undefined)
      .map(evidenceRootDomain)
      .filter(Boolean),
  ).size;
}
