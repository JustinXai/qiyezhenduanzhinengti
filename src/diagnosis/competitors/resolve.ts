// ============================================================================
// Competitor resolver (Agent I).
//
// Turns raw competitor inputs (bare names, or names + a user-asserted website)
// into auditable `CompetitorResolution`s. Two trust paths only:
//
//   1. User-supplied website  → re-validated through the SSRF / URL guard.
//        pass  ⇒ USER_CONFIRMED   fail ⇒ INVALID_DOMAIN
//   2. Name only              → identified from (mock) search evidence.
//        one official host   ⇒ RESOLVED
//        many official hosts ⇒ AMBIGUOUS   (same-name firms)
//        none                ⇒ NOT_FOUND
//
// Hard rules enforced here (docs/PRODUCT_TRUTH_RULES.md, AGENTS.md §10):
//   - NEVER synthesize a domain from the brand string (no name + ".com").
//   - EVERY input yields exactly one resolution — nothing is dropped silently.
//   - A domain is trusted only when user-confirmed or backed by search evidence.
// ============================================================================

import type { EvidenceItem } from "../../contracts";
import type { WebSearchProvider, WebSearchResultItem } from "../../providers/types";
import {
  assertUrlAllowed,
  type SsrfCheckResult,
} from "../../security/crawler/ssrf-guard";
import { normalizeEvidence } from "../evidence/normalize";
import { buildCompetitorDomainQueries } from "../search/query-planner";
import {
  competitorInputName,
  competitorInputWebsite,
  type CompetitorInput,
} from "../../runtime/diagnosis-input";
import type {
  CompetitorResolution,
  CompetitorResolutionResult,
} from "./types";

/** Injectable seams (all default to real implementations / no mock). */
export interface CompetitorResolverDeps {
  /** Search provider used to identify official domains for name-only inputs. */
  search: WebSearchProvider;
  /** URL/SSRF guard. Defaults to the real guard; overridable for tests. */
  assertUrlAllowed?: (url: string | URL) => SsrfCheckResult;
  /** Per-query result cap forwarded to the provider. */
  searchLimit?: number;
}

// --- small pure helpers -----------------------------------------------------

/** Lowercase host, strip a single leading "www." and any trailing dot. */
function canonicalHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

