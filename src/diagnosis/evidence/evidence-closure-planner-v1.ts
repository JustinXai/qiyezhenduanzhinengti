import {
  CustomerEvidenceRequestPackV1,
  EVIDENCE_CLOSURE_BUDGET_V1,
  EvidenceClosurePlanV1,
  EvidenceRequirementSlot,
  type CustomerEvidenceMaterialType,
  type CustomerEvidenceRequestItemV1,
  type EvidenceRequirementSlotType,
  type NextBestEvidenceActionType,
} from "../../contracts/evidence-closure";

export interface EvidenceClosureCandidateV1 {
  candidateRef: string;
  claimKind: string;
  publicationStatus: "PRUNED" | "DEEP_NEEDS_CONFIRMATION";
  reasonCode: string;
  evidenceIds: string[];
  directCount: number;
  partialCount: number;
  contextCount: number;
  independentSupportSourceCount: number;
  customerQuestion?: string;
  potentialGeoOpportunity?: string;
  businessValue?: number;
}

export interface EvidenceClosurePlannerInputV1 {
  diagnosisId: string;
  companyKey: string;
  generatedAt: string;
  candidates: readonly EvidenceClosureCandidateV1[];
}

const KIND_VALUE: Readonly<Record<string, number>> = {
  geoOpportunity: 5,
  coreIssue: 4,
  demonstrationFix: 4,
  competitorGap: 3,
  strength: 2,
};

const QUERY_INTENT_BY_KIND: Readonly<Record<string, string>> = {
  geoOpportunity: "核验该客户问题对应的公开事实、使用场景与独立需求证据",
  coreIssue: "核验当前企业公开页面是否直接说明该能力、流程或覆盖范围",
  demonstrationFix: "核验原始 Issue 的事实基础与可引用材料",
  competitorGap: "在相同可比维度下分别核验本企业与竞品官方事实",
  strength: "核验企业公开声明及可交叉验证的第三方事实",
};

const OFFICIAL_PAGE_BY_KIND: Readonly<Record<string, string>> = {
  geoOpportunity: "产品、解决方案、FAQ 或服务流程页",
  coreIssue: "产品、服务、FAQ、资质或服务网络页",
  demonstrationFix: "与原 Issue 直接对应的官方说明页",
  competitorGap: "双方同维度的产品或服务官方页",
  strength: "企业介绍、产品、资质或客户案例页",
};

function candidateValue(candidate: EvidenceClosureCandidateV1): number {
  const value = candidate.businessValue ?? KIND_VALUE[candidate.claimKind] ?? 1;
  return ["INVALID_SOURCE_ISSUE_REFERENCE", "BANNED_OR_OVERPROMISING_COPY"].includes(
    candidate.reasonCode,
  )
    ? value - 10
    : value;
}

function customerQuestion(candidate: EvidenceClosureCandidateV1): string {
  return (
    candidate.customerQuestion ??
    `客户如何验证 ${candidate.candidateRef} 所涉及的企业事实与适用边界？`
  );
}

function potentialOpportunity(candidate: EvidenceClosureCandidateV1): string {
  return (
    candidate.potentialGeoOpportunity ??
    `在补足 ${candidate.candidateRef} 的事实与来源后，评估是否形成可信 GEO 内容机会`
  );
}

function slotTypesFor(candidate: EvidenceClosureCandidateV1): EvidenceRequirementSlotType[] {
  switch (candidate.reasonCode) {
    case "INSUFFICIENT_DIRECT_SUPPORT":
      return ["CURRENT_COMPANY_DIRECT_FACT", "CUSTOMER_DOCUMENT_REQUIRED"];
    case "INSUFFICIENT_INDEPENDENT_SUPPORT":
      return ["INDEPENDENT_THIRD_PARTY_SUPPORT", "CURRENT_COMPANY_DIRECT_FACT"];
    case "MISSING_COMPETITOR_OFFICIAL_RELATION":
    case "UNVERIFIED_COMPETITOR_ASSERTION":
    case "COMPETITOR_ENTITY_NOT_RESOLVED":
      return ["COMPETITOR_OFFICIAL_FACT", "COMPARABLE_DIMENSION_EVIDENCE"];
    case "MISSING_CURRENT_COMPANY_RELATION":
      return ["CURRENT_COMPANY_DIRECT_FACT", "COMPARABLE_DIMENSION_EVIDENCE"];
    case "COMPARISON_DIMENSION_MISMATCH":
      return ["COMPARABLE_DIMENSION_EVIDENCE"];
    case "MISSING_COVERAGE_PREFIX":
    case "COVERAGE_NOT_ESTABLISHED":
    case "NO_MEASUREMENT_COVERAGE":
      return ["CURRENT_COMPANY_COVERAGE"];
    case "NO_VALID_EVIDENCE":
    case "INVALID_EVIDENCE_REFERENCE":
      return ["CURRENT_COMPANY_DIRECT_FACT", "INDEPENDENT_THIRD_PARTY_SUPPORT"];
    case "GENERIC_OR_UNACTIONABLE":
      return ["CUSTOMER_INTERNAL_CONFIRMATION", "CUSTOMER_DOCUMENT_REQUIRED"];
    case "INVALID_SOURCE_ISSUE_REFERENCE":
    case "BANNED_OR_OVERPROMISING_COPY":
      return ["CUSTOMER_INTERNAL_CONFIRMATION"];
    default:
      return ["CUSTOMER_INTERNAL_CONFIRMATION"];
  }
}

