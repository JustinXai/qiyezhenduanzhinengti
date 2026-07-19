// ============================================================================
// Round-6 one-shot three-company real-sample runner.
//
// Importing this module is inert. Real execution is possible only when this
// exact script is invoked and the process environment explicitly carries
// THREE_COMPANY_SAMPLE_AUTHORIZED=true. The public API/body/URL/UI never reads
// that switch. After preflight, the runner bridges the existing technical
// canary authorization into each isolated child server process.
// ============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { loadEnvironment } from "../src/runtime/load-environment";
import type { DiagnosisInput } from "../src/runtime/diagnosis-input";
import {
  DiagnosisReport as DiagnosisReportSchema,
  SCORE_DIMENSION_WEIGHTS,
  type DiagnosisReport,
} from "../src/contracts";
import { deriveCoverage, type ClaimEvidenceRelation } from "../src/contracts/claim-evidence";
import { presentReport } from "../src/report/presentation";
import {
  chinesePublicReportGuard,
  countQuickVisibleChars,
  evaluateClaimPublication,
  type ClaimPublicationSourceContext,
} from "../src/report/validation";

export const THREE_COMPANY_SAMPLE_AUTH_ENV = "THREE_COMPANY_SAMPLE_AUTHORIZED";
export const THREE_COMPANY_SAMPLE_PRIVATE_ROOT = "E:\\企业诊断智能体_private\\three-company-sample-v1";
export const THREE_COMPANY_SAMPLE_RUNNER_VERSION = "three-company-real-sample.v1";

export const THREE_COMPANY_SAMPLE_BUDGET = {
  perCompany: {
    bochaExpectedMax: 10,
    bochaHardMax: 12,
    crawlerHardMax: 12,
    crawlerFirstPartyHardMax: 8,
    crawlerCompetitorHardMax: 4,
    deepseekExpected: 4,
    deepseekHardMax: 8,
    retries: 0,
    diagnoses: 1,
  },
  batch: {
    bochaHardMax: 36,
    crawlerHardMax: 36,
    deepseekHardMax: 24,
    retries: 0,
    diagnoses: 3,
  },
} as const;

export interface ThreeCompanySampleTarget {
  ordinal: 1 | 2 | 3;
  slug: "qiaqia" | "iflytek" | "heli";
  directory: "01-qiaqia" | "02-iflytek" | "03-heli";
  companyName: string;
  website: string;
  industryOrFocus: string;
  targetRegion: "中国公开网络";
  competitor: string;
  customerQuestions: readonly [string, string, string, string, string];
  input: DiagnosisInput;
}

function fixedInput(target: Omit<ThreeCompanySampleTarget, "input">): DiagnosisInput {
  return {
    website: target.website,
    brandName: target.companyName,
    industry: target.industryOrFocus,
    productOrService: target.industryOrFocus,
    targetRegion: target.targetRegion,
    competitors: [target.competitor],
    notes: [
      "THREE-COMPANY-REAL-SAMPLE-V1（非客户，仅使用公开信息）",
      ...target.customerQuestions.map((question) => `Q: ${question}`),
    ].join("\n"),
  };
}

function target(definition: Omit<ThreeCompanySampleTarget, "input">): ThreeCompanySampleTarget {
  const customerQuestions = Object.freeze([...definition.customerQuestions]) as ThreeCompanySampleTarget["customerQuestions"];
  const frozenDefinition = { ...definition, customerQuestions };
  const input = fixedInput(frozenDefinition);
  if (input.competitors) Object.freeze(input.competitors);
  return Object.freeze({ ...frozenDefinition, input: Object.freeze(input) });
}

export const THREE_COMPANY_SAMPLE_TARGETS: readonly ThreeCompanySampleTarget[] = Object.freeze([
  target({
    ordinal: 1,
    slug: "qiaqia",
    directory: "01-qiaqia",
    companyName: "洽洽食品股份有限公司",
    website: "https://www.qiaqiafood.com/",
    industryOrFocus: "坚果炒货与休闲食品",
    targetRegion: "中国公开网络",
    competitor: "三只松鼠",
    customerQuestions: [
      "购买瓜子和坚果产品时，消费者应该重点比较哪些品质指标？",
      "洽洽不同坚果、瓜子和礼盒产品分别适合哪些消费场景？",
      "消费者如何确认原料、加工、保鲜和食品安全信息？",
      "企业团购、员工福利和礼赠采购应如何选择洽洽产品？",
      "洽洽与其他坚果休闲食品品牌的公开差异是什么？",
    ],
  }),
  target({
    ordinal: 2,
    slug: "iflytek",
    directory: "02-iflytek",
    companyName: "科大讯飞股份有限公司",
    website: "https://www.iflytek.com/cn/",
    industryOrFocus: "企业AI解决方案、智慧办公和行业数字化",
    targetRegion: "中国公开网络",
    competitor: "百度智能云",
    customerQuestions: [
      "企业选择AI办公和智能体解决方案时应关注哪些能力？",
      "科大讯飞的企业AI产品适合哪些行业和业务流程？",
      "企业采购时如何判断部署方式、数据安全和系统兼容性？",
      "科大讯飞有哪些可公开验证的企业案例、服务流程和交付能力？",
      "科大讯飞企业AI方案与其他国内厂商的公开差异是什么？",
    ],
  }),
  target({
    ordinal: 3,
    slug: "heli",
    directory: "03-heli",
    companyName: "安徽合力股份有限公司 / 合力叉车",
    website: "https://www.helichina.com/",
    industryOrFocus: "工业车辆、叉车与智能物流设备",
    targetRegion: "中国公开网络",
    competitor: "杭叉集团",
    customerQuestions: [
      "企业应如何选择锂电叉车、内燃叉车和仓储车辆？",
      "不同吨位、工况和作业环境分别适合哪些叉车型号？",
      "企业采购叉车时应重点关注哪些安全、能耗和维护指标？",
      "合力的销售、服务、配件和售后网络能提供哪些支持？",
      "合力与其他工业车辆品牌的公开差异是什么？",
    ],
  }),
]);

