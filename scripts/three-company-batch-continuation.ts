// ============================================================================
// Round-6A ThreeCompanyBatchContinuationV1.
//
// This is an orchestration seam, not an executable Provider client. Importing
// it is inert. Persistence, parent-lock verification and company execution are
// injected so Phase A can prove the invariants without network/private writes.
// ============================================================================

import {
  THREE_COMPANY_SAMPLE_BUDGET,
  THREE_COMPANY_SAMPLE_TARGETS,
  companyStopReasons,
  type BatchTotals,
  type CompanyExecutionResult,
  type ThreeCompanySampleTarget,
} from "./three-company-real-sample";
import {
  ROUND53_SAMPLE_GATE_IDS,
  type CompanySampleMetrics,
  type Round53SampleGateId,
} from "./round53-three-company-sample";

export const THREE_COMPANY_CONTINUATION_VERSION = "three-company-batch-continuation.v1";
export const THREE_COMPANY_CONTINUATION_AUTH_ENV =
  "THREE_COMPANY_SAMPLE_CONTINUATION_AUTHORIZED";
export const THREE_COMPANY_CONTINUATION_ID = "batch-continuation-1";
export const THREE_COMPANY_CONTINUATION_FILENAME = "batch-continuation-1.json";

export const THREE_COMPANY_CONTINUATION_TARGETS = Object.freeze(
  THREE_COMPANY_SAMPLE_TARGETS.filter(
    (target): target is ThreeCompanySampleTarget & { slug: "iflytek" | "heli" } =>
      target.slug === "iflytek" || target.slug === "heli",
  ),
);

export const THREE_COMPANY_CONTINUATION_BUDGET = Object.freeze({
  perCompany: THREE_COMPANY_SAMPLE_BUDGET.perCompany,
  batch: Object.freeze({
    bochaHardMax: 24,
    crawlerHardMax: 24,
    deepseekHardMax: 16,
    retries: 0,
    diagnoses: 2,
  }),
});

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type ContinuationAuthorizationFailure =
  | "CONTINUATION_NOT_AUTHORIZED"
  | "PROVIDER_MODE_NOT_REAL"
  | "SMOKE_MODE_NOT_FALSE"
  | "PROVIDER_CONFIGURATION_MISSING";

export interface ContinuationAuthorizationResult {
  authorized: boolean;
  failures: ContinuationAuthorizationFailure[];
}

/** Server-environment only: there is deliberately no request/body/query input. */
export function assessThreeCompanyContinuationAuthorization(
  env: ServerEnvironment,
): ContinuationAuthorizationResult {
  const failures: ContinuationAuthorizationFailure[] = [];
  if (env[THREE_COMPANY_CONTINUATION_AUTH_ENV] !== "true") {
    failures.push("CONTINUATION_NOT_AUTHORIZED");
  }
  if (env.PROVIDER_MODE !== "REAL") failures.push("PROVIDER_MODE_NOT_REAL");
  if (env.DIAGNOSIS_SMOKE_MODE !== "false") failures.push("SMOKE_MODE_NOT_FALSE");
  if (!env.BOCHA_API_KEY?.trim() || !env.DEEPSEEK_API_KEY?.trim()) {
    failures.push("PROVIDER_CONFIGURATION_MISSING");
  }
  return { authorized: failures.length === 0, failures };
}

export interface ThreeCompanyContinuationPreflightFacts {
  parentBatchId: string;
  parentBatchStatus: "STOPPED" | string;
  parentBatchHash: string;
  acceptedCompletedCompany: "qiaqia";
  acceptedReportRevisionId: string;
  acceptedReportHash: string;
  qiaqiaRevisionTruthGuardPassed: boolean;
  originalQiaqiaCanonicalPreserved: boolean;
  continuationAlreadyExists: boolean;
  existingDiagnosisTargets: readonly string[];
  competitorGapPolicyActiveInNormalRuntime: boolean;
  normalRuntimePersistsAnalysisStageRuns: boolean;
  candidateDecisionAuditComplete: boolean;
}