function slotFor(
  candidate: EvidenceClosureCandidateV1,
  slotType: EvidenceRequirementSlotType,
  slotIndex: number,
): EvidenceRequirementSlot {
  const id = `${candidate.candidateRef}:slot:${slotIndex + 1}`;
  const common = {
    id,
    candidateRef: candidate.candidateRef,
    claimKind: candidate.claimKind,
    currentlyAvailableEvidenceIds: [...new Set(candidate.evidenceIds)],
    customerQuestion: customerQuestion(candidate),
  };
  switch (slotType) {
    case "CURRENT_COMPANY_DIRECT_FACT":
      return EvidenceRequirementSlot.parse({
        ...common,
        slotType,
        missingRequirement: "缺少能直接支持该企业事实的当前企业材料",
        requiredSourceType: "CURRENT_COMPANY_OFFICIAL",
        requiredIndependentSourceCount: 0,
        suggestedQueryIntent: QUERY_INTENT_BY_KIND[candidate.claimKind] ?? "核验当前企业事实",
        suggestedOfficialPageType: OFFICIAL_PAGE_BY_KIND[candidate.claimKind] ?? "相关官方说明页",
        completionCondition: "取得与候选陈述语义直接匹配的官方内容，并重新经过关系验证与发布策略",
        cannotBeClosedReason: null,
      });
    case "CURRENT_COMPANY_COVERAGE":
      return EvidenceRequirementSlot.parse({
        ...common,
        slotType,
        missingRequirement: "缺少可审计的公开页面测量边界或 Coverage 限定",
        requiredSourceType: "CURRENT_COMPANY_OFFICIAL",
        requiredIndependentSourceCount: 0,
        suggestedQueryIntent: "仅检查冻结范围内与该陈述直接相关的企业公开页面",
        suggestedOfficialPageType: "相关栏目页与已声明检查范围内的官方页面",
        completionCondition: "记录实际检查范围，并使用冻结的 Coverage 限定重新验证负面陈述",
        cannotBeClosedReason:
          candidate.reasonCode === "MISSING_COVERAGE_PREFIX"
            ? "补充证据不能替代缺失的 Coverage 限定；原候选不得自动发布"
            : null,
      });
    case "INDEPENDENT_THIRD_PARTY_SUPPORT":
      return EvidenceRequirementSlot.parse({
        ...common,
        slotType,
        missingRequirement: "缺少独立第三方来源对该机会或问题的交叉支持",
        requiredSourceType: "INDEPENDENT_THIRD_PARTY",
        requiredIndependentSourceCount: Math.max(1, 2 - candidate.independentSupportSourceCount),
        suggestedQueryIntent: QUERY_INTENT_BY_KIND[candidate.claimKind] ?? "查找独立第三方交叉支持",
        suggestedOfficialPageType: null,
        completionCondition: "达到原 Publication Policy 所要求的独立来源数量并通过语义关系验证",
        cannotBeClosedReason: null,
      });
    case "COMPETITOR_OFFICIAL_FACT":
      return EvidenceRequirementSlot.parse({
        ...common,
        slotType,
        missingRequirement: "缺少竞品官方来源对竞品事实的直接关系",
        requiredSourceType: "COMPETITOR_OFFICIAL",
        requiredIndependentSourceCount: 0,
        suggestedQueryIntent: "只查找竞品官方页面中与比较维度直接对应的事实",
        suggestedOfficialPageType: "竞品同类产品、服务或能力官方页",
        completionCondition: "竞品实体已解析，官方事实与候选陈述语义匹配，并通过统一竞品发布策略",
        cannotBeClosedReason: null,
      });
    case "COMPARABLE_DIMENSION_EVIDENCE":
      return EvidenceRequirementSlot.parse({
        ...common,
        slotType,
        missingRequirement: "双方证据尚未落在同一可比维度",
        requiredSourceType: "INDEPENDENT_THIRD_PARTY",
        requiredIndependentSourceCount: 1,
        suggestedQueryIntent: "核验双方在同一产品、服务、时间和覆盖口径下的可比事实",
        suggestedOfficialPageType: "双方同维度官方说明页",
        completionCondition: "比较维度一致且各方事实分别有可追溯来源；不得推导无证据的优劣结论",
        cannotBeClosedReason: null,
      });
    case "CUSTOMER_INTERNAL_CONFIRMATION":
      return EvidenceRequirementSlot.parse({
        ...common,
        slotType,
        missingRequirement: "候选需要客户澄清事实或确认业务适用边界",
        requiredSourceType: "CUSTOMER_ATTESTATION",
        requiredIndependentSourceCount: 0,
        suggestedQueryIntent: null,
        suggestedOfficialPageType: null,
        completionCondition: "记录确认人、确认时间和口径；确认本身仍为未评估来源，不自动成为 DIRECT",
        cannotBeClosedReason:
          candidate.reasonCode === "INVALID_SOURCE_ISSUE_REFERENCE"
            ? "客户确认不能修复无效 sourceIssueId；原候选必须永久剪枝并另建可验证候选"
            : candidate.reasonCode === "BANNED_OR_OVERPROMISING_COPY"
              ? "客户确认不能解除禁用或过度承诺文案规则"
              : null,
      });
    case "CUSTOMER_DOCUMENT_REQUIRED":
      return EvidenceRequirementSlot.parse({
        ...common,
        slotType,
        missingRequirement: "需要客户提供可验证、可脱敏的正式材料",
        requiredSourceType: "CUSTOMER_DOCUMENT",
        requiredIndependentSourceCount: 0,
        suggestedQueryIntent: null,
        suggestedOfficialPageType: null,
        completionCondition: "材料完成来源记录、敏感性检查、语义验证与发布前审批",
        cannotBeClosedReason: null,
      });
  }
}

