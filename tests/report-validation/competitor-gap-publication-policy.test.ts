import { describe, expect, it } from "vitest";
import type { DiagnosisReport, EvidenceItem } from "../../src/contracts";
import type { ClaimEvidenceRelation } from "../../src/contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../../src/contracts/independent-support-source";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import {
  COMPETITOR_GAP_PUBLICATION_POLICY_VERSION,
  evaluateCompetitorGapPublication,
  type CompetitorGapPublicationMetadata,
  type CompetitorGapPublicationPolicyInput,
} from "../../src/report/validation/competitor-gap-publication-policy";
import { pruneUnsupportedClaims } from "../../src/report/validation/prune-claims";
import { publishGuard } from "../../src/report/validation/publish-guard";
import { coverageOf } from "./support";

const templateEvidence = buildSampleReport().evidence[0]!;

function evidence(
  id: string,
  sourceType: EvidenceItem["sourceType"],
  domain: string,
): EvidenceItem {
  return {
    ...templateEvidence,
    id,
    title: `${domain} FAQ evidence`,
    sourceType,
    sourceDomain: domain,
    normalizedDomain: domain,
    url: `https://${domain}/${id}`,
  };
}

function relation(
  evidenceId: string,
  supportLevel: ClaimEvidenceRelation["supportLevel"] = "PARTIAL_SUPPORT",
): ClaimEvidenceRelation {
  return {
    claimId: "gap_1",
    claimKind: "competitorGap",
    evidenceId,
    supportLevel,
    confidence: 0.8,
    justification: "Verifier confirmed the FAQ comparison dimension.",
    basis: "CONTENT_MATCH",
    verifierMode: "MOCK_DETERMINISTIC",
    verifierVersion: "competitor-gap.test.v1",
  };
}

const sourceContext: ClaimPublicationSourceContext = {
  companyId: "company_qiaqia",
  firstPartyDomains: ["company.example"],
  competitorEntities: [
    {
      competitorEntityId: "competitor_three_squirrels",
      domains: ["competitor.example"],
    },
  ],
};

const validMetadata: CompetitorGapPublicationMetadata = {
  competitorNameSource: "USER_INPUT",
  competitorEntityId: "competitor_three_squirrels",
  comparisonDimension: "FAQ入口",
  currentCompanyComparisonDimension: "FAQ入口",
  competitorComparisonDimension: "FAQ入口",
  conclusionWithinEvidence: true,
  negativeOrMissing: true,
  currentCompanyCoverageEstablished: true,
  competitorCoverageEstablished: true,
  boundedScope: true,
};

function policyInput(overrides: {
  evidence?: EvidenceItem[];
  evidenceIds?: string[];
  relations?: ClaimEvidenceRelation[];
  sourceContext?: ClaimPublicationSourceContext;
  metadata?: Partial<CompetitorGapPublicationMetadata>;
} = {}): CompetitorGapPublicationPolicyInput {
  const evidenceItems = overrides.evidence ?? [
    evidence("ev_current", "FIRST_PARTY_EVIDENCE", "company.example"),
    evidence("ev_competitor", "COMPETITOR_WEB_EVIDENCE", "competitor.example"),
  ];
  return {
    gap: {
      id: "gap_1",
      competitorName: "三只松鼠",
      gapStatement:
        "本次检查的三只松鼠公开官网页面中可见FAQ入口；在本次已检查的洽洽公开页面中暂未发现同类入口。",
      evidenceIds: overrides.evidenceIds ?? evidenceItems.map((item) => item.id),
    },
    evidence: evidenceItems,
    relations: overrides.relations ?? [relation("ev_current"), relation("ev_competitor")],
    sourceContext: overrides.sourceContext ?? sourceContext,
    metadata: { ...validMetadata, ...overrides.metadata },
  };
}

function reportWithGap(input: CompetitorGapPublicationPolicyInput): DiagnosisReport {
  return buildSampleReport({
    evidence: [...input.evidence],
    strengths: [],
    coreIssues: [],
    geoOpportunities: [],
    competitorGaps: [{ ...input.gap, evidenceIds: [...input.gap.evidenceIds] }],
    demonstrationFix: null,
  });
}

