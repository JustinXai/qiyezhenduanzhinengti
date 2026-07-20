import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { z } from "zod";
import { DiagnosisReport, EvidenceItem, type DiagnosisReport as DiagnosisReportType } from "../src/contracts";
import { ClaimEvidenceRelation, deriveCoverage } from "../src/contracts/claim-evidence";
import { buildClaims } from "../src/diagnosis/analysis/claims";
import {
  OPPORTUNITY_BANNED_PHRASES,
  APPROVED_NEGATIVE_OPPORTUNITY_PREFIX,
} from "../src/diagnosis/analysis/opportunity-copy-policy";
import {
  buildClaimsPrompt,
  REPORT_CLAIMS_ZH_PROMPT_VERSION,
} from "../src/diagnosis/analysis/stage-prompts";
import { ClaimsStageOutput } from "../src/diagnosis/analysis/stage-schemas";
import { extractVerifiableClaims } from "../src/diagnosis/verification";
import { createDeepSeekProvider } from "../src/providers/deepseek";
import {
  DEFAULT_CLAIM_PUBLICATION_POLICY_VERSION,
  evaluateClaimPublication,
  negativeScopeTextFromReport,
  publicationSourceContextFromReport,
} from "../src/report/validation/claim-publication-policy";
import { COMPETITOR_GAP_PUBLICATION_POLICY_VERSION } from "../src/report/validation/competitor-gap-publication-policy";
import { DiagnosisInputSchema, type DiagnosisInput } from "../src/runtime/diagnosis-input";

export const CLAIMS_MODEL_POLICY_ENV = "CLAIMS_MODEL_POLICY";
export const CLAIMS_SHADOW_AUTH_ENV = "CLAIMS_SHADOW_AB_AUTHORIZED";
export const CLAIMS_MODEL_POLICY_DEFAULT = "FLASH" as const;
export const CLAIMS_SHADOW_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
export const CLAIMS_SHADOW_TEMPERATURE = 0;
export const CLAIMS_SHADOW_MAX_TOKENS = 4096;
export const CLAIMS_SHADOW_SCHEMA_VERSION = "ClaimsStageOutput.v2.1";
export const CLAIMS_SHADOW_GUARD_VERSION =
  `${DEFAULT_CLAIM_PUBLICATION_POLICY_VERSION}+${COMPETITOR_GAP_PUBLICATION_POLICY_VERSION}`;

const ModelPolicy = z.enum(["FLASH", "PRO", "SHADOW"]);
export type ClaimsModelPolicy = z.infer<typeof ModelPolicy>;
export type ShadowCompanySlug = "qiaqia" | "iflytek" | "heli";
export type ShadowModel = (typeof CLAIMS_SHADOW_MODELS)[number];

const COMPANY_ORDER: readonly ShadowCompanySlug[] = ["qiaqia", "iflytek", "heli"];
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface FrozenClaimsInput {
  company: ShadowCompanySlug;
  databasePath: string;
  diagnosisId: string;
  diagnosisInput: DiagnosisInput;
  evidence: EvidenceItem[];
  canonical: DiagnosisReportType;
  relations: ClaimEvidenceRelation[];
  bochaCallCount: number;
  frozenHashes: {
    databaseFile: string;
    diagnosisInput: string;
    evidenceSnapshot: string;
    profileOutput: string;
    scoreInput: string;
    aiVisibilityInput: string;
    canonical: string;
  };
}

export interface ShadowPlanItem {
  sequence: number;
  company: ShadowCompanySlug;
  model: ShadowModel;
  promptVersion: typeof REPORT_CLAIMS_ZH_PROMPT_VERSION;
  schemaVersion: typeof CLAIMS_SHADOW_SCHEMA_VERSION;
  guardVersion: string;
  maxTokens: typeof CLAIMS_SHADOW_MAX_TOKENS;
  temperature: typeof CLAIMS_SHADOW_TEMPERATURE;
  thinking: "disabled";
  retries: 0;
}

