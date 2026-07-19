export type TechnicalCanaryStatus = "PASS" | "FAIL";

export type ProductYieldStatus =
  | "HEALTHY"
  | "SPARSE_BUT_TRUTHFUL"
  | "BLOCKED_BY_IMPLEMENTATION_BUG"
  | "INSUFFICIENT_SAMPLE";

export interface TechnicalCanaryChecks {
  completeChain: boolean;
  providerBudget: boolean;
  stateMachine: boolean;
  schemas: boolean;
  claimEvidenceTruth: boolean;
  scoring: boolean;
  chineseReport: boolean;
  security: boolean;
  reportViews: boolean;
  pageExperience: boolean;
  publicApi: boolean;
  auditPersistence: boolean;
}

export const TECHNICAL_CANARY_CHECK_NAMES = [
  "completeChain",
  "providerBudget",
  "stateMachine",
  "schemas",
  "claimEvidenceTruth",
  "scoring",
  "chineseReport",
  "security",
  "reportViews",
  "pageExperience",
  "publicApi",
  "auditPersistence",
] as const satisfies readonly (keyof TechnicalCanaryChecks)[];

export interface TechnicalCanaryDecision {
  status: TechnicalCanaryStatus;
  failedChecks: Array<keyof TechnicalCanaryChecks>;
}

/** Opportunity count is intentionally absent: sparse yield is not a technical failure. */
export function classifyTechnicalCanary(
  checks: TechnicalCanaryChecks,
): TechnicalCanaryDecision {
  const failedChecks = TECHNICAL_CANARY_CHECK_NAMES.filter((name) => !checks[name]);
  return { status: failedChecks.length === 0 ? "PASS" : "FAIL", failedChecks };
}

export type ZeroOpportunityRootCause =
  | "MODEL_RETURNED_ZERO_CANDIDATES"
  | "INVALID_SOURCE_ISSUE_REFERENCE"
  | "INVALID_EVIDENCE_REFERENCE"
  | "INSUFFICIENT_SUPPORT"
  | "DUPLICATED_EVIDENCE_SET"
  | "GENERIC_OR_UNACTIONABLE"
  | "BUILDER_OR_GUARD_BUG"
  | "VALID_SPARSE_RESULT";

export interface ProductYieldFacts {
  publishedIssueCount: number;
  publishedOpportunityCount: number;
  publishedDemonstrationFixCount: number;
  allPublishedOpportunitiesHaveValidLineage: boolean;
  implementationBugConfirmed: boolean;
  /** Required when publishedOpportunityCount is zero; never infer the cause from count. */
  zeroOpportunityRootCause: ZeroOpportunityRootCause | null;
}

export interface ProductYieldDecision {
  status: ProductYieldStatus;
  reason: ZeroOpportunityRootCause | "PUBLISHED_YIELD_HEALTHY";
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`INVALID_PRODUCT_YIELD_FACT:${field}`);
  }
}

/**
 * Product-yield classification consumes confirmed forensics. It never guesses
 * a zero-opportunity cause and never feeds back into TechnicalCanaryStatus.
 */
export function classifyProductYield(facts: ProductYieldFacts): ProductYieldDecision {
  assertNonNegativeInteger(facts.publishedIssueCount, "publishedIssueCount");
  assertNonNegativeInteger(facts.publishedOpportunityCount, "publishedOpportunityCount");
  assertNonNegativeInteger(
    facts.publishedDemonstrationFixCount,
    "publishedDemonstrationFixCount",
  );

  if (facts.implementationBugConfirmed) {
    if (facts.zeroOpportunityRootCause !== "BUILDER_OR_GUARD_BUG") {
      throw new Error("PRODUCT_YIELD_BUG_CAUSE_MISMATCH");
    }
    return {
      status: "BLOCKED_BY_IMPLEMENTATION_BUG",
      reason: "BUILDER_OR_GUARD_BUG",
    };
  }

  if (facts.publishedOpportunityCount > 0) {
    if (facts.zeroOpportunityRootCause !== null) {
      throw new Error("ZERO_OPPORTUNITY_CAUSE_WITH_PUBLISHED_OPPORTUNITY");
    }
    if (!facts.allPublishedOpportunitiesHaveValidLineage) {
      return {
        status: "BLOCKED_BY_IMPLEMENTATION_BUG",
        reason: "BUILDER_OR_GUARD_BUG",
      };
    }
    return { status: "HEALTHY", reason: "PUBLISHED_YIELD_HEALTHY" };
  }

  if (facts.zeroOpportunityRootCause === null) {
    throw new Error("ZERO_OPPORTUNITY_ROOT_CAUSE_REQUIRED");
  }
  if (facts.zeroOpportunityRootCause === "BUILDER_OR_GUARD_BUG") {
    return {
      status: "BLOCKED_BY_IMPLEMENTATION_BUG",
      reason: facts.zeroOpportunityRootCause,
    };
  }
  if (facts.zeroOpportunityRootCause === "MODEL_RETURNED_ZERO_CANDIDATES") {
    return {
      status: "INSUFFICIENT_SAMPLE",
      reason: facts.zeroOpportunityRootCause,
    };
  }
  return {
    status: "SPARSE_BUT_TRUTHFUL",
    reason: facts.zeroOpportunityRootCause,
  };
}

export interface Round53CanaryClassification {
  technical: TechnicalCanaryDecision;
  productYield: ProductYieldDecision;
}

export function classifyRound53Canary(input: {
  technicalChecks: TechnicalCanaryChecks;
  productYieldFacts: ProductYieldFacts;
}): Round53CanaryClassification {
  return {
    technical: classifyTechnicalCanary(input.technicalChecks),
    productYield: classifyProductYield(input.productYieldFacts),
  };
}
