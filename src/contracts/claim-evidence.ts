// ============================================================================
// ClaimEvidenceRelation contracts — Round-3 Claim/Evidence semantic verification.
//
// These types are DELIBERATELY not part of the Canonical `DiagnosisReport`
// (src/contracts/index.ts, Supervisor-owned). The report keeps carrying claims
// with candidate `evidenceIds` (candidate ClaimEvidenceLinks); the SEMANTIC
// support of each (Claim, Evidence) pair is a separate, verifier-produced record
// persisted alongside the report and consumed by the deterministic publish guard.
//
// Doctrine (docs/PRODUCT_TRUTH_RULES.md §4, AGENTS.md §10):
//   - `EvidenceItem.supportLevel` (in the canonical report) is a SOURCE-property
//     default assigned at normalization time. It NEVER expresses "does this
//     evidence semantically support claim X". That judgement lives here, in
//     `ClaimEvidenceRelation.supportLevel`.
//   - Source authority (first-party / competitor own-domain) must never be used
//     as a shortcut for semantic support. `first-party => DIRECT` is forbidden.
//   - Negative / missing claims ("官网缺少……", "未覆盖……", "本企业落后……") can
//     never be DIRECTLY proven by a single page. They require a measurement
//     BOUNDARY established from the executed query plan + controlled crawl scope
//     + observed evidence coverage, and their support is coverage-backed.
// ============================================================================

import { z } from "zod";
import { EvidenceSupportLevel, type EvidenceItem } from "./index";

// ---------------------------------------------------------------------------
// Which canonical claim bucket a relation belongs to.
// ---------------------------------------------------------------------------

export const ClaimKind = z.enum([
  "coreIssue",
  "strength",
  "geoOpportunity",
  "competitorGap",
]);
export type ClaimKind = z.infer<typeof ClaimKind>;

// ---------------------------------------------------------------------------
// Claim polarity — derived deterministically from the claim text + kind. The
// verifier and the guard both classify with the SAME helper so the model can
// never smuggle a negative claim past the boundary rules.
// ---------------------------------------------------------------------------

export const ClaimPolarity = z.enum([
  // A positive statement about the enterprise's own capability / content.
  "ENTERPRISE_CAPABILITY",
  // A negative / missing / gap / "behind competitor" statement. Boundary-gated.
  "NEGATIVE_MISSING",
  // A factual statement about a competitor (backed by competitor evidence).
  "COMPETITOR_FACT",
]);
export type ClaimPolarity = z.infer<typeof ClaimPolarity>;

// ---------------------------------------------------------------------------
// How a relation's support was established.
//   CONTENT_MATCH        — the evidence's own content backs the claim.
//   MEASUREMENT_BOUNDARY — coverage-backed: the checked scope did / did not
//                          reveal the thing the (negative) claim asserts.
// ---------------------------------------------------------------------------

export const RelationBasis = z.enum(["CONTENT_MATCH", "MEASUREMENT_BOUNDARY"]);
export type RelationBasis = z.infer<typeof RelationBasis>;

// ---------------------------------------------------------------------------
// Which verifier produced the relation (traceability — 职责 9).
// ---------------------------------------------------------------------------

export const VerifierMode = z.enum(["MOCK_DETERMINISTIC", "DEEPSEEK_STRUCTURED"]);
export type VerifierMode = z.infer<typeof VerifierMode>;

// ---------------------------------------------------------------------------
// ClaimEvidenceRelation — one verified (Claim, Evidence) support judgement.
// ---------------------------------------------------------------------------

export const ClaimEvidenceRelation = z.object({
  claimId: z.string().min(1),
  claimKind: ClaimKind,
  evidenceId: z.string().min(1),
  supportLevel: EvidenceSupportLevel,
  confidence: z.number().min(0).max(1),
  justification: z.string(),
  basis: RelationBasis,
  verifierMode: VerifierMode,
  verifierVersion: z.string().min(1),
});
export type ClaimEvidenceRelation = z.infer<typeof ClaimEvidenceRelation>;

// ---------------------------------------------------------------------------
// EvidenceCoverage — the measurement boundary for a single diagnosis run.
//
// This is the ONLY thing that can make a negative / missing claim publishable.
// It records WHAT was actually checked so a negative statement can be bounded to
// "本次已检查的公开页面和搜索结果中未发现……" instead of an unbounded absolute
// fact. Derived from the executed query plan + controlled crawl scope + the
// observed evidence set — never from source authority alone.
// ---------------------------------------------------------------------------

export const SearchWindow = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type SearchWindow = z.infer<typeof SearchWindow>;

