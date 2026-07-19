import { pathToFileURL } from "node:url";

/** Round-5.2C is a new frozen-Evidence reanalysis, never a Diagnosis restart. */
export const FROZEN_EVIDENCE_REANALYSIS_MODE = "FROZEN_EVIDENCE_REANALYSIS" as const;
export const FROZEN_EVIDENCE_REANALYSIS_DIAGNOSIS_ID = "diag_d9d";
export const REANALYSIS_MODE_ENV = "DIAGNOSIS_RECOVERY_MODE";
export const REANALYSIS_AUTH_ENV = "TECHNICAL_CANARY_REPAIR_AUTHORIZED";

export const REANALYSIS_STAGES = [
  "REPORT_PROFILE",
  "REPORT_SCORING",
  "REPORT_AI_VISIBILITY",
  "REPORT_CLAIMS",
] as const;
export type ReanalysisStage = (typeof REANALYSIS_STAGES)[number];

/**
 * Structural mirror of Agent Q's strict FrozenEvidenceSnapshotV1. The
 * integration loader must call Q's parser and Insta360 identity assertion
 * before returning this value; the Runner never accepts unparsed JSON.
 */
export interface FrozenEvidenceSnapshotV1View {
  diagnosisId: string;
  evidenceCount: number;
  firstPartyEvidenceCount: number;
  observedEvidenceCount: number;
  competitorEvidenceCount: number;
  languageDistribution: { zh: number; other: number };
  sourceTierDistribution: { A: number; B: number; C: number; D: number; E: number };
  diagnosisInputHash: string;
  evidenceRegistryHash: string;
  normalizedEvidenceHash: string;
  sortedEvidenceIdsHash: string;
  evidenceUrlsHash: string;
  databaseFileHash: string;
  runLockHash: string;
  capturedAt: string;
  recoveryContractVersion: "frozen-evidence-reanalysis.v1";
  queryPlanProvenance: "UNAVAILABLE";
  competitorResolutionProvenance: "UNAVAILABLE";
}

export interface FrozenDiagnosisState {
  diagnosisId: string;
  status: string;
  phase: string | null;
  failureCode: string | null;
  evidenceCount: number;
  repairAttemptCount: number;
  diagnosisCount: number;
}

export interface ReanalysisUsage {
  bochaCalls: number;
  crawlerCalls: number;
  deepSeekCalls: number;
  retries: number;
}

export interface FrozenActivityCounts {
  evidence: number;
  searchRecords: number;
  crawlerRecords: number;
}

export interface ReanalysisRuntimePlan {
  diagnosisId: string;
  recoveryMode: typeof FROZEN_EVIDENCE_REANALYSIS_MODE;
  reusedStages: readonly ["EVIDENCE_REGISTRY"];
  rerunStages: readonly ReanalysisStage[];
  deepSeekCallCap: number;
  retries: 0;
  snapshot: FrozenEvidenceSnapshotV1View;
  snapshotHash: string;
}

export interface ReanalysisDeepSeekInput {
  diagnosisId: string;
  stage: ReanalysisStage;
  stageInput: unknown;
}

export interface ReanalysisFinalizerInput {
  diagnosisId: string;
  stageOutputs: Readonly<Record<ReanalysisStage, unknown>>;
}

export type ReanalysisDeepSeekSeam = (
  input: ReanalysisDeepSeekInput,
) => Promise<{ rawJson: string }>;
export type ReanalysisFinalizerSeam = (
  input: ReanalysisFinalizerInput,
) => Promise<{ resultState: "READY" }>;

export interface ReanalysisRuntimeResult {
  diagnosisId: string;
  finalStatus: "READY" | string;
  repairAttempt: number;
  originalFailurePreserved: boolean;
  repairTimeline: readonly string[];
}

export interface ReportPageVerification {
  quickRendered: boolean;
  deepRendered: boolean;
  evidenceRendered: boolean;
  reportLanguage: string;
  quickCharacterCount: number;
  mobileViewportWidth: number;
  mobileHorizontalOverflow: boolean;
  evidenceCount: number;
}

