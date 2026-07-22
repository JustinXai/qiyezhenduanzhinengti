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
    expect(snapshot.summary).not.toContain("没有投诉");
    expect(snapshot.summary).not.toContain("口碑良好");
  });

  it("deducts a bounded score for one reputation issue and marks system-generated questions", () => {
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
    expect(mvp.reputation?.riskLevel).toBe("LOW");
    expect(mvp.reputation?.overallReputationScore).toBeLessThan(82);
    expect(mvp.reputation?.complaintSignals).toHaveLength(1);
    expect(mvp.questionSource).toBe("SYSTEM_GENERATED");
    expect(mvp.overview.topProblems.join(" ")).toMatch(/舆情|争议|风险提示/);
    expect(mvp.coreIssues.some((issue) => /舆情|风险提示/.test(issue.title))).toBe(true);
    expect(mvp.contentPlans[0]?.title).toBe("舆情回应与信任修复方案");
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
    expect(snapshot.overallReputationScore).toBe(78);
    expect(snapshot.riskLevel).toBe("LOW");
  });

  it("deducts once for the same registry risk theme repeated across company-info platforms", () => {
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
    expect(snapshot.riskThemes).toEqual(["司法与企业风险提示"]);
    expect(snapshot.overallReputationScore).toBe(78);
    expect(snapshot.riskLevel).toBe("LOW");
  });
});