export type SampleAuthorizationFailure =
  | "SAMPLE_NOT_AUTHORIZED"
  | "PROVIDER_MODE_NOT_REAL"
  | "SMOKE_MODE_NOT_FALSE"
  | "PROVIDER_CONFIGURATION_MISSING";

export interface SampleAuthorizationResult {
  authorized: boolean;
  failures: SampleAuthorizationFailure[];
}

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

/** Reads only process/server environment. There is intentionally no request argument. */
export function assessThreeCompanySampleAuthorization(env: ServerEnvironment): SampleAuthorizationResult {
  const failures: SampleAuthorizationFailure[] = [];
  if (env[THREE_COMPANY_SAMPLE_AUTH_ENV] !== "true") failures.push("SAMPLE_NOT_AUTHORIZED");
  if (env.PROVIDER_MODE !== "REAL") failures.push("PROVIDER_MODE_NOT_REAL");
  if (env.DIAGNOSIS_SMOKE_MODE !== "false") failures.push("SMOKE_MODE_NOT_FALSE");
  if (!env.BOCHA_API_KEY?.trim() || !env.DEEPSEEK_API_KEY?.trim()) {
    failures.push("PROVIDER_CONFIGURATION_MISSING");
  }
  return { authorized: failures.length === 0, failures };
}

export interface CompanyPaths {
  directory: string;
  database: string;
  runLock: string;
  summary: string;
  sanitizedCanonical: string;
  quickScreenshot: string;
  deepScreenshot: string;
  evidenceScreenshot: string;
  printScreenshot: string;
  log: string;
  providerUsage: string;
  sampleMetrics: string;
}

export function resolveCompanyPaths(
  privateRoot: string,
  sampleTarget: ThreeCompanySampleTarget,
): CompanyPaths {
  const root = resolve(privateRoot);
  const directory = resolve(root, sampleTarget.directory);
  const pathFromRoot = relative(root, directory);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || resolve(dirname(directory)) !== root) {
    throw new Error("PRIVATE_DIRECTORY_ISOLATION_FAILED");
  }
  return {
    directory,
    database: join(directory, `${sampleTarget.slug}.sqlite`),
    runLock: join(directory, "run-lock.json"),
    summary: join(directory, "summary.json"),
    sanitizedCanonical: join(directory, "sanitized-canonical.json"),
    quickScreenshot: join(directory, "quick.png"),
    deepScreenshot: join(directory, "deep.png"),
    evidenceScreenshot: join(directory, "evidence.png"),
    printScreenshot: join(directory, "print.png"),
    log: join(directory, "run.log"),
    providerUsage: join(directory, "provider-usage.json"),
    sampleMetrics: join(directory, "sample-metrics.json"),
  };
}

export function buildIsolatedChildEnvironment(
  env: ServerEnvironment,
  paths: CompanyPaths,
  port: number,
): NodeJS.ProcessEnv {
  const authorization = assessThreeCompanySampleAuthorization(env);
  if (!authorization.authorized) {
    throw new Error(`THREE_COMPANY_SAMPLE_NOT_AUTHORIZED:${authorization.failures.join(",")}`);
  }
  return {
    ...env,
    NODE_ENV: "development",
    PROVIDER_MODE: "REAL",
    DIAGNOSIS_SMOKE_MODE: "false",
    [THREE_COMPANY_SAMPLE_AUTH_ENV]: "true",
    // Internal bridge only. The parent runner remains gated by the new switch;
    // no public request value is copied into this environment.
    TECHNICAL_COMPANY_CANARY_AUTHORIZED: "true",
    TECHNICAL_CANARY_PROFILE: "TECHNICAL_COMPANY_CANARY_V1",
    DATABASE_URL: paths.database,
    PORT: String(port),
  };
}

export interface SampleProviderUsage {
  bocha: number;
  crawler: number;
  crawlerFirstParty: number | null;
  crawlerCompetitor: number | null;
  deepseek: number;
  retries: number;
}

export interface CompanyExecutionResult {
  target: ThreeCompanySampleTarget["slug"];
  diagnosisIdShort: string | null;
  diagnosisCount: number;
  finalState: string;
  durationMs: number;
  providerUsage: SampleProviderUsage;
  schemaFailure: boolean;
  safetyFailure: boolean;
  publicApiLeak: boolean;
  truthGuardViolation: boolean;
  unsupportedPublishedClaimCount: number;
  scoringWeightsChanged: boolean;
  stateMachineAnomaly: boolean;
  databaseConflict: boolean;
  runLockConflict: boolean;
  issueCount: number;
  opportunityCount: number;
  demonstrationFixPublished: boolean;
  productYieldStatus: "HEALTHY" | "SPARSE_BUT_TRUTHFUL" | "INSUFFICIENT_SAMPLE";
  reportLanguage: string | null;
  quickVisibleCharacters: number | null;
  mobileOverflow: boolean | null;
  printCaptured: boolean;
  viewSwitchProviderDelta: number | null;
  canonicalProjectionConsistent: boolean;
  pruneAuditComplete: boolean;
  crawlerUsageAuditable: boolean;
}