export type ContinuationPreflightFailure =
  | "QIAQIA_REVISION_TRUTH_GUARD_FAILED"
  | "ORIGINAL_QIAQIA_CANONICAL_NOT_PRESERVED"
  | "PARENT_BATCH_NOT_STOPPED"
  | "CONTINUATION_ALREADY_EXISTS"
  | "IFLYTEK_DIAGNOSIS_ALREADY_EXISTS"
  | "HELI_DIAGNOSIS_ALREADY_EXISTS"
  | "COMPETITOR_GAP_POLICY_NOT_ACTIVE"
  | "NORMAL_RUNTIME_STAGE_PERSISTENCE_MISSING"
  | "CANDIDATE_DECISION_AUDIT_INCOMPLETE"
  | "PARENT_BATCH_ID_MISSING"
  | "PARENT_BATCH_HASH_MISSING"
  | "ACCEPTED_REVISION_ID_MISSING"
  | "ACCEPTED_REVISION_HASH_MISSING";

export interface ContinuationPreflightResult {
  passed: boolean;
  failures: ContinuationPreflightFailure[];
}

export function evaluateThreeCompanyContinuationPreflight(
  facts: ThreeCompanyContinuationPreflightFacts,
): ContinuationPreflightResult {
  const failures: ContinuationPreflightFailure[] = [];
  if (!facts.parentBatchId.trim()) failures.push("PARENT_BATCH_ID_MISSING");
  if (!facts.parentBatchHash.trim()) failures.push("PARENT_BATCH_HASH_MISSING");
  if (!facts.acceptedReportRevisionId.trim()) failures.push("ACCEPTED_REVISION_ID_MISSING");
  if (!facts.acceptedReportHash.trim()) failures.push("ACCEPTED_REVISION_HASH_MISSING");
  if (!facts.qiaqiaRevisionTruthGuardPassed) {
    failures.push("QIAQIA_REVISION_TRUTH_GUARD_FAILED");
  }
  if (!facts.originalQiaqiaCanonicalPreserved) {
    failures.push("ORIGINAL_QIAQIA_CANONICAL_NOT_PRESERVED");
  }
  if (facts.parentBatchStatus !== "STOPPED") failures.push("PARENT_BATCH_NOT_STOPPED");
  if (facts.continuationAlreadyExists) failures.push("CONTINUATION_ALREADY_EXISTS");
  if (facts.existingDiagnosisTargets.includes("iflytek")) {
    failures.push("IFLYTEK_DIAGNOSIS_ALREADY_EXISTS");
  }
  if (facts.existingDiagnosisTargets.includes("heli")) {
    failures.push("HELI_DIAGNOSIS_ALREADY_EXISTS");
  }
  if (!facts.competitorGapPolicyActiveInNormalRuntime) {
    failures.push("COMPETITOR_GAP_POLICY_NOT_ACTIVE");
  }
  if (!facts.normalRuntimePersistsAnalysisStageRuns) {
    failures.push("NORMAL_RUNTIME_STAGE_PERSISTENCE_MISSING");
  }
  if (!facts.candidateDecisionAuditComplete) {
    failures.push("CANDIDATE_DECISION_AUDIT_INCOMPLETE");
  }
  return { passed: failures.length === 0, failures };
}

export type ContinuationAuthorizationStatus = "AUTHORIZED" | "NOT_AUTHORIZED";
export type ContinuationStatus = "RUNNING" | "COMPLETED" | "STOPPED";

export interface ThreeCompanyContinuationRecord {
  continuationVersion: typeof THREE_COMPANY_CONTINUATION_VERSION;
  continuationId: typeof THREE_COMPANY_CONTINUATION_ID;
  parentBatchId: string;
  parentBatchStatus: "STOPPED";
  parentBatchHash: string;
  acceptedCompletedCompany: "qiaqia";
  acceptedReportRevisionId: string;
  acceptedReportHash: string;
  remainingTargets: readonly ["iflytek", "heli"];
  authorizationStatus: ContinuationAuthorizationStatus;
  status: ContinuationStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stopReason: string | null;
  providerBudget: typeof THREE_COMPANY_CONTINUATION_BUDGET;
  diagnosisBudget: Readonly<{ maximumNewDiagnoses: 2; retries: 0 }>;
  completedTargets: Array<"iflytek" | "heli">;
  totals: BatchTotals;
}

