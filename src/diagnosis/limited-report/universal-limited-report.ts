import type {
  DiagnosisReport,
  EvidenceItem,
  LimitedReportDataV1,
  MvpGeoDiagnosticReportV1,
  MvpGeoReportPackId,
  MvpGeoScoreFindingStatus,
  ReputationAndPublicOpinionSnapshotV1,
  SourceCoverageSlotV1,
  PublicInformationSlotStatus,
} from "../../contracts";
import { REPORT_CONTRACT_VERSION, SCORE_CONTRACT_VERSION } from "../../contracts";
import type { DiagnosisInput } from "../../runtime/diagnosis-input";
import { buildReputationQueries } from "../reputation/policy";
import { buildReputationSnapshot } from "../reputation/snapshot";
import { computeScoreBlock } from "../../report/validation/score-calculator";

type CheckItem = {
  title: string;
  keywords: readonly string[];
  impact: string;
  recommendation: string;
};

type DimensionDefinition = {
  id: string;
  title: string;
  maxScore: number;
  category: string;
  items: readonly CheckItem[];
};

type PolicyDefinition = {
  id: MvpGeoReportPackId;
  label: string;
  prohibitedClaims: readonly string[];
  dimensions: readonly DimensionDefinition[];
  industryAnalysis: readonly string[];
  plans: readonly Omit<MvpGeoDiagnosticReportV1["contentPlans"][number], "priority">[];
  requestedMaterials: readonly string[];
};

const DISCLAIMER =
  "以下判断基于本次公开检索范围；未发现表示当前公开渠道中未检索到清晰信息，不代表企业实际业务或资质一定不存在。该指数用于判断企业当前公开信息是否容易被客户和AI检索、理解与引用，不代表企业实际服务质量、市场份额或AI平台官方排名。";

const SCORE_V2_WEIGHTS: Record<string, number> = {
  sourceFoundation: 0.2,
  reputationAndPublicOpinion: 0.2,
  contentAssets: 0.2,
  customerScenarios: 0.15,
  trustInformation: 0.15,
  conversionPath: 0.1,
};

const MEDICAL_DIMENSIONS: readonly DimensionDefinition[] = [
  {
    id: "sourceFoundation",
    title: "基础信源与企业身份",
    maxScore: 25,
    category: "基础信源",
    items: [
      { title: "工商或企业主体信息", keywords: ["工商", "企业主体", "统一社会信用", "公司", "企查查", "天眼查", "爱企查"], impact: "客户需要先确认企业主体是否清晰可识别。", recommendation: "集中发布企业主体、品牌主体和可核验入口。" },
      { title: "官方网站或官方账号", keywords: ["官网", "官方网站", "官方账号", "公众号", "抖音", "小红书"], impact: "缺少官方入口会让客户难以判断哪一处信息可信。", recommendation: "建立官网或统一官方账号矩阵，并在各入口互相指向。" },
      { title: "地图POI或门店入口", keywords: ["地图", "高德", "百度地图", "门店", "地址", "导航"], impact: "本地客户搜索时依赖地图和门店入口确认距离、地址和营业状态。", recommendation: "补齐地图POI、门店名称、地址、营业时间和联系电话。" },
      { title: "本地生活平台入口", keywords: ["大众点评", "美团", "本地生活", "团购", "评价"], impact: "本地消费决策常从本地生活平台开始。", recommendation: "整理本地生活平台基础页和服务项目页。" },
      { title: "医疗机构或相关官方信息入口", keywords: ["医疗机构", "执业许可", "卫健委", "卫生健康", "备案", "许可证"], impact: "受监管服务的公开说明需要让客户能找到权威来源。", recommendation: "有明确来源时展示医疗机构或相关官方信息入口，没有时先集中说明可公开事实。" },
    ],
  },
  {
    id: "contentAssets",
    title: "服务或产品内容资产",
    maxScore: 25,
    category: "内容资产",
    items: [
      { title: "机构或品牌介绍", keywords: ["介绍", "品牌", "机构", "简介"], impact: "品牌介绍决定客户是否能快速理解企业定位。", recommendation: "建设机构介绍页，说明服务范围、对象和基础定位。" },
      { title: "服务项目介绍", keywords: ["项目", "服务项目", "医美", "美容", "治疗", "护理"], impact: "服务项目不清晰会让客户无法判断是否匹配需求。", recommendation: "按项目建立介绍页，说明适用人群、流程和边界。" },
      { title: "医生或专业人员介绍", keywords: ["医生", "医师", "专家", "团队", "专业人员"], impact: "专业人员信息影响客户信任和咨询意愿。", recommendation: "建设医生或服务团队页，只写可核验的专业背景。" },
      { title: "项目流程及注意事项", keywords: ["流程", "注意事项", "术前", "术后", "风险", "恢复"], impact: "缺少流程和注意事项会增加客户顾虑。", recommendation: "补齐项目流程、风险提示和服务前后注意事项。" },
      { title: "设备、耗材或相关品牌说明", keywords: ["设备", "耗材", "仪器", "材料", "品牌"], impact: "设备和耗材说明能帮助客户理解服务依据。", recommendation: "整理设备、耗材和品牌说明，避免夸大功效。" },
    ],
  },
  {
    id: "customerScenarios",
    title: "客户搜索场景覆盖",
    maxScore: 20,
    category: "客户场景",
    items: [
      { title: "品牌名称搜索", keywords: [], impact: "客户会先搜索品牌名称确认企业是否真实存在。", recommendation: "围绕品牌名建设统一简介、地图和官方入口。" },
      { title: "地区+服务项目搜索", keywords: ["赣州", "地区", "附近", "项目", "医美", "医疗美容"], impact: "地区和服务项目组合决定本地客户能否发现企业。", recommendation: "建设地区化项目页和本地服务说明。" },
      { title: "机构资质或正规性查询", keywords: ["资质", "正规", "医疗机构", "执业", "许可"], impact: "资质相关信息不集中会降低客户信任。", recommendation: "有明确来源时集中展示主体和资质入口；未找到时避免下结论。" },
      { title: "服务项目、流程和风险查询", keywords: ["项目", "流程", "风险", "注意事项", "恢复"], impact: "客户在决策前需要理解项目过程和风险边界。", recommendation: "建立项目FAQ、流程说明和风险注意事项页。" },
      { title: "预约、收费、随访和售后查询", keywords: ["预约", "收费", "价格", "随访", "售后", "投诉"], impact: "转化路径不清晰会让客户停留在咨询前。", recommendation: "明确预约、收费边界、随访和售后处理路径。" },
    ],
  },
  {
    id: "trustInformation",
    title: "信任与决策信息",
    maxScore: 20,
    category: "信任信息",
    items: [
      { title: "主体或资质说明", keywords: ["主体", "资质", "许可", "备案"], impact: "客户需要确认企业和服务的公开依据。", recommendation: "将主体、资质或官方入口集中成可阅读页面。" },
      { title: "团队及专业背景", keywords: ["团队", "医生", "医师", "专业背景"], impact: "团队信息不足会削弱客户对专业服务的判断。", recommendation: "补齐团队介绍、专业背景和服务分工。" },
      { title: "风险和注意事项", keywords: ["风险", "注意事项", "禁忌", "术后"], impact: "风险边界缺失会让客户感觉信息不透明。", recommendation: "用中性语言说明风险、禁忌和服务前后注意事项。" },
      { title: "案例、评价或第三方信息", keywords: ["案例", "评价", "口碑", "第三方"], impact: "缺少评价和案例会降低客户信任凭据。", recommendation: "整理合规案例、客户评价入口和第三方公开信息。" },
      { title: "售后、投诉和纠纷处理", keywords: ["售后", "投诉", "纠纷", "处理"], impact: "售后与投诉路径不清晰会增加客户决策阻力。", recommendation: "建立售后、投诉和纠纷处理说明。" },
    ],
  },
  {
    id: "conversionPath",
    title: "咨询与转化路径",
    maxScore: 10,
    category: "转化路径",
    items: [
      { title: "联系方式", keywords: ["电话", "联系", "客服", "咨询"], impact: "联系方式不清晰会直接影响咨询转化。", recommendation: "统一展示电话、在线咨询和官方联系方式。" },
      { title: "地址和营业信息", keywords: ["地址", "营业时间", "门店", "导航"], impact: "地址和营业信息影响到店决策。", recommendation: "补齐地址、营业时间、交通和到店说明。" },
      { title: "预约流程", keywords: ["预约", "挂号", "面诊"], impact: "预约流程不清晰会导致客户不知道下一步怎么做。", recommendation: "建立预约流程和面诊说明。" },
      { title: "收费或价格说明边界", keywords: ["收费", "价格", "费用"], impact: "价格边界缺失会增加客户咨询顾虑。", recommendation: "给出收费说明边界，不承诺具体治疗效果。" },
      { title: "面诊、服务及随访路径", keywords: ["面诊", "服务流程", "随访", "复诊"], impact: "后续路径不清晰会削弱服务信任。", recommendation: "补齐面诊、服务、随访和复查流程。" },
    ],
  },
];

function cloneDimensionWithOverrides(
  dimensions: readonly DimensionDefinition[],
  overrides: Partial<Record<string, readonly CheckItem[]>>,
): DimensionDefinition[] {
  return dimensions.map((dimension) => ({
    ...dimension,
    items: overrides[dimension.id] ?? dimension.items,
  }));
}