export interface FrozenEvidenceReanalysisDependencies {
  /** Agent Q parser/identity assertion belongs behind this read-only loader. */
  loadFrozenEvidenceSnapshot(): Promise<FrozenEvidenceSnapshotV1View>;
  loadDiagnosis(diagnosisId: string): Promise<FrozenDiagnosisState>;
  /** Agent R read-only preflight/plan. */
  prepareRuntime(input: {
    diagnosisId: string;
    recoveryMode: typeof FROZEN_EVIDENCE_REANALYSIS_MODE;
    snapshot: FrozenEvidenceSnapshotV1View;
  }): Promise<ReanalysisRuntimePlan>;
  /** Agent R one-shot execution. No retry loop is permitted around this call. */
  executeRuntime(input: {
    plan: ReanalysisRuntimePlan;
    snapshot: FrozenEvidenceSnapshotV1View;
    invokeDeepSeekStage: ReanalysisDeepSeekSeam;
    finalizeRecoveredAnalysis: ReanalysisFinalizerSeam;
  }): Promise<ReanalysisRuntimeResult>;
  invokeDeepSeekStage: ReanalysisDeepSeekSeam;
  finalizeRecoveredAnalysis: ReanalysisFinalizerSeam;
  readUsage(diagnosisId: string): Promise<ReanalysisUsage>;
  readFrozenActivity(diagnosisId: string): Promise<FrozenActivityCounts>;
  readDiagnosisCount(): Promise<number>;
  readPublicApiPayload(diagnosisId: string): Promise<unknown>;
  verifyReportPages(diagnosisId: string): Promise<ReportPageVerification>;
  printSanitizedPlan(plan: SanitizedFrozenEvidenceReanalysisPlan): void;
}

export type FrozenEvidenceReanalysisBlockCode =
  | "REANALYSIS_MODE_REQUIRED"
  | "REANALYSIS_NOT_AUTHORIZED"
  | "SNAPSHOT_VERSION_MISMATCH"
  | "SNAPSHOT_DIAGNOSIS_MISMATCH"
  | "SNAPSHOT_HASH_MISSING"
  | "SNAPSHOT_CAPTURE_TIME_INVALID"
  | "SNAPSHOT_DISTRIBUTION_MISMATCH"
  | "SNAPSHOT_PROVENANCE_MISMATCH"
  | "DIAGNOSIS_MISMATCH"
  | "ORIGINAL_FAILURE_MISMATCH"
  | "EVIDENCE_COUNT_MISMATCH"
  | "REPAIR_ATTEMPT_ALREADY_EXISTS"
  | "RUNTIME_PLAN_MISMATCH"
  | "SNAPSHOT_CHANGED"
  | "BOCHA_CALL_FORBIDDEN"
  | "CRAWLER_CALL_FORBIDDEN"
  | "DEEPSEEK_BUDGET_EXCEEDED"
  | "AUTOMATIC_RETRY_FORBIDDEN"
  | "NEW_DIAGNOSIS_FORBIDDEN"
  | "NEW_EVIDENCE_FORBIDDEN"
  | "NEW_SEARCH_RECORD_FORBIDDEN"
  | "NEW_CRAWLER_RECORD_FORBIDDEN"
  | "ORIGINAL_FAILURE_NOT_PRESERVED"
  | "REPAIR_ATTEMPT_MISMATCH"
  | "REPAIR_TIMELINE_MISSING"
  | "FINAL_STATE_NOT_READY"
  | "RUNTIME_RESULT_DIAGNOSIS_MISMATCH"
  | "PUBLIC_API_REANALYSIS_LEAK"
  | "QUICK_PAGE_MISSING"
  | "DEEP_PAGE_MISSING"
  | "EVIDENCE_PAGE_MISSING"
  | "REPORT_LANGUAGE_MISMATCH"
  | "QUICK_REPORT_TOO_LONG"
  | "MOBILE_VIEWPORT_NOT_390"
  | "MOBILE_HORIZONTAL_OVERFLOW"
  | "PUBLIC_EVIDENCE_COUNT_MISMATCH";

export class FrozenEvidenceReanalysisRunnerError extends Error {
  constructor(readonly code: FrozenEvidenceReanalysisBlockCode) {
    super(code);
    this.name = "FrozenEvidenceReanalysisRunnerError";
  }
}

