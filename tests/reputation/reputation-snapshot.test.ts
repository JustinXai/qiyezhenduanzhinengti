import { describe, expect, it } from "vitest";
import { buildReputationQueries } from "../../src/diagnosis/reputation/policy";
import { buildReputationSnapshot } from "../../src/diagnosis/reputation/snapshot";
import { buildUniversalLimitedReport } from "../../src/diagnosis/limited-report/universal-limited-report";
import type { EvidenceItem } from "../../src/contracts";

const complaintEvidence: EvidenceItem[] = [
  {
    id: "ev_rep_1",
    title: "成都万学海文教育科技有限公司 黑猫投诉 退费合同争议",
    sourceDomain: "tousu.sina.com.cn",
    sourceType: "OBSERVED_WEB_EVIDENCE",
    authorityLevel: "MEDIA",
    supportLevel: "CONTEXT_ONLY",
    acquisitionLevel: "SEARCH_SNIPPET",
    fetchedAt: "2026-07-22T00:00:00.000Z",
    snippet: "用户反馈退费、课程和合同条款相关争议，暂未看到清晰企业回应。",
    url: "https://tousu.sina.com.cn/complaint/example",
  },
];

describe("reputation snapshot", () => {
  it("adds education-specific reputation queries from centralized policy", () => {
    const queries = buildReputationQueries({
      brandName: "成都万学海文教育科技有限公司",
      industry: "教育培训",
      productOrService: "考研培训课程",
      targetRegion: "成都",
    }, 8);
    expect(queries).toHaveLength(8);
    expect(queries.join(" ")).toContain("退费");
    expect(queries.join(" ")).toContain("课程缩水");
    expect(queries.join(" ")).toContain("教学质量");
  });

  it("keeps no-negative copy bounded without claiming good reputation", () => {
    const snapshot = buildReputationSnapshot({
      diagnosisId: "diag_rep",
      diagnosisInput: { brandName: "任意企业", website: "", industry: "品牌服务" },
      evidence: [],
      searchedQueries: ["任意企业 投诉"],
      generatedAt: "2026-07-22T00:00:00.000Z",
    });
    expect(snapshot.summary).toBe("本次公开检索匹配到相关公开信息，暂未发现明确负面风险信号。");
    expect(snapshot.overallReputationScore).toBe(65);
    expect(snapshot.reputationNeutralBase).toBe(65);
    expect(snapshot.positiveReputationBonus).toBe(0);
    expect(snapshot.summary).not.toContain("没有投诉");
    expect(snapshot.summary).not.toContain("口碑良好");
  });

  it("case 1: valid customer-visible negative starts from neutral baseline and becomes HIGH risk", () => {
    const report = buildUniversalLimitedReport(
      {
        brandName: "成都万学海文教育科技有限公司",
        website: "",
        industry: "教育培训",
        productOrService: "考研培训",
        targetRegion: "成都",
      },
      complaintEvidence,
      true,
      "2026-07-22T00:00:00.000Z",
      { diagnosisId: "diag_rep" },
    );
    const mvp = report.mvpReport!;
    expect(mvp.reputation?.riskLevel).toBe("HIGH");
    expect(mvp.reputation?.overallReputationScore).toBe(35);
    expect(mvp.reputation?.reputationHealthScore).toBe(35);
    expect(mvp.reputation?.reputationNeutralBase).toBe(65);
    expect(mvp.reputation?.positiveReputationBonus).toBe(0);
    expect(mvp.reputation?.preNegativeReputationScore).toBe(65);
    expect(mvp.reputation?.evidenceConfidence).toBe("MEDIUM");
    expect(mvp.reputation?.factualSpecificityConfidence).toBe("MEDIUM");
    expect(mvp.reputation?.complaintSignals).toHaveLength(1);
    expect(mvp.questionSource).toBe("SYSTEM_GENERATED");
    expect(mvp.overview.topProblems.join(" ")).toMatch(/舆情|争议|风险提示/);
    expect(mvp.coreIssues[0]?.title).toBe("公开舆情影响客户信任");
    expect(mvp.coreIssues[0]?.priority).toBe("P0");
    expect(mvp.contentPlans[0]?.title).toBe("舆情核实与信任修复");
  });

  it("does not treat registry navigation risk words or trademark pages as negative responses", () => {
    const snapshot = buildReputationSnapshot({
      diagnosisId: "diag_rep",
      diagnosisInput: { brandName: "成都万学海文教育科技有限公司", website: "", industry: "教育培训" },
      evidence: [
        {
          id: "ev_registry",
          title: "成都万学海文教育科技有限公司商标信息查询 - 天眼查",
          sourceDomain: "www.tianyancha.com",
          sourceType: "OBSERVED_WEB_EVIDENCE",
          authorityLevel: "MEDIA",
          supportLevel: "CONTEXT_ONLY",
          acquisitionLevel: "SEARCH_SNIPPET",
          fetchedAt: "2026-07-22T00:00:00.000Z",
          snippet: "风险监控 存续 曾用名 小微企业 电话: 登录查看 商标信息。",
          url: "https://www.tianyancha.com/tm/example",
        },
        {
          id: "ev_qixin",
          title: "成都万学海文教育科技有限公司_投资融资 - 启信宝",
          sourceDomain: "www.qixin.com",
          sourceType: "OBSERVED_WEB_EVIDENCE",
          authorityLevel: "MEDIA",
          supportLevel: "CONTEXT_ONLY",
          acquisitionLevel: "SEARCH_SNIPPET",
          fetchedAt: "2026-07-22T00:00:00.000Z",
          snippet: "自身风险 3条 司法案件 启信分: 608分，相关事实需进一步核验。",
          url: "https://www.qixin.com/company/example",
        },
      ],
      searchedQueries: ["成都万学海文教育科技有限公司 舆情"],
      generatedAt: "2026-07-22T00:00:00.000Z",
    });

    expect(snapshot.complaintSignals.map((item) => item.evidenceId)).toEqual(["ev_qixin"]);
    expect(snapshot.responseSignals).toHaveLength(0);
    expect(snapshot.overallReputationScore).toBe(35);
    expect(snapshot.riskLevel).toBe("HIGH");
    expect(snapshot.factualSpecificityConfidence).toBe("MEDIUM");
  });

  it("case 2: weak registry navigation risk words do not trigger conversion penalty", () => {
    const weak = buildReputationSnapshot({
      diagnosisId: "diag_rep",
      diagnosisInput: { brandName: "成都万学海文教育科技有限公司", website: "", industry: "教育培训" },
      evidence: [{
        id: "ev_registry",
        title: "成都万学海文教育科技有限公司商标信息查询 - 天眼查",
        sourceDomain: "www.tianyancha.com",
        sourceType: "OBSERVED_WEB_EVIDENCE",
        authorityLevel: "MEDIA",
        supportLevel: "CONTEXT_ONLY",
        acquisitionLevel: "SEARCH_SNIPPET",
        fetchedAt: "2026-07-22T00:00:00.000Z",
        snippet: "风险监控 存续 曾用名 小微企业 电话: 登录查看 商标信息。",
        url: "https://www.tianyancha.com/tm/example",
      }],
      searchedQueries: ["成都万学海文教育科技有限公司 舆情"],
      generatedAt: "2026-07-22T00:00:00.000Z",
    });

    expect(weak.complaintSignals).toHaveLength(0);
    expect(weak.overallReputationScore).toBe(65);
    expect(weak.riskLevel).toBe("LOW");
    expect(weak.reputationNeutralBase).toBe(65);
  });

  it("case 3: multiple independent sources add repeated-source and decision-impact penalties without authority severity", () => {
    const snapshot = buildReputationSnapshot({
      diagnosisId: "diag_rep",
      diagnosisInput: { brandName: "成都万学海文教育科技有限公司", website: "", industry: "教育培训" },
      evidence: [
        {
          id: "ev_qcc",
          title: "成都万学海文教育科技有限公司招聘信息 - 企查查",
          sourceDomain: "企查查",
          sourceType: "OBSERVED_WEB_EVIDENCE",
          authorityLevel: "MEDIA",
          supportLevel: "CONTEXT_ONLY",
          acquisitionLevel: "SEARCH_SNIPPET",
          fetchedAt: "2026-07-22T00:00:00.000Z",
          snippet: "风险方面发现成都万学海文教育科技有限公司含有司法案件5条,裁判文书2条,立案信息4条,开庭公告5条。",
          url: "https://www.qcc.com/example",
        },
        {
          id: "ev_qixin",
          title: "成都万学海文教育科技有限公司_投资融资 - 启信宝",
          sourceDomain: "启信宝",
          sourceType: "OBSERVED_WEB_EVIDENCE",
          authorityLevel: "MEDIA",
          supportLevel: "CONTEXT_ONLY",
          acquisitionLevel: "SEARCH_SNIPPET",
          fetchedAt: "2026-07-22T00:00:00.000Z",
          snippet: "自身风险 3条 司法案件 启信分: 608分，相关事实需进一步核验。",
          url: "https://www.qixin.com/company/example",
        },
      ],
      searchedQueries: ["成都万学海文教育科技有限公司 舆情"],
      generatedAt: "2026-07-22T00:00:00.000Z",
    });

    expect(snapshot.complaintSignals).toHaveLength(2);
    expect(snapshot.riskThemes).toEqual(["司法案件与公开企业风险信息"]);
    expect(snapshot.overallReputationScore).toBe(30);
    expect(snapshot.riskLevel).toBe("HIGH");
    expect(snapshot.searchCoverageConfidence).toBe("MEDIUM");
    expect(snapshot.entityRelationConfidence).toBe("HIGH");
    expect(snapshot.nameMatchConfidence).toBe("HIGH");
    expect(snapshot.underlyingEntityConfidence).toBe("MEDIUM");
    expect(snapshot.eventAttributionConfidence).toBe("MEDIUM");
    expect(snapshot.factualSpecificityConfidence).toBe("MEDIUM");
    expect(snapshot.customerVisibilityConfidence).toBe("MEDIUM");
    expect(snapshot.underlyingNegativeEventCount).toBe(1);
    expect(snapshot.customerVisibleEntryCount).toBe(2);
    expect(snapshot.independentOriginalSourceCount).toBe(0);
  });

  it("case 4: reputation score drop recalculates overall score and routes first 30 days to reputation containment", () => {
    const report = buildUniversalLimitedReport(
      {
        brandName: "成都万学海文教育科技有限公司",
        website: "",
        industry: "教育培训",
        productOrService: "考研培训",
        targetRegion: "成都",
      },
      [
        ...complaintEvidence,
        {
          id: "ev_qixin",
          title: "成都万学海文教育科技有限公司_投资融资 - 启信宝",
          sourceDomain: "www.qixin.com",
          sourceType: "OBSERVED_WEB_EVIDENCE",
          authorityLevel: "MEDIA",
          supportLevel: "CONTEXT_ONLY",
          acquisitionLevel: "SEARCH_SNIPPET",
          fetchedAt: "2026-07-22T00:00:00.000Z",
          snippet: "自身风险 3条 司法案件 启信分: 608分，相关事实需进一步核验。",
          url: "https://www.qixin.com/company/example",
        },
      ],
      true,
      "2026-07-22T00:00:00.000Z",
      { diagnosisId: "diag_rep" },
    );
    const mvp = report.mvpReport!;

    expect(mvp.reputation?.overallReputationScore).toBe(30);
    expect(mvp.score.overall).not.toBeNull();
    expect(mvp.score.overall).toBeLessThanOrEqual(40);
    expect(mvp.score.level).toBe("当前存在高优先级信任风险");
    expect(mvp.overview.topProblems[0]).toContain("公开舆情影响客户信任");
    expect(mvp.coreIssues[0]?.title).toBe("公开舆情影响客户信任");
    expect(mvp.roadmap[0]?.companyActions.join(" ")).toContain("逐条核实风险证据");
    expect(mvp.roadmap[0]?.acceptanceCriteria.join(" ")).toContain("不是用正面内容掩盖争议");
  });
});