const LIFESTYLE_DIMENSIONS = cloneDimensionWithOverrides(MEDICAL_DIMENSIONS, {
  sourceFoundation: [
    { title: "门店名称、地址和营业时间", keywords: ["门店", "地址", "营业时间", "导航", "电话"], impact: "本地消费客户需要快速确认能否到店。", recommendation: "补齐门店页、地图POI、营业时间和联系方式。" },
    { title: "地图入口", keywords: ["地图", "高德", "百度地图", "POI", "导航"], impact: "地图入口影响附近客户发现和到店路径。", recommendation: "规范地图POI名称、地址、图片和服务标签。" },
    { title: "小红书、抖音及官方账号", keywords: ["小红书", "抖音", "官方账号", "公众号"], impact: "生活服务客户常从社交内容判断风格和信任。", recommendation: "建立官方账号内容矩阵并统一品牌口径。" },
    { title: "本地生活平台入口", keywords: ["大众点评", "美团", "团购", "本地生活"], impact: "价格、评价和套餐入口影响客户到店决策。", recommendation: "完善本地生活平台项目、价格和评价维护。" },
    { title: "预约和到店入口", keywords: ["预约", "到店", "客服", "联系"], impact: "预约入口缺失会降低即时转化。", recommendation: "建立清晰预约和到店流程。" },
  ],
  contentAssets: [
    { title: "服务项目", keywords: ["项目", "服务", "护理", "美发", "美甲", "SPA", "健身"], impact: "服务项目不清晰会让客户无法判断是否匹配需求。", recommendation: "按项目建立服务说明。" },
    { title: "价格或收费区间", keywords: ["价格", "收费", "团购", "套餐"], impact: "本地消费客户对价格边界高度敏感。", recommendation: "补齐价格区间、套餐边界和预约说明。" },
    { title: "服务人员和技能介绍", keywords: ["老师", "技师", "团队", "服务人员"], impact: "人员介绍影响体验型服务信任。", recommendation: "展示人员技能、擅长项目和服务风格。" },
    { title: "卫生及服务流程", keywords: ["卫生", "消毒", "流程", "环境"], impact: "卫生与流程影响客户安全感。", recommendation: "建设卫生标准和服务流程内容。" },
    { title: "案例和客户评价", keywords: ["案例", "评价", "口碑", "作品"], impact: "案例和评价是体验型消费的重要证明。", recommendation: "整理作品、案例和评价入口。" },
  ],
});

const GENERAL_DIMENSIONS = cloneDimensionWithOverrides(MEDICAL_DIMENSIONS, {
  sourceFoundation: [
    { title: "企业和品牌身份", keywords: ["公司", "品牌", "企业", "主体"], impact: "客户和合作方需要确认企业身份和品牌定位。", recommendation: "建立企业介绍和品牌主体说明。" },
    { title: "官网及官方账号", keywords: ["官网", "官方网站", "官方账号", "公众号"], impact: "官方入口影响客户对信息真实性的判断。", recommendation: "统一官网、公众号和其他官方入口。" },
    { title: "地区、渠道和服务范围", keywords: ["地区", "服务范围", "渠道", "全国", "本地"], impact: "服务范围不清晰会影响咨询和合作判断。", recommendation: "补齐服务地区、渠道和适用客户说明。" },
    { title: "购买、咨询或商务合作入口", keywords: ["购买", "咨询", "合作", "招商", "联系方式"], impact: "入口不清晰会减少潜在线索转化。", recommendation: "建立咨询、购买和合作入口。" },
    { title: "第三方公开收录", keywords: ["百科", "媒体", "平台", "收录"], impact: "第三方公开信息能帮助客户交叉验证。", recommendation: "补齐合规的公开收录和资料一致性。" },
  ],
  contentAssets: [
    { title: "产品或服务体系", keywords: ["产品", "服务", "体系", "方案"], impact: "客户需要理解企业到底提供什么。", recommendation: "建设产品或服务体系页。" },
    { title: "规格、用途和使用场景", keywords: ["规格", "用途", "场景", "选购"], impact: "客户会按使用场景寻找匹配方案。", recommendation: "补齐规格、用途和选购指南。" },
    { title: "品质、工艺、认证或案例", keywords: ["品质", "工艺", "认证", "案例"], impact: "品质和案例影响购买或合作信任。", recommendation: "整理品质、工艺、认证和案例内容。" },
    { title: "客户常见问题", keywords: ["FAQ", "常见问题", "问题", "怎么"], impact: "FAQ 能覆盖客户反复咨询的问题。", recommendation: "建立客户问题库和回答页。" },
    { title: "售后与合作流程", keywords: ["售后", "流程", "合作", "服务"], impact: "流程不清晰会增加沟通成本。", recommendation: "补齐售后、合作和交付流程。" },
  ],
});

const EDUCATION_DIMENSIONS = cloneDimensionWithOverrides(GENERAL_DIMENSIONS, {
  sourceFoundation: [
    { title: "机构主体和品牌身份", keywords: ["公司", "品牌", "企业", "主体", "机构", "学校"], impact: "家长和学员需要先确认机构主体、品牌关系和校区是否真实。", recommendation: "建立机构主体、品牌沿革、校区地址和官方入口说明。" },
    { title: "官网及官方账号", keywords: ["官网", "官方网站", "官方账号", "公众号"], impact: "官方入口影响学员对课程信息和报名规则的信任。", recommendation: "统一官网、公众号、视频号和校区咨询入口。" },
    { title: "校区、地区和服务范围", keywords: ["校区", "地区", "地址", "成都", "四川"], impact: "线下咨询和试听前，客户会核实校区位置和服务范围。", recommendation: "补齐校区地址、上课形式、服务城市和联系方式。" },
    { title: "咨询、试听和报名入口", keywords: ["咨询", "试听", "报名", "联系方式"], impact: "入口不清晰会降低学员咨询和到校试听意愿。", recommendation: "建立咨询、试听、报名与校区入口。" },
    { title: "第三方公开收录", keywords: ["百科", "媒体", "平台", "收录", "企查查", "天眼查"], impact: "第三方公开信息能帮助客户交叉验证机构真实性。", recommendation: "补齐合规公开收录，并保持主体、地址和联系方式一致。" },
  ],
  contentAssets: [
    { title: "课程体系和班型", keywords: ["课程", "班型", "考研", "培训", "辅导"], impact: "学员需要理解有哪些课程、适合什么备考阶段。", recommendation: "建设课程体系、班型差异和适用人群说明。" },
    { title: "收费、报名和退费规则", keywords: ["价格", "收费", "报名", "退费", "退款"], impact: "收费和退费边界不清晰会直接影响信任和投诉风险。", recommendation: "补齐收费组成、报名流程、退费规则和常见争议FAQ。" },
    { title: "师资与教学服务", keywords: ["老师", "师资", "教学", "教研", "服务"], impact: "师资和教学服务决定客户是否相信课程交付。", recommendation: "展示师资背景、教研体系、督学服务和答疑机制。" },
    { title: "课程适用边界和学习服务注意事项", keywords: ["适合", "阶段", "基础", "注意事项", "服务"], impact: "适用边界缺失容易造成预期不一致。", recommendation: "说明不同基础、目标院校和备考阶段的适用课程。" },
    { title: "学员案例、评价和服务口碑", keywords: ["案例", "评价", "口碑", "学员"], impact: "学员评价和案例是教育培训决策的重要信任凭据。", recommendation: "合规整理真实案例、评价入口和服务反馈机制。" },
  ],
  customerScenarios: [
    { title: "机构是否正规", keywords: ["正规", "机构", "主体", "资质"], impact: "客户会先确认机构是否真实、主体是否清晰。", recommendation: "集中说明机构主体、品牌关系、校区和官方入口。" },
    { title: "课程和班型如何选择", keywords: ["课程", "班型", "适合", "阶段"], impact: "课程选择不清晰会让客户转向竞品比较。", recommendation: "建设课程选择与备考方案说明。" },
    { title: "师资和教学服务是否清晰", keywords: ["师资", "老师", "教学", "督学"], impact: "师资与服务不透明会削弱报名信任。", recommendation: "补齐师资、教研、督学和答疑服务说明。" },
    { title: "收费和退费规则", keywords: ["收费", "价格", "报名", "退费"], impact: "收费和退费规则是教育培训客户最敏感的问题之一。", recommendation: "建立收费、报名和退费FAQ。" },
    { title: "试听、咨询和校区入口", keywords: ["试听", "咨询", "校区", "报名"], impact: "客户产生兴趣后需要低摩擦进入试听和咨询。", recommendation: "明确校区、试听、咨询和报名路径。" },
  ],
  trustInformation: [
    { title: "主体和校区说明", keywords: ["主体", "校区", "地址", "机构"], impact: "主体和校区说明影响客户基础信任。", recommendation: "集中展示主体、校区、联系方式和官方入口。" },
    { title: "师资和教研背景", keywords: ["师资", "老师", "教研", "团队"], impact: "师资信息不足会降低客户对课程交付的判断。", recommendation: "补齐师资、教研和教学服务分工。" },
    { title: "课程适用边界和退费规则", keywords: ["适用", "退费", "规则", "注意事项"], impact: "边界不清晰容易导致报名后争议。", recommendation: "用中性语言说明课程适用边界、退费规则和学习服务注意事项。" },
    { title: "学员案例和第三方评价", keywords: ["案例", "评价", "口碑", "第三方"], impact: "评价和案例能帮助客户理解真实服务体验。", recommendation: "整理合规案例、学员评价入口和第三方公开信息。" },
    { title: "售后、投诉和争议处理", keywords: ["售后", "投诉", "纠纷", "处理", "退费"], impact: "争议处理路径不清晰会增加客户顾虑。", recommendation: "建立投诉、退费和学习服务争议处理说明。" },
  ],
  conversionPath: [
    { title: "咨询入口", keywords: ["电话", "联系", "客服", "咨询"], impact: "咨询入口不清晰会直接影响报名转化。", recommendation: "统一展示电话、在线咨询和校区联系方式。" },
    { title: "校区和上课信息", keywords: ["地址", "校区", "上课", "交通"], impact: "校区和上课形式影响试听和报名决策。", recommendation: "补齐校区地址、上课方式、交通和到校说明。" },
    { title: "试听和报名流程", keywords: ["试听", "报名", "预约"], impact: "试听和报名流程不清晰会导致客户不知道下一步怎么做。", recommendation: "建立咨询、试听和报名流程说明。" },
    { title: "收费和退费说明边界", keywords: ["收费", "价格", "费用", "退费"], impact: "收费和退费边界缺失会增加投诉和咨询顾虑。", recommendation: "给出收费组成、退费规则和服务边界，不作保过、押题命中或升学结果承诺。" },
    { title: "学习服务和售后路径", keywords: ["服务流程", "答疑", "督学", "售后"], impact: "学习服务路径不清晰会削弱报名后信任。", recommendation: "补齐答疑、督学、学习反馈和售后处理路径。" },
  ],
});

