// ============================================================================
// Round-7 Mock 验收测试场景
// 来源于 docs/product/ROUND7_QUICK_FIRST_SME_CONVERSION.md §七
//
// 验收标准：
// A. 食品类区域企业：公开信息较少，Quick 能输出 2-3 个公开信息完善机会
// B. 工业 B2B 中小企业：产品选型、售后、案例问题回答不足
// C. 本地服务企业：服务流程、价格边界、案例、地域覆盖不清
//
// 重要：所有内容均为 Mock，不得冒充真实企业事实
// ============================================================================

import type { DiagnosisReport, QuestionCoverageGap } from "../src/contracts";
import { SAMPLE_DIAGNOSIS_REPORT } from "../src/fixtures/sample-report";

// ---------------------------------------------------------------------------
// 场景 A：食品类区域企业
// 特征：公开信息较少
// ---------------------------------------------------------------------------

export function createMockReportForFoodRegionalEnterprise(): DiagnosisReport {
  const questionCoverageGaps: QuestionCoverageGap[] = [
    {
      questionId: "q-foode-1",
      questionText: "这个品牌的产品口感如何？有哪些口味可以选择？",
      coverageStatus: "PARTIALLY_SUPPORTED",
      observedScope: "官网产品页面列出了部分产品名称，但未找到口感描述和口味选择信息",
      missingInformation: "产品口感描述和口味选择列表",
      suggestedAction: "在官网产品页面补充产品口感描述和完整口味列表",
      businessValue: "帮助客户快速了解产品特点，提升购买决策效率",
      evidenceIds: [],
    },
    {
      questionId: "q-foode-2",
      questionText: "哪里可以买到这个品牌的产品？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次搜索结果中未找到购买渠道信息",
      missingInformation: "线上购买渠道（天猫/京东/拼多多）和线下商超信息",
      suggestedAction: "在官网添加购买渠道页面或弹窗链接",
      businessValue: "降低客户购买门槛，直接转化潜在客户",
      evidenceIds: [],
    },
    {
      questionId: "q-foode-3",
      questionText: "品牌有没有工厂直供或加盟合作的机会？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次未搜索到任何关于加盟或合作的信息",
      missingInformation: "加盟合作政策、联系方式或招商页面入口",
      suggestedAction: "建立加盟合作页面或展示企业联系方式",
      businessValue: "拓展 B2B 渠道和经销商网络",
      evidenceIds: [],
    },
  ];

  return {
    ...SAMPLE_DIAGNOSIS_REPORT,
    companyProfile: {
      ...SAMPLE_DIAGNOSIS_REPORT.companyProfile,
      brandName: "安徽乐锦记食品有限公司",
      productOrService: "休闲零食",
      industry: "食品消费",
    },
    questionCoverageGaps,
    geoOpportunities: [], // 无正式 GEO Opportunity
    coreIssues: [], // 无正式核心问题
  };
}

// ---------------------------------------------------------------------------
// 场景 B：工业 B2B 中小企业
// 特征：产品选型、售后、案例问题回答不足
// ---------------------------------------------------------------------------

export function createMockReportForIndustrialSMEs(): DiagnosisReport {
  const questionCoverageGaps: QuestionCoverageGap[] = [
    {
      questionId: "q-indsm-1",
      questionText: "这个厂家的设备适合什么规模和类型的工厂使用？",
      coverageStatus: "PARTIALLY_SUPPORTED",
      observedScope: "官网有设备基本参数，但未找到适用场景和选型指南",
      missingInformation: "设备适用规模、典型客户案例和选型建议",
      suggestedAction: "建立产品选型指南页面，展示典型客户规模和行业",
      businessValue: "帮助采购方快速判断产品是否适合自身需求",
      evidenceIds: [],
    },
    {
      questionId: "q-indsm-2",
      questionText: "设备坏了怎么办？有没有售后服务和技术支持？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次搜索未找到售后服务政策、技术支持渠道或客服信息",
      missingInformation: "售后服务政策、保修期限、维修响应时间和客服联系方式",
      suggestedAction: "在官网添加售后服务页面或明确展示客服联系方式",
      businessValue: "降低客户购买顾虑，特别是 B2B 采购的决策风险",
      evidenceIds: [],
    },
    {
      questionId: "q-indsm-3",
      questionText: "有没有其他工厂使用过这个厂家的设备？效果如何？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次搜索未找到客户案例或使用效果展示",
      missingInformation: "客户案例、应用场景和设备使用效果",
      suggestedAction: "整理并展示 3-5 个典型客户案例，包括行业和应用场景",
      businessValue: "增强采购信心，降低客户评估成本",
      evidenceIds: [],
    },
    {
      questionId: "q-indsm-4",
      questionText: "设备价格是多少？有没有报价或询价渠道？",
      coverageStatus: "PARTIALLY_SUPPORTED",
      observedScope: "官网未展示价格，但有联系表单或电话",
      missingInformation: "标准价格区间、报价流程或在线询价入口",
      suggestedAction: "提供价格区间或明确的询价流程入口",
      businessValue: "帮助客户快速评估预算匹配度",
      evidenceIds: [],
    },
  ];

  return {
    ...SAMPLE_DIAGNOSIS_REPORT,
    companyProfile: {
      ...SAMPLE_DIAGNOSIS_REPORT.companyProfile,
      brandName: "某某工业设备有限公司",
      productOrService: "工业自动化设备",
      industry: "工业制造",
    },
    questionCoverageGaps,
    geoOpportunities: [],
    coreIssues: [],
  };
}

// ---------------------------------------------------------------------------
// 场景 C：本地服务企业
// 特征：服务流程、价格边界、案例、地域覆盖不清
// ---------------------------------------------------------------------------