export interface CompanyExecutionContext {
  target: ThreeCompanySampleTarget;
  paths: CompanyPaths;
  childEnvironment: NodeJS.ProcessEnv;
  port: number;
}

export type CompanyExecutor = (context: CompanyExecutionContext) => Promise<CompanyExecutionResult>;

export interface BatchTotals {
  bocha: number;
  crawler: number;
  deepseek: number;
  retries: number;
  diagnoses: number;
}

export interface ThreeCompanyBatchResult {
  runnerVersion: typeof THREE_COMPANY_SAMPLE_RUNNER_VERSION;
  status: "COMPLETED" | "STOPPED";
  results: CompanyExecutionResult[];
  totals: BatchTotals;
  stopReasons: string[];
}

export interface ThreeCompanySamplePlan {
  runnerVersion: typeof THREE_COMPANY_SAMPLE_RUNNER_VERSION;
  mode: "PLAN_ONLY";
  authorizationDefault: false;
  realProviderCalls: 0;
  newDiagnoses: 0;
  privateWrites: 0;
  budget: typeof THREE_COMPANY_SAMPLE_BUDGET;
  targets: Array<{
    ordinal: number;
    slug: ThreeCompanySampleTarget["slug"];
    companyName: string;
    website: string;
    competitor: string;
    questionCount: 5;
    directory: string;
    database: string;
    runLock: string;
  }>;
}

/** Read-only plan: no authorization, filesystem write, database, provider, or Diagnosis. */
export function buildThreeCompanySamplePlan(
  privateRoot: string = THREE_COMPANY_SAMPLE_PRIVATE_ROOT,
): ThreeCompanySamplePlan {
  return {
    runnerVersion: THREE_COMPANY_SAMPLE_RUNNER_VERSION,
    mode: "PLAN_ONLY",
    authorizationDefault: false,
    realProviderCalls: 0,
    newDiagnoses: 0,
    privateWrites: 0,
    budget: THREE_COMPANY_SAMPLE_BUDGET,
    targets: THREE_COMPANY_SAMPLE_TARGETS.map((sampleTarget) => {
      const paths = resolveCompanyPaths(privateRoot, sampleTarget);
      return {
        ordinal: sampleTarget.ordinal,
        slug: sampleTarget.slug,
        companyName: sampleTarget.companyName,
        website: sampleTarget.website,
        competitor: sampleTarget.competitor,
        questionCount: 5,
        directory: paths.directory,
        database: paths.database,
        runLock: paths.runLock,
      };
    }),
  };
}

export interface RunThreeCompanyBatchOptions {
  env: ServerEnvironment;
  executor: CompanyExecutor;
  /** Tests may use a temporary directory; production main always uses the frozen root. */
  privateRoot?: string;
  startPort?: number;
  now?: () => string;
  /** Production enables this; orchestration-only unit tests may disable it. */
  verifyRequiredArtifacts?: boolean;
}

export function requiredCompanyArtifactPaths(paths: CompanyPaths): string[] {
  return [
    paths.database,
    paths.sanitizedCanonical,
    paths.quickScreenshot,
    paths.deepScreenshot,
    paths.evidenceScreenshot,
    paths.printScreenshot,
    paths.log,
    paths.providerUsage,
    paths.sampleMetrics,
  ];
}

function writeJson(path: string, value: unknown, exclusive = false): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: exclusive ? "wx" : "w",
  });
}

function zeroTotals(): BatchTotals {
  return { bocha: 0, crawler: 0, deepseek: 0, retries: 0, diagnoses: 0 };
}

function addUsage(totals: BatchTotals, result: CompanyExecutionResult): void {
  totals.bocha += result.providerUsage.bocha;
  totals.crawler += result.providerUsage.crawler;
  totals.deepseek += result.providerUsage.deepseek;
  totals.retries += result.providerUsage.retries;
  totals.diagnoses += result.diagnosisCount;
}