export interface SanitizedFrozenEvidenceReanalysisPlan {
  diagnosisId: string;
  mode: typeof FROZEN_EVIDENCE_REANALYSIS_MODE;
  authorized: boolean;
  originalFailureEligible: boolean;
  snapshot: {
    recoveryContractVersion: "frozen-evidence-reanalysis.v1";
    evidenceCount: number;
    identityFieldsPresent: boolean;
  };
  rerunStages: readonly ReanalysisStage[];
  providerBudget: {
    bocha: 0;
    crawler: 0;
    deepSeek: 4;
    retries: 0;
    newDiagnoses: 0;
  };
  blockedBy: readonly FrozenEvidenceReanalysisBlockCode[];
}

const HASH_FIELDS: ReadonlyArray<keyof FrozenEvidenceSnapshotV1View> = [
  "diagnosisInputHash",
  "evidenceRegistryHash",
  "normalizedEvidenceHash",
  "sortedEvidenceIdsHash",
  "evidenceUrlsHash",
  "databaseFileHash",
  "runLockHash",
];

function hasAllHashes(snapshot: FrozenEvidenceSnapshotV1View): boolean {
  return HASH_FIELDS.every((key) => /^[a-f0-9]{64}$/u.test(String(snapshot[key])));
}

function isExplicitlyEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return (
    env[REANALYSIS_MODE_ENV] === FROZEN_EVIDENCE_REANALYSIS_MODE &&
    env[REANALYSIS_AUTH_ENV] === "true"
  );
}

export function buildSanitizedFrozenEvidenceReanalysisPlan(
  snapshot: FrozenEvidenceSnapshotV1View,
  diagnosis: FrozenDiagnosisState,
  env: Readonly<Record<string, string | undefined>>,
): SanitizedFrozenEvidenceReanalysisPlan {
  const blockedBy: FrozenEvidenceReanalysisBlockCode[] = [];
  const authorized = isExplicitlyEnabled(env);
  const originalFailureEligible =
    diagnosis.status === "FAILED" &&
    diagnosis.phase === "ANALYZING" &&
    diagnosis.failureCode === "REPORT_CLAIMS_FAILED";
  const identitiesPresent = hasAllHashes(snapshot);

  if (env[REANALYSIS_MODE_ENV] !== FROZEN_EVIDENCE_REANALYSIS_MODE) {
    blockedBy.push("REANALYSIS_MODE_REQUIRED");
  }
  if (env[REANALYSIS_AUTH_ENV] !== "true") blockedBy.push("REANALYSIS_NOT_AUTHORIZED");
  if (snapshot.recoveryContractVersion !== "frozen-evidence-reanalysis.v1") {
    blockedBy.push("SNAPSHOT_VERSION_MISMATCH");
  }
  if (!snapshot.diagnosisId.startsWith(FROZEN_EVIDENCE_REANALYSIS_DIAGNOSIS_ID)) {
    blockedBy.push("SNAPSHOT_DIAGNOSIS_MISMATCH");
  }
  if (!identitiesPresent) blockedBy.push("SNAPSHOT_HASH_MISSING");
  if (!Number.isFinite(Date.parse(snapshot.capturedAt))) {
    blockedBy.push("SNAPSHOT_CAPTURE_TIME_INVALID");
  }
  if (snapshot.evidenceCount !== 22 || diagnosis.evidenceCount !== 22) {
    blockedBy.push("EVIDENCE_COUNT_MISMATCH");
  }
  const sourceCount =
    snapshot.firstPartyEvidenceCount +
    snapshot.observedEvidenceCount +
    snapshot.competitorEvidenceCount;
  const languageCount = snapshot.languageDistribution.zh + snapshot.languageDistribution.other;
  const tierCount = Object.values(snapshot.sourceTierDistribution).reduce(
    (total, count) => total + count,
    0,
  );
  if (
    sourceCount !== snapshot.evidenceCount ||
    languageCount !== snapshot.evidenceCount ||
    tierCount !== snapshot.evidenceCount
  ) {
    blockedBy.push("SNAPSHOT_DISTRIBUTION_MISMATCH");
  }
  if (
    snapshot.queryPlanProvenance !== "UNAVAILABLE" ||
    snapshot.competitorResolutionProvenance !== "UNAVAILABLE"
  ) {
    blockedBy.push("SNAPSHOT_PROVENANCE_MISMATCH");
  }
  if (
    !diagnosis.diagnosisId.startsWith(FROZEN_EVIDENCE_REANALYSIS_DIAGNOSIS_ID) ||
    diagnosis.diagnosisId !== snapshot.diagnosisId
  ) {
    blockedBy.push("DIAGNOSIS_MISMATCH");
  }
  if (!originalFailureEligible) blockedBy.push("ORIGINAL_FAILURE_MISMATCH");
  if (diagnosis.repairAttemptCount !== 0) blockedBy.push("REPAIR_ATTEMPT_ALREADY_EXISTS");

  return {
    diagnosisId: diagnosis.diagnosisId,
    mode: FROZEN_EVIDENCE_REANALYSIS_MODE,
    authorized,
    originalFailureEligible,
    snapshot: {
      recoveryContractVersion: "frozen-evidence-reanalysis.v1",
      evidenceCount: snapshot.evidenceCount,
      identityFieldsPresent: identitiesPresent,
    },
    rerunStages: REANALYSIS_STAGES,
    providerBudget: {
      bocha: 0,
      crawler: 0,
      deepSeek: 4,
      retries: 0,
      newDiagnoses: 0,
    },
    blockedBy,
  };
}