describe("CompetitorGapPublicationPolicyV1", () => {
  it("1. prunes a Gap with no competitor Evidence relation", () => {
    const input = policyInput({
      evidence: [evidence("ev_current", "FIRST_PARTY_EVIDENCE", "company.example")],
      relations: [relation("ev_current")],
    });
    expect(evaluateCompetitorGapPublication(input)).toMatchObject({
      policyVersion: COMPETITOR_GAP_PUBLICATION_POLICY_VERSION,
      outcome: "PRUNE",
      reason: "MISSING_COMPETITOR_OFFICIAL_RELATION",
    });
  });

  it("2. prunes ordinary web competitor Evidence without an official relation", () => {
    const input = policyInput({
      evidence: [
        evidence("ev_current", "FIRST_PARTY_EVIDENCE", "company.example"),
        evidence("ev_observed", "OBSERVED_WEB_EVIDENCE", "news.example"),
      ],
      relations: [relation("ev_current"), relation("ev_observed")],
    });
    expect(evaluateCompetitorGapPublication(input)).toMatchObject({
      outcome: "PRUNE",
      reason: "MISSING_COMPETITOR_OFFICIAL_RELATION",
    });
  });

  it("3. prunes official competitor Evidence that has no Claim relation", () => {
    const input = policyInput({ relations: [relation("ev_current")] });
    expect(evaluateCompetitorGapPublication(input)).toMatchObject({
      outcome: "PRUNE",
      reason: "MISSING_COMPETITOR_OFFICIAL_RELATION",
    });
  });

  it("4. publishes after official PARTIAL and current-company relations pass", () => {
    expect(evaluateCompetitorGapPublication(policyInput())).toMatchObject({
      outcome: "PUBLISH",
      reason: "PUBLISHED",
      competitorEntityConfirmed: true,
      currentCompanyRelationEvidenceIds: ["ev_current"],
      competitorOfficialRelationEvidenceIds: ["ev_competitor"],
    });
  });

  it("5. prunes when the two sides do not support the same dimension", () => {
    const input = policyInput({
      metadata: { competitorComparisonDimension: "配送时效" },
    });
    expect(evaluateCompetitorGapPublication(input)).toMatchObject({
      outcome: "PRUNE",
      reason: "COMPARISON_DIMENSION_MISMATCH",
      comparisonDimensionMatched: false,
    });
  });

  it("6. prunes when the competitor entity is not confirmed", () => {
    const input = policyInput({
      sourceContext: { ...sourceContext, competitorEntities: [] },
    });
    expect(evaluateCompetitorGapPublication(input)).toMatchObject({
      outcome: "PRUNE",
      reason: "COMPETITOR_ENTITY_NOT_RESOLVED",
    });
  });

  it("7. sends a bounded negative Gap without Coverage to Deep confirmation", () => {
    const input = policyInput({
      metadata: { currentCompanyCoverageEstablished: false },
    });
    expect(evaluateCompetitorGapPublication(input)).toMatchObject({
      outcome: "DEEP_NEEDS_CONFIRMATION",
      reason: "COMPETITOR_COVERAGE_NOT_ESTABLISHED",
      coverageStatus: "NOT_ESTABLISHED",
    });
  });

  it("8. removes a competitor-only observation from the public Quick Gap", () => {
    const input = policyInput({
      evidence: [
        evidence("ev_competitor", "COMPETITOR_WEB_EVIDENCE", "competitor.example"),
      ],
      relations: [relation("ev_competitor")],
    });
    const report = reportWithGap(input);
    const result = pruneUnsupportedClaims(
      report,
      input.relations,
      coverageOf(report),
      {
        sourceContext,
        competitorGapContexts: { gap_1: input.metadata },
      },
    );
    expect(result.report.competitorGaps).toEqual([]);
    expect(result.pruned).toContainEqual({
      kind: "competitorGap",
      ref: "gap_1",
      reasonCode: "MISSING_CURRENT_COMPANY_RELATION",
    });
  });

  it("blocks unsupported or non-verifier relations from public output", () => {
    const unsupported = policyInput({
      relations: [relation("ev_current"), relation("ev_competitor", "UNSUPPORTED")],
    });
    expect(evaluateCompetitorGapPublication(unsupported)).toMatchObject({
      outcome: "BLOCK",
      reason: "UNVERIFIED_COMPETITOR_ASSERTION",
    });

    const unverified = policyInput();
    unverified.relations = unverified.relations.map((item) => ({
      ...item,
      verifierVersion: "",
    }));
    expect(evaluateCompetitorGapPublication(unverified)).toMatchObject({
      outcome: "BLOCK",
      reason: "UNVERIFIED_COMPETITOR_ASSERTION",
    });
  });

  it("fails closed when bounded-scope or conclusion metadata is absent", () => {
    expect(
      evaluateCompetitorGapPublication(
        policyInput({ metadata: { boundedScope: false } }),
      ),
    ).toMatchObject({ outcome: "PRUNE", reason: "UNVERIFIED_COMPETITOR_ASSERTION" });
    expect(
      evaluateCompetitorGapPublication(
        policyInput({ metadata: { conclusionWithinEvidence: false } }),
      ),
    ).toMatchObject({ outcome: "PRUNE", reason: "UNVERIFIED_COMPETITOR_ASSERTION" });
  });

  it("the public Publish Guard fails closed when comparison metadata is absent", () => {
    const input = policyInput();
    const report = reportWithGap(input);
    const result = publishGuard({
      report,
      relations: input.relations,
      coverage: coverageOf(report),
      sourceContext,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          claimId: "gap_1",
          rule: "COMPETITOR_GAP_UNVERIFIED_COMPETITOR_ASSERTION",
        }),
      );
    }
  });

  it("the public Publish Guard delegates a fully verified Gap to Policy V1", () => {
    const input = policyInput();
    const report = reportWithGap(input);
    expect(
      publishGuard({
        report,
        relations: input.relations,
        coverage: coverageOf(report),
        sourceContext,
        competitorGapContexts: { gap_1: input.metadata },
      }),
    ).toEqual({ ok: true });
  });
});