export function companyStopReasons(result: CompanyExecutionResult): string[] {
  const reasons: string[] = [];
  const usage = result.providerUsage;
  const budget = THREE_COMPANY_SAMPLE_BUDGET.perCompany;
  if (usage.bocha > budget.bochaHardMax) reasons.push("BOCHA_COMPANY_BUDGET_EXCEEDED");
  if (usage.crawler > budget.crawlerHardMax) reasons.push("CRAWLER_COMPANY_BUDGET_EXCEEDED");
  if (usage.crawlerFirstParty !== null && usage.crawlerFirstParty > budget.crawlerFirstPartyHardMax) {
    reasons.push("CRAWLER_FIRST_PARTY_BUDGET_EXCEEDED");
  }
  if (usage.crawlerCompetitor !== null && usage.crawlerCompetitor > budget.crawlerCompetitorHardMax) {
    reasons.push("CRAWLER_COMPETITOR_BUDGET_EXCEEDED");
  }
  if (usage.deepseek > budget.deepseekHardMax) reasons.push("DEEPSEEK_COMPANY_BUDGET_EXCEEDED");
  if (usage.retries !== 0) reasons.push("UNEXPECTED_RETRY");
  if (result.diagnosisCount !== 1) reasons.push("DIAGNOSIS_COUNT_VIOLATION");
  if (result.finalState !== "READY") reasons.push("FINAL_STATE_NOT_READY");
  if (result.schemaFailure) reasons.push("SCHEMA_FAILURE");
  if (result.safetyFailure) reasons.push("SAFETY_FAILURE");
  if (result.publicApiLeak) reasons.push("PUBLIC_API_LEAK");
  if (result.truthGuardViolation) reasons.push("TRUTH_GUARD_VIOLATION");
  if (result.unsupportedPublishedClaimCount > 0) reasons.push("UNSUPPORTED_CLAIM_PUBLISHED");
  if (result.scoringWeightsChanged) reasons.push("SCORING_WEIGHTS_CHANGED");
  if (result.stateMachineAnomaly) reasons.push("STATE_MACHINE_ANOMALY");
  if (result.databaseConflict) reasons.push("DATABASE_CONFLICT");
  if (result.runLockConflict) reasons.push("RUN_LOCK_CONFLICT");
  if (result.reportLanguage !== "zh-CN") reasons.push("REPORT_LANGUAGE_INVALID");
  if (result.quickVisibleCharacters === null || result.quickVisibleCharacters > 1800) {
    reasons.push("QUICK_CHARACTER_LIMIT_FAILED");
  }
  if (result.mobileOverflow !== false) reasons.push("MOBILE_OVERFLOW_OR_UNVERIFIED");
  if (!result.printCaptured) reasons.push("PRINT_NOT_CAPTURED");
  if (result.viewSwitchProviderDelta !== 0) reasons.push("VIEW_SWITCH_PROVIDER_DELTA_NONZERO_OR_UNKNOWN");
  if (!result.canonicalProjectionConsistent) reasons.push("CANONICAL_PROJECTION_MISMATCH");
  if (!result.pruneAuditComplete) reasons.push("PRUNE_AUDIT_INCOMPLETE");
  if (!result.crawlerUsageAuditable) reasons.push("CRAWLER_USAGE_NOT_AUDITABLE");
  return reasons;
}

export function batchBudgetStopReasons(totals: BatchTotals): string[] {
  const budget = THREE_COMPANY_SAMPLE_BUDGET.batch;
  const reasons: string[] = [];
  if (totals.bocha > budget.bochaHardMax) reasons.push("BOCHA_BATCH_BUDGET_EXCEEDED");
  if (totals.crawler > budget.crawlerHardMax) reasons.push("CRAWLER_BATCH_BUDGET_EXCEEDED");
  if (totals.deepseek > budget.deepseekHardMax) reasons.push("DEEPSEEK_BATCH_BUDGET_EXCEEDED");
  if (totals.retries !== 0) reasons.push("BATCH_RETRY_VIOLATION");
  if (totals.diagnoses > budget.diagnoses) reasons.push("BATCH_DIAGNOSIS_BUDGET_EXCEEDED");
  return reasons;
}

export async function runThreeCompanySampleBatch(
  options: RunThreeCompanyBatchOptions,
): Promise<ThreeCompanyBatchResult> {
  const authorization = assessThreeCompanySampleAuthorization(options.env);
  if (!authorization.authorized) {
    throw new Error(`THREE_COMPANY_SAMPLE_NOT_AUTHORIZED:${authorization.failures.join(",")}`);
  }

  const privateRoot = resolve(options.privateRoot ?? THREE_COMPANY_SAMPLE_PRIVATE_ROOT);
  const batchLock = join(privateRoot, "batch-run-lock.json");
  if (existsSync(batchLock)) throw new Error("BATCH_RUN_LOCK_PRESENT");
  mkdirSync(privateRoot, { recursive: true });
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  writeJson(
    batchLock,
    {
      runnerVersion: THREE_COMPANY_SAMPLE_RUNNER_VERSION,
      status: "RUNNING",
      startedAt,
      targetOrder: THREE_COMPANY_SAMPLE_TARGETS.map((item) => item.slug),
      budget: THREE_COMPANY_SAMPLE_BUDGET,
    },
    true,
  );

  const results: CompanyExecutionResult[] = [];
  const totals = zeroTotals();
  let stopReasons: string[] = [];

  for (const sampleTarget of THREE_COMPANY_SAMPLE_TARGETS) {
    const paths = resolveCompanyPaths(privateRoot, sampleTarget);
    if (existsSync(paths.database) || existsSync(paths.runLock)) {
      stopReasons = [`${sampleTarget.slug}:PRIVATE_ARTIFACT_CONFLICT`];
      break;
    }
    mkdirSync(paths.directory, { recursive: true });
    writeJson(
      paths.runLock,
      { runnerVersion: THREE_COMPANY_SAMPLE_RUNNER_VERSION, status: "RUNNING", startedAt: now() },
      true,
    );

    let result: CompanyExecutionResult;
    try {
      result = await options.executor({
        target: sampleTarget,
        paths,
        childEnvironment: buildIsolatedChildEnvironment(
          options.env,
          paths,
          (options.startPort ?? 3200) + sampleTarget.ordinal - 1,
        ),
        port: (options.startPort ?? 3200) + sampleTarget.ordinal - 1,
      });
    } catch {
      stopReasons = [`${sampleTarget.slug}:EXECUTOR_FAILURE`];
      writeJson(paths.runLock, {
        runnerVersion: THREE_COMPANY_SAMPLE_RUNNER_VERSION,
        status: "STOPPED",
        finishedAt: now(),
        stopReasons,
      });
      break;
    }
    if (result.target !== sampleTarget.slug) throw new Error("EXECUTOR_TARGET_MISMATCH");
    results.push(result);
    addUsage(totals, result);
    writeJson(paths.summary, result);
    const reasons = [...companyStopReasons(result), ...batchBudgetStopReasons(totals)];
    if (
      options.verifyRequiredArtifacts === true &&
      requiredCompanyArtifactPaths(paths).some((path) => !existsSync(path))
    ) {
      reasons.push("REQUIRED_ARTIFACT_MISSING");
    }
    writeJson(paths.runLock, {
      runnerVersion: THREE_COMPANY_SAMPLE_RUNNER_VERSION,
      status: reasons.length === 0 ? "COMPLETED" : "STOPPED",
      finishedAt: now(),
      diagnosisIdShort: result.diagnosisIdShort,
      stopReasons: reasons,
    });
    if (reasons.length > 0) {
      stopReasons = reasons.map((reason) => `${sampleTarget.slug}:${reason}`);
      break;
    }
  }

  const output: ThreeCompanyBatchResult = {
    runnerVersion: THREE_COMPANY_SAMPLE_RUNNER_VERSION,
    status: results.length === 3 && stopReasons.length === 0 ? "COMPLETED" : "STOPPED",
    results,
    totals,
    stopReasons,
  };
  writeJson(batchLock, { ...output, startedAt, finishedAt: now() });
  return output;
}