function actionForSlot(
  slot: EvidenceRequirementSlot,
  reasonCode: string,
): NextBestEvidenceActionType {
  if (slot.cannotBeClosedReason) {
    return reasonCode === "INVALID_SOURCE_ISSUE_REFERENCE" ||
      reasonCode === "BANNED_OR_OVERPROMISING_COPY"
      ? "PRUNE_PERMANENTLY"
      : "KEEP_AS_NEEDS_CONFIRMATION";
  }
  switch (slot.slotType) {
    case "INDEPENDENT_THIRD_PARTY_SUPPORT":
    case "COMPARABLE_DIMENSION_EVIDENCE":
      return "TARGETED_WEB_SEARCH";
    case "CURRENT_COMPANY_DIRECT_FACT":
    case "CURRENT_COMPANY_COVERAGE":
    case "COMPETITOR_OFFICIAL_FACT":
      return "TARGETED_OFFICIAL_CRAWL";
    case "CUSTOMER_INTERNAL_CONFIRMATION":
      return "REQUEST_CUSTOMER_CONFIRMATION";
    case "CUSTOMER_DOCUMENT_REQUIRED":
      return "REQUEST_CUSTOMER_DOCUMENT";
  }
}

export function planEvidenceClosureV1(input: EvidenceClosurePlannerInputV1): EvidenceClosurePlanV1 {
  const eligible = input.candidates
    .filter((candidate) => candidate.reasonCode !== "SYSTEM_FAILURE_NOT_BUSINESS_ISSUE")
    .sort(
      (a, b) =>
        candidateValue(b) - candidateValue(a) ||
        a.candidateRef.localeCompare(b.candidateRef, "en"),
    );
  const selected = eligible.slice(0, EVIDENCE_CLOSURE_BUDGET_V1.maxCandidates);
  const slots = selected.flatMap((candidate) =>
    slotTypesFor(candidate)
      .slice(0, EVIDENCE_CLOSURE_BUDGET_V1.maxSlotsPerCandidate)
      .map((slotType, index) => slotFor(candidate, slotType, index)),
  );
  const candidateByRef = new Map(selected.map((candidate) => [candidate.candidateRef, candidate]));
  let queryActions = 0;
  let crawlActions = 0;
  const nextActions = slots.map((slot, index) => {
    const candidate = candidateByRef.get(slot.candidateRef)!;
    let action = actionForSlot(slot, candidate.reasonCode);
    if (action === "TARGETED_WEB_SEARCH") {
      queryActions += 1;
      if (queryActions > EVIDENCE_CLOSURE_BUDGET_V1.maxTargetedQueries) {
        action = "KEEP_AS_NEEDS_CONFIRMATION";
      }
    }
    if (action === "TARGETED_OFFICIAL_CRAWL") {
      crawlActions += 1;
      if (crawlActions > EVIDENCE_CLOSURE_BUDGET_V1.maxTargetedCrawls) {
        action = "KEEP_AS_NEEDS_CONFIRMATION";
      }
    }
    return {
      id: `${slot.id}:action`,
      slotId: slot.id,
      candidateRef: slot.candidateRef,
      action,
      rationale: slot.cannotBeClosedReason ?? slot.missingRequirement,
      priority: index + 1,
      executesAutomatically: false as const,
      mayPublishClaim: false as const,
      mayUpgradeSupport: false as const,
    };
  });
  return EvidenceClosurePlanV1.parse({
    version: "evidence-closure-plan.v1",
    diagnosisId: input.diagnosisId,
    companyKey: input.companyKey,
    generatedAt: input.generatedAt,
    status: "PLANNED_NOT_EXECUTED",
    featureEnabled: false,
    sourceCandidateCount: input.candidates.length,
    selectedCandidateRefs: selected.map((candidate) => candidate.candidateRef),
    slots,
    nextActions,
    budget: EVIDENCE_CLOSURE_BUDGET_V1,
    noPlanReason:
      input.candidates.length === 0
        ? "NO_PRUNED_CANDIDATES"
        : selected.length === 0
          ? "NO_ELIGIBLE_CANDIDATES"
          : null,
  });
}