const EDUCATION_POLICY: PolicyDefinition = {
  id: "GENERAL_BRAND_BUSINESS",
  label: "教育培训机构",
  prohibitedClaims: ["保过", "押题命中", "升学结果承诺", "没有投诉"],
  dimensions: EDUCATION_DIMENSIONS,
  industryAnalysis: [
    "教育培训客户会先确认机构是否正规、校区是否真实、师资是否清晰，再比较课程体系、班型、适用备考阶段、收费组成和退费规则。",
    "对考研和升学培训来说，客户最关心课程能不能匹配自己的基础和目标，教学服务是否稳定，学员评价和服务口碑是否可信。",
    "GEO建设应优先把机构主体、课程班型、师资服务、收费退费、学员案例、试听咨询和校区入口整理成稳定内容资产，减少客户反复确认的成本。",
  ],
  plans: [
    { title: "品牌与机构正规性说明", buildContent: "整理机构主体、品牌关系、校区地址、官方入口和联系方式。", solvesProblem: "基础信源体系薄弱", recommendedCarrier: "官网关于页、校区页、公众号资料页", requiredMaterials: ["营业主体信息", "品牌标准名称", "校区地址和联系方式"], deliverables: ["机构正规性说明", "公开入口一致性清单", "校区信息结构"] },
    { title: "课程与服务体系", buildContent: "梳理课程分类、班型差异、适用人群和备考阶段。", solvesProblem: "课程内容资产不足", recommendedCarrier: "官网课程页、班型说明页", requiredMaterials: ["课程清单", "班型设置", "适用人群"], deliverables: ["课程体系页", "班型说明", "备考方案FAQ"] },
    { title: "师资与教学服务说明", buildContent: "展示师资背景、教研体系、督学答疑和学习服务流程。", solvesProblem: "教学信任信息不完整", recommendedCarrier: "师资页、教学服务页、公众号专题", requiredMaterials: ["师资资料", "教研介绍", "服务流程"], deliverables: ["师资介绍", "教学服务说明", "学习服务问答"] },
    { title: "收费、报名和退费 FAQ", buildContent: "说明收费组成、报名流程、退费规则和常见争议边界。", solvesProblem: "收费和退费边界不清晰", recommendedCarrier: "FAQ页、报名说明页、咨询前说明", requiredMaterials: ["收费规则", "报名流程", "退费条款"], deliverables: ["收费退费FAQ", "报名流程说明", "争议处理口径"] },
    { title: "学员案例与口碑回应", buildContent: "整理真实学员案例、评价入口和公开舆情回应机制。", solvesProblem: "口碑和争议回应不足", recommendedCarrier: "案例页、口碑页、售后说明页", requiredMaterials: ["学员案例", "评价链接", "处理结果材料"], deliverables: ["案例结构", "口碑回应说明", "服务争议FAQ"] },
    { title: "校区、试听和咨询入口", buildContent: "明确校区位置、试听预约、咨询方式和报名下一步。", solvesProblem: "咨询转化路径不清晰", recommendedCarrier: "校区页、试听页、联系页", requiredMaterials: ["校区资料", "试听规则", "咨询入口"], deliverables: ["校区入口文案", "试听流程", "咨询路径建议"] },
  ],
  requestedMaterials: ["机构主体信息", "校区资料", "课程和班型清单", "师资资料", "收费报名退费规则", "学员案例", "咨询试听流程"],
};