function sumProvider(rows: Array<{ provider: string; calls: number }>, provider: string): number {
  return rows.filter((row) => row.provider === provider).reduce((sum, row) => sum + row.calls, 0);
}

function readPersistedExecution(paths: CompanyPaths): {
  diagnosisCount: number;
  finalState: string;
  usage: SampleProviderUsage;
} {
  const db = new BetterSqlite3(paths.database, { readonly: true, fileMustExist: true });
  try {
    const diagnosis = db.prepare("SELECT COUNT(*) count FROM diagnosis_requests").get() as { count: number };
    const final = db
      .prepare("SELECT status FROM diagnosis_requests ORDER BY created_at DESC LIMIT 1")
      .get() as { status: string } | undefined;
    const rows = db
      .prepare(
        "SELECT provider, stage, SUM(call_count) calls, SUM(retry_count) retries FROM provider_usage GROUP BY provider, stage",
      )
      .all() as Array<{ provider: string; stage: string; calls: number; retries: number }>;
    const crawlerFirstParty = rows.find(
      (row) => row.provider === "crawler" && row.stage === "CRAWLING_FIRST_PARTY",
    );
    const crawlerCompetitor = rows.find(
      (row) => row.provider === "crawler" && row.stage === "CRAWLING_COMPETITOR",
    );
    const crawlerAggregate = rows.find(
      (row) => row.provider === "crawler" && row.stage === "CRAWLING",
    );
    const crawler =
      crawlerFirstParty && crawlerCompetitor
        ? crawlerFirstParty.calls + crawlerCompetitor.calls
        : (crawlerAggregate?.calls ?? 0);
    return {
      diagnosisCount: diagnosis.count,
      finalState: final?.status ?? "UNKNOWN",
      usage: {
        bocha: sumProvider(rows, "bocha"),
        crawler,
        crawlerFirstParty: crawlerFirstParty?.calls ?? null,
        crawlerCompetitor: crawlerCompetitor?.calls ?? null,
        deepseek: sumProvider(rows, "deepseek"),
        retries: rows.reduce((sum, row) => sum + row.retries, 0),
      },
    };
  } finally {
    db.close();
  }
}

interface PersistedTruthAudit {
  truthGuardViolation: boolean;
  unsupportedPublishedClaimCount: number;
  pruneAuditComplete: boolean;
  crawlerUsageAuditable: boolean;
}

interface SqlRelationRow {
  claim_id: string;
  claim_kind: ClaimEvidenceRelation["claimKind"];
  evidence_id: string;
  support_level: "DIRECT_SUPPORT" | "PARTIAL_SUPPORT" | "CONTEXT_ONLY" | "UNSUPPORTED";
  confidence: number;
  justification: string | null;
  basis: ClaimEvidenceRelation["basis"];
  verifier_mode: ClaimEvidenceRelation["verifierMode"];
  verifier_version: string;
}

function tableExists(db: BetterSqlite3.Database, table: string): boolean {
  const row = db
    .prepare("SELECT 1 present FROM sqlite_schema WHERE type = 'table' AND name = ?")
    .get(table) as { present: number } | undefined;
  return row?.present === 1;
}

function candidateRefsFromClaimsOutput(output: unknown): string[] | null {
  if (output === null || Array.isArray(output) || typeof output !== "object") return null;
  const value = output as Record<string, unknown>;
  const buckets = ["strengths", "coreIssues", "geoOpportunities", "competitorGaps"] as const;
  const refs: string[] = [];
  for (const bucket of buckets) {
    const candidates = value[bucket];
    if (!Array.isArray(candidates)) return null;
    for (const candidate of candidates) {
      if (candidate === null || typeof candidate !== "object") return null;
      const id = (candidate as Record<string, unknown>).id;
      if (typeof id !== "string" || !id) return null;
      refs.push(id);
    }
  }
  const demonstrationFix = value.demonstrationFix;
  if (demonstrationFix !== null) {
    if (typeof demonstrationFix !== "object") return null;
    const id = (demonstrationFix as Record<string, unknown>).id;
    if (typeof id !== "string" || !id) return null;
    refs.push(id);
  }
  return refs;
}

/**
 * Fail-closed audit over persisted canonical, pairwise relations, stage output,
 * prune ledger and crawler usage. Independent partial publication is left to
 * the shared Agent-X policy adapter; until that adapter is present a
 * partial-only published Strength/Opportunity is a blocking unknown, never a
 * guessed PASS.
 */