function materialFor(slot: EvidenceRequirementSlot): CustomerEvidenceMaterialType {
  switch (slot.claimKind) {
    case "competitorGap":
      return "INTERNAL_BRAND_POSITIONING";
    case "demonstrationFix":
      return "FAQ";
    case "geoOpportunity":
      return slot.slotType === "CUSTOMER_INTERNAL_CONFIRMATION"
        ? "VERBAL_CONFIRMATION"
        : "SERVICE_PROCESS";
    case "coreIssue":
      return "PRODUCT_SPECIFICATION";
    default:
      return "INTERNAL_BRAND_POSITIONING";
  }
}

export function buildCustomerEvidenceRequestPackV1(input: {
  plan: EvidenceClosurePlanV1;
  potentialGeoOpportunities?: Readonly<Record<string, string>>;
}): CustomerEvidenceRequestPackV1 {
  const requestable = input.plan.slots.filter((slot) =>
    [
      "CURRENT_COMPANY_DIRECT_FACT",
      "CUSTOMER_INTERNAL_CONFIRMATION",
      "CUSTOMER_DOCUMENT_REQUIRED",
      "CURRENT_COMPANY_COVERAGE",
    ].includes(slot.slotType),
  );
  const requests: CustomerEvidenceRequestItemV1[] = requestable.slice(0, 5).map((slot, index) => ({
    id: `${input.plan.companyKey}:request:${index + 1}`,
    candidateRef: slot.candidateRef,
    slotId: slot.id,
    factToConfirm: slot.missingRequirement,
    suggestedMaterial: materialFor(slot),
    validates: slot.completionCondition,
    customerQuestion: slot.customerQuestion,
    potentialGeoOpportunity:
      input.potentialGeoOpportunities?.[slot.candidateRef] ??
      potentialOpportunity({
        candidateRef: slot.candidateRef,
        claimKind: slot.claimKind,
        publicationStatus: "PRUNED",
        reasonCode: "REQUEST_PACK",
        evidenceIds: slot.currentlyAvailableEvidenceIds,
        directCount: 0,
        partialCount: 0,
        contextCount: 0,
        independentSupportSourceCount: 0,
      }),
    containsSensitiveMaterial: false,
    verbalConfirmationAllowed: slot.slotType === "CUSTOMER_INTERNAL_CONFIRMATION",
    requiresApprovalBeforePublication: true,
    prohibitedContentReminder:
      "不得提供 API Key、密码、客户个人数据、未脱敏合同、财务机密或无关内部文件",
  }));
  return CustomerEvidenceRequestPackV1.parse({
    version: "customer-evidence-request-pack.v1",
    diagnosisId: input.plan.diagnosisId,
    companyKey: input.plan.companyKey,
    generatedAt: input.plan.generatedAt,
    phase: "POST_REPORT_ENRICHMENT",
    visibleInFreeQuickReport: false,
    featureEnabled: false,
    requests,
  });
}