function assertRuntimePlan(
  plan: ReanalysisRuntimePlan,
  resolvedDiagnosisId: string,
  snapshot: FrozenEvidenceSnapshotV1View,
): void {
  const exactStages =
    plan.rerunStages.length === REANALYSIS_STAGES.length &&
    plan.rerunStages.every((stage, index) => stage === REANALYSIS_STAGES[index]);
  if (
    plan.diagnosisId !== resolvedDiagnosisId ||
    plan.recoveryMode !== FROZEN_EVIDENCE_REANALYSIS_MODE ||
    plan.reusedStages.length !== 1 ||
    plan.reusedStages[0] !== "EVIDENCE_REGISTRY" ||
    plan.deepSeekCallCap !== 4 ||
    plan.retries !== 0 ||
    !/^[a-f0-9]{64}$/u.test(plan.snapshotHash) ||
    snapshotIdentity(plan.snapshot) !== snapshotIdentity(snapshot) ||
    !exactStages
  ) {
    throw new FrozenEvidenceReanalysisRunnerError("RUNTIME_PLAN_MISMATCH");
  }
}

function snapshotIdentity(snapshot: FrozenEvidenceSnapshotV1View): string {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  };
  return canonical(snapshot);
}

function usageDelta(after: ReanalysisUsage, before: ReanalysisUsage): ReanalysisUsage {
  return {
    bochaCalls: after.bochaCalls - before.bochaCalls,
    crawlerCalls: after.crawlerCalls - before.crawlerCalls,
    deepSeekCalls: after.deepSeekCalls - before.deepSeekCalls,
    retries: after.retries - before.retries,
  };
}

const PUBLIC_LEAK_KEYS = new Set(
  [
    "recoveryMode",
    "coverageMode",
    "frozenEvidenceSnapshot",
    "snapshotEvidenceRegistryHash",
    "queryPlanProvenance",
    "competitorResolutionProvenance",
    "competitorResolutionStatus",
    "recoveryContractVersion",
    "databaseFileHash",
    "runLockHash",
    "repairAttempt",
    "repairTimeline",
    "reusedStages",
    "rerunStages",
    "analysisStageRuns",
    "providerBudget",
    "deepSeekCallCap",
  ].map((key) => key.toLowerCase()),
);