export interface ThreeCompanyContinuationPlan {
  continuationVersion: typeof THREE_COMPANY_CONTINUATION_VERSION;
  mode: "PLAN_ONLY";
  authorizationDefault: false;
  realProviderCalls: 0;
  newDiagnoses: 0;
  privateWrites: 0;
  remainingTargets: readonly ["iflytek", "heli"];
  providerBudget: typeof THREE_COMPANY_CONTINUATION_BUDGET;
  diagnosisBudget: Readonly<{ maximumNewDiagnoses: 2; retries: 0 }>;
}

export function buildThreeCompanyContinuationPlan(): ThreeCompanyContinuationPlan {
  return {
    continuationVersion: THREE_COMPANY_CONTINUATION_VERSION,
    mode: "PLAN_ONLY",
    authorizationDefault: false,
    realProviderCalls: 0,
    newDiagnoses: 0,
    privateWrites: 0,
    remainingTargets: ["iflytek", "heli"],
    providerBudget: THREE_COMPANY_CONTINUATION_BUDGET,
    diagnosisBudget: { maximumNewDiagnoses: 2, retries: 0 },
  };
}

export interface ContinuationCompanyResult extends CompanyExecutionResult {
  target: "iflytek" | "heli";
  competitorGapTruthViolation: boolean;
  publicationDecisionComplete: boolean;
  candidateSourceAuditable: boolean;
}

export interface ContinuationExecutionContext {
  target: (typeof THREE_COMPANY_CONTINUATION_TARGETS)[number];
  ordinal: 1 | 2;
  /** Already authorized server environment; never sourced from a public request. */
  serverEnvironment: ServerEnvironment;
}

export type ContinuationCompanyExecutor = (
  context: ContinuationExecutionContext,
) => Promise<ContinuationCompanyResult>;

/**
 * The store owns only the new continuation ledger. It intentionally exposes no
 * method that can update/delete/recover the original batch lock.
 */
export interface ThreeCompanyContinuationStore {
  create(record: ThreeCompanyContinuationRecord): Promise<void>;
  update(record: ThreeCompanyContinuationRecord): Promise<void>;
  assertParentBatchUnchanged(expectedParentBatchHash: string): Promise<boolean>;
}

export interface RunThreeCompanyContinuationOptions {
  env: ServerEnvironment;
  preflight: ThreeCompanyContinuationPreflightFacts;
  store: ThreeCompanyContinuationStore;
  executor: ContinuationCompanyExecutor;
  now?: () => string;
}

export interface ThreeCompanyContinuationResult {
  record: ThreeCompanyContinuationRecord;
  results: ContinuationCompanyResult[];
}

function zeroTotals(): BatchTotals {
  return { bocha: 0, crawler: 0, deepseek: 0, retries: 0, diagnoses: 0 };
}

function addResult(totals: BatchTotals, result: ContinuationCompanyResult): void {
  totals.bocha += result.providerUsage.bocha;
  totals.crawler += result.providerUsage.crawler;
  totals.deepseek += result.providerUsage.deepseek;
  totals.retries += result.providerUsage.retries;
  totals.diagnoses += result.diagnosisCount;
}

export function continuationBatchBudgetStopReasons(totals: BatchTotals): string[] {
  const budget = THREE_COMPANY_CONTINUATION_BUDGET.batch;
  const reasons: string[] = [];
  if (totals.bocha > budget.bochaHardMax) reasons.push("BOCHA_CONTINUATION_BUDGET_EXCEEDED");
  if (totals.crawler > budget.crawlerHardMax) reasons.push("CRAWLER_CONTINUATION_BUDGET_EXCEEDED");
  if (totals.deepseek > budget.deepseekHardMax) reasons.push("DEEPSEEK_CONTINUATION_BUDGET_EXCEEDED");
  if (totals.retries !== 0) reasons.push("CONTINUATION_RETRY_VIOLATION");
  if (totals.diagnoses > budget.diagnoses) reasons.push("CONTINUATION_DIAGNOSIS_BUDGET_EXCEEDED");
  return reasons;
}