const POLICIES: Record<MvpGeoReportPackId, PolicyDefinition> = {
  REGULATED_MEDICAL: {
    id: "REGULATED_MEDICAL",
    label: "医疗及医美等受监管服务",
    prohibitedClaims: ["没有资质", "机构不正规", "医生不专业", "不安全"],
    dimensions: MEDICAL_DIMENSIONS,
    industryAnalysis: [
      "医疗和医美服务的客户通常会先搜索品牌名称、地区和服务项目，再进一步确认机构主体、专业人员、项目流程、风险边界和预约路径。公开信息如果分散，客户就很难在一次搜索中形成完整判断。",
      "这类行业的信息建设重点不是夸大效果，而是让客户能清楚找到企业是谁、在哪里、提供什么服务、由谁服务、流程如何、有哪些注意事项以及如何咨询。公开资料越结构化，客户和AI系统越容易理解并引用企业的基本事实。",
      "GEO建设在本场景中的价值，是把企业真实、可公开、可核验的信息组织成稳定内容资产，覆盖品牌搜索、地区服务搜索、资质查询、项目风险查询和预约售后查询，减少客户在多个平台之间反复确认的成本。",
    ],
    plans: [
      { title: "机构与主体信息页", buildContent: "整理企业名称、品牌名称、主体信息、门店地址和统一联系方式。", solvesProblem: "基础信源体系薄弱", recommendedCarrier: "官网基础页、公众号资料页、地图POI资料", requiredMaterials: ["营业主体信息", "品牌标准名称", "门店地址和联系方式"], deliverables: ["主体信息结构化文案", "公开入口一致性清单", "页面信息架构"] },
      { title: "资质和官方信息页", buildContent: "有明确来源时集中展示医疗机构或相关官方入口，未找到时只说明本次公开检索边界。", solvesProblem: "信任信息不完整", recommendedCarrier: "官网说明页、咨询前说明页", requiredMaterials: ["可公开资质材料", "官方查询入口", "更新时间"], deliverables: ["资质说明页文案", "来源标注规则", "风险措辞校验"] },
      { title: "医生团队页", buildContent: "按人员整理姓名、分工、专业背景和可公开介绍。", solvesProblem: "专业团队信息不足", recommendedCarrier: "官网团队页、公众号专题", requiredMaterials: ["医生或专业人员名单", "可公开履历", "服务分工"], deliverables: ["团队页结构", "人员介绍文案", "问答素材"] },
      { title: "服务项目页", buildContent: "按项目说明适用场景、服务流程、注意事项和咨询入口。", solvesProblem: "服务内容资产不足", recommendedCarrier: "官网栏目页、项目FAQ、小程序服务页", requiredMaterials: ["服务项目清单", "项目流程", "禁忌和注意事项"], deliverables: ["项目页模板", "项目FAQ", "客户搜索问题覆盖表"] },
      { title: "流程、风险和注意事项页", buildContent: "用中性语言说明服务前、中、后的流程和风险提示。", solvesProblem: "客户问题覆盖不足", recommendedCarrier: "官网说明页、预约前须知", requiredMaterials: ["流程节点", "注意事项", "售后随访规则"], deliverables: ["流程图文案", "风险说明模板", "预约前问答"] },
      { title: "预约面诊和收费说明", buildContent: "明确预约方式、面诊流程、价格说明边界和后续沟通路径。", solvesProblem: "咨询转化路径不清晰", recommendedCarrier: "转化页、咨询页、地图和本地生活资料", requiredMaterials: ["预约规则", "收费边界", "客服入口"], deliverables: ["转化路径文案", "咨询话术结构", "页面CTA配置"] },
      { title: "随访、售后和投诉说明", buildContent: "说明服务后联系、随访、投诉和纠纷处理路径。", solvesProblem: "售后信任信息不足", recommendedCarrier: "官网售后页、服务协议摘要", requiredMaterials: ["售后流程", "投诉渠道", "响应规则"], deliverables: ["售后说明页", "投诉处理FAQ", "信任信息检查表"] },
    ],
    requestedMaterials: ["主体材料", "官方或可公开资质入口", "医生团队信息", "服务项目清单", "流程和注意事项", "预约与收费边界", "售后投诉规则"],
  },
  LOCAL_LIFESTYLE_SERVICE: {
    id: "LOCAL_LIFESTYLE_SERVICE",
    label: "本地生活服务",
    prohibitedClaims: ["没有资质", "服务不安全", "人员不专业"],
    dimensions: LIFESTYLE_DIMENSIONS,
    industryAnalysis: [
      "本地生活服务客户通常会围绕门店名称、地区、项目、价格、案例和评价做决策。客户不是只看一条结果，而是会在地图、本地生活平台、社交平台和官方账号之间来回确认。",
      "公开信息越完整，客户越容易理解门店位置、服务项目、价格边界、服务流程、人员风格和预约方式。对AI问答来说，这些结构化信息也更容易被检索、归纳和引用。",
      "GEO建设应优先把门店入口、项目说明、价格边界、案例评价、卫生流程和预约售后整理成可持续更新的内容资产，服务本地搜索和客户咨询。",
    ],
    plans: [
      { title: "门店和项目页", buildContent: "建设门店基础资料和核心服务项目说明。", solvesProblem: "门店入口与服务信息分散", recommendedCarrier: "官网门店页、地图POI、本地生活平台", requiredMaterials: ["门店信息", "项目清单", "服务照片"], deliverables: ["门店页文案", "项目页模板", "平台资料清单"] },
      { title: "价格与服务说明", buildContent: "说明价格区间、套餐边界和预约条件。", solvesProblem: "价格边界不清晰", recommendedCarrier: "项目页、团购页、FAQ", requiredMaterials: ["价格区间", "套餐规则", "适用条件"], deliverables: ["价格说明模板", "FAQ问答", "页面结构"] },
      { title: "人员与服务流程", buildContent: "展示服务人员、擅长项目、服务流程和体验边界。", solvesProblem: "服务信任信息不足", recommendedCarrier: "团队页、项目页、短内容账号", requiredMaterials: ["人员介绍", "服务流程", "环境照片"], deliverables: ["人员介绍文案", "流程说明", "内容发布清单"] },
      { title: "卫生标准", buildContent: "公开说明消毒、卫生和服务前后注意事项。", solvesProblem: "卫生和流程信息不完整", recommendedCarrier: "官网说明页、本地生活详情", requiredMaterials: ["卫生流程", "用品说明", "注意事项"], deliverables: ["卫生标准页", "问答素材", "平台同步建议"] },
      { title: "案例评价", buildContent: "整理作品、案例、客户评价和第三方入口。", solvesProblem: "案例和口碑信号不足", recommendedCarrier: "案例页、小红书、抖音、本地生活平台", requiredMaterials: ["作品素材", "评价链接", "授权范围"], deliverables: ["案例内容结构", "评价引用规则", "内容日历"] },
      { title: "预约到店和售后", buildContent: "说明预约方式、到店路径、售后和投诉处理。", solvesProblem: "转化路径不清晰", recommendedCarrier: "预约页、地图资料、客服话术", requiredMaterials: ["预约规则", "到店说明", "售后流程"], deliverables: ["转化页文案", "咨询话术", "售后FAQ"] },
    ],
    requestedMaterials: ["门店资料", "项目清单", "价格区间", "人员介绍", "卫生流程", "案例评价", "预约售后规则"],
  },
  GENERAL_BRAND_BUSINESS: {
    id: "GENERAL_BRAND_BUSINESS",
    label: "普通品牌和企业",
    prohibitedClaims: ["市场份额低", "AI不会推荐", "竞争对手明显领先"],
    dimensions: GENERAL_DIMENSIONS,
    industryAnalysis: [
      "普通品牌和企业客户通常会先确认企业是谁、产品或服务是什么、适合什么场景、品质依据是什么、如何购买或合作。公开信息越分散，客户越难建立稳定认知。",
      "公开内容需要同时服务搜索引擎、AI问答和真实客户决策。品牌介绍、产品体系、规格用途、认证案例、FAQ、购买咨询和售后合作流程，都是客户和AI理解企业的基础素材。",
      "GEO建设的重点，是把企业真实资料整理成可检索、可引用、可持续更新的内容资产，让客户在不同入口都能得到一致、清晰、可行动的答案。",
    ],
    plans: [
      { title: "品牌介绍", buildContent: "整理企业定位、品牌故事、服务对象和核心能力。", solvesProblem: "企业身份表达不集中", recommendedCarrier: "官网关于页、品牌介绍页", requiredMaterials: ["企业简介", "品牌定位", "服务对象"], deliverables: ["品牌介绍文案", "结构化信息表", "页面信息架构"] },
      { title: "产品体系", buildContent: "梳理产品或服务分类、核心卖点和适用对象。", solvesProblem: "产品或服务体系不清晰", recommendedCarrier: "官网产品页、目录页", requiredMaterials: ["产品清单", "服务范围", "核心卖点"], deliverables: ["产品体系页", "栏目规划", "FAQ初稿"] },
      { title: "规格和选购指南", buildContent: "说明规格、用途、使用场景和选购建议。", solvesProblem: "客户问题覆盖不足", recommendedCarrier: "选购指南、FAQ、图文内容", requiredMaterials: ["规格参数", "使用场景", "客户问题"], deliverables: ["选购指南", "问答库", "内容发布计划"] },
      { title: "品质和工艺", buildContent: "展示工艺、认证、品质控制和可公开证明。", solvesProblem: "信任信息不完整", recommendedCarrier: "品质页、认证页、案例页", requiredMaterials: ["工艺说明", "认证资料", "检测或案例"], deliverables: ["品质说明页", "证明材料索引", "风险措辞校验"] },
      { title: "购买和合作入口", buildContent: "明确购买、咨询、招商、商务合作和售后路径。", solvesProblem: "转化路径不清晰", recommendedCarrier: "联系页、合作页、客服话术", requiredMaterials: ["联系方式", "合作流程", "售后规则"], deliverables: ["合作页文案", "CTA设计", "咨询路径建议"] },
      { title: "案例和售后", buildContent: "整理案例、客户评价、交付流程和售后说明。", solvesProblem: "决策证明不足", recommendedCarrier: "案例页、售后页、行业专题", requiredMaterials: ["案例素材", "评价材料", "售后流程"], deliverables: ["案例结构", "售后FAQ", "内容资产清单"] },
    ],
    requestedMaterials: ["企业简介", "产品或服务清单", "规格和场景资料", "认证或案例", "客户问题", "购买合作流程", "售后规则"],
  },
};

function selectPolicy(industry = "", product = ""): PolicyDefinition {
  const text = `${industry} ${product}`.toLowerCase();
  if (/教育|培训|考研|升学|课程|学校|辅导|万学|海文/.test(text)) return EDUCATION_POLICY;
  if (/医疗|医美|口腔|体检|诊所/.test(text)) return POLICIES.REGULATED_MEDICAL;
  if (/美容|美发|美甲|spa|摄影|健身|皮肤护理|本地生活/.test(text)) return POLICIES.LOCAL_LIFESTYLE_SERVICE;
  return POLICIES.GENERAL_BRAND_BUSINESS;
}

function sourceCounts(evidence: readonly EvidenceItem[]) {
  const count = (level: string) => evidence.filter((item) => (item.acquisitionLevel ?? "SEARCH_SNIPPET") === level).length;
  return { total: evidence.length, searchSnippet: count("SEARCH_SNIPPET"), crawledPage: count("CRAWLED_PAGE"), officialPage: count("OFFICIAL_PAGE"), officialRegistry: count("OFFICIAL_REGISTRY") };
}

function normalizedEvidenceText(item: EvidenceItem): string {
  return `${item.title} ${item.snippet} ${item.sourceDomain}`.toLowerCase();
}

function evidenceIdsFor(item: CheckItem, evidence: readonly EvidenceItem[], brandName = ""): string[] {
  const keywords = item.keywords.length > 0 ? item.keywords : [brandName].filter(Boolean);
  if (keywords.length === 0) return [];
  return evidence
    .filter((candidate) => {
      const text = normalizedEvidenceText(candidate);
      return keywords.some((keyword) => keyword && text.includes(keyword.toLowerCase()));
    })
    .map((candidate) => candidate.id);
}

function hasOfficialEvidence(ids: readonly string[], evidence: readonly EvidenceItem[]): boolean {
  return ids.some((id) => {
    const item = evidence.find((candidate) => candidate.id === id);
    return item?.acquisitionLevel === "OFFICIAL_PAGE" || item?.acquisitionLevel === "OFFICIAL_REGISTRY" || item?.sourceType === "FIRST_PARTY_EVIDENCE";
  });
}

function hasVerifiedEvidence(ids: readonly string[], evidence: readonly EvidenceItem[]): boolean {
  return ids.some((id) => {
    const item = evidence.find((candidate) => candidate.id === id);
    return item?.acquisitionLevel === "CRAWLED_PAGE" ||
      item?.acquisitionLevel === "OFFICIAL_PAGE" ||
      item?.acquisitionLevel === "OFFICIAL_REGISTRY" ||
      item?.sourceType === "FIRST_PARTY_EVIDENCE";
  });
}

function hasAnyVerifiedEvidence(evidence: readonly EvidenceItem[]): boolean {
  return evidence.some((item) =>
    item.acquisitionLevel === "CRAWLED_PAGE" ||
    item.acquisitionLevel === "OFFICIAL_PAGE" ||
    item.acquisitionLevel === "OFFICIAL_REGISTRY" ||
    item.sourceType === "FIRST_PARTY_EVIDENCE",
  );
}

function statusScore(status: MvpGeoScoreFindingStatus): number | null {
  if (status === "CLEARLY_FOUND") return 100;
  if (status === "PARTIALLY_FOUND") return 50;
  if (status === "NOT_FOUND_IN_CHECKED_SCOPE") return 0;
  return null;
}