export function assertNoFrozenEvidenceReanalysisLeak(
  payload: unknown,
  snapshot: FrozenEvidenceSnapshotV1View,
): void {
  const forbiddenValues = [
    FROZEN_EVIDENCE_REANALYSIS_MODE,
    "FROZEN_EVIDENCE_SCOPE_ONLY",
    "UNVERIFIED_LEGACY_STATE",
    "REPORT_CLAIMS_FAILED",
    REANALYSIS_MODE_ENV,
    REANALYSIS_AUTH_ENV,
    ...HASH_FIELDS.map((key) => String(snapshot[key])),
  ];
  const seen = new Set<object>();
  const leaks = (value: unknown): boolean => {
    if (typeof value === "string") {
      return forbiddenValues.some((forbidden) => value.includes(forbidden));
    }
    if (!value || typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some(leaks);
    return Object.entries(value).some(
      ([key, child]) => PUBLIC_LEAK_KEYS.has(key.toLowerCase()) || leaks(child),
    );
  };
  if (leaks(payload)) throw new FrozenEvidenceReanalysisRunnerError("PUBLIC_API_REANALYSIS_LEAK");
}

export function assertReportPagesVerified(result: ReportPageVerification): void {
  if (!result.quickRendered) throw new FrozenEvidenceReanalysisRunnerError("QUICK_PAGE_MISSING");
  if (!result.deepRendered) throw new FrozenEvidenceReanalysisRunnerError("DEEP_PAGE_MISSING");
  if (!result.evidenceRendered) {
    throw new FrozenEvidenceReanalysisRunnerError("EVIDENCE_PAGE_MISSING");
  }
  if (result.reportLanguage !== "zh-CN") {
    throw new FrozenEvidenceReanalysisRunnerError("REPORT_LANGUAGE_MISMATCH");
  }
  if (result.quickCharacterCount > 1800) {
    throw new FrozenEvidenceReanalysisRunnerError("QUICK_REPORT_TOO_LONG");
  }
  if (result.mobileViewportWidth !== 390) {
    throw new FrozenEvidenceReanalysisRunnerError("MOBILE_VIEWPORT_NOT_390");
  }
  if (result.mobileHorizontalOverflow) {
    throw new FrozenEvidenceReanalysisRunnerError("MOBILE_HORIZONTAL_OVERFLOW");
  }
  if (result.evidenceCount !== 22) {
    throw new FrozenEvidenceReanalysisRunnerError("PUBLIC_EVIDENCE_COUNT_MISMATCH");
  }
}

export interface FrozenEvidenceReanalysisOutcome {
  plan: SanitizedFrozenEvidenceReanalysisPlan;
  result: ReanalysisRuntimeResult;
  usageDelta: ReanalysisUsage;
  pages: ReportPageVerification;
}

export async function runFrozenEvidenceReanalysis(
  deps: FrozenEvidenceReanalysisDependencies,
): Promise<FrozenEvidenceReanalysisOutcome> {
  const snapshotBefore = await deps.loadFrozenEvidenceSnapshot();
  const diagnosis = await deps.loadDiagnosis(FROZEN_EVIDENCE_REANALYSIS_DIAGNOSIS_ID);
  // Execution authorization is deliberately process-only. Unlike the pure
  // planning helper, this function exposes no env/body/options parameter.
  const sanitized = buildSanitizedFrozenEvidenceReanalysisPlan(
    snapshotBefore,
    diagnosis,
    process.env,
  );
  deps.printSanitizedPlan(sanitized);
  if (sanitized.blockedBy.length > 0) {
    throw new FrozenEvidenceReanalysisRunnerError(sanitized.blockedBy[0]!);
  }

  const runtimePlan = await deps.prepareRuntime({
    diagnosisId: diagnosis.diagnosisId,
    recoveryMode: FROZEN_EVIDENCE_REANALYSIS_MODE,
    snapshot: snapshotBefore,
  });
  assertRuntimePlan(runtimePlan, diagnosis.diagnosisId, snapshotBefore);

  const usageBefore = await deps.readUsage(diagnosis.diagnosisId);
  const activityBefore = await deps.readFrozenActivity(diagnosis.diagnosisId);
  const diagnosisCountBefore = await deps.readDiagnosisCount();
  let result: ReanalysisRuntimeResult | undefined;
  let runtimeError: unknown;
  try {
    result = await deps.executeRuntime({
      plan: runtimePlan,
      snapshot: snapshotBefore,
      invokeDeepSeekStage: deps.invokeDeepSeekStage,
      finalizeRecoveredAnalysis: deps.finalizeRecoveredAnalysis,
    });
  } catch (error) {
    runtimeError = error;
  }

  const usageAfter = await deps.readUsage(diagnosis.diagnosisId);
  const activityAfter = await deps.readFrozenActivity(diagnosis.diagnosisId);
  const diagnosisCountAfter = await deps.readDiagnosisCount();
  const delta = usageDelta(usageAfter, usageBefore);
  const snapshotAfter = await deps.loadFrozenEvidenceSnapshot();

  if (snapshotIdentity(snapshotAfter) !== snapshotIdentity(snapshotBefore)) {
    throw new FrozenEvidenceReanalysisRunnerError("SNAPSHOT_CHANGED");
  }
  if (delta.bochaCalls !== 0) {
    throw new FrozenEvidenceReanalysisRunnerError("BOCHA_CALL_FORBIDDEN");
  }
  if (delta.crawlerCalls !== 0) {
    throw new FrozenEvidenceReanalysisRunnerError("CRAWLER_CALL_FORBIDDEN");
  }
  if (delta.deepSeekCalls > 4) {
    throw new FrozenEvidenceReanalysisRunnerError("DEEPSEEK_BUDGET_EXCEEDED");
  }
  if (delta.retries !== 0) {
    throw new FrozenEvidenceReanalysisRunnerError("AUTOMATIC_RETRY_FORBIDDEN");
  }
  if (activityAfter.evidence !== activityBefore.evidence) {
    throw new FrozenEvidenceReanalysisRunnerError("NEW_EVIDENCE_FORBIDDEN");
  }
  if (activityAfter.searchRecords !== activityBefore.searchRecords) {
    throw new FrozenEvidenceReanalysisRunnerError("NEW_SEARCH_RECORD_FORBIDDEN");
  }
  if (activityAfter.crawlerRecords !== activityBefore.crawlerRecords) {
    throw new FrozenEvidenceReanalysisRunnerError("NEW_CRAWLER_RECORD_FORBIDDEN");
  }
  if (
    diagnosisCountBefore !== diagnosis.diagnosisCount ||
    diagnosisCountAfter !== diagnosisCountBefore
  ) {
    throw new FrozenEvidenceReanalysisRunnerError("NEW_DIAGNOSIS_FORBIDDEN");
  }
  if (runtimeError) throw runtimeError;
  if (!result) throw new Error("FROZEN_EVIDENCE_REANALYSIS_RETURNED_NO_RESULT");
  if (result.diagnosisId !== diagnosis.diagnosisId) {
    throw new FrozenEvidenceReanalysisRunnerError("RUNTIME_RESULT_DIAGNOSIS_MISMATCH");
  }
  if (!result.originalFailurePreserved) {
    throw new FrozenEvidenceReanalysisRunnerError("ORIGINAL_FAILURE_NOT_PRESERVED");
  }
  if (result.repairAttempt !== 1) {
    throw new FrozenEvidenceReanalysisRunnerError("REPAIR_ATTEMPT_MISMATCH");
  }
  if (
    !result.repairTimeline.includes("FAILED") ||
    !result.repairTimeline.includes(FROZEN_EVIDENCE_REANALYSIS_MODE)
  ) {
    throw new FrozenEvidenceReanalysisRunnerError("REPAIR_TIMELINE_MISSING");
  }
  if (result.finalStatus !== "READY") {
    throw new FrozenEvidenceReanalysisRunnerError("FINAL_STATE_NOT_READY");
  }

  assertNoFrozenEvidenceReanalysisLeak(
    await deps.readPublicApiPayload(diagnosis.diagnosisId),
    snapshotBefore,
  );
  const pages = await deps.verifyReportPages(diagnosis.diagnosisId);
  assertReportPagesVerified(pages);
  return { plan: sanitized, result, usageDelta: delta, pages };
}

function printInjectionRequired(): void {
  console.error(
    "[frozen-evidence-reanalysis] BLOCKED: injected snapshot/runtime/DeepSeek/finalizer seams required",
  );
  process.exitCode = 1;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  // Direct execution cannot open SQLite or construct a Provider. Supervisor
  // must inject the private runtime only after all integration gates pass.
  printInjectionRequired();
}
