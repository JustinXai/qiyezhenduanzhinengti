/**
 * A support source is an entity/domain identity, never an Evidence row id.
 * Template-literal types keep persisted/audited values self-describing.
 */
export type IndependentSupportSourceKey =
  | `ENTITY:CURRENT_COMPANY:${string}`
  | `ENTITY:COMPETITOR:${string}`
  | `DOMAIN:${string}`;

export interface ResolvedCompetitorSupportEntity {
  /** Stable internal entity id. A display name is not an entity id. */
  competitorEntityId: string;
  /** Confirmed official hosts belonging to this competitor entity. */
  domains: readonly string[];
  /** Optional exact Evidence binding when persisted resolution provides it. */
  evidenceIds?: readonly string[];
}

export interface ClaimPublicationSourceContext {
  /** Stable id for the enterprise being diagnosed. */
  companyId: string;
  /** Confirmed domains/hosts belonging to the current enterprise. */
  firstPartyDomains: readonly string[];
  /** Only resolved competitor entities may receive competitor entity keys. */
  competitorEntities: readonly ResolvedCompetitorSupportEntity[];
}