export function continuationCompanyStopReasons(result: ContinuationCompanyResult): string[] {
  const reasons = companyStopReasons(result);
  if (result.competitorGapTruthViolation) reasons.push("COMPETITOR_GAP_TRUTH_VIOLATION");
  if (!result.publicationDecisionComplete) reasons.push("PUBLICATION_DECISION_INCOMPLETE");
  if (!result.candidateSourceAuditable) reasons.push("CANDIDATE_SOURCE_NOT_AUDITABLE");
  return [...new Set(reasons)];
}

function makeRecord(
  facts: ThreeCompanyContinuationPreflightFacts,
  now: string,
): ThreeCompanyContinuationRecord {
  return {
    continuationVersion: THREE_COMPANY_CONTINUATION_VERSION,
    continuationId: THREE_COMPANY_CONTINUATION_ID,
    parentBatchId: facts.parentBatchId,
    parentBatchStatus: "STOPPED",
    parentBatchHash: facts.parentBatchHash,
    acceptedCompletedCompany: "qiaqia",
    acceptedReportRevisionId: facts.acceptedReportRevisionId,
    acceptedReportHash: facts.acceptedReportHash,
    remainingTargets: ["iflytek", "heli"],
    authorizationStatus: "AUTHORIZED",
    status: "RUNNING",
    createdAt: now,
    startedAt: now,
    completedAt: null,
    stopReason: null,
    providerBudget: THREE_COMPANY_CONTINUATION_BUDGET,
    diagnosisBudget: { maximumNewDiagnoses: 2, retries: 0 },
    completedTargets: [],
    totals: zeroTotals(),
  };
}

function stoppedRecord(
  record: ThreeCompanyContinuationRecord,
  completedAt: string,
  stopReason: string,
): ThreeCompanyContinuationRecord {
  return { ...record, status: "STOPPED", completedAt, stopReason };
}

export async function runThreeCompanyBatchContinuation(
  options: RunThreeCompanyContinuationOptions,
): Promise<ThreeCompanyContinuationResult> {
  const authorization = assessThreeCompanyContinuationAuthorization(options.env);
  if (!authorization.authorized) {
    throw new Error(`THREE_COMPANY_CONTINUATION_NOT_AUTHORIZED:${authorization.failures.join(",")}`);
  }
  const preflight = evaluateThreeCompanyContinuationPreflight(options.preflight);
  if (!preflight.passed) {
    throw new Error(`THREE_COMPANY_CONTINUATION_PREFLIGHT_FAILED:${preflight.failures.join(",")}`);
  }

  const now = options.now ?? (() => new Date().toISOString());
  let record = makeRecord(options.preflight, now());
  const results: ContinuationCompanyResult[] = [];
  await options.store.create(record);

  for (const [index, target] of THREE_COMPANY_CONTINUATION_TARGETS.entries()) {
    if (!(await options.store.assertParentBatchUnchanged(record.parentBatchHash))) {
      record = stoppedRecord(record, now(), "PARENT_BATCH_MUTATED");
      await options.store.update(record);
      return { record, results };
    }

    let result: ContinuationCompanyResult;
    try {
      result = await options.executor({
        target,
        ordinal: (index + 1) as 1 | 2,
        serverEnvironment: options.env,
      });
    } catch {
      record = stoppedRecord(record, now(), `${target.slug}:EXECUTOR_FAILURE`);
      await options.store.update(record);
      return { record, results };
    }
    if (result.target !== target.slug) {
      record = stoppedRecord(record, now(), `${target.slug}:EXECUTOR_TARGET_MISMATCH`);
      await options.store.update(record);
      return { record, results };
    }

    results.push(result);
    addResult(record.totals, result);
    const reasons = [
      ...continuationCompanyStopReasons(result),
      ...continuationBatchBudgetStopReasons(record.totals),
    ];
    if (reasons.length > 0) {
      record = stoppedRecord(record, now(), reasons.map((reason) => `${target.slug}:${reason}`).join(","));
      await options.store.update(record);
      return { record, results };
    }
    record.completedTargets.push(target.slug);
    await options.store.update(record);
  }

  if (!(await options.store.assertParentBatchUnchanged(record.parentBatchHash))) {
    record = stoppedRecord(record, now(), "PARENT_BATCH_MUTATED");
  } else if (record.totals.diagnoses !== 2 || record.completedTargets.length !== 2) {
    record = stoppedRecord(record, now(), "CONTINUATION_DIAGNOSIS_BUDGET_NOT_EXACT");
  } else {
    record = { ...record, status: "COMPLETED", completedAt: now(), stopReason: null };
  }
  await options.store.update(record);
  return { record, results };
}