export interface ShadowMetrics {
  model: ShadowModel;
  schemaPass: boolean;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  candidateStrengthCount: number;
  candidateIssueCount: number;
  candidateOpportunityCount: number;
  candidateDemoFixCount: number;
  invalidEvidenceReferenceCount: number;
  invalidSourceIssueReferenceCount: number;
  missingCoveragePrefixCount: number;
  bannedCopyCount: number;
  genericCandidateCount: number;
  competitorAssertionViolationCount: number;
  candidatesPassingSameTruthPolicy: number;
  publishableIssueCount: number;
  publishableOpportunityCount: number;
  publishableDemoFixCount: number;
  /** Relations are reused only for byte-stable semantic candidates, never by positional id alone. */
  semanticRelationReuseCount: number;
  truthPolicyUnverifiedCandidateCount: number;
}

export interface ShadowRunRecord {
  sequence: number;
  company: ShadowCompanySlug;
  model: ShadowModel;
  promptVersion: string;
  schemaVersion: string;
  guardVersion: string;
  promptSha256: string;
  evidenceOrderSha256: string;
  rawResponseSha256: string | null;
  parsedOutputHash: string | null;
  providerErrorCode: string | null;
  metrics: ShadowMetrics;
}

interface CompletionCapture {
  rawContent: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface Args {
  dbs: Record<ShadowCompanySlug, string>;
  output: string;
  planOnly: boolean;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function claimsModelPolicy(
  env: Record<string, string | undefined> = process.env,
): ClaimsModelPolicy {
  return ModelPolicy.parse(env[CLAIMS_MODEL_POLICY_ENV] || CLAIMS_MODEL_POLICY_DEFAULT);
}

export function buildShadowPlan(): ShadowPlanItem[] {
  let sequence = 0;
  return COMPANY_ORDER.flatMap((company) =>
    CLAIMS_SHADOW_MODELS.map((model) => ({
      sequence: ++sequence,
      company,
      model,
      promptVersion: REPORT_CLAIMS_ZH_PROMPT_VERSION,
      schemaVersion: CLAIMS_SHADOW_SCHEMA_VERSION,
      guardVersion: CLAIMS_SHADOW_GUARD_VERSION,
      maxTokens: CLAIMS_SHADOW_MAX_TOKENS,
      temperature: CLAIMS_SHADOW_TEMPERATURE,
      thinking: "disabled" as const,
      retries: 0 as const,
    })),
  );
}

export function assertShadowBudget(plan: readonly ShadowPlanItem[]): void {
  const expected = [
    "qiaqia:deepseek-v4-flash",
    "qiaqia:deepseek-v4-pro",
    "iflytek:deepseek-v4-flash",
    "iflytek:deepseek-v4-pro",
    "heli:deepseek-v4-flash",
    "heli:deepseek-v4-pro",
  ];
  const actual = plan.map((item) => `${item.company}:${item.model}`);
  if (stableJson(actual) !== stableJson(expected)) throw new Error("SHADOW_PLAN_ORDER_MISMATCH");
  if (plan.length !== 6) throw new Error("SHADOW_TOTAL_CALL_BUDGET_MISMATCH");
  for (const model of CLAIMS_SHADOW_MODELS) {
    if (plan.filter((item) => item.model === model).length !== 3) {
      throw new Error(`SHADOW_MODEL_CALL_BUDGET_MISMATCH:${model}`);
    }
  }
  const comparable = plan.map((item) => stableJson({
    promptVersion: item.promptVersion,
    schemaVersion: item.schemaVersion,
    guardVersion: item.guardVersion,
    maxTokens: item.maxTokens,
    temperature: item.temperature,
    thinking: item.thinking,
    retries: item.retries,
  }));
  if (new Set(comparable).size !== 1) throw new Error("SHADOW_PARAMETER_PARITY_MISMATCH");
  if (plan.some((item) => item.retries !== 0)) throw new Error("SHADOW_RETRY_BUDGET_MISMATCH");
}

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

function one<T>(db: Database.Database, sql: string, ...params: unknown[]): T {
  const row = db.prepare(sql).get(...params) as T | undefined;
  if (!row) throw new Error("FROZEN_INPUT_ROW_MISSING");
  return row;
}

function latestStageOutput(db: Database.Database, diagnosisId: string, stage: string): unknown | undefined {
  const run = tableExists(db, "analysis_stage_runs")
    ? (db.prepare(
        "SELECT output_json FROM analysis_stage_runs WHERE diagnosis_id = ? AND stage = ? AND status = 'SUCCEEDED' AND output_json IS NOT NULL ORDER BY attempt DESC, completed_at DESC, rowid DESC LIMIT 1",
      ).get(diagnosisId, stage) as { output_json: string } | undefined)
    : undefined;
  if (run) return JSON.parse(run.output_json) as unknown;
  const checkpoint = db.prepare(
    "SELECT output_json FROM analysis_checkpoints WHERE diagnosis_id = ? AND stage IN (?, ?) ORDER BY completed_at DESC, rowid DESC LIMIT 1",
  ).get(diagnosisId, stage, stage.replace("REPORT_", "")) as
    | { output_json: string }
    | undefined;
  return checkpoint ? JSON.parse(checkpoint.output_json) as unknown : undefined;
}

function evidenceFromDb(db: Database.Database, diagnosisId: string): EvidenceItem[] {
  const rows = db.prepare(
    "SELECT id, source_type, source_domain, url, title, snippet, authority_level, support_level, fetched_at FROM evidence WHERE diagnosis_id = ? ORDER BY id",
  ).all(diagnosisId) as Array<Record<string, unknown>>;
  return rows.map((row) => EvidenceItem.parse({
    id: row.id,
    sourceType: row.source_type,
    sourceDomain: row.source_domain,
    url: row.url,
    title: row.title ?? "",
    snippet: row.snippet ?? "",
    authorityLevel: row.authority_level ?? "",
    supportLevel: row.support_level,
    fetchedAt: new Date(Number(row.fetched_at) * 1000).toISOString(),
  }));
}

function relationsFromDb(db: Database.Database, diagnosisId: string): ClaimEvidenceRelation[] {
  if (!tableExists(db, "claim_evidence_relations")) return [];
  const rows = db.prepare(
    "SELECT claim_id, claim_kind, evidence_id, support_level, confidence, justification, basis, verifier_mode, verifier_version FROM claim_evidence_relations WHERE diagnosis_id = ? ORDER BY claim_id, evidence_id",
  ).all(diagnosisId) as Array<Record<string, unknown>>;
  return rows.map((row) => ClaimEvidenceRelation.parse({
    claimId: row.claim_id,
    claimKind: row.claim_kind,
    evidenceId: row.evidence_id,
    supportLevel: row.support_level,
    confidence: row.confidence,
    justification: row.justification ?? "",
    basis: row.basis,
    verifierMode: row.verifier_mode,
    verifierVersion: row.verifier_version,
  }));
}

export function loadFrozenClaimsInput(
  company: ShadowCompanySlug,
  databasePath: string,
): FrozenClaimsInput {
  const resolvedDb = resolve(databasePath);
  const databaseFileHash = sha256(readFileSync(resolvedDb));
  const db = new Database(resolvedDb, { readonly: true, fileMustExist: true });
  try {
    const diagnoses = db.prepare("SELECT id, input_json FROM diagnosis_requests ORDER BY rowid").all() as
      Array<{ id: string; input_json: string }>;
    if (diagnoses.length !== 1) throw new Error(`SHADOW_REQUIRES_ONE_DIAGNOSIS:${company}`);
    const diagnosis = diagnoses[0]!;
    const diagnosisInput = DiagnosisInputSchema.parse(JSON.parse(diagnosis.input_json));
    const reportRow = tableExists(db, "report_revisions")
      ? (db.prepare(
          "SELECT canonical_json FROM report_revisions WHERE diagnosis_id = ? ORDER BY revision_number DESC LIMIT 1",
        ).get(diagnosis.id) as { canonical_json: string } | undefined) ?? one<{ canonical_json: string }>(
          db,
          "SELECT canonical_json FROM reports WHERE diagnosis_id = ? ORDER BY rowid DESC LIMIT 1",
          diagnosis.id,
        )
      : one<{ canonical_json: string }>(
          db,
          "SELECT canonical_json FROM reports WHERE diagnosis_id = ? ORDER BY rowid DESC LIMIT 1",
          diagnosis.id,
        );
    const canonical = DiagnosisReport.parse(JSON.parse(reportRow.canonical_json));
    const registryEvidence = evidenceFromDb(db, diagnosis.id);
    const canonicalById = new Map(canonical.evidence.map((item) => [item.id, item]));
    const evidence = registryEvidence.map((item) => canonicalById.get(item.id)).filter(
      (item): item is EvidenceItem => item !== undefined,
    );
    const evidenceIdentity = (item: EvidenceItem) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceDomain: item.sourceDomain,
      url: item.url,
      title: item.title,
      snippet: item.snippet,
      authorityLevel: item.authorityLevel,
      supportLevel: item.supportLevel,
      fetchedAtEpochSeconds: Math.floor(Date.parse(item.fetchedAt) / 1000),
    });
    if (
      evidence.length !== registryEvidence.length ||
      stableJson(evidence.map(evidenceIdentity)) !== stableJson(registryEvidence.map(evidenceIdentity))
    ) {
      throw new Error(`FROZEN_EVIDENCE_CANONICAL_MISMATCH:${company}`);
    }
    // Legacy qiaqia predates individual stage-run persistence. Its latest
    // append-only Canonical is the only frozen source for these non-Claims
    // inputs; they are hashed for parity and never regenerated.
    const profileOutput = latestStageOutput(db, diagnosis.id, "REPORT_PROFILE") ?? canonical.companyProfile;
    const scoreInput = latestStageOutput(db, diagnosis.id, "REPORT_SCORING") ?? canonical.scores;
    const aiVisibilityInput =
      latestStageOutput(db, diagnosis.id, "REPORT_AI_VISIBILITY") ?? canonical.aiVisibilityTests;
    const bocha = tableExists(db, "provider_usage")
      ? (db.prepare(
          "SELECT COALESCE(SUM(call_count), 0) calls FROM provider_usage WHERE diagnosis_id = ? AND provider = 'bocha'",
        ).get(diagnosis.id) as { calls: number })
      : { calls: 0 };
    return {
      company,
      databasePath: resolvedDb,
      diagnosisId: diagnosis.id,
      diagnosisInput,
      evidence,
      canonical,
      relations: relationsFromDb(db, diagnosis.id),
      bochaCallCount: bocha.calls,
      frozenHashes: {
        databaseFile: databaseFileHash,
        diagnosisInput: sha256(stableJson(diagnosisInput)),
        evidenceSnapshot: sha256(stableJson(evidence)),
        profileOutput: sha256(stableJson(profileOutput)),
        scoreInput: sha256(stableJson(scoreInput)),
        aiVisibilityInput: sha256(stableJson(aiVisibilityInput)),
        canonical: sha256(stableJson(canonical)),
      },
    };
  } finally {
    db.close();
  }
}

