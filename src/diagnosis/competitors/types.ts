// ============================================================================
// Competitor entity & official-domain resolution (Agent I) — shared types.
//
// Every competitor a user names must end up with an explicit, auditable
// resolution STATUS — we never silently drop a competitor and we never invent
// its official domain by string-concatenating a brand name with ".com". A
// domain is only ever trusted when it is either:
//   (a) supplied by the user and passes the SSRF / URL guard, or
//   (b) identified from real (mock, in this slice) search evidence.
// See docs/PRODUCT_TRUTH_RULES.md and AGENTS.md §10.
// ============================================================================

import type { EvidenceItem } from "../../contracts";

/**
 * Resolution status for a single competitor input. Exhaustive — the resolver
 * assigns exactly one to every input so nothing is dropped silently.
 *
 *  - USER_CONFIRMED : user supplied a website that passed the URL/SSRF guard.
 *  - RESOLVED       : a single official domain was identified from search.
 *  - AMBIGUOUS      : multiple distinct official candidates (same-name firms).
 *  - NOT_FOUND      : search returned nothing that looks like an official site.
 *  - INVALID_DOMAIN : user supplied a website that failed the URL/SSRF guard
 *                     (malformed, non-http, private / loopback / metadata, …).
 */
export type CompetitorResolutionStatus =
  | "USER_CONFIRMED"
  | "RESOLVED"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "INVALID_DOMAIN";

/** A resolution is "confirmed" only when it carries a trusted official domain. */
export const CONFIRMED_STATUSES: ReadonlySet<CompetitorResolutionStatus> =
  new Set(["USER_CONFIRMED", "RESOLVED"]);

export interface CompetitorResolution {
  /** The competitor name as the user typed it (trimmed). */
  name: string;
  /** Host the user asserted (canonical, www-stripped), or null if none given. */
  providedDomain: string | null;
  /** The confirmed official host, or null when not confirmed. */
  resolvedDomain: string | null;
  status: CompetitorResolutionStatus;
  /** 0..1 — how confident the resolution is. 0 for unconfirmed states. */
  confidence: number;
  /** Ids of the resolution evidence items backing this decision. */
  evidenceIds: string[];
  /** Human-readable, Chinese explanation of how the status was reached. */
  resolutionReason: string;
  /**
   * For AMBIGUOUS: the distinct official candidate hosts that could not be
   * disambiguated. Empty for every other status.
   */
  candidateDomains: string[];
}

export interface CompetitorResolutionResult {
  /** One entry per de-duplicated input, in input order. Never lossy. */
  resolutions: CompetitorResolution[];
  /**
   * Canonical evidence gathered while resolving (de-duplicated by id). Feed
   * this into the report's evidence set so `evidenceIds` stay referentially
   * valid downstream.
   */
  evidence: EvidenceItem[];
  /**
   * Confirmed competitor hosts (USER_CONFIRMED + RESOLVED), de-duplicated.
   * Passed to `normalizeEvidence` so competitor pages classify as
   * COMPETITOR_WEB_EVIDENCE — this REPLACES the old hard-coded scenario host.
   */
  resolvedDomains: string[];
}