function readPersistedTruthAudit(
  paths: CompanyPaths,
  diagnosisId: string,
  report: DiagnosisReport,
  companyId: ThreeCompanySampleTarget["slug"],
): PersistedTruthAudit {
  const db = new BetterSqlite3(paths.database, { readonly: true, fileMustExist: true });
  try {
    if (!tableExists(db, "claim_evidence_relations")) {
      return {
        truthGuardViolation: true,
        unsupportedPublishedClaimCount: report.coreIssues.length + report.strengths.length + report.geoOpportunities.length,
        pruneAuditComplete: false,
        crawlerUsageAuditable: false,
      };
    }
    const relations = db
      .prepare(
        "SELECT claim_id, claim_kind, evidence_id, support_level, confidence, justification, basis, verifier_mode, verifier_version FROM claim_evidence_relations WHERE diagnosis_id = ? ORDER BY claim_id, id",
      )
      .all(diagnosisId) as SqlRelationRow[];
    const relationsByClaim = new Map<string, SqlRelationRow[]>();
    for (const relation of relations) {
      const existing = relationsByClaim.get(relation.claim_id) ?? [];
      existing.push(relation);
      relationsByClaim.set(relation.claim_id, existing);
    }

    const firstPartyDomains = [
      ...new Set(
        report.evidence
          .filter((item) => item.sourceType === "FIRST_PARTY_EVIDENCE")
          .map((item) => item.normalizedDomain ?? item.sourceDomain),
      ),
    ];
    const bochaUsage = db
      .prepare(
        "SELECT COALESCE(SUM(call_count), 0) calls FROM provider_usage WHERE diagnosis_id = ? AND provider = 'bocha'",
      )
      .get(diagnosisId) as { calls: number };
    const coverage = deriveCoverage({
      evidence: report.evidence,
      firstPartyDomains,
      executedQueries: bochaUsage.calls > 0 ? ["PERSISTED_EXECUTED_QUERY_PRESENT"] : [],
      plannedQueries: bochaUsage.calls > 0 ? ["PERSISTED_EXECUTED_QUERY_PRESENT"] : [],
      successfulQueries: bochaUsage.calls > 0 ? ["PERSISTED_EXECUTED_QUERY_PRESENT"] : [],
      queryPlanId: `${diagnosisId}:persisted-audit`,
      coverageLimitations: ["Runner依据持久化Provider usage与首方Evidence重建最小测量边界。"],
    });
    const sourceContext: ClaimPublicationSourceContext = {
      companyId,
      firstPartyDomains,
      // Competitor resolution identity is not guessed from a display name.
      competitorEntities: [],
    };
    const publicClaims = [
      ...report.coreIssues.map((claim) => ({
        id: claim.id,
        kind: "coreIssue" as const,
        text: `${claim.statement} ${claim.businessImpact} ${claim.fixDirection}`,
        negativeScopeText: claim.statement,
        evidenceIds: claim.evidenceIds,
      })),
      ...report.strengths.map((claim) => ({
        id: claim.id,
        kind: "strength" as const,
        text: `${claim.statement} ${claim.businessImpact}`,
        negativeScopeText: claim.statement,
        evidenceIds: claim.evidenceIds,
      })),
      ...report.geoOpportunities.map((claim) => ({
        id: claim.id,
        kind: "geoOpportunity" as const,
        text: `${claim.statement} ${claim.businessImpact} ${claim.customerQuestion} ${claim.contentGap}`,
        negativeScopeText: claim.contentGap,
        evidenceIds: claim.evidenceIds,
      })),
    ];
    let unsupportedPublishedClaimCount = 0;
    let truthGuardViolation = false;
    for (const claim of publicClaims) {
      const claimRelations = (relationsByClaim.get(claim.id) ?? []).map((row) => ({
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
      const decision = evaluateClaimPublication({
        claim,
        relations: claimRelations,
        evidence: report.evidence,
        coverage,
        sourceContext,
      });
      if (decision.outcome !== "PUBLISH") truthGuardViolation = true;
      if (decision.rule === "UNSUPPORTED_EVIDENCE" || decision.outcome === "BLOCK") {
        unsupportedPublishedClaimCount += 1;
      }
    }

    const publishedIssueIds = new Set(report.coreIssues.map((claim) => claim.id));
    if (
      report.geoOpportunities.some(
        (opportunity) =>
          !opportunity.sourceIssueId ||
          !publishedIssueIds.has(opportunity.sourceIssueId) ||
          !opportunity.recommendedAction?.trim() ||
          !opportunity.priorityReason?.trim() ||
          !opportunity.customerQuestion.trim(),
      )
    ) {
      truthGuardViolation = true;
    }

    let pruneAuditComplete = false;
    if (tableExists(db, "prune_decisions") && tableExists(db, "analysis_stage_runs")) {
      const reportRow = db
        .prepare("SELECT id FROM reports WHERE diagnosis_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(diagnosisId) as { id: string } | undefined;
      const stageRun = db
        .prepare(
          "SELECT id, output_json FROM analysis_stage_runs WHERE diagnosis_id = ? AND stage = 'REPORT_CLAIMS' AND status = 'SUCCEEDED' ORDER BY attempt DESC, completed_at DESC LIMIT 1",
        )
        .get(diagnosisId) as { id: string; output_json: string } | undefined;
      if (reportRow && stageRun) {
        let candidateRefs: string[] | null = null;
        try {
          candidateRefs = candidateRefsFromClaimsOutput(JSON.parse(stageRun.output_json));
        } catch {
          candidateRefs = null;
        }
        if (candidateRefs) {
          const publishedRefs = new Set([
            ...report.strengths.map((claim) => claim.id),
            ...report.coreIssues.map((claim) => claim.id),
            ...report.geoOpportunities.map((claim) => claim.id),
            ...report.competitorGaps.map((claim) => claim.id),
            ...(report.demonstrationFix ? [report.demonstrationFix.id] : []),
          ]);
          const droppedRefs = candidateRefs.filter((ref) => !publishedRefs.has(ref));
          const decisions = db
            .prepare(
              "SELECT candidate_ref FROM prune_decisions WHERE diagnosis_id = ? AND report_id = ? AND stage_run_id = ?",
            )
            .all(diagnosisId, reportRow.id, stageRun.id) as Array<{ candidate_ref: string }>;
          const auditedRefs = new Set(decisions.map((decision) => decision.candidate_ref));
          pruneAuditComplete = droppedRefs.every((ref) => auditedRefs.has(ref));
        }
      }
    }

    const crawlerStages = db
      .prepare("SELECT stage FROM provider_usage WHERE diagnosis_id = ? AND provider = 'crawler'")
      .all(diagnosisId) as Array<{ stage: string }>;
    const crawlerUsageAuditable =
      crawlerStages.some((row) => row.stage === "CRAWLING_FIRST_PARTY") &&
      crawlerStages.some((row) => row.stage === "CRAWLING_COMPETITOR");

    return {
      truthGuardViolation,
      unsupportedPublishedClaimCount,
      pruneAuditComplete,
      crawlerUsageAuditable,
    };
  } finally {
    db.close();
  }
}

async function waitForServer(baseUrl: string, timeoutMs = 150_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch {
      // The isolated server may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  throw new Error("LOCAL_SERVER_START_TIMEOUT");
}

function startServer(context: CompanyExecutionContext): ChildProcess {
  return spawn("pnpm", ["exec", "next", "dev", "-p", String(context.port)], {
    cwd: process.cwd(),
    env: context.childEnvironment,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function captureCompanyScreens(
  reportUrl: string,
  paths: CompanyPaths,
): Promise<{ mobileOverflow: boolean; printCaptured: boolean }> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(reportUrl, { waitUntil: "networkidle" });
    await mobile.screenshot({ path: paths.quickScreenshot, fullPage: true });
    const mobileOverflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await mobile.close();

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(reportUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "完整诊断", exact: true }).click();
    await page.screenshot({ path: paths.deepScreenshot, fullPage: true });
    await page.getByRole("button", { name: "证据", exact: true }).click();
    await page.screenshot({ path: paths.evidenceScreenshot, fullPage: true });
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: paths.printScreenshot, fullPage: true });
    await page.close();
    return { mobileOverflow, printCaptured: existsSync(paths.printScreenshot) };
  } finally {
    await browser.close();
  }
}

function providerCallTotal(usage: SampleProviderUsage): number {
  return usage.bocha + usage.crawler + usage.deepseek;
}

const FROZEN_SCORE_WEIGHTS = {
  companyClarity: 0.2,
  websiteCompleteness: 0.2,
  customerQuestionCoverage: 0.25,
  trustEvidence: 0.2,
  aiVisibility: 0.15,
} as const;

function scoringWeightsChanged(): boolean {
  return JSON.stringify(SCORE_DIMENSION_WEIGHTS) !== JSON.stringify(FROZEN_SCORE_WEIGHTS);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  await new Promise<void>((resolveStop) => {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      shell: true,
      stdio: "ignore",
    });
    killer.on("exit", () => resolveStop());
    killer.on("error", () => resolveStop());
  });
}

const INTERNAL_PUBLIC_API_FIELDS = [
  "pruneDecision",
  "independentSupportSourceKey",
  "guardRule",
  "algorithmVersion",
  "stageRunId",
  "verifierMode",
] as const;

/** Default real executor. It is unreachable unless the parent preflight passes. */
export async function executeCompanyOverIsolatedHttp(
  context: CompanyExecutionContext,
): Promise<CompanyExecutionResult> {
  const started = Date.now();
  const baseUrl = `http://localhost:${context.port}`;
  const child = startServer(context);
  let created: {
    diagnosisId?: string;
    publicToken?: string;
    status?: string;
    failedStage?: string;
    error?: { code?: string };
  } = {};
  let publicBody = "";
  let report: DiagnosisReport | null = null;
  let quickVisibleCharacters: number | null = null;
  let reportLanguage: string | null = null;
  let canonicalProjectionConsistent = false;
  let chineseGuardFailed = true;
  let mobileOverflow: boolean | null = null;
  let printCaptured = false;
  let viewSwitchProviderDelta: number | null = null;
  let reportCounts = { issueCount: 0, opportunityCount: 0, demonstrationFixPublished: false };
  try {
    await waitForServer(baseUrl);
    const response = await fetch(`${baseUrl}/api/diagnoses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context.target.input),
      signal: AbortSignal.timeout(16 * 60 * 1_000),
    });
    created = (await response.json()) as typeof created;
    if (response.status !== 201) throw new Error(`PUBLIC_API_POST_FAILED:${response.status}`);
    if (created.diagnosisId && created.publicToken) {
      const publicResponse = await fetch(
        `${baseUrl}/api/diagnoses/${created.diagnosisId}?publicToken=${created.publicToken}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      publicBody = await publicResponse.text();
      if (!publicResponse.ok) throw new Error(`PUBLIC_API_GET_FAILED:${publicResponse.status}`);
      const parsed = JSON.parse(publicBody) as {
        report?: unknown;
      };
      report = DiagnosisReportSchema.parse(parsed.report);
      const views = presentReport(report);
      reportLanguage = report.reportLanguage;
      quickVisibleCharacters = countQuickVisibleChars(views.quick);
      chineseGuardFailed = !chinesePublicReportGuard(views).ok;
      canonicalProjectionConsistent =
        views.quick.diagnosisId === report.diagnosisId &&
        views.deep.diagnosisId === report.diagnosisId &&
        views.evidence.items.length === report.evidence.length &&
        views.evidence.items.every((item) => report?.evidence.some((source) => source.id === item.id)) &&
        views.quick.overallScore === report.scores.overallScore &&
        views.deep.scores.overallScore === report.scores.overallScore;
      reportCounts = {
        issueCount: report.coreIssues.length,
        opportunityCount: report.geoOpportunities.length,
        demonstrationFixPublished: report.demonstrationFix !== null,
      };
      writeJson(context.paths.sanitizedCanonical, report);

      const usageBeforeViews = readPersistedExecution(context.paths).usage;
      const screens = await captureCompanyScreens(
        `${baseUrl}/report/${created.publicToken}`,
        context.paths,
      );
      mobileOverflow = screens.mobileOverflow;
      printCaptured = screens.printCaptured;
      const usageAfterViews = readPersistedExecution(context.paths).usage;
      viewSwitchProviderDelta = providerCallTotal(usageAfterViews) - providerCallTotal(usageBeforeViews);
    }
  } finally {
    await stopServer(child);
  }

  const persisted = readPersistedExecution(context.paths);
  if (!created.diagnosisId || !report) throw new Error("PERSISTED_REPORT_NOT_AVAILABLE");
  const audit = readPersistedTruthAudit(
    context.paths,
    created.diagnosisId,
    report,
    context.target.slug,
  );
  const publicApiLeak = INTERNAL_PUBLIC_API_FIELDS.some((field) => publicBody.includes(field));
  const sparse = reportCounts.opportunityCount === 0;
  const result: CompanyExecutionResult = {
    target: context.target.slug,
    diagnosisIdShort: created.diagnosisId?.slice(0, 8) ?? null,
    diagnosisCount: persisted.diagnosisCount,
    finalState: persisted.finalState,
    durationMs: Date.now() - started,
    providerUsage: persisted.usage,
    schemaFailure: created.error?.code?.includes("SCHEMA") ?? false,
    safetyFailure: (created.error?.code?.includes("SECURITY") ?? false) || chineseGuardFailed,
    publicApiLeak,
    truthGuardViolation: audit.truthGuardViolation,
    unsupportedPublishedClaimCount: audit.unsupportedPublishedClaimCount,
    scoringWeightsChanged: scoringWeightsChanged(),
    stateMachineAnomaly: created.status !== persisted.finalState,
    databaseConflict: false,
    runLockConflict: false,
    ...reportCounts,
    productYieldStatus: sparse ? "SPARSE_BUT_TRUTHFUL" : "HEALTHY",
    reportLanguage,
    quickVisibleCharacters,
    mobileOverflow,
    printCaptured,
    viewSwitchProviderDelta,
    canonicalProjectionConsistent,
    pruneAuditComplete: audit.pruneAuditComplete,
    crawlerUsageAuditable: audit.crawlerUsageAuditable,
  };
  writeJson(context.paths.providerUsage, persisted.usage);
  writeJson(context.paths.sampleMetrics, {
    diagnosisIdShort: result.diagnosisIdShort,
    finalState: result.finalState,
    durationMs: result.durationMs,
    providerUsage: result.providerUsage,
    issueCount: result.issueCount,
    opportunityCount: result.opportunityCount,
    demonstrationFixPublished: result.demonstrationFixPublished,
    reportLanguage: result.reportLanguage,
    quickVisibleCharacters: result.quickVisibleCharacters,
    mobileOverflow: result.mobileOverflow,
    viewSwitchProviderDelta: result.viewSwitchProviderDelta,
    truthGuardViolation: result.truthGuardViolation,
    unsupportedPublishedClaimCount: result.unsupportedPublishedClaimCount,
    pruneAuditComplete: result.pruneAuditComplete,
    crawlerUsageAuditable: result.crawlerUsageAuditable,
  });
  writeFileSync(
    context.paths.log,
    [
      `${new Date().toISOString()} target=${context.target.slug}`,
      `${new Date().toISOString()} finalState=${result.finalState}`,
      `${new Date().toISOString()} providerCalls=${providerCallTotal(result.providerUsage)} retries=${result.providerUsage.retries}`,
      `${new Date().toISOString()} quickChars=${result.quickVisibleCharacters} mobileOverflow=${result.mobileOverflow}`,
    ].join("\n") + "\n",
    "utf8",
  );
  return result;
}

async function main(): Promise<void> {
  if (process.argv.slice(2).includes("--plan")) {
    process.stdout.write(`${JSON.stringify(buildThreeCompanySamplePlan(), null, 2)}\n`);
    return;
  }
  loadEnvironment();
  const result = await runThreeCompanySampleBatch({
    env: process.env,
    executor: executeCompanyOverIsolatedHttp,
    privateRoot: THREE_COMPANY_SAMPLE_PRIVATE_ROOT,
    verifyRequiredArtifacts: true,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "COMPLETED") process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[three-company-sample] ${message}\n`);
    process.exitCode = 1;
  });
}