function allEvidenceIds(payload: z.infer<typeof ClaimsStageOutput>): string[] {
  return [
    ...payload.strengths.flatMap((item) => item.evidenceIds),
    ...payload.coreIssues.flatMap((item) => item.evidenceIds),
    ...payload.geoOpportunities.flatMap((item) => item.evidenceIds),
    ...payload.competitorGaps.flatMap((item) => item.evidenceIds),
    ...(payload.demonstrationFix?.evidenceIds ?? []),
  ];
}

function candidateTextParts(payload: z.infer<typeof ClaimsStageOutput>): string[] {
  return [
    ...payload.strengths.flatMap((item) => [item.statement, item.businessImpact]),
    ...payload.coreIssues.flatMap((item) => [item.statement, item.businessImpact, item.fixDirection]),
    ...payload.geoOpportunities.flatMap((item) => [
      item.statement,
      item.businessImpact,
      item.customerQuestion,
      item.contentGap,
      item.recommendedAction ?? "",
      item.priorityReason ?? "",
    ]),
    ...payload.competitorGaps.flatMap((item) => [item.gapStatement]),
  ];
}

function zeroMetrics(model: ShadowModel, latencyMs: number, capture: CompletionCapture): ShadowMetrics {
  return {
    model,
    schemaPass: false,
    latencyMs,
    inputTokens: capture.inputTokens,
    outputTokens: capture.outputTokens,
    candidateStrengthCount: 0,
    candidateIssueCount: 0,
    candidateOpportunityCount: 0,
    candidateDemoFixCount: 0,
    invalidEvidenceReferenceCount: 0,
    invalidSourceIssueReferenceCount: 0,
    missingCoveragePrefixCount: 0,
    bannedCopyCount: 0,
    genericCandidateCount: 0,
    competitorAssertionViolationCount: 0,
    candidatesPassingSameTruthPolicy: 0,
    publishableIssueCount: 0,
    publishableOpportunityCount: 0,
    publishableDemoFixCount: 0,
    semanticRelationReuseCount: 0,
    truthPolicyUnverifiedCandidateCount: 0,
  };
}