function scoreLevel(score: number | null): string {
  if (score === null) return "检查完成度不足";
  if (score <= 29) return "公开信息基础较弱";
  if (score <= 49) return "存在明显缺口";
  if (score <= 69) return "初步具备基础";
  if (score <= 84) return "公开信息较完整";
  return "公开信息成熟";
}

function statusCopy(status: MvpGeoScoreFindingStatus): string {
  if (status === "CLEARLY_FOUND") return "已清晰发现";
  if (status === "PARTIALLY_FOUND") return "部分发现";
  if (status === "NOT_FOUND_IN_CHECKED_SCOPE") return "本次检索未发现";
  return "尚未执行检查";
}

function currentCopy(status: MvpGeoScoreFindingStatus, title: string): string {
  if (status === "CLEARLY_FOUND") return `本次检索已发现较清晰的${title}公开信息。`;
  if (status === "PARTIALLY_FOUND") return `本次检索发现了与${title}相关的公开线索，但信息仍较分散或缺少集中入口。`;
  if (status === "NOT_FOUND_IN_CHECKED_SCOPE") return `本次公开检索未发现集中、清晰的${title}公开入口。`;
  return `本次尚未执行${title}检查。`;
}

function scoreDimensions(policy: PolicyDefinition, input: DiagnosisInput, evidence: readonly EvidenceItem[], searchCompleted: boolean): MvpGeoDiagnosticReportV1["score"]["dimensions"] {
  const verifiedBoundary = hasAnyVerifiedEvidence(evidence);
  return policy.dimensions.map((dimension) => {
    const itemMax = dimension.maxScore / dimension.items.length;
    let earned = 0;
    let checkedMax = 0;
    const findings = dimension.items.map((item) => {
      const evidenceIds = evidenceIdsFor(item, evidence, input.brandName ?? "");
      const status: MvpGeoScoreFindingStatus = !searchCompleted
        ? "NOT_CHECKED"
        : evidenceIds.length === 0
          ? "NOT_FOUND_IN_CHECKED_SCOPE"
          : hasOfficialEvidence(evidenceIds, evidence)
            ? "CLEARLY_FOUND"
            : "PARTIALLY_FOUND";
      const score = statusScore(status);
      const measured = score !== null && verifiedBoundary && (status === "NOT_FOUND_IN_CHECKED_SCOPE" || hasVerifiedEvidence(evidenceIds, evidence));
      const displayScore = measured ? score : null;
      if (displayScore !== null) {
        checkedMax += itemMax;
        earned += (displayScore / 100) * itemMax;
      }
      return {
        title: item.title,
        status,
        score: displayScore,
        evidenceIds,
        currentStatus: currentCopy(status, item.title),
        impact: item.impact,
        recommendation: item.recommendation,
      };
    });
    const checkedItemCount = findings.filter((finding) => finding.score !== null).length;
    const score = checkedMax > 0 ? Math.round((earned / checkedMax) * dimension.maxScore) : null;
    return {
      id: dimension.id,
      title: dimension.title,
      maxScore: dimension.maxScore,
      score,
      checkedItemCount,
      totalItemCount: dimension.items.length,
      findings,
    };
  });
}

function completionRate(dimensions: MvpGeoDiagnosticReportV1["score"]["dimensions"]): number {
  const checked = dimensions.reduce((total, dimension) => total + dimension.checkedItemCount, 0);
  const total = dimensions.reduce((sum, dimension) => sum + dimension.totalItemCount, 0);
  return total > 0 ? Math.round((checked / total) * 100) : 0;
}

function normalizedDimensionScore(dimension: MvpGeoDiagnosticReportV1["score"]["dimensions"][number]): number | null {
  if (dimension.score === null || dimension.maxScore <= 0) return null;
  return Math.round((dimension.score / dimension.maxScore) * 100);
}

