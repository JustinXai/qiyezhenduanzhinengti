// ============================================================================
// Real DeepSeek stage prompts (Round-5, technical company canary).
//
// The four analysis stages each make ONE structured completion. Prompts are
// evidence-grounded: the model may only cite evidence ids that appear in the
// digest we hand it, must answer in strict JSON (the adapter already sends
// response_format=json_object + thinking=disabled), and NEVER emits numeric
// scores or percentages — rating rubrics and probe answers only, with all
// numeric scoring computed programmatically downstream (PRODUCT_TRUTH_RULES §8).
//
// Truth rules baked into every prompt:
//   - 只能引用证据摘要中的 id;不得编造 id、URL 或事实。
//   - 证据不足时明确说"未发现/无法确认",不得脑补;禁止承诺词与夸大。
//   - 竞品差距仅在竞品证据存在时给出;否则返回空数组。
// ============================================================================

import type { EvidenceItem } from "../../contracts";
import type { DiagnosisInput } from "../../runtime/diagnosis-input";
import { competitorNames } from "../../runtime/diagnosis-input";

export const REAL_ANALYSIS_PROMPT_VERSION = "analysis.real.v1";

/** Per-stage completion budgets (never a blanket 256; sized to expected output). */
export const STAGE_MAX_TOKENS: Record<string, number> = {
  company_profile: 1024,
  dimension_signals: 2048,
  ai_visibility: 3072,
  claims: 4096,
};

export interface StagePrompt {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}

const SYSTEM_PROMPT =
  "你是企业GEO诊断系统的结构化JSON分析接口。规则:" +
  "1) 只输出一个合法JSON对象,不得输出Markdown代码块、解释或多余文本;" +
  "2) 只能引用证据摘要中出现的证据id,禁止编造id、URL、数据或事实;" +
  "3) 证据不足时明确保守表述(如\"本次检查的公开页面中未发现\"),禁止绝对化否定;" +
  "4) 禁止营销承诺词(如:保证、必然、第一、领先地位承诺);" +
  "5) 不输出任何数值评分或百分比,评分由系统程序计算;" +
  "6) 所有文本使用简体中文,表述克制、可核验。";

/** One bounded line per evidence item the model may cite. */
export function buildEvidenceDigest(
  evidence: readonly EvidenceItem[],
  opts: { maxItems?: number; maxSnippetChars?: number } = {},
): string {
  const maxItems = opts.maxItems ?? 30;
  const maxSnippet = opts.maxSnippetChars ?? 220;
  const lines: string[] = [];
  for (const e of evidence.slice(0, maxItems)) {
    const snippet = e.snippet.replace(/\s+/g, " ").trim().slice(0, maxSnippet);
    lines.push(`- id=${e.id} | 类型=${e.sourceType} | 域名=${e.sourceDomain} | 标题=${e.title} | 摘要=${snippet}`);
  }
  if (evidence.length > maxItems) {
    lines.push(`(另有 ${evidence.length - maxItems} 条证据未列出,不可引用)`);
  }
  return lines.join("\n");
}