export function evaluateShadowOutput(
  frozen: FrozenClaimsInput,
  model: ShadowModel,
  json: unknown,
  latencyMs: number,
  capture: CompletionCapture,
): ShadowMetrics {
  const schema = ClaimsStageOutput.safeParse(json);
  if (!schema.success) return zeroMetrics(model, latencyMs, capture);
  const payload = schema.data;
  const evidenceById = new Map(frozen.evidence.map((item) => [item.id, item]));
  const validIssueIds = new Set(payload.coreIssues.map((_item, index) => `iss_${index + 1}`));
  const invalidEvidenceReferenceCount = allEvidenceIds(payload).filter((id) => !evidenceById.has(id)).length;
  const invalidSourceIssueReferenceCount = [
    ...payload.geoOpportunities.map((item) => item.sourceIssueId),
    payload.demonstrationFix?.sourceIssueId,
  ].filter((id): id is string => typeof id === "string" && !validIssueIds.has(id)).length;
  const missingCoveragePrefixCount = payload.geoOpportunities.filter(
    (item) => /缺少|缺乏|缺失|未提供|未覆盖|未明确|未说明|未展示|未发现|不足/u.test(item.contentGap) &&
      !item.contentGap.trim().startsWith(APPROVED_NEGATIVE_OPPORTUNITY_PREFIX),
  ).length;
  const text = candidateTextParts(payload).join("\n");
  const bannedCopyCount = OPPORTUNITY_BANNED_PHRASES.filter((phrase) => text.includes(phrase)).length;
  const genericCandidateCount = payload.geoOpportunities.filter(
    (item) =>
      !item.customerQuestion.trim() ||
      !item.recommendedAction ||
      item.recommendedAction.trim().length < 8 ||
      /^(?:多发|增加|优化|完善)内容[。.!！]?$/u.test(item.recommendedAction.trim()),
  ).length;
  const competitorAssertionViolationCount = payload.competitorGaps.filter(
    (gap) => !gap.evidenceIds.some((id) => evidenceById.get(id)?.sourceType === "COMPETITOR_WEB_EVIDENCE"),
  ).length + payload.geoOpportunities.filter(
    (item) => /竞品.{0,12}(?:领先|优势|积累|覆盖|完善|成熟|更多)/u.test(
      [item.statement, item.businessImpact, item.contentGap].join(" "),
    ) && !item.evidenceIds.some((id) => evidenceById.get(id)?.sourceType === "COMPETITOR_WEB_EVIDENCE"),
  ).length;
  const firstPartyDomains = [...new Set(
    frozen.evidence
      .filter((item) => item.sourceType === "FIRST_PARTY_EVIDENCE")
      .map((item) => item.normalizedDomain ?? item.sourceDomain),
  )];
  const coverage = deriveCoverage({
    evidence: frozen.evidence,
    firstPartyDomains,
    executedQueries: frozen.bochaCallCount > 0 ? ["PERSISTED_EXECUTED_QUERY_PRESENT"] : [],
    queryPlanId: `${frozen.diagnosisId}:shadow-read-only`,
    coverageLimitations: ["Shadow仅依据冻结Evidence与持久化调用记录重建测量边界。"],
  });
  const built = buildClaims(frozen.evidence, payload, coverage);
  if (!built.ok) return zeroMetrics(model, latencyMs, capture);
  const candidateReport = DiagnosisReport.parse({
    ...frozen.canonical,
    strengths: built.value.strengths,
    coreIssues: built.value.coreIssues,
    geoOpportunities: built.value.geoOpportunities,
    competitorGaps: built.value.competitorGaps,
    demonstrationFix: built.value.demonstrationFix,
  });
  const frozenClaims = new Map<string, unknown>([
    ...frozen.canonical.strengths.map((item) => [item.id, item] as const),
    ...frozen.canonical.coreIssues.map((item) => [item.id, item] as const),
    ...frozen.canonical.geoOpportunities.map((item) => [item.id, item] as const),
    ...frozen.canonical.competitorGaps.map((item) => [item.id, item] as const),
    ...(frozen.canonical.demonstrationFix
      ? [[frozen.canonical.demonstrationFix.id, frozen.canonical.demonstrationFix] as const]
      : []),
  ]);
  const shadowClaims = new Map<string, unknown>([
    ...candidateReport.strengths.map((item) => [item.id, item] as const),
    ...candidateReport.coreIssues.map((item) => [item.id, item] as const),
    ...candidateReport.geoOpportunities.map((item) => [item.id, item] as const),
    ...candidateReport.competitorGaps.map((item) => [item.id, item] as const),
    ...(candidateReport.demonstrationFix
      ? [[candidateReport.demonstrationFix.id, candidateReport.demonstrationFix] as const]
      : []),
  ]);
  const semanticMatches = new Set(
    [...shadowClaims].filter(([id, candidate]) => stableJson(candidate) === stableJson(frozenClaims.get(id))),
  );
  const semanticMatchIds = new Set([...semanticMatches].map(([id]) => id));
  const sourceContext = publicationSourceContextFromReport(candidateReport, coverage);
  const publishedClaims = extractVerifiableClaims(candidateReport)
    .filter((claim): claim is typeof claim & {
      kind: "coreIssue" | "strength" | "geoOpportunity";
    } => claim.kind !== "competitorGap")
    .filter((claim) => {
      const relations = semanticMatchIds.has(claim.id)
        ? frozen.relations.filter((relation) => relation.claimId === claim.id)
        : [];
      return evaluateClaimPublication({
        claim: {
          id: claim.id,
          kind: claim.kind,
          text: claim.text,
          negativeScopeText: negativeScopeTextFromReport(candidateReport, claim.kind, claim.id),
          evidenceIds: claim.candidateEvidenceIds,
        },
        relations,
        evidence: candidateReport.evidence,
        coverage,
        sourceContext,
      }).outcome === "PUBLISH";
    });
  const publishedIds = new Set(publishedClaims.map((claim) => claim.id));
  const publishableIssueCount = publishedClaims.filter((claim) => claim.kind === "coreIssue").length;
  const publishableOpportunityCount = publishedClaims.filter(
    (claim) =>
      claim.kind === "geoOpportunity" &&
      candidateReport.geoOpportunities.some(
        (item) => item.id === claim.id && item.sourceIssueId !== undefined && publishedIds.has(item.sourceIssueId),
      ),
  ).length;
  const demo = candidateReport.demonstrationFix;
  const demoIssue = demo
    ? candidateReport.coreIssues.find((issue) => issue.statement === demo.currentIssue)
    : undefined;
  const publishableDemoFixCount =
    demo && semanticMatchIds.has(demo.id) && demoIssue && publishedIds.has(demoIssue.id) ? 1 : 0;
  const publishedStrengthCount = publishedClaims.filter((claim) => claim.kind === "strength").length;
  const sourceCandidateCount =
    payload.strengths.length + payload.coreIssues.length + payload.geoOpportunities.length +
    payload.competitorGaps.length + (payload.demonstrationFix ? 1 : 0);
  return {
    model,
    schemaPass: true,
    latencyMs,
    inputTokens: capture.inputTokens,
    outputTokens: capture.outputTokens,
    candidateStrengthCount: payload.strengths.length,
    candidateIssueCount: payload.coreIssues.length,
    candidateOpportunityCount: payload.geoOpportunities.length,
    candidateDemoFixCount: payload.demonstrationFix ? 1 : 0,
    invalidEvidenceReferenceCount,
    invalidSourceIssueReferenceCount,
    missingCoveragePrefixCount,
    bannedCopyCount,
    genericCandidateCount,
    competitorAssertionViolationCount,
    candidatesPassingSameTruthPolicy:
      publishedStrengthCount + publishableIssueCount + publishableOpportunityCount + publishableDemoFixCount,
    publishableIssueCount,
    publishableOpportunityCount,
    publishableDemoFixCount,
    semanticRelationReuseCount: semanticMatchIds.size,
    truthPolicyUnverifiedCandidateCount: sourceCandidateCount - semanticMatchIds.size,
  };
}