function overallScore(dimensions: MvpGeoDiagnosticReportV1["score"]["dimensions"], completion: number): number | null {
  if (completion < 80) return null;
  let weighted = 0;
  let weightSum = 0;
  for (const dimension of dimensions) {
    const score = normalizedDimensionScore(dimension);
    const weight = SCORE_V2_WEIGHTS[dimension.id] ?? 0;
    if (score === null || weight <= 0) continue;
    weighted += score * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? Math.round(weighted / weightSum) : null;
}

function criticalRiskCap(reputation: ReputationAndPublicOpinionSnapshotV1): number | null {
  const reputationScore = reputation.reputationHealthScore ?? reputation.overallReputationScore;
  if (reputationScore === null) return null;
  const hasP0ReputationRisk = reputation.complaintSignals.length > 0 && reputation.riskLevel !== "UNKNOWN";
  if (reputationScore <= 35 && reputation.riskLevel === "HIGH") return 40;
  if (reputationScore <= 44 && hasP0ReputationRisk) return 45;
  return null;
}

function topMissingFindings(dimensions: MvpGeoDiagnosticReportV1["score"]["dimensions"], limit: number) {
  return dimensions
    .flatMap((dimension) => dimension.findings.map((finding) => ({ dimension, finding })))
    .filter((entry) => entry.finding.status !== "CLEARLY_FOUND")
    .sort((a, b) => (a.finding.score ?? -1) - (b.finding.score ?? -1))
    .slice(0, limit);
}

function buildSourceCoverageMatrix(dimensions: MvpGeoDiagnosticReportV1["score"]["dimensions"], searchCompleted: boolean): SourceCoverageSlotV1[] {
  return dimensions.flatMap((dimension) => dimension.findings.map((finding, index) => ({
    slotId: `${dimension.id}_${index + 1}`,
    title: finding.title,
    category: dimension.title,
    status: finding.status === "CLEARLY_FOUND" ? "FOUND" : finding.status === "PARTIALLY_FOUND" ? "PARTIAL" : finding.status === "NOT_CHECKED" ? "NOT_CHECKED" : "NOT_FOUND_IN_CHECKED_SCOPE",
    evidenceIds: finding.evidenceIds,
    checkedQueries: searchCompleted ? ["本次公开网络检索"] : [],
    sourceTypes: [],
    findingSummary: finding.currentStatus,
    missingInformation: finding.status === "CLEARLY_FOUND" ? "" : `缺少集中、清晰的${finding.title}。`,
    recommendedAction: finding.recommendation,
    confidence: finding.status === "CLEARLY_FOUND" ? 0.8 : finding.status === "PARTIALLY_FOUND" ? 0.5 : 0.3,
    requiredForFullDiagnosis: true,
  })));
}

function dimensionRows(report: MvpGeoDiagnosticReportV1, dimensionId: string) {
  const dimension = report.score.dimensions.find((item) => item.id === dimensionId);
  return dimension?.findings ?? [];
}

function industryQuestions(policy: PolicyDefinition, input: DiagnosisInput): string[] {
  const submitted = (input.customerQuestions ?? [])
    .map((item) => item.question)
    .filter((question): question is string => typeof question === "string" && question.trim().length > 0);
  const typical = policy === EDUCATION_POLICY
    ? ["这家机构是否正规？", "课程体系和班型适合哪些备考阶段？", "师资、督学和答疑服务如何安排？", "咨询、试听、报名、收费与退费规则是什么？", "有没有学员案例、评价或公开风险提示？"]
    : policy.id === "REGULATED_MEDICAL"
    ? ["这家机构是否正规？", "有哪些服务项目和流程？", "怎么预约，收费和随访如何安排？", "有没有真实案例、评价或风险提示？", "服务后出现问题如何处理？"]
    : policy.id === "LOCAL_LIFESTYLE_SERVICE"
      ? ["门店在哪里，营业时间是什么？", "服务项目和价格区间是什么？", "如何预约到店，售后怎么处理？", "客户评价和案例是否可信？", "出现退款或争议时如何处理？"]
      : ["企业主要产品或服务是什么？", "产品适合什么场景？", "如何购买、咨询或商务合作？", "网上评价、投诉和企业回应情况如何？", "售后、交付和合同边界是否清楚？"];
  return [...submitted, ...typical].slice(0, 8);
}

function reputationScoreDimension(snapshot: ReputationAndPublicOpinionSnapshotV1, searchCompleted: boolean): MvpGeoDiagnosticReportV1["score"]["dimensions"][number] {
  if (!searchCompleted || snapshot.evidenceIds.length === 0) {
    const titles = ["公开投诉与负面舆情集中度", "争议主题清晰度", "企业公开回应线索", "正向评价与第三方口碑", "舆情来源覆盖"];
    return {
      id: "reputationAndPublicOpinion",
      title: "舆情与口碑",
      maxScore: 100,
      score: null,
      checkedItemCount: 0,
      totalItemCount: titles.length,
      findings: titles.map((title) => ({
        title,
        status: "NOT_CHECKED" as const,
        score: null,
        evidenceIds: [],
        currentStatus: searchCompleted
          ? `本次尚未匹配到可用于判断${title}的明确证据。`
          : `本次尚未执行${title}检查。`,
        impact: "舆情与口碑会影响客户搜索后的信任判断。",
        recommendation: "补充可核验的公开来源后，再判断投诉、评价和回应情况。",
      })),
    };
  }
  const score = snapshot.overallReputationScore;
  const complaintCount = snapshot.complaintSignals.length;
  const responseCount = snapshot.responseSignals.length;
  const sourceCount = snapshot.sourceCoverage.length;
  const riskThemeCount = snapshot.riskThemes.length;
  const searchCoverageConfidence = snapshot.searchCoverageConfidence ?? (sourceCount >= 2 && snapshot.evidenceIds.length >= 5 ? "HIGH" : sourceCount > 0 ? "MEDIUM" : "LOW");
  const factualSpecificityConfidence = snapshot.factualSpecificityConfidence ?? "LOW";
  const underlyingEntityConfidence = snapshot.underlyingEntityConfidence ?? snapshot.entityRelationConfidence ?? "LOW";
  const eventAttributionConfidence = snapshot.eventAttributionConfidence ?? "LOW";
  const customerVisibilityConfidence = snapshot.customerVisibilityConfidence ?? (snapshot.evidenceIds.length >= 3 ? "HIGH" : snapshot.evidenceIds.length > 0 ? "MEDIUM" : "LOW");
  const findings = [
    {
      title: "公开投诉与负面舆情集中度",
      status: complaintCount === 0 ? "CLEARLY_FOUND" as const : complaintCount <= 2 ? "PARTIALLY_FOUND" as const : "NOT_FOUND_IN_CHECKED_SCOPE" as const,
      score: complaintCount === 0 ? 100 : complaintCount <= 2 ? 50 : 0,
      evidenceIds: snapshot.complaintSignals.map((item) => item.evidenceId),
      currentStatus: complaintCount === 0 ? "本次公开检索暂未发现明确负面风险信号。" : `本次检索发现${complaintCount}条投诉、争议或企业风险提示相关线索。`,
      impact: "客户在咨询、试听、报名、付款或合作前会用负面舆情交叉验证企业可信度。",
      recommendation: "先整理公开争议主题、处理口径和真实服务边界，形成可持续更新的信任说明。",
    },
    {
      title: "争议主题清晰度",
      status: riskThemeCount === 0 ? "CLEARLY_FOUND" as const : riskThemeCount <= 2 ? "PARTIALLY_FOUND" as const : "NOT_FOUND_IN_CHECKED_SCOPE" as const,
      score: riskThemeCount === 0 ? 100 : riskThemeCount <= 2 ? 50 : 0,
      evidenceIds: snapshot.complaintSignals.map((item) => item.evidenceId),
      currentStatus: riskThemeCount === 0 ? "本次检索未形成集中争议主题。" : `风险主题集中在${snapshot.riskThemes.slice(0, 3).join("、")}；主体确认置信度为${underlyingEntityConfidence}，事件归属置信度为${eventAttributionConfidence}，具体事实置信度为${factualSpecificityConfidence}。`,
      impact: "争议主题如果没有被主动说明，客户容易只看到片段化负面信息。",
      recommendation: "将争议高频点转化为服务流程、合同边界和售后处理说明。",
    },
    {
      title: "企业公开回应线索",
      status: responseCount > 0 ? "PARTIALLY_FOUND" as const : complaintCount > 0 ? "NOT_FOUND_IN_CHECKED_SCOPE" as const : "CLEARLY_FOUND" as const,
      score: responseCount > 0 ? 50 : complaintCount > 0 ? 0 : 100,
      evidenceIds: snapshot.responseSignals.map((item) => item.evidenceId),
      currentStatus: responseCount > 0 ? "本次检索发现部分回应或处理线索。" : complaintCount > 0 ? "暂未形成足够清晰的公开回应线索。" : "未见需要公开回应的集中负面舆情。",
      impact: "公开回应能让客户看到企业是否重视争议处理。",
      recommendation: "建立投诉、退款、合同和服务争议的公开回应与咨询前说明机制。",
    },
    {
      title: "正向评价与第三方口碑",
      status: snapshot.positiveSignals.length > 0 ? "PARTIALLY_FOUND" as const : "NOT_FOUND_IN_CHECKED_SCOPE" as const,
      score: snapshot.positiveSignals.length > 0 ? 50 : 0,
      evidenceIds: snapshot.positiveSignals.map((item) => item.evidenceId),
      currentStatus: snapshot.positiveSignals.length > 0 ? "本次检索发现部分正向评价或中性口碑线索。" : "本次检索未发现集中、清晰的正向评价入口。",
      impact: "正向口碑材料不足时，客户更容易被零散负面信息影响。",
      recommendation: "合规整理真实评价、案例和服务反馈入口，不制造或诱导虚假评价。",
    },
    {
      title: "舆情来源覆盖",
      status: sourceCount >= 4 ? "CLEARLY_FOUND" as const : sourceCount >= 2 ? "PARTIALLY_FOUND" as const : "NOT_FOUND_IN_CHECKED_SCOPE" as const,
      score: sourceCount >= 4 ? 100 : sourceCount >= 2 ? 50 : 0,
      evidenceIds: snapshot.evidenceIds,
      currentStatus: sourceCount > 0 ? `本次检索覆盖置信度为${searchCoverageConfidence}，客户可见度置信度为${customerVisibilityConfidence}，覆盖${snapshot.sourceCoverage.join("、")}等公开来源；客户可见入口和底层事件已分开计算。` : "本次舆情检索来源覆盖有限。",
      impact: "来源覆盖只影响证据置信度，不用于抬高舆情健康分。",
      recommendation: "持续跟踪投诉平台、社交平台、媒体报道和官方公开渠道，并与舆情健康分分开解释。",
    },
  ];
  return {
    id: "reputationAndPublicOpinion",
    title: "舆情与口碑",
    maxScore: 100,
    score,
    checkedItemCount: findings.length,
    totalItemCount: findings.length,
    findings,
  };
}

function reputationIssue(report: MvpGeoDiagnosticReportV1): MvpGeoDiagnosticReportV1["coreIssues"][number] | null {
  const reputation = report.reputation;
  if (!reputation || (reputation.riskLevel === "LOW" && reputation.complaintSignals.length === 0) || reputation.riskLevel === "UNKNOWN") return null;
  return {
    title: "公开舆情影响客户信任",
    essence: "客户搜索机构正规性、课程服务、报名或合作信息时，如果先看到公开风险内容且看不到企业说明，会直接影响继续咨询和付款决策。",
    currentPerformance: reputation.summary,
    impacts: [
      "客户理解：客户会先看到司法、经营风险或争议主题，再回头验证机构是否可信。",
      "信任判断：缺少事实核实、处理状态和公开回应时，负面信息更容易放大。",
      "搜索咨询：客户可能直接放弃咨询、试听、报名或转向其他机构。",
    ],
    severity: reputation.riskLevel === "HIGH" ? "★★★★★" : "★★★★☆",
    priority: "P0",
    direction: "优先核实相关风险内容和主体关联，确认是否已处理，整理企业可公开说明、服务边界和统一回应入口。",
  };
}

function buildCoreIssues(report: MvpGeoDiagnosticReportV1): MvpGeoDiagnosticReportV1["coreIssues"] {
  type CoreIssue = MvpGeoDiagnosticReportV1["coreIssues"][number];
  const priorityPlan: Array<Pick<CoreIssue, "severity" | "priority">> = [
    { severity: "★★★★★", priority: "P0" },
    { severity: "★★★★☆", priority: "P0" },
    { severity: "★★★★☆", priority: "P1" },
    { severity: "★★★★☆", priority: "P1" },
    { severity: "★★★☆☆", priority: "P2" },
    { severity: "★★★☆☆", priority: "P2" },
  ];
  const definitions = [
    ["基础信源体系薄弱", "企业身份、官方入口、地图或平台入口没有形成稳定的公开信源体系。", "sourceFoundation"],
    ["服务内容资产不足", "客户搜索到企业后，还需要进一步理解项目、流程、边界和适用场景。", "contentAssets"],
    ["客户问题覆盖不足", "用户提交问题和行业典型问题缺少可直接引用的公开答案。", "customerScenarios"],
    ["信任信息不完整", "主体、团队、流程、风险、案例和售后信息没有形成完整决策链路。", "trustInformation"],
    ["咨询转化路径不清晰", "联系方式、预约、收费边界和售后路径没有被组织成低摩擦转化入口。", "conversionPath"],
    ["本地语义关联不足", "地区、服务项目和客户搜索语言之间的内容连接仍不够集中。", "customerScenarios"],
  ] as const;
  const dimensionMap = new Map(report.score.dimensions.map((dimension) => [dimension.id, dimension]));
  const built = definitions
    .map(([title, essence, dimensionId], index) => {
      const dimension = dimensionMap.get(dimensionId);
      const missing = dimension?.findings.filter((finding) => finding.status !== "CLEARLY_FOUND").slice(0, 2).map((finding) => finding.title).join("、") || "相关公开入口";
      const planned = priorityPlan[index] ?? { severity: "★★★☆☆", priority: "P2" as const };
      return {
        title,
        essence,
        currentPerformance: `本次检索中，${missing}仍未形成集中、清晰的公开信息。`,
        impacts: [
          "客户理解：客户需要跨多个入口拼接信息，容易中途流失。",
          "信任判断：缺少集中说明时，客户难以判断信息来源和更新状态。",
          "搜索咨询：搜索和AI问答难以稳定引用企业自己的完整答案。",
        ],
        severity: planned.severity,
        priority: planned.priority,
        direction: dimension?.findings.find((finding) => finding.status !== "CLEARLY_FOUND")?.recommendation ?? "整理真实资料，形成可检索、可引用、可持续更新的公开内容资产。",
      };
    })
    .sort((a, b) => {
      const priorityRank: Record<CoreIssue["priority"], number> = { P0: 0, P1: 1, P2: 2 };
      return priorityRank[a.priority] - priorityRank[b.priority];
    })
    .slice(0, 5);
  const rep = reputationIssue(report);
  if (!rep) return built.slice(0, 4);
  return [rep, ...built.filter((issue) => issue.title !== rep.title)].slice(0, 4);
}

function withPriorities(policy: PolicyDefinition, reputation?: ReputationAndPublicOpinionSnapshotV1): MvpGeoDiagnosticReportV1["contentPlans"] {
  const reputationPlan: Omit<MvpGeoDiagnosticReportV1["contentPlans"][number], "priority"> = {
    title: "舆情核实与信任修复",
    buildContent: "逐条核实公开风险证据、主体关联、处理状态和企业回应口径，形成客户可理解的服务边界与统一说明入口。",
    solvesProblem: "公开负面舆情影响品牌信任",
    recommendedCarrier: "官网信任说明页、服务协议摘要、售后FAQ、咨询前说明",
    requiredMaterials: ["风险证据清单", "主体关联确认", "事实与处理状态", "企业可公开回应规则"],
    deliverables: ["舆情证据核实表", "回应口径结构", "信任修复内容页", "售后争议FAQ"],
  };
  const basePlans = reputation && (reputation.riskLevel !== "LOW" || reputation.complaintSignals.length > 0)
    ? [reputationPlan, ...policy.plans.filter((plan) => plan.title !== reputationPlan.title)]
    : policy.plans;
  return basePlans.slice(0, 5).map((plan, index) => ({
    ...plan,
    priority: index < 2 ? "P0" : index < 4 ? "P1" : "P2",
  }));
}

interface LimitedReportBuildOptions {
  diagnosisId?: string;
  reputation?: ReputationAndPublicOpinionSnapshotV1;
  searchedReputationQueries?: readonly string[];
}

function buildMvpReport(input: DiagnosisInput, evidence: readonly EvidenceItem[], searchCompleted: boolean, generatedAt = new Date().toISOString(), options: LimitedReportBuildOptions = {}): MvpGeoDiagnosticReportV1 {
  const policy = selectPolicy(input.industry, input.productOrService);
  const reputation = options.reputation ?? buildReputationSnapshot({
    diagnosisId: options.diagnosisId ?? "unknown",
    diagnosisInput: input,
    evidence,
    searchedQueries: options.searchedReputationQueries ?? buildReputationQueries(input, 8),
    generatedAt,
  });
  const baseDimensions = scoreDimensions(policy, input, evidence, searchCompleted);
  const dimensions = [
    baseDimensions[0]!,
    reputationScoreDimension(reputation, searchCompleted),
    ...baseDimensions.slice(1),
  ];
  const completion = completionRate(dimensions);
  const weightedOverall = overallScore(dimensions, completion);
  const cap = criticalRiskCap(reputation);
  const overall = weightedOverall === null ? null : Math.min(weightedOverall, cap ?? weightedOverall);
  const hasCriticalReputationRisk = cap !== null;
  const level = hasCriticalReputationRisk ? "当前存在高优先级信任风险" : scoreLevel(overall);
  const topMissing = topMissingFindings(dimensions, 3);
  const companyName = input.brandName ?? "待确认企业";
  const industry = input.industry ?? policy.label;
  const region = input.targetRegion ?? "待确认地区";
  const reportDate = generatedAt;
  const questions = industryQuestions(policy, input);
  const questionSource = (input.customerQuestions ?? []).some((item) => item.question?.trim()) ? "USER_PROVIDED" : "SYSTEM_GENERATED";
  const hasReputationRisk = reputation.complaintSignals.length > 0;
  const firstReputationAction = "先核实公开风险信息并建立统一说明入口。";
  const isEducation = policy === EDUCATION_POLICY;

  const report: MvpGeoDiagnosticReportV1 = {
    strategyPack: policy.id,
    score: {
      overall,
      level,
      completionRate: completion,
      dimensions,
      explanation: "GEO公开信息基础指数V2采用六个一级维度：基础信源20%、舆情与口碑20%、内容资产20%、客户搜索场景15%、信任与决策信息15%、咨询与转化路径10%。",
    },
    overview: {
      companyName,
      industry,
      region,
      reportDate,
      overallEvaluation: overall === null
        ? `${companyName}本次检查完成度为${completion}%，暂不输出总分。`
        : hasCriticalReputationRisk
          ? `${companyName}当前GEO公开信息基础指数为${overall}分，属于“${level}”。公开搜索中已经出现可能影响客户报名、付款或合作判断的风险信息，需要先完成事实核实、处理状态整理和统一公开回应，再系统建设课程、服务和客户问题内容。`
          : `${companyName}当前GEO公开信息基础指数为${overall}分，属于“${level}”。公开信息可以开始作为诊断依据，但仍存在明显建设空间。`,
      topProblems: [
        ...(hasReputationRisk ? ["公开舆情影响客户信任，需要优先核实事实、处理状态和公开回应口径。"] : []),
        ...topMissing.map((entry) => entry.finding.title),
      ].slice(0, 3),
      topOpportunities: [
        "先补齐企业身份、官方入口和本地信源，让客户能确认企业基本事实。",
        hasReputationRisk ? "把风险提示、客户反馈和企业回应整理成可解释的公开信任内容。" : "把评价、案例和服务反馈整理成可解释的公开信任内容。",
        isEducation ? "围绕课程、班型、师资、收费退费和试听报名建设结构化内容。" : "围绕服务项目和客户问题建设结构化内容，让搜索和AI问答有可引用答案。",
      ].slice(0, 3),
    },
    industryAnalysis: [...policy.industryAnalysis].slice(0, 3),
    sourceFoundationRows: [],
    contentAssetRows: [],
    customerScenarioRows: [],
    trustRiskRows: [],
    coreIssues: [],
    contentPlans: withPriorities(policy, reputation),
    roadmap: [
        { stage: "0-30天", companyActions: hasReputationRisk ? ["逐条核实风险证据、主体关联、具体事实和当前处理状态。", "整理企业可以公开的说明、回应口径、收费报名退费和学习服务边界。", "建立统一公开说明入口，再启动普通GEO内容建设。"] : ["确认企业主体、品牌名称、地址、联系方式和可公开资料。", "提供课程、师资、服务流程和咨询报名规则。"], xingmeiDeliverables: hasReputationRisk ? ["完成舆情证据复核、主题归类和回应入口结构。", "输出机构正规性、收费退费、服务边界和公开回应文案。"] : ["完成公开信源清单和页面结构。", "输出机构身份、课程服务和咨询入口文案。"], acceptanceCriteria: hasReputationRisk ? ["每条负面信息都有事实核实结果和处理状态记录。", "客户能看到统一公开回应入口，而不是用正面内容掩盖争议。"] : ["客户搜索品牌名能看到统一基础信息。", "官网、地图或官方账号至少形成一个清晰入口。"] },
      { stage: "31-60天", companyActions: hasReputationRisk ? ["发布退款规则、学习服务流程和常见争议FAQ。", "补充学员服务、售后处理说明、真实案例和处理结果材料。"] : ["补充客户高频问题、课程流程、服务注意事项和案例评价材料。", "确认可公开的收费、报名、退费和学习服务规则。"], xingmeiDeliverables: ["建设客户决策FAQ、课程页和信任信息页。", "完成行业典型搜索场景内容覆盖。"], acceptanceCriteria: ["客户搜索课程、班型和校区时能找到结构化说明。", "客户对收费、退费和服务问题能看到清晰边界。"] },
      { stage: "61-90天", companyActions: hasReputationRisk ? ["复查舆情变化，跟踪相同问题是否继续出现。", "更新公开回应、客户问题内容和处理结果材料。"] : ["按月提供新增课程、案例和客户问题。", "配合复测公开信息表现并校正内容。"], xingmeiDeliverables: ["持续发布、测试、更新和优化内容资产。", "输出阶段复盘和下一轮建设建议。"], acceptanceCriteria: ["核心内容持续更新。", "重点问题和转化入口完成复测，不承诺排名或经营结果。"] },
    ],
    conclusion: [
      overall === null ? `本次检查完成度为${completion}%，需要先补齐检查范围。` : hasCriticalReputationRisk ? `${companyName}当前分数为${overall}分，最先要处理的是公开舆情造成的信任阻断。` : `${companyName}当前分数为${overall}分，最大问题是公开信息入口和客户决策内容仍不够集中。`,
      "最大机会在于把企业真实资料、公开口碑和争议回应整理成可检索、可理解、可引用的GEO内容资产。",
      hasReputationRisk ? `${firstReputationAction}随后再补齐企业身份、服务项目、预约咨询和信任信息。` : "第一阶段应优先补齐企业身份、官方入口、服务项目、预约咨询和信任信息，再进入持续内容发布和复测。",
    ],
    reputation,
    questionSource,
    disclaimer: DISCLAIMER,
    visibleCharacterCount: 0,
    algorithmVersion: "fast-mvp-geo-diagnostic-report.v1",
  };

  report.sourceFoundationRows = dimensionRows(report, "sourceFoundation").slice(0, 3).map((finding) => ({
    sourceType: finding.title,
    finding: finding.currentStatus,
    status: statusCopy(finding.status),
    score: finding.score,
    decisionImpact: finding.impact,
    optimization: finding.recommendation,
  }));
  report.contentAssetRows = dimensionRows(report, "contentAssets").slice(0, 3).map((finding) => ({
    item: finding.title,
    currentStatus: finding.currentStatus,
    score: finding.score,
    gap: finding.status === "CLEARLY_FOUND" ? "已具备基础公开信息。" : `缺少集中、清晰的${finding.title}。`,
    impact: finding.impact,
    recommendation: finding.recommendation,
  }));
  report.customerScenarioRows = questions.slice(0, 3).map((question, index) => {
    const finding = dimensionRows(report, "customerScenarios")[index % 5]!;
    return {
      scenario: finding.title,
      question,
      answerability: finding.status === "CLEARLY_FOUND" ? "公开信息可清晰回答" : finding.status === "PARTIALLY_FOUND" ? "只能部分回答" : "基本无法回答",
      performance: finding.currentStatus,
      score: finding.score,
      impact: finding.impact,
      recommendedContent: finding.recommendation,
    };
  });
  report.trustRiskRows = [...dimensionRows(report, "trustInformation").slice(0, 1), ...dimensionRows(report, "conversionPath").slice(0, 3)].map((finding) => ({
    item: finding.title,
    currentStatus: finding.currentStatus,
    score: finding.score,
    impact: finding.impact,
    recommendation: finding.recommendation,
  }));
  report.coreIssues = buildCoreIssues(report);
  report.visibleCharacterCount = countVisibleChars(report);
  return report;
}

function countVisibleChars(report: MvpGeoDiagnosticReportV1): number {
  const texts: string[] = [
    report.overview.overallEvaluation,
    ...report.overview.topProblems,
    ...report.overview.topOpportunities,
    report.reputation?.summary ?? "",
    ...(report.reputation?.riskThemes ?? []),
    ...report.industryAnalysis.slice(0, 3),
    ...report.sourceFoundationRows.flatMap((row) => [row.sourceType, row.finding, row.status, row.decisionImpact, row.optimization]),
    ...report.contentAssetRows.flatMap((row) => [row.item, row.currentStatus, row.gap, row.impact, row.recommendation]),
    ...report.customerScenarioRows.flatMap((row) => [row.scenario, row.question, row.answerability, row.performance, row.impact, row.recommendedContent]),
    ...report.trustRiskRows.flatMap((row) => [row.item, row.currentStatus, row.impact, row.recommendation]),
    ...report.coreIssues.slice(0, 3).flatMap((issue) => [issue.title, issue.essence, issue.currentPerformance, ...issue.impacts, issue.severity, issue.priority, issue.direction]),
    ...report.contentPlans.flatMap((plan) => [plan.title, plan.buildContent, plan.solvesProblem, plan.recommendedCarrier, plan.priority, ...plan.requiredMaterials, ...plan.deliverables]),
    ...report.roadmap.flatMap((stage) => [stage.stage, ...stage.companyActions, ...stage.xingmeiDeliverables, ...stage.acceptanceCriteria]),
    ...report.conclusion,
    report.disclaimer,
  ];
  return texts.join("").replace(/\s+/g, "").length;
}

export function buildUniversalLimitedReport(input: DiagnosisInput, evidence: readonly EvidenceItem[], searchCompleted: boolean, generatedAt = new Date().toISOString(), options: LimitedReportBuildOptions = {}): LimitedReportDataV1 {
  const mvpReport = buildMvpReport(input, evidence, searchCompleted, generatedAt, options);
  const policy = selectPolicy(input.industry, input.productOrService);
  const sourceCoverageMatrix = buildSourceCoverageMatrix(mvpReport.score.dimensions, searchCompleted);
  const evidenceCount = sourceCounts(evidence);
  const dimensions = mvpReport.score.dimensions.map((dimension) => {
    const status: PublicInformationSlotStatus = dimension.checkedItemCount === 0
      ? "NOT_CHECKED"
      : (dimension.score ?? 0) >= dimension.maxScore * 0.8
        ? "VERIFIED_PRESENT"
        : (dimension.score ?? 0) > 0
          ? "PARTIALLY_PRESENT"
          : "VERIFIED_MISSING";
    return {
      id: dimension.id,
      title: dimension.title,
      weight: SCORE_V2_WEIGHTS[dimension.id] ?? dimension.maxScore / 100,
      status,
      score: normalizedDimensionScore(dimension),
    };
  });
  const questions = (input.customerQuestions ?? []).map((item) => item.question).filter((question): question is string => typeof question === "string");
  return {
    readinessScore: {
      score: mvpReport.score.overall,
      scoreCoverage: mvpReport.score.completionRate / 100,
      checkedWeight: mvpReport.score.completionRate / 100,
      summary: mvpReport.score.explanation,
      dimensions,
      algorithmVersion: "public-information-readiness-score.v1",
    },
    sourceCoverageMatrix,
    verticalPolicy: {
      selectedPack: policy.id,
      resolutionStatus: "RESOLVED",
      requiredSlots: [
        ...policy.dimensions.flatMap((dimension) => dimension.items.map((item) => item.title)),
        "公开投诉与负面舆情集中度",
        "企业公开回应线索",
      ],
      prohibitedClaims: [...policy.prohibitedClaims],
    },
    questionCoverage: (questions.length > 0 ? questions : industryQuestions(policy, input).slice(0, 5)).map((question, index) => {
      const row = mvpReport.customerScenarioRows[index % mvpReport.customerScenarioRows.length]!;
      return {
        question,
        answerStatus: row.answerability,
        missingInformation: row.performance,
        recommendedContent: row.recommendedContent,
      };
    }),
    contentAssetPlans: mvpReport.contentPlans.map((plan) => ({
      title: plan.title,
      linkedQuestion: plan.solvesProblem,
      suggestedContent: [plan.buildContent, `建议载体：${plan.recommendedCarrier}`, `星媄数据可交付：${plan.deliverables.join("、")}`],
      businessValue: `解决${plan.solvesProblem}，降低客户理解和咨询成本。`,
      evidenceBoundary: DISCLAIMER,
    })),
    requestedMaterials: [...policy.requestedMaterials].slice(0, 8),
    evidenceCounts: evidenceCount,
    mvpReport,
    algorithmVersion: "fast-mvp-geo-diagnostic-report.v1",
  };
}

function canonicalScoreDimension(score: number | null, maxScore: number, evidenceIds: string[]) {
  return {
    score: score === null ? null : Math.round((score / maxScore) * 100),
    measurementStatus: score === null ? "INSUFFICIENT_EVIDENCE" as const : "MEASURED" as const,
    confidence: score === null ? 0 : 0.6,
    evidenceIds,
  };
}

function dimensionEvidenceIds(
  dimension: MvpGeoDiagnosticReportV1["score"]["dimensions"][number] | undefined,
): string[] {
  return Array.from(new Set(dimension?.findings.flatMap((finding) => finding.evidenceIds) ?? []));
}

export function buildLimitedCanonicalReport(args: {
  diagnosisId: string;
  publicToken: string;
  input: DiagnosisInput;
  evidence: EvidenceItem[];
  searchCompleted: boolean;
  generatedAt: string;
}): DiagnosisReport {
  const limitedReport = buildUniversalLimitedReport(args.input, args.evidence, args.searchCompleted, args.generatedAt);
  const dimensions = limitedReport.mvpReport!.score.dimensions;
  const byId = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
  const scoreDimensions = {
    companyClarity: canonicalScoreDimension(byId.get("sourceFoundation")?.score ?? null, 25, dimensionEvidenceIds(byId.get("sourceFoundation"))),
    websiteCompleteness: canonicalScoreDimension(byId.get("contentAssets")?.score ?? null, 25, dimensionEvidenceIds(byId.get("contentAssets"))),
    customerQuestionCoverage: canonicalScoreDimension(byId.get("customerScenarios")?.score ?? null, 20, dimensionEvidenceIds(byId.get("customerScenarios"))),
    trustEvidence: canonicalScoreDimension(byId.get("trustInformation")?.score ?? null, 20, dimensionEvidenceIds(byId.get("trustInformation"))),
    aiVisibility: {
      score: null,
      measurementStatus: "INSUFFICIENT_EVIDENCE" as const,
      confidence: 0,
      evidenceIds: [],
    },
  };
  const computedScore = computeScoreBlock(scoreDimensions);
  return {
    reportContractVersion: REPORT_CONTRACT_VERSION,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    reportLanguage: "zh-CN",
    diagnosisId: args.diagnosisId,
    publicToken: args.publicToken,
    generatedAt: args.generatedAt,
    companyProfile: {
      brandName: args.input.brandName ?? "待确认企业",
      website: args.input.website,
      industry: args.input.industry ?? "待确认行业",
      productOrService: args.input.productOrService ?? "待确认服务",
      targetRegion: args.input.targetRegion ?? "待确认地区",
      competitors: [],
      unresolvedQuestions: [],
    },
    scores: {
      ...scoreDimensions,
      overallScore: computedScore.overallScore,
      scoreCoverage: computedScore.scoreCoverage,
    },
    aiVisibilityTests: [],
    strengths: [],
    coreIssues: [],
    competitorGaps: [],
    geoOpportunities: [],
    demonstrationFix: null,
    questionCoverageAssessments: [],
    questionCoverageGaps: [],
    evidence: args.evidence,
    executionMode: "LIMITED_PUBLIC_SCAN",
    publicReportEligible: false,
    publicReportStatus: "LIMITED_READY",
    reportProvenance: "FAST_MVP_GEO_DIAGNOSTIC_REPORT_V1",
    limitedReport,
  };
}