/** Ensure a scheme so bare hosts ("dji.com") still parse; never downgrades. */
function coerceUrl(raw: string): string {
  const s = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/** Best-effort canonical host for display, independent of the guard verdict. */
function hostFromWebsite(website: string): string | null {
  try {
    return canonicalHost(new URL(coerceUrl(website)).hostname) || null;
  } catch {
    return null;
  }
}

const OFFICIAL_MARKERS = [
  "官网",
  "官方网站",
  "官方站点",
  "official site",
  "official website",
];

/** A search result that self-describes as an official site. */
function isOfficialResult(item: WebSearchResultItem): boolean {
  const hay = `${item.title ?? ""} ${item.snippet ?? ""}`.toLowerCase();
  return OFFICIAL_MARKERS.some((m) => hay.includes(m.toLowerCase()));
}

/** Canonical host of a result (prefer its URL, fall back to sourceDomain). */
function hostOfResult(item: WebSearchResultItem): string {
  try {
    return canonicalHost(new URL(item.url).hostname);
  } catch {
    return canonicalHost(item.sourceDomain ?? "");
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Registrable-ish label of a host ("gopro" from "gopro.com"). */
function labelOf(host: string): string {
  const parts = host.split(".");
  return parts.length >= 2 ? (parts[parts.length - 2] ?? "") : host;
}

/** Light ASCII-slug relatedness between a name and a host (confidence nudge). */
function slugRelated(name: string, host: string): boolean {
  const ns = slug(name);
  const lbl = labelOf(host);
  if (!ns || !lbl) return false;
  return lbl.includes(ns) || ns.includes(lbl);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// --- input normalization ----------------------------------------------------

interface NormalizedInput {
  name: string;
  website: string | undefined;
}

/** De-duplicate by name (first wins); adopt the first non-empty website seen. */
function normalizeInputs(competitors: readonly CompetitorInput[]): NormalizedInput[] {
  const byName = new Map<string, NormalizedInput>();
  const order: string[] = [];
  for (const raw of competitors) {
    const name = competitorInputName(raw);
    if (!name) continue;
    const website = competitorInputWebsite(raw);
    const existing = byName.get(name);
    if (existing) {
      if (!existing.website && website) existing.website = website;
    } else {
      byName.set(name, { name, website });
      order.push(name);
    }
  }
  return order.map((n) => byName.get(n)!);
}

// --- resolution of a single competitor --------------------------------------

interface SingleResolution {
  resolution: CompetitorResolution;
  evidence: EvidenceItem[];
}

function resolveUserWebsite(
  name: string,
  website: string,
  guard: (url: string | URL) => SsrfCheckResult,
): SingleResolution {
  const providedDomain = hostFromWebsite(website);
  const check = guard(coerceUrl(website));
  if (check.ok) {
    const host = canonicalHost(check.url.hostname);
    return {
      resolution: {
        name,
        providedDomain,
        resolvedDomain: host,
        status: "USER_CONFIRMED",
        confidence: 1,
        evidenceIds: [],
        resolutionReason: `用户提供的官网 ${host} 通过安全校验,直接采用`,
        candidateDomains: [],
      },
      evidence: [],
    };
  }
  return {
    resolution: {
      name,
      providedDomain,
      resolvedDomain: null,
      status: "INVALID_DOMAIN",
      confidence: 0,
      evidenceIds: [],
      resolutionReason: `用户提供的域名未通过安全校验(${check.reason}):${check.detail}`,
      candidateDomains: [],
    },
    evidence: [],
  };
}

async function resolveByName(
  name: string,
  deps: CompetitorResolverDeps,
): Promise<SingleResolution> {
  const query = buildCompetitorDomainQueries(name)[0] ?? name;
  const res = await deps.search.search(query, { limit: deps.searchLimit ?? 10 });
  const items: WebSearchResultItem[] = res.ok ? res.results : [];

  // Group OFFICIAL results by canonical host. A host with >=1 official-marked
  // result is an official candidate. Never fabricate a host from the name.
  const officialByHost = new Map<string, WebSearchResultItem[]>();
  for (const item of items) {
    if (!isOfficialResult(item)) continue;
    const host = hostOfResult(item);
    if (!host) continue;
    const list = officialByHost.get(host) ?? [];
    list.push(item);
    officialByHost.set(host, list);
  }
  const officialHosts = [...officialByHost.keys()].sort();

  // Classify + normalize evidence with the (possibly) confirmed domain so the
  // resolved host's pages become COMPETITOR_WEB_EVIDENCE.
  const resolvedDomain = officialHosts.length === 1 ? officialHosts[0]! : null;
  const evidence = normalizeEvidence(items, {
    companyDomains: [],
    competitorDomains: resolvedDomain ? [resolvedDomain] : [],
  });
  const idsForHosts = (hosts: readonly string[]): string[] => {
    const set = new Set(hosts);
    return evidence.filter((e) => set.has(e.sourceDomain)).map((e) => e.id);
  };

  if (officialHosts.length === 0) {
    return {
      resolution: {
        name,
        providedDomain: null,
        resolvedDomain: null,
        status: "NOT_FOUND",
        confidence: 0,
        // Preserve whatever WAS searched as context (may be empty).
        evidenceIds: evidence.map((e) => e.id),
        resolutionReason: "官方域名搜索未识别到可信官网,保留为未确认",
        candidateDomains: [],
      },
      evidence,
    };
  }

  if (officialHosts.length >= 2) {
    return {
      resolution: {
        name,
        providedDomain: null,
        resolvedDomain: null,
        status: "AMBIGUOUS",
        confidence: 0.3,
        evidenceIds: idsForHosts(officialHosts),
        resolutionReason: `搜索到 ${officialHosts.length} 个同名企业的官网候选,无法唯一确定,需人工确认`,
        candidateDomains: officialHosts,
      },
      evidence,
    };
  }

  // Exactly one official host -> RESOLVED.
  const host = resolvedDomain!;
  const corroboration = officialByHost.get(host)?.length ?? 1;
  const confidence = clamp01(
    0.7 + 0.05 * (corroboration - 1) + (slugRelated(name, host) ? 0.1 : 0),
  );
  return {
    resolution: {
      name,
      providedDomain: null,
      resolvedDomain: host,
      status: "RESOLVED",
      confidence,
      evidenceIds: idsForHosts([host]),
      resolutionReason: `通过官方域名搜索识别到唯一官网 ${host}(${corroboration} 条佐证)`,
      candidateDomains: [],
    },
    evidence,
  };
}

// --- public entry point -----------------------------------------------------

/**
 * Resolve every competitor input to an auditable status. Deterministic given a
 * deterministic search provider; performs at most one search call per unique
 * name-only competitor (user-confirmed inputs need no search).
 */
export async function resolveCompetitors(
  competitors: readonly CompetitorInput[] | undefined,
  deps: CompetitorResolverDeps,
): Promise<CompetitorResolutionResult> {
  const guard = deps.assertUrlAllowed ?? assertUrlAllowed;
  const inputs = normalizeInputs(competitors ?? []);

  const resolutions: CompetitorResolution[] = [];
  const evidenceById = new Map<string, EvidenceItem>();

  for (const { name, website } of inputs) {
    const single = website
      ? resolveUserWebsite(name, website, guard)
      : await resolveByName(name, deps);
    resolutions.push(single.resolution);
    for (const e of single.evidence) {
      if (!evidenceById.has(e.id)) evidenceById.set(e.id, e);
    }
  }

  const resolvedDomains: string[] = [];
  const seenDomain = new Set<string>();
  for (const r of resolutions) {
    if (r.resolvedDomain && !seenDomain.has(r.resolvedDomain)) {
      seenDomain.add(r.resolvedDomain);
      resolvedDomains.push(r.resolvedDomain);
    }
  }

  return {
    resolutions,
    evidence: [...evidenceById.values()],
    resolvedDomains,
  };
}