function inputContext(input: DiagnosisInput): string {
  const competitors = competitorNames(input.competitors);
  return [
    `目标企业网站: ${input.website}`,
    input.brandName ? `品牌名(用户提供): ${input.brandName}` : null,
    input.industry ? `行业(用户提供,仅上下文,不是证据): ${input.industry}` : null,
    input.productOrService ? `产品/服务(用户提供,仅上下文): ${input.productOrService}` : null,
    input.targetRegion ? `目标地区(用户提供,仅上下文): ${input.targetRegion}` : null,
    competitors.length > 0 ? `竞品输入(仅名称,是否成立以证据为准): ${competitors.join("、")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Stage 1: company_profile
// ---------------------------------------------------------------------------

export function buildCompanyProfilePrompt(
  input: DiagnosisInput,
  evidence: readonly EvidenceItem[],
): StagePrompt {
  const userPrompt = [
    "任务: 基于证据摘要提炼企业画像。字段值必须能从证据或用户输入中追溯;不确定的信息放入unresolvedQuestions。",
    "",
    inputContext(input),
    "",
    "证据摘要:",
    buildEvidenceDigest(evidence),
    "",
    "输出JSON对象,字段严格为:",
    `{"brandName":"string","industry":"string","productOrService":"string","targetRegion":"string","competitors":["string"],"unresolvedQuestions":["string"]}`,
    "unresolvedQuestions列出2-4条公开信息无法回答、需要企业确认的问题。",
  ].join("\n");
  return { systemPrompt: SYSTEM_PROMPT, userPrompt, maxTokens: STAGE_MAX_TOKENS.company_profile! };
}

// ---------------------------------------------------------------------------
// Stage 2: dimension_signals — rate the FIXED rubric only.
// ---------------------------------------------------------------------------

const RUBRIC = `{
 "companyClarity": {"criteria":[{"key":"brandIdentityClear","rating":"?"},{"key":"offeringClear","rating":"?"},{"key":"targetCustomerClear","rating":"?"},{"key":"valuePropositionClear","rating":"?"}],"evidenceIds":["..."]},
 "websiteCompleteness": {"criteria":[{"key":"productInfo","rating":"?"},{"key":"companyBackground","rating":"?"},{"key":"contactChannel","rating":"?"},{"key":"processOrPricing","rating":"?"},{"key":"caseOrProof","rating":"?"}],"evidenceIds":["..."]},
 "customerQuestionCoverage": {"criteria":[{"key":"purchaseDecisionQuestions","rating":"?"},{"key":"comparisonQuestions","rating":"?"},{"key":"deliveryAndAfterSales","rating":"?"},{"key":"structuredFaq","rating":"?"}],"evidenceIds":["..."]},
 "trustEvidence": {"criteria":[{"key":"thirdPartyCredentials","rating":"?"},{"key":"verifiableCases","rating":"?"},{"key":"mediaOrPublicMentions","rating":"?"},{"key":"customerTestimonials","rating":"?"}],"evidenceIds":["..."]}
}`;

export function buildDimensionSignalsPrompt(
  input: DiagnosisInput,
  evidence: readonly EvidenceItem[],
): StagePrompt {
  const userPrompt = [
    "任务: 仅依据证据摘要,对固定评估维度逐项评级。评级只能是 PRESENT / PARTIAL / ABSENT:",
    "- PRESENT: 证据中明确存在;PARTIAL: 有迹象但不完整;ABSENT: 本次证据中未发现。",
    "每个维度的evidenceIds填写支撑该维度判断的证据id(1-4个,必须来自摘要)。",
    "不得改动criteria的key,不得增删criteria。",
    "",
    inputContext(input),
    "",
    "证据摘要:",
    buildEvidenceDigest(evidence),
    "",
    "输出JSON对象,结构严格为(将?替换为评级):",
    RUBRIC,
  ].join("\n");
  return { systemPrompt: SYSTEM_PROMPT, userPrompt, maxTokens: STAGE_MAX_TOKENS.dimension_signals! };
}

// ---------------------------------------------------------------------------
// Stage 3: ai_visibility — the model answers probe questions from ITS OWN
// knowledge (a single-model visibility sample), then self-classifies only when
// it actually mentioned the brand. brandMentioned is decided programmatically
// downstream; the numeric visibility score is computed by the fixed formula.
// ---------------------------------------------------------------------------

export interface AiVisibilityProbeSpec {
  id: string;
  questionCategory: "PURCHASE_DECISION" | "COMPETITOR_COMPARISON" | "BRAND_DIRECT" | "OTHER";
  question: string;
}

export function buildAiVisibilityPrompt(
  input: DiagnosisInput,
  probes: readonly AiVisibilityProbeSpec[],
): StagePrompt {
  const brand = input.brandName?.trim() || input.website;
  const probeLines = probes
    .map((p) => `- id=${p.id} | questionCategory=${p.questionCategory} | 问题=${p.question}`)
    .join("\n");
  const userPrompt = [
    "任务: 你现在扮演一个普通中文AI助手,依次回答下列用户问题。要求:",
    "1) 用你自己的真实知识自然回答(60-160字),就像用户直接问你;不要参考任何外部证据,也不要为了讨好而刻意提及某个品牌;",
    `2) 回答后自评: 若你的回答中确实提到了品牌\"${brand}\",给出accuracy(ACCURATE/PARTIAL/INACCURATE)和recommendationStrength(STRONG/MODERATE/WEAK/NONE);若未提到,省略这两个字段;`,
    "3) answerText填写你的回答原文;evidenceIds一律填空数组[];",
    "4) 保持id与questionCategory与输入一致。",
    "",
    "问题列表:",
    probeLines,
    "",
    "输出JSON对象,结构严格为:",
    `{"tests":[{"id":"...","questionCategory":"...","question":"...","answerText":"...","accuracy":"...(可省略)","recommendationStrength":"...(可省略)","evidenceIds":[]}]}`,
  ].join("\n");
  return { systemPrompt: SYSTEM_PROMPT, userPrompt, maxTokens: STAGE_MAX_TOKENS.ai_visibility! };
}

