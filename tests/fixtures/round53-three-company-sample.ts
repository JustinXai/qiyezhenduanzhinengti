import type {
  CompanySampleFixture,
  SampleClaimCandidate,
  SampleEvidence,
  SampleOpportunityCandidate,
} from "../../scripts/round53-three-company-sample";

function evidence(company: string): SampleEvidence[] {
  return [
    { id: `${company}-ev-a`, language: "zh-CN", normalizedDomain: `${company}.example.cn`, tier: "A" },
    { id: `${company}-ev-b`, language: "zh-CN", normalizedDomain: `news-${company}.example.cn`, tier: "B" },
    { id: `${company}-ev-c`, language: "en", normalizedDomain: `reference-${company}.example.com`, tier: "C" },
  ];
}

function claims(company: string): SampleClaimCandidate[] {
  return [
    {
      id: `${company}-strength`,
      kind: "STRENGTH",
      publicationStatus: "PUBLISHED",
      verificationVerdict: "SUPPORTED",
      support: [{ evidenceId: `${company}-ev-a`, supportLevel: "DIRECT_SUPPORT" }],
      negativeOrMissing: false,
      coverageLimited: false,
    },
    {
      id: `${company}-issue`,
      kind: "ISSUE",
      publicationStatus: "PUBLISHED",
      verificationVerdict: "SUPPORTED",
      support: [{ evidenceId: `${company}-ev-a`, supportLevel: "DIRECT_SUPPORT" }],
      negativeOrMissing: true,
      coverageLimited: true,
    },
    {
      id: `${company}-pruned-strength`,
      kind: "STRENGTH",
      publicationStatus: "PRUNED",
      verificationVerdict: "UNSUPPORTED",
      support: [{ evidenceId: `${company}-ev-c`, supportLevel: "CONTEXT_ONLY" }],
      negativeOrMissing: false,
      coverageLimited: false,
      pruneReason: "INSUFFICIENT_INDEPENDENT_SUPPORT",
    },
  ];
}

function credibleOpportunity(company: string): SampleOpportunityCandidate {
  return {
    id: `${company}-opportunity`,
    publicationStatus: "PUBLISHED",
    verificationVerdict: "SUPPORTED",
    sourceIssueId: `${company}-issue`,
    evidenceIds: [`${company}-ev-a`, `${company}-ev-b`],
    support: [
      { evidenceId: `${company}-ev-a`, supportLevel: "PARTIAL_SUPPORT" },
      { evidenceId: `${company}-ev-b`, supportLevel: "PARTIAL_SUPPORT" },
    ],
    customerQuestion: "采购团队如何快速核验关键能力？",
    recommendedAction: "发布包含验收步骤和对应证据链接的中文核验页。",
    priorityReason: "该页面直接回应已发布问题对应的采购核验缺口。",
    genericTemplate: false,
  };
}

export function buildRound53ThreeCompanyMockFixture(): CompanySampleFixture[] {
  return ["alpha", "beta", "gamma"].map((company, index) => ({
    companyId: company,
    evidence: evidence(company),
    claims: claims(company),
    opportunities: index < 2 ? [credibleOpportunity(company)] : [],
    demonstrationFix:
      index === 0
        ? {
            publicationStatus: "PUBLISHED",
            sourceIssueId: `${company}-issue`,
            evidenceIds: [`${company}-ev-a`],
          }
        : null,
    quickVisibleCharacters: 900 + index * 100,
    durationMs: 1_000 + index * 100,
    providerCalls: { bocha: 0, crawler: 0, deepseek: 0, viewSwitchAdditional: 0 },
    scoreCoverage: 1,
    measurementComposition: {
      measuredWeight: 0.4,
      estimatedWeight: 0.6,
      insufficientWeight: 0,
      providerFailedWeight: 0,
    },
  }));
}