function capturingFetch(capture: CompletionCapture): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    try {
      const envelope = JSON.parse(await response.clone().text()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      };
      const raw = envelope.choices?.[0]?.message?.content;
      capture.rawContent = typeof raw === "string" ? raw : null;
      capture.inputTokens = Number.isFinite(envelope.usage?.prompt_tokens)
        ? Number(envelope.usage?.prompt_tokens)
        : null;
      capture.outputTokens = Number.isFinite(envelope.usage?.completion_tokens)
        ? Number(envelope.usage?.completion_tokens)
        : null;
    } catch {
      // The adapter owns response classification; the observer never repairs or substitutes content.
    }
    return response;
  }) as typeof fetch;
}

async function executeOne(
  item: ShadowPlanItem,
  frozen: FrozenClaimsInput,
  env: NodeJS.ProcessEnv,
): Promise<ShadowRunRecord> {
  const competitorDomains = [...new Set(
    frozen.evidence
      .filter((evidence) => evidence.sourceType === "COMPETITOR_WEB_EVIDENCE")
      .map((evidence) => evidence.sourceDomain),
  )];
  const prompt = buildClaimsPrompt(frozen.diagnosisInput, frozen.evidence, competitorDomains);
  if (prompt.version !== item.promptVersion || prompt.maxTokens !== item.maxTokens) {
    throw new Error("SHADOW_CURRENT_PROMPT_CONTRACT_MISMATCH");
  }
  const capture: CompletionCapture = { rawContent: null, inputTokens: null, outputTokens: null };
  const provider = createDeepSeekProvider(
    {
      apiKey: env.DEEPSEEK_API_KEY ?? "",
      baseUrl: env.DEEPSEEK_BASE_URL,
      model: item.model,
      temperature: item.temperature,
      timeoutMs: 120_000,
    },
    { fetch: capturingFetch(capture) },
  );
  const started = Date.now();
  const result = await provider.completeJson({
    stage: "claims-shadow",
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    maxTokens: item.maxTokens,
  });
  const latencyMs = Date.now() - started;
  const metrics = result.ok
    ? evaluateShadowOutput(frozen, item.model, result.json, latencyMs, capture)
    : zeroMetrics(item.model, latencyMs, capture);
  return {
    sequence: item.sequence,
    company: item.company,
    model: item.model,
    promptVersion: item.promptVersion,
    schemaVersion: item.schemaVersion,
    guardVersion: item.guardVersion,
    promptSha256: sha256(stableJson({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxTokens: prompt.maxTokens,
      temperature: item.temperature,
      thinking: item.thinking,
    })),
    evidenceOrderSha256: sha256(stableJson(frozen.evidence.map((evidence) => evidence.id))),
    rawResponseSha256: capture.rawContent === null ? null : sha256(capture.rawContent),
    parsedOutputHash: result.ok ? sha256(stableJson(result.json)) : null,
    providerErrorCode: result.ok ? null : result.error.code,
    metrics,
  };
}