export function createMockReportForLocalServices(): DiagnosisReport {
  const questionCoverageGaps: QuestionCoverageGap[] = [
    {
      questionId: "q-locsv-1",
      questionText: "这家服务公司的服务流程是怎样的？需要多长时间？",
      coverageStatus: "PARTIALLY_SUPPORTED",
      observedScope: "官网有服务介绍，但未找到具体流程和时间说明",
      missingInformation: "服务流程步骤、各环节时长和整体服务周期",
      suggestedAction: "建立服务流程页面，清晰展示服务步骤和预计时长",
      businessValue: "帮助客户建立合理预期，减少咨询成本",
      evidenceIds: [],
    },
    {
      questionId: "q-locsv-2",
      questionText: "服务是怎么收费的？有没有套餐或价格表？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次搜索未找到任何价格信息",
      missingInformation: "价格区间、套餐选项、收费方式或报价说明",
      suggestedAction: "提供价格区间或明确的咨询报价流程",
      businessValue: "帮助客户快速判断是否在预算范围内",
      evidenceIds: [],
    },
    {
      questionId: "q-locsv-3",
      questionText: "有没有其他客户的好评或案例可以参考？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次搜索未找到客户评价或成功案例",
      missingInformation: "客户评价、案例展示或服务前后对比",
      suggestedAction: "展示 2-3 个典型客户案例或服务效果展示",
      businessValue: "增强服务可信度，帮助新客户建立信任",
      evidenceIds: [],
    },
    {
      questionId: "q-locsv-4",
      questionText: "我的城市或区域有这家服务公司吗？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次搜索未找到地域覆盖或服务范围说明",
      missingInformation: "服务覆盖城市/区域列表、服务点地址或本地合作伙伴",
      suggestedAction: "在官网或搜索结果中明确标注服务覆盖区域",
      businessValue: "帮助本地潜在客户快速判断是否在服务范围内",
      evidenceIds: [],
    },
  ];

  return {
    ...SAMPLE_DIAGNOSIS_REPORT,
    companyProfile: {
      ...SAMPLE_DIAGNOSIS_REPORT.companyProfile,
      brandName: "某某家政服务有限公司",
      productOrService: "家庭清洁与保养服务",
      industry: "本地生活服务",
    },
    questionCoverageGaps,
    geoOpportunities: [],
    coreIssues: [],
  };
}

// ---------------------------------------------------------------------------
// Mock 验收检查函数
// ---------------------------------------------------------------------------

/**
 * 验收标准 A：食品类区域企业
 * Quick 能输出 2-3 个公开信息完善机会，即使 Published Issue 和正式 Opportunity 为 0
 */
export function validateFoodRegionalEnterpriseScenario(report: DiagnosisReport): {
  pass: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // 检查 questionCoverageGaps
  const gaps = report.questionCoverageGaps ?? [];
  if (gaps.length < 2 || gaps.length > 3) {
    issues.push(`食品类企业应有 2-3 个公开信息完善机会，当前为 ${gaps.length} 个`);
  }

  // 检查正式 Opportunity 为 0
  if (report.geoOpportunities.length !== 0) {
    issues.push(`食品类企业正式 Opportunity 应为 0，当前为 ${report.geoOpportunities.length} 个`);
  }

  // 检查正式核心问题为 0
  if (report.coreIssues.length !== 0) {
    issues.push(`食品类企业正式核心问题应为 0，当前为 ${report.coreIssues.length} 个`);
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

/**
 * 验收标准 B：工业 B2B 中小企业
 * Quick 能够给出清晰补充方向
 */
export function validateIndustrialSMEScenario(report: DiagnosisReport): {
  pass: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  const gaps = report.questionCoverageGaps ?? [];

  // 检查是否覆盖产品选型、售后、案例问题
  const hasProductSelection = gaps.some((g: QuestionCoverageGap) =>
    g.questionText.includes("适合") || g.questionText.includes("选型")
  );
  if (!hasProductSelection) {
    issues.push("缺少产品选型相关的问题覆盖");
  }

  const hasAfterSales = gaps.some((g: QuestionCoverageGap) =>
    g.questionText.includes("售后") || g.questionText.includes("坏了")
  );
  if (!hasAfterSales) {
    issues.push("缺少售后服务相关的问题覆盖");
  }

  const hasCases = gaps.some((g: QuestionCoverageGap) =>
    g.questionText.includes("案例") || g.questionText.includes("效果")
  );
  if (!hasCases) {
    issues.push("缺少客户案例相关的问题覆盖");
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

/**
 * 验收标准 C：本地服务企业
 * Quick 能够形成客户决策问题清单
 */
export function validateLocalServicesScenario(report: DiagnosisReport): {
  pass: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  const gaps = report.questionCoverageGaps ?? [];

  // 检查是否覆盖服务流程、价格、案例、地域问题
  const hasProcess = gaps.some((g: QuestionCoverageGap) =>
    g.questionText.includes("流程") || g.questionText.includes("时间")
  );
  if (!hasProcess) {
    issues.push("缺少服务流程相关的问题覆盖");
  }

  const hasPrice = gaps.some((g: QuestionCoverageGap) =>
    g.questionText.includes("价格") || g.questionText.includes("收费")
  );
  if (!hasPrice) {
    issues.push("缺少价格相关的问题覆盖");
  }

  const hasCases = gaps.some((g: QuestionCoverageGap) =>
    g.questionText.includes("好评") || g.questionText.includes("案例")
  );
  if (!hasCases) {
    issues.push("缺少客户案例相关的问题覆盖");
  }

  const hasCoverage = gaps.some((g: QuestionCoverageGap) =>
    g.questionText.includes("城市") || g.questionText.includes("区域")
  );
  if (!hasCoverage) {
    issues.push("缺少地域覆盖相关的问题覆盖");
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}
