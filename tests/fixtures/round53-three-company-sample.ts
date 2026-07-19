import type {
  CompanySampleFixture,
  SampleClaimCandidate,
  SampleEvidence,
  SampleOpportunityCandidate,
} from "../../scripts/round53-three-company-sample";

function evidence(company: string): SampleEvidence[] {
  return [
    {
      id: `${company}-ev-a`,
      language: "zh-CN",
      normalizedDomain: `${company}.example.cn`,
      tier: "A",
      sourceType: "FIRST_PARTY_EVIDENCE",
    },
    {
      id: `${company}-ev-b`,
      language: "zh-CN",
      normalizedDomain: `news-${company}.example.cn`,
      tier: "B",
      sourceType: "OBSERVED_WEB_EVIDENCE",
    },
    {
      id: `${company}-ev-c`,
      language: "en",
      normalizedDomain: `reference-${company}.example.com`,
      tier: "C",
      sourceType: "OBSERVED_WEB_EVIDENCE",
    },
    {
      id: `${company}-ev-d`,
      language: "zh-CN",
      normalizedDomain: `directory-${company}.example.com`,
      tier: "D",
      sourceType: "OBSERVED_WEB_EVIDENCE",
    },
    {
      id: `${company}-ev-e`,
      language: "zh-CN",
      normalizedDomain: `social-${company}.example.com`,
      tier: "E",
      sourceType: "OBSERVED_WEB_EVIDENCE",
    },
  ];
}

function claims(company: string): SampleClaimCandidate[] {
  return [
    {
      id: `${company}-strength`,
      kind: "STRENGTH",
      text: "公开资料展示了可核验的产品能力。",
      publicationStatus: "PUBLISHED",
      verificationVerdict: "SUPPORTED",
      support: [{ evidenceId: `${company}-ev-a`, supportLevel: "DIRECT_SUPPORT", basis: "CONTENT_MATCH" }],
      negativeOrMissing: false,
      coverageLimited: false,
    },
    {
      id: `${company}-issue`,
      kind: "ISSUE",
      text: "本次已检查的公开页面和搜索结果中未发现集中说明采购核验步骤的页面。",
      publicationStatus: "PUBLISHED",
      verificationVerdict: "SUPPORTED",
      support: [{ evidenceId: `${company}-ev-a`, supportLevel: "DIRECT_SUPPORT", basis: "MEASUREMENT_BOUNDARY" }],
      negativeOrMissing: true,
      coverageLimited: true,
    },
    {
      id: `${company}-pruned-strength`,
      kind: "STRENGTH",
      text: "上下文页面无法单独证明该能力。",
      publicationStatus: "PRUNED",
      verificationVerdict: "UNSUPPORTED",
      support: [{ evidenceId: `${company}-ev-c`, supportLevel: "CONTEXT_ONLY", basis: "CONTENT_MATCH" }],
      negativeOrMissing: false,
      coverageLimited: false,
      pruneReason: "INSUFFICIENT_INDEPENDENT_SUPPORT",
    },
  ];
}

function credibleOpportunity(company: string): SampleOpportunityCandidate {
  return {
    id: `${company}-opportunity`,
    text: "发布包含验收步骤和对应证据链接的中文核验页。",
    publicationStatus: "PUBLISHED",
    verificationVerdict: "SUPPORTED",
    sourceIssueId: `${company}-issue`,
    evidenceIds: [`${company}-ev-a`, `${company}-ev-b`],
    support: [
      { evidenceId: `${company}-ev-a`, supportLevel: "PARTIAL_SUPPORT", basis: "MEASUREMENT_BOUNDARY" },
      { evidenceId: `${company}-ev-b`, supportLevel: "PARTIAL_SUPPORT", basis: "MEASUREMENT_BOUNDARY" },
    ],
    customerQuestion: "采购团队如何快速核验关键能力？",
    contentGap: "本次已检查的公开页面和搜索结果中未发现集中说明采购核验步骤的页面。",
    recommendedAction: "发布包含验收步骤和对应证据链接的中文核验页。",
    priorityReason: "该页面直接回应已发布问题对应的采购核验缺口。",
    genericTemplate: false,
  };
}

export function buildRound53ThreeCompanyMockFixture(): CompanySampleFixture[] {
  return ["alpha", "beta", "gamma"].map((company, index) => ({
    companyId: company,
    evidence: evidence(company),
    coverage: {
      queryPlanId: `${company}-plan`,
      plannedQueries: [`${company} 产品`],
      executedQueries: [`${company} 产品`],
      successfulQueries: [`${company} 产品`],
      failedQueries: [],
      searchedDomains: [`${company}.example.cn`],
      crawledPages: [`https://${company}.example.cn/`],
      crawledFirstPartyUrls: [`https://${company}.example.cn/`],
      firstPartyDomains: [`${company}.example.cn`],
      observedEvidenceIds: evidence(company).map((item) => item.id),
      searchWindow: { from: null, to: null },
      coverageLimitations: ["仅限公开页面和搜索结果"],
      boundaryEstablished: true,
    },
    sourceContext: {
      companyId: company,
      firstPartyDomains: [`${company}.example.cn`],
      competitorEntities: [],
    },
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
