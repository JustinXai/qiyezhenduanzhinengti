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
    expect(snapshot.summary).toBe("本次公开检索暂未发现明显集中的负面舆情。");
    expect(snapshot.summary).not.toContain("没有投诉");
    expect(snapshot.summary).not.toContain("口碑良好");
  });

  it("puts medium reputation risk into the MVP report and marks system-generated questions", () => {
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
    expect(mvp.reputation?.riskLevel).toBe("MEDIUM");
    expect(mvp.questionSource).toBe("SYSTEM_GENERATED");
    expect(mvp.coreIssues[0]?.title).toMatch(/舆情|投诉|争议/);
    expect(mvp.contentPlans[0]?.title).toBe("舆情回应与信任修复方案");
  });
});