export const EvidenceCoverage = z.object({
  /** Stable id of the query plan this run executed. */
  queryPlanId: z.string(),
  /** Every query the plan produced (planned, may exceed executed). */
  plannedQueries: z.array(z.string()),
  /** Query Plan queries that were actually executed this run. */
  executedQueries: z.array(z.string()),
  /** Executed queries that returned results without a provider failure. */
  successfulQueries: z.array(z.string()),
  /** Executed queries that failed (provider error / empty). */
  failedQueries: z.array(z.string()),
  /** Domains actually searched/observed this run. */
  searchedDomains: z.array(z.string()),
  /** All crawled page URLs this run (superset of first-party scope). */
  crawledPages: z.array(z.string()),
  /** Controlled first-party crawl scope — the enterprise pages actually seen. */
  crawledFirstPartyUrls: z.array(z.string()),
  /** Enterprise domain(s) the crawl was scoped to. */
  firstPartyDomains: z.array(z.string()),
  /** Full evidence set observed this run (ids). */
  observedEvidenceIds: z.array(z.string()),
  /** Time window of the searched/observed evidence (ISO strings or null). */
  searchWindow: SearchWindow,
  /** Human-readable scope limitations (surfaced to bound negative claims). */
  coverageLimitations: z.array(z.string()),
  /**
   * Deterministic verdict: was enough of the enterprise's public surface
   * actually checked to defensibly bound a negative statement? Requires at least
   * one in-scope first-party page AND at least one executed query — an About page
   * with no executed query plan does NOT establish a boundary.
   */
  boundaryEstablished: z.boolean(),
});
export type EvidenceCoverage = z.infer<typeof EvidenceCoverage>;

// ---------------------------------------------------------------------------
// Deterministic coverage derivation. Pure; no authority-as-support shortcut —
// it only records the checked scope so downstream rules can bound negatives.
// ---------------------------------------------------------------------------

export interface DeriveCoverageInput {
  evidence: readonly EvidenceItem[];
  firstPartyDomains: readonly string[];
  executedQueries?: readonly string[];
  queryPlanId?: string;
  plannedQueries?: readonly string[];
  successfulQueries?: readonly string[];
  failedQueries?: readonly string[];
  searchedDomains?: readonly string[];
  searchWindow?: SearchWindow;
  coverageLimitations?: readonly string[];
}

/** Lowercase host, strip a single leading "www." and any trailing dot. */
function canonicalHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

function hostOfUrl(raw: string): string {
  try {
    return canonicalHost(new URL(raw).hostname);
  } catch {
    return "";
  }
}

function hostMatchesDomain(host: string, domain: string): boolean {
  const h = canonicalHost(host);
  const d = canonicalHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

export function deriveCoverage(input: DeriveCoverageInput): EvidenceCoverage {
  const firstPartyDomains = input.firstPartyDomains.map(canonicalHost).filter(Boolean);
  const executedQueries = [...(input.executedQueries ?? [])];

  const crawledFirstPartyUrls: string[] = [];
  for (const e of input.evidence) {
    if (e.sourceType !== "FIRST_PARTY_EVIDENCE") continue;
    const host = hostOfUrl(e.url);
    const inScope =
      firstPartyDomains.length === 0
        ? true
        : firstPartyDomains.some((d) => hostMatchesDomain(host, d));
    if (inScope) crawledFirstPartyUrls.push(e.url);
  }

  // A boundary requires BOTH a controlled first-party page in scope AND at least
  // one executed query (docs/CLAIM_EVIDENCE_VERIFICATION.md; Round-3 §六). An
  // About page with an empty query plan does NOT bound a negative claim.
  const boundaryEstablished = crawledFirstPartyUrls.length >= 1 && executedQueries.length >= 1;

  const searchedDomains = input.searchedDomains
    ? [...input.searchedDomains]
    : [...new Set(input.evidence.map((e) => canonicalHost(e.sourceDomain)).filter(Boolean))];

  return {
    queryPlanId: input.queryPlanId ?? "",
    plannedQueries: [...(input.plannedQueries ?? executedQueries)],
    executedQueries,
    successfulQueries: [...(input.successfulQueries ?? executedQueries)],
    failedQueries: [...(input.failedQueries ?? [])],
    searchedDomains,
    crawledPages: [...crawledFirstPartyUrls],
    crawledFirstPartyUrls,
    firstPartyDomains,
    observedEvidenceIds: input.evidence.map((e) => e.id),
    searchWindow: input.searchWindow ?? { from: null, to: null },
    coverageLimitations: [
      ...(input.coverageLimitations ?? []),
      ...(crawledFirstPartyUrls.length === 0 ? ["未检查到范围内的首方页面"] : []),
      ...(executedQueries.length === 0 ? ["本次未执行任何检索查询"] : []),
    ],
    boundaryEstablished,
  };
}

/** An explicitly-empty coverage (nothing checked) — negatives cannot publish. */
export function emptyCoverage(): EvidenceCoverage {
  return {
    queryPlanId: "",
    plannedQueries: [],
    executedQueries: [],
    successfulQueries: [],
    failedQueries: [],
    searchedDomains: [],
    crawledPages: [],
    crawledFirstPartyUrls: [],
    firstPartyDomains: [],
    observedEvidenceIds: [],
    searchWindow: { from: null, to: null },
    coverageLimitations: ["本次未建立测量边界(无检索、无受控抓取)"],
    boundaryEstablished: false,
  };
}
