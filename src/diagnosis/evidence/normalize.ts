// ============================================================================
// Evidence normalization (Agent C) — WebSearchResultItem[] -> EvidenceItem[].
//
// Pure & deterministic. Given raw web-search results plus a small context
// describing which domains belong to the enterprise vs. its competitors, this
// classifies each result's `sourceType` by DOMAIN relationship, de-duplicates
// by URL, assigns conservative default authority/support levels, and passes
// `fetchedAt` through unchanged.
//
// Design notes / doctrine (see AGENTS.md §10, docs/PRODUCT_TRUTH_RULES.md):
//   - Classification is domain-based only. We never guess COMPETITOR from a
//     name appearing in a snippet — a news article merely mentioning a rival is
//     OBSERVED, not COMPETITOR (avoids "Evidence 错配").
//   - `supportLevel` defaults to CONTEXT_ONLY. Real per-claim support is the
//     job of Agent D's evidence semantic guard, not this structural pass — we
//     do not fabricate precision here ("不虚假精度").
//   - Items with an unparseable/non-http(s) URL are dropped so the output
//     always validates against the canonical EvidenceItem schema.
// ============================================================================

import type { WebSearchResultItem } from "../../providers/types";
import type {
  EvidenceAcquisitionLevel,
  EvidenceItem,
  EvidenceSourceType,
  EvidenceSupportLevel,
} from "../../contracts";

export interface EvidenceNormalizationContext {
  /**
   * Host(s) owned by the enterprise being diagnosed (e.g. "example-equip.com").
   * A result whose host equals or is a subdomain of any of these is FIRST_PARTY.
   */
  companyDomains: string[];
  /**
   * Known competitor host(s), if resolved. A result on one of these is
   * COMPETITOR_WEB_EVIDENCE. When empty, competitor sites simply fall through
   * to OBSERVED — we never infer "competitor" from names alone.
   */
  competitorDomains?: string[];
}

const AUTHORITY_OWNED = "OWNED";
const AUTHORITY_MEDIA = "MEDIA";
const DEFAULT_SUPPORT: EvidenceSupportLevel = "CONTEXT_ONLY";

/** Lowercase host, strip a single leading "www." and any trailing dot. */
function canonicalHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

/** True when `host` equals `domain` or is a subdomain of it (suffix on a label boundary). */
function hostMatchesDomain(host: string, domain: string): boolean {
  const h = canonicalHost(host);
  const d = canonicalHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Parse a result URL into a canonical http(s) URL + host. Returns null for
 * anything that is not a valid absolute http/https URL.
 */
function parseHttpUrl(raw: string): { url: string; host: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname) return null;
  // Strip fragment for a stable, comparable key; keep path + query intact.
  u.hash = "";
  return { url: u.toString(), host: u.hostname };
}

/** Deterministic FNV-1a 32-bit hash -> 8 hex chars. No crypto dependency. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts, kept in unsigned range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function classifySourceType(
  host: string,
  ctx: EvidenceNormalizationContext,
): EvidenceSourceType {
  for (const domain of ctx.companyDomains ?? []) {
    if (hostMatchesDomain(host, domain)) return "FIRST_PARTY_EVIDENCE";
  }
  for (const domain of ctx.competitorDomains ?? []) {
    if (hostMatchesDomain(host, domain)) return "COMPETITOR_WEB_EVIDENCE";
  }
  return "OBSERVED_WEB_EVIDENCE";
}

function defaultAuthorityLevel(sourceType: EvidenceSourceType): string {
  // Enterprise & competitor own-domain pages are first-party "OWNED" content;
  // everything else is treated as third-party media by default.
  return sourceType === "OBSERVED_WEB_EVIDENCE" ? AUTHORITY_MEDIA : AUTHORITY_OWNED;
}

function acquisitionLevelOf(item: WebSearchResultItem): EvidenceAcquisitionLevel {
  const raw = (item as WebSearchResultItem & { acquisitionLevel?: unknown }).acquisitionLevel;
  if (
    raw === "CRAWLED_PAGE" ||
    raw === "OFFICIAL_PAGE" ||
    raw === "CUSTOMER_SUPPLIED" ||
    raw === "OFFICIAL_REGISTRY"
  ) {
    return raw;
  }
  if (raw === "SEARCH_SNIPPET") return raw;
  return "SEARCH_SNIPPET";
}

/**
 * Normalize raw web-search results into canonical EvidenceItems.
 *
 * - `sourceType` by domain relationship (FIRST_PARTY / COMPETITOR / OBSERVED).
 * - De-duplicated by canonical URL (fragment-stripped, host lowercased),
 *   keeping the first occurrence to preserve input ordering.
 * - `authorityLevel` defaults by source type; `supportLevel` defaults to
 *   CONTEXT_ONLY (downstream semantic guard refines per claim).
 * - `fetchedAt` is passed through verbatim.
 * - Results with invalid / non-http(s) URLs are dropped.
 */
export function normalizeEvidence(
  items: readonly WebSearchResultItem[],
  ctx: EvidenceNormalizationContext,
): EvidenceItem[] {
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];

  for (const item of items) {
    const parsed = parseHttpUrl(item.url ?? "");
    if (!parsed) continue;

    const dedupeKey = parsed.url.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const sourceType = classifySourceType(parsed.host, ctx);
    const sourceDomain = canonicalHost(item.sourceDomain?.trim() || parsed.host);
    const acquisitionLevel = acquisitionLevelOf(item);

    out.push({
      id: `ev_${fnv1a(parsed.url)}`,
      title: (item.title ?? "").trim(),
      sourceDomain,
      sourceType,
      authorityLevel: defaultAuthorityLevel(sourceType),
      supportLevel: DEFAULT_SUPPORT,
      fetchedAt: item.fetchedAt,
      snippet: (item.snippet ?? "").trim(),
      url: parsed.url,
      acquisitionLevel,
    });
  }

  return out;
}