export type AggregateGateStatus = "PASS" | "FAIL" | "NOT_EVALUABLE";

export interface ThreeCompanyAggregateInput {
  company: "qiaqia" | "iflytek" | "heli";
  reportSource: "LATEST_APPEND_ONLY_REVISION" | "CANONICAL";
  reportId: string;
  reportHash: string;
  metrics: CompanySampleMetrics;
}

export interface ThreeCompanyAggregateGate {
  id: Round53SampleGateId;
  status: AggregateGateStatus;
  reason: string;
}

export interface ThreeCompanyAggregateEvaluation {
  sampleStatus: AggregateGateStatus;
  completeCompanyCount: number;
  missingCompanies: Array<"qiaqia" | "iflytek" | "heli">;
  gates: ThreeCompanyAggregateGate[];
}

const FINAL_COMPANY_ORDER = ["qiaqia", "iflytek", "heli"] as const;

function incompleteStatus(hardViolation: boolean): AggregateGateStatus {
  return hardViolation ? "FAIL" : "NOT_EVALUABLE";
}

export function evaluateThreeCompanyAggregateGates(
  inputs: readonly ThreeCompanyAggregateInput[],
): ThreeCompanyAggregateEvaluation {
  const byCompany = new Map(inputs.map((input) => [input.company, input]));
  if (byCompany.size !== inputs.length) throw new Error("DUPLICATE_AGGREGATE_COMPANY");
  for (const input of inputs) {
    if (input.metrics.companyId !== input.company) throw new Error("AGGREGATE_COMPANY_ID_MISMATCH");
    if (!input.reportId.trim() || !input.reportHash.trim()) throw new Error("AGGREGATE_REPORT_IDENTITY_MISSING");
    if (input.company === "qiaqia" && input.reportSource !== "LATEST_APPEND_ONLY_REVISION") {
      throw new Error("QIAQIA_AGGREGATE_MUST_USE_LATEST_REVISION");
    }
    if (input.company !== "qiaqia" && input.reportSource !== "CANONICAL") {
      throw new Error("CONTINUATION_AGGREGATE_MUST_USE_CANONICAL");
    }
  }
  const missingCompanies = FINAL_COMPANY_ORDER.filter((company) => !byCompany.has(company));
  const metrics = inputs.map((input) => input.metrics);
  const complete = missingCompanies.length === 0;
  const truthPassCount = metrics.filter((metric) => metric.truthGuardPassed).length;
  const unsupportedCount = metrics.reduce((sum, metric) => sum + metric.publishedUnsupportedClaimCount, 0);
  const quickPassCount = metrics.filter((metric) => metric.quickVisibleCharacters <= 1800).length;
  const viewSwitchCalls = metrics.reduce((sum, metric) => sum + metric.providerCalls.viewSwitchAdditional, 0);
  const lineageInvalidCount = metrics.reduce(
    (sum, metric) => sum + metric.publishedOpportunityLineageInvalidCount,
    0,
  );
  const credibleOpportunityCompanies = metrics.filter((metric) => metric.hasCredibleOpportunity).length;
  const credibleFixCompanies = metrics.filter((metric) => metric.credibleDemonstrationFix).length;
  const genericOpportunityCandidates = metrics.reduce(
    (sum, metric) => sum + metric.genericOpportunityCandidateCount,
    0,
  );
  const sparseTruthfulCompanies = metrics.filter((metric) => metric.sparseButTruthful).length;

  const statuses: Record<Round53SampleGateId, AggregateGateStatus> = {
    ALL_TRUTH_GUARDS_PASS: complete
      ? truthPassCount === 3 ? "PASS" : "FAIL"
      : incompleteStatus(metrics.some((metric) => !metric.truthGuardPassed)),
    NO_UNSUPPORTED_PUBLISHED_CLAIMS: complete
      ? unsupportedCount === 0 ? "PASS" : "FAIL"
      : incompleteStatus(unsupportedCount > 0),
    ALL_QUICK_WITHIN_1800: complete
      ? quickPassCount === 3 ? "PASS" : "FAIL"
      : incompleteStatus(metrics.some((metric) => metric.quickVisibleCharacters > 1800)),
    ALL_VIEW_SWITCHES_ZERO_PROVIDER_CALLS: complete
      ? viewSwitchCalls === 0 ? "PASS" : "FAIL"
      : incompleteStatus(viewSwitchCalls > 0),
    ALL_PUBLISHED_OPPORTUNITY_LINEAGE_VALID: complete
      ? lineageInvalidCount === 0 ? "PASS" : "FAIL"
      : incompleteStatus(lineageInvalidCount > 0),
    AT_LEAST_TWO_COMPANIES_HAVE_CREDIBLE_OPPORTUNITY: complete
      ? credibleOpportunityCompanies >= 2 ? "PASS" : "FAIL"
      : "NOT_EVALUABLE",
    AT_LEAST_ONE_COMPANY_HAS_CREDIBLE_DEMONSTRATION_FIX: complete
      ? credibleFixCompanies >= 1 ? "PASS" : "FAIL"
      : "NOT_EVALUABLE",
    NO_GENERIC_TEMPLATE_OPPORTUNITY_CANDIDATES: complete
      ? genericOpportunityCandidates === 0 ? "PASS" : "FAIL"
      : incompleteStatus(genericOpportunityCandidates > 0),
    OPPORTUNITY_NOT_REQUIRED_FOR_EVERY_COMPANY: complete
      ? credibleOpportunityCompanies >= 2 ? "PASS" : "FAIL"
      : "NOT_EVALUABLE",
    SPARSE_REPORT_IS_NOT_SYSTEM_FAILURE: complete
      ? sparseTruthfulCompanies === 0 || truthPassCount === 3 ? "PASS" : "FAIL"
      : "NOT_EVALUABLE",
  };
  const gates = ROUND53_SAMPLE_GATE_IDS.map((id) => ({
    id,
    status: statuses[id],
    reason: complete
      ? `evaluated from qiaqia latest revision plus ${inputs.length - 1} continuation Canonical reports`
      : statuses[id] === "FAIL"
        ? `hard violation observed in ${inputs.length}/3 completed companies`
        : `requires complete 3-company data; missing ${missingCompanies.join(",")}`,
  }));
  const sampleStatus = gates.some((gate) => gate.status === "FAIL")
    ? "FAIL"
    : gates.every((gate) => gate.status === "PASS")
      ? "PASS"
      : "NOT_EVALUABLE";
  return { sampleStatus, completeCompanyCount: inputs.length, missingCompanies, gates };
}

export const PUBLIC_API_FORBIDDEN_INTERNAL_KEYS = Object.freeze([
  "continuationId",
  "acceptedReportRevisionId",
  "acceptedReportHash",
  "publicationDecisions",
  "candidateSourceProvenance",
  "legacyCheckpointId",
  "stageRunId",
] as const);

/** Defense-in-depth assertion for a public API projection assembled elsewhere. */
export function publicApiInternalAuditLeakKeys(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      if ((PUBLIC_API_FORBIDDEN_INTERNAL_KEYS as readonly string[]).includes(key)) found.add(key);
      visit(nested);
    }
  };
  visit(value);
  return [...found].sort();
}
