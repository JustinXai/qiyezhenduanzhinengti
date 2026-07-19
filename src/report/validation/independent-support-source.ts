import type { EvidenceItem } from "../../contracts";
import type {
  ClaimPublicationSourceContext,
  IndependentSupportSourceKey,
  ResolvedCompetitorSupportEntity,
} from "../../contracts/independent-support-source";

const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "mil",
  "net",
  "org",
]);

const EXPLICIT_MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "edu.cn",
  "ac.cn",
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "org.au",
  "com.hk",
  "com.sg",
  "com.tw",
  "co.jp",
  "co.kr",
  "co.nz",
]);

function canonicalHost(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\.$/u, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "");
  } catch {
    return trimmed.split("/")[0]?.replace(/^www\./u, "").replace(/\.$/u, "") ?? "";
  }
}

function looksLikeIpAddress(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) || host.includes(":");
}

/**
 * Deterministic registrable-domain calculation for the public suffix forms the
 * product accepts. It intentionally does not use brand-specific domain tables.
 */
export function registrableDomain(value: string): string {
  const host = canonicalHost(value);
  if (!host || looksLikeIpAddress(host) || !host.includes(".")) return host;
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");

  const suffix2 = labels.slice(-2).join(".");
  const countryCodeTld = labels.at(-1)?.length === 2;
  const secondLevel = labels.at(-2) ?? "";
  const usesMultiLabelSuffix =
    EXPLICIT_MULTI_LABEL_PUBLIC_SUFFIXES.has(suffix2) ||
    (countryCodeTld && COMMON_SECOND_LEVEL_SUFFIXES.has(secondLevel));
  return usesMultiLabelSuffix ? labels.slice(-3).join(".") : suffix2;
}

function evidenceHost(item: EvidenceItem): string {
  for (const candidate of [item.normalizedDomain, item.sourceDomain]) {
    if (!candidate) continue;
    const host = canonicalHost(candidate);
    if (host.includes(".") || looksLikeIpAddress(host)) return host;
  }
  return canonicalHost(item.url);
}

function hostMatchesDomain(host: string, assertedDomain: string): boolean {
  const candidate = canonicalHost(host);
  const domain = canonicalHost(assertedDomain);
  return Boolean(candidate && domain && (candidate === domain || candidate.endsWith(`.${domain}`)));
}

function competitorEntityForEvidence(
  item: EvidenceItem,
  entities: readonly ResolvedCompetitorSupportEntity[],
): ResolvedCompetitorSupportEntity | undefined {
  const byEvidenceId = entities.filter((entity) => entity.evidenceIds?.includes(item.id));
  if (byEvidenceId.length === 1) return byEvidenceId[0];
  if (byEvidenceId.length > 1) return undefined;

  const host = evidenceHost(item);
  const byDomain = entities.filter((entity) =>
    entity.domains.some((domain) => hostMatchesDomain(host, domain)),
  );
  return byDomain.length === 1 ? byDomain[0] : undefined;
}

function nonEmptyId(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/** Resolve one Evidence item to its only permissible independent-source key. */
export function resolveIndependentSupportSourceKey(
  item: EvidenceItem,
  context: ClaimPublicationSourceContext,
): IndependentSupportSourceKey | null {
  if (item.sourceType === "FIRST_PARTY_EVIDENCE") {
    const companyId = nonEmptyId(context.companyId);
    const host = evidenceHost(item);
    const confirmed = context.firstPartyDomains.some((domain) => hostMatchesDomain(host, domain));
    if (!companyId || !confirmed) return null;
    return `ENTITY:CURRENT_COMPANY:${companyId}`;
  }

  if (item.sourceType === "COMPETITOR_WEB_EVIDENCE") {
    const entity = competitorEntityForEvidence(item, context.competitorEntities);
    const competitorEntityId = entity && nonEmptyId(entity.competitorEntityId);
    return competitorEntityId ? `ENTITY:COMPETITOR:${competitorEntityId}` : null;
  }

  const domain = registrableDomain(evidenceHost(item));
  return domain ? `DOMAIN:${domain}` : null;
}

export function independentSupportSourceKeys(
  evidenceIds: readonly string[],
  evidence: readonly EvidenceItem[],
  context: ClaimPublicationSourceContext,
): IndependentSupportSourceKey[] {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const keys = new Set<IndependentSupportSourceKey>();
  for (const evidenceId of evidenceIds) {
    const item = byId.get(evidenceId);
    if (!item) continue;
    const key = resolveIndependentSupportSourceKey(item, context);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

export function countIndependentSupportSources(
  evidenceIds: readonly string[],
  evidence: readonly EvidenceItem[],
  context: ClaimPublicationSourceContext,
): number {
  return independentSupportSourceKeys(evidenceIds, evidence, context).length;
}