function assertAuthorization(env: NodeJS.ProcessEnv): void {
  if (claimsModelPolicy(env) !== "SHADOW") throw new Error("CLAIMS_MODEL_POLICY_SHADOW_REQUIRED");
  if (env[CLAIMS_SHADOW_AUTH_ENV] !== "true") throw new Error("CLAIMS_SHADOW_AB_NOT_AUTHORIZED");
  if (env.PROVIDER_MODE !== "REAL") throw new Error("PROVIDER_MODE_MUST_BE_REAL");
  if (env.DIAGNOSIS_SMOKE_MODE !== "false") throw new Error("DIAGNOSIS_SMOKE_MODE_MUST_BE_FALSE");
  if (!env.DEEPSEEK_API_KEY) throw new Error("MISSING_DEEPSEEK_API_KEY");
  if (!env.DEEPSEEK_BASE_URL) throw new Error("MISSING_DEEPSEEK_BASE_URL");
}

function parseArgs(argv: readonly string[]): Args {
  const raw = Object.fromEntries(argv.map((arg) => {
    const match = /^--([^=]+)=(.+)$/u.exec(arg);
    if (!match) throw new Error(`INVALID_ARGUMENT:${arg}`);
    return [match[1]!, match[2]!];
  }));
  return {
    dbs: {
      qiaqia: resolve(z.string().min(1).parse(raw["qiaqia-db"])),
      iflytek: resolve(z.string().min(1).parse(raw["iflytek-db"])),
      heli: resolve(z.string().min(1).parse(raw["heli-db"])),
    },
    output: resolve(z.string().min(1).parse(raw.output)),
    planOnly: raw["plan-only"] === "true",
  };
}