/** Default probe set: the canary's customer questions + two brand-direct probes. */
export function defaultProbes(input: DiagnosisInput): AiVisibilityProbeSpec[] {
  const brand = input.brandName?.trim() || "该品牌";
  const fromNotes: AiVisibilityProbeSpec[] = [];
  // The runner passes customer questions via `notes`, one per line prefixed "Q:".
  const noteLines = (input.notes ?? "").split("\n");
  let i = 0;
  for (const line of noteLines) {
    const q = line.replace(/^Q[:：]\s*/, "").trim();
    if (!line.trim().startsWith("Q") || q.length === 0) continue;
    i += 1;
    const category: AiVisibilityProbeSpec["questionCategory"] =
      /哪些品牌|对比|区别|竞品|vs/i.test(q) ? "COMPETITOR_COMPARISON" : "PURCHASE_DECISION";
    fromNotes.push({ id: `aiv_q${i}`, questionCategory: category, question: q });
  }
  const brandDirect: AiVisibilityProbeSpec[] = [
    { id: "aiv_brand_1", questionCategory: "BRAND_DIRECT", question: `${brand}主要提供什么产品和服务?` },
    { id: "aiv_brand_2", questionCategory: "BRAND_DIRECT", question: `${brand}和同类品牌相比有什么特点?` },
  ];
  return [...fromNotes.slice(0, 5), ...brandDirect];
}

// ---------------------------------------------------------------------------
// Stage 4: claims
// ---------------------------------------------------------------------------

export function buildClaimsPrompt(
  input: DiagnosisInput,
  evidence: readonly EvidenceItem[],
  confirmedCompetitorDomains: readonly string[],
): StagePrompt {
  const competitorRule =
    confirmedCompetitorDomains.length > 0
      ? `已确认竞品官方域名: ${confirmedCompetitorDomains.join("、")}。competitorGaps最多2条,每条必须引用竞品域名下的证据id,且用词保守(\"竞品官网公开展示了X,本企业官网本次检查未发现同类信息\")。`
      : "本次没有已确认的竞品官方域名证据,competitorGaps必须为空数组[]。";
  const userPrompt = [
    "任务: 基于证据摘要生成诊断主张。硬性规则:",
    "1) 每条主张的evidenceIds必须引用能实际支撑该表述的证据id(来自摘要);无充分证据的主张不要输出;",
    "2) claimType: 证据直接支撑的推断用DIAGNOSTIC_INFERENCE;合理但证据不足的假设用UNVERIFIED_HYPOTHESIS(最多1条);",
    "3) 负面表述必须限定范围(\"本次检查的公开页面中未发现X\"),禁止绝对化(\"完全没有/不存在\");",
    "4) strengths最多2条;coreIssues最多3条;geoOpportunities最多3条;不足不硬凑;",
    `5) ${competitorRule}`,
    "6) demonstrationFix: 仅当某个coreIssue可以用一个内容资产示范修复时给出(fixType: ENTITY_DESCRIPTION/FAQ_EXAMPLE/BEFORE_AFTER_STRUCTURE),否则为null;before/after描述结构而非虚构事实;customerConfirmationNeeded写明需要企业确认的真实口径。",
    "",
    inputContext(input),
    "",
    "证据摘要:",
    buildEvidenceDigest(evidence),
    "",
    "输出JSON对象,结构严格为:",
    `{"strengths":[{"statement":"...","businessImpact":"...","claimType":"...","evidenceIds":["..."]}],` +
      `"coreIssues":[{"statement":"...","businessImpact":"...","claimType":"...","fixDirection":"...","evidenceIds":["..."]}],` +
      `"geoOpportunities":[{"statement":"...","businessImpact":"...","claimType":"...","customerQuestion":"...","contentGap":"...","evidenceIds":["..."]}],` +
      `"competitorGaps":[{"competitorName":"...","gapStatement":"...","evidenceIds":["..."]}],` +
      `"demonstrationFix":{...}或null}`,
  ].join("\n");
  return { systemPrompt: SYSTEM_PROMPT, userPrompt, maxTokens: STAGE_MAX_TOKENS.claims! };
}