function assertPrivateOutput(output: string): void {
  const rel = relative(REPOSITORY_ROOT, output);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error("SHADOW_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY");
  }
  if (existsSync(output)) throw new Error("SHADOW_OUTPUT_ALREADY_EXISTS");
}

export async function runShadowAb(args: Args, env: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  assertAuthorization(env);
  const plan = buildShadowPlan();
  assertShadowBudget(plan);
  assertPrivateOutput(args.output);
  const frozen = Object.fromEntries(COMPANY_ORDER.map((company) => [
    company,
    loadFrozenClaimsInput(company, args.dbs[company]),
  ])) as Record<ShadowCompanySlug, FrozenClaimsInput>;
  const records: ShadowRunRecord[] = [];
  for (const item of plan) {
    records.push(await executeOne(item, frozen[item.company], env));
  }
  if (records.length !== 6) throw new Error("SHADOW_EXECUTED_CALL_COUNT_MISMATCH");
  for (const company of COMPANY_ORDER) {
    const pair = records.filter((record) => record.company === company);
    if (pair.length !== 2 || pair[0]?.promptSha256 !== pair[1]?.promptSha256) {
      throw new Error(`SHADOW_PROMPT_PARITY_MISMATCH:${company}`);
    }
  }
  for (const item of Object.values(frozen)) {
    if (sha256(readFileSync(item.databasePath)) !== item.frozenHashes.databaseFile) {
      throw new Error(`SHADOW_FROZEN_DATABASE_CHANGED:${item.company}`);
    }
  }
  const artifact = {
    artifactVersion: "claims-model-shadow-ab.v1",
    createdAt: new Date().toISOString(),
    policyDefault: CLAIMS_MODEL_POLICY_DEFAULT,
    executedPolicy: "SHADOW",
    providerBudget: { bocha: 0, crawler: 0, deepseek: 6, retries: 0 },
    frozenInputs: Object.fromEntries(COMPANY_ORDER.map((company) => [company, {
      diagnosisId: frozen[company].diagnosisId,
      hashes: frozen[company].frozenHashes,
    }])),
    records,
    rawResponsesPersisted: false,
    truthPolicyEvaluation:
      "Historical ClaimEvidenceRelations are reused only when the complete built Shadow candidate is semantically identical to the latest frozen Canonical candidate with the same id. Positional ids alone never authorize reuse; changed candidates remain unverified and non-publishable without a new verifier call.",
    canonicalWrites: 0,
  };
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return artifact;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.planOnly) {
    const plan = buildShadowPlan();
    assertShadowBudget(plan);
    assertPrivateOutput(args.output);
    const frozen = COMPANY_ORDER.map((company) =>
      loadFrozenClaimsInput(company, args.dbs[company]),
    );
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: "PLAN_ONLY_NO_PROVIDER",
      callsPlanned: plan.length,
      modelCounts: Object.fromEntries(
        CLAIMS_SHADOW_MODELS.map((model) => [model, plan.filter((item) => item.model === model).length]),
      ),
      retries: 0,
      order: plan.map((item) => `${item.company}:${item.model}`),
      frozenInputs: frozen.map((item) => ({
        company: item.company,
        diagnosisId: item.diagnosisId,
        hashes: item.frozenHashes,
      })),
      outputWouldBe: args.output,
    }, null, 2)}\n`);
    return;
  }
  const artifact = await runShadowAb(args);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    output: args.output,
    calls: (artifact as { records: unknown[] }).records.length,
    rawResponsesPersisted: false,
  }, null, 2)}\n`);
}

const invokedAsScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (invokedAsScript) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
