/**
 * Round-5.2B frozen-evidence recovery runner.
 *
 * This module deliberately owns policy, not provider construction. The
 * Supervisor injects Agent O's recovery runtime after all integration gates are
 * green. That keeps this runner unit-testable and makes an accidental direct
 * execution incapable of reaching a real provider.
 */

export const ANALYSIS_RECOVERY_DIAGNOSIS_ID = "diag_d9d";
export const ANALYSIS_RECOVERY_AUTHORIZATION = "TECHNICAL_CANARY_REPAIR_AUTHORIZED";

export const ANALYSIS_STAGES = [
  "REPORT_PROFILE",
  "REPORT_SCORING",
  "REPORT_AI_VISIBILITY",
  "REPORT_CLAIMS",
] as const;

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];
type RecoverableStage = Exclude<AnalysisStage, "REPORT_CLAIMS">;

export interface FrozenHashIdentity {
  /** Hash sealed by the original run or forensic audit. */
  frozen: string | null;
  /** Hash recomputed from the current persisted artifact. */
  current: string | null;
}

export interface FrozenRecoveryPreflight {
  diagnosisId: string;
  originalStatus: "FAILED" | string;
  originalPhase: "ANALYZING" | string | null;
  originalFailureCode: "REPORT_CLAIMS_FAILED" | string | null;
  runLockExists: boolean;
  repairAttemptCount: number;
  diagnosisCount: number;
  evidenceCount: number;
  expectedEvidenceCount: number;
  identities: {
    diagnosisInput: FrozenHashIdentity;
    evidenceRegistry: FrozenHashIdentity;
    competitorResolution: FrozenHashIdentity;
    queryPlan: FrozenHashIdentity;
  };
  recoverableStages: Readonly<Record<RecoverableStage, boolean>>;
}

export interface RuntimeRecoveryPlan {
  diagnosisId: string;
  reusedStages: readonly RecoverableStage[];
  rerunStages: readonly AnalysisStage[];
  deepSeekCallCap: number;
}

export interface RecoveryUsage {
  bochaCalls: number;
  crawlerCalls: number;
  deepSeekCalls: number;
  retries: number;
}

export interface RecoveryRuntimeResult {
  ok: boolean;
  finalStatus: string;
  repairAttempt: number;
  originalFailurePreserved: boolean;
  repairTimeline: readonly string[];
  publicApiPayload?: unknown;
}

export interface AnalysisRecoveryRunnerDependencies {
  /** Read-only. Must not create a repair row or call any provider. */
  readPreflight(diagnosisId: string): Promise<FrozenRecoveryPreflight>;
  /** Agent O's read-only planner. */
  planRecovery(diagnosisId: string): Promise<RuntimeRecoveryPlan>;
  /** Agent O's one-shot recovery entrypoint. Called at most once. */
  resumeRecovery(plan: RuntimeRecoveryPlan): Promise<RecoveryRuntimeResult>;
  readUsage(diagnosisId: string): Promise<RecoveryUsage>;
  readDiagnosisCount(): Promise<number>;
  printSanitizedPlan(plan: SanitizedRecoveryPlan): void;
}

export type RecoveryBlockCode =
  | "REPAIR_NOT_AUTHORIZED"
  | "DIAGNOSIS_MISMATCH"
  | "ORIGINAL_FAILURE_MISMATCH"
  | "RUN_LOCK_MISSING"
  | "REPAIR_ATTEMPT_ALREADY_EXISTS"
  | "EVIDENCE_COUNT_MISMATCH"
  | "DIAGNOSIS_INPUT_HASH_MISSING"
  | "DIAGNOSIS_INPUT_HASH_MISMATCH"
  | "EVIDENCE_REGISTRY_HASH_MISSING"
  | "EVIDENCE_REGISTRY_HASH_MISMATCH"
  | "COMPETITOR_RESOLUTION_HASH_MISSING"
  | "COMPETITOR_RESOLUTION_HASH_MISMATCH"
  | "QUERY_PLAN_HASH_MISSING"
  | "QUERY_PLAN_HASH_MISMATCH"
  | "RUNTIME_PLAN_MISMATCH"
  | "BOCHA_CALL_FORBIDDEN"
  | "CRAWLER_CALL_FORBIDDEN"
  | "DEEPSEEK_BUDGET_EXCEEDED"
  | "AUTOMATIC_RETRY_FORBIDDEN"
  | "NEW_DIAGNOSIS_FORBIDDEN"
  | "ORIGINAL_FAILURE_NOT_PRESERVED"
  | "REPAIR_ATTEMPT_MISMATCH"
  | "REPAIR_TIMELINE_MISSING"
  | "PUBLIC_API_RECOVERY_LEAK";

export class AnalysisRecoveryRunnerError extends Error {
  constructor(readonly code: RecoveryBlockCode) {
    super(code);
    this.name = "AnalysisRecoveryRunnerError";
  }
}

export interface SanitizedRecoveryPlan {
  diagnosisId: string;
  authorized: boolean;
  originalFailureEligible: boolean;
  runLockExists: boolean;
  repairAttemptCount: number;
  evidenceCount: number;
  identityAvailability: {
    diagnosisInputHash: boolean;
    evidenceRegistryHash: boolean;
    competitorResolutionHash: boolean;
    queryPlanHash: boolean;
  };
  reusedStages: readonly RecoverableStage[];
  rerunStages: readonly AnalysisStage[];
  providerBudget: {
    bocha: 0;
    crawler: 0;
    deepSeek: number;
    retries: 0;
    newDiagnoses: 0;
  };
  blockedBy: readonly RecoveryBlockCode[];
}

const RECOVERABLE_STAGES: readonly RecoverableStage[] = [
  "REPORT_PROFILE",
  "REPORT_SCORING",
  "REPORT_AI_VISIBILITY",
];

function exactAuthorization(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[ANALYSIS_RECOVERY_AUTHORIZATION] === "true";
}

function hashBlockCode(
  identity: FrozenHashIdentity,
  missing: RecoveryBlockCode,
  mismatch: RecoveryBlockCode,
): RecoveryBlockCode | null {
  if (!identity.frozen || !identity.current) return missing;
  return identity.frozen === identity.current ? null : mismatch;
}

export function buildSanitizedRecoveryPlan(
  preflight: FrozenRecoveryPreflight,
  env: Readonly<Record<string, string | undefined>>,
): SanitizedRecoveryPlan {
  const authorized = exactAuthorization(env);
  const originalFailureEligible =
    preflight.originalStatus === "FAILED" &&
    preflight.originalPhase === "ANALYZING" &&
    preflight.originalFailureCode === "REPORT_CLAIMS_FAILED";
  const reusedStages = RECOVERABLE_STAGES.filter((stage) => preflight.recoverableStages[stage]);
  const rerunStages = ANALYSIS_STAGES.filter(
    (stage) => stage === "REPORT_CLAIMS" || !reusedStages.includes(stage as RecoverableStage),
  );
  const blockedBy: RecoveryBlockCode[] = [];

  if (!authorized) blockedBy.push("REPAIR_NOT_AUTHORIZED");
  if (preflight.diagnosisId !== ANALYSIS_RECOVERY_DIAGNOSIS_ID) blockedBy.push("DIAGNOSIS_MISMATCH");
  if (!originalFailureEligible) blockedBy.push("ORIGINAL_FAILURE_MISMATCH");
  if (!preflight.runLockExists) blockedBy.push("RUN_LOCK_MISSING");
  if (preflight.repairAttemptCount !== 0) blockedBy.push("REPAIR_ATTEMPT_ALREADY_EXISTS");
  if (
    preflight.expectedEvidenceCount !== 22 ||
    preflight.evidenceCount !== preflight.expectedEvidenceCount
  ) {
    blockedBy.push("EVIDENCE_COUNT_MISMATCH");
  }

  const identityChecks: Array<RecoveryBlockCode | null> = [
    hashBlockCode(
      preflight.identities.diagnosisInput,
      "DIAGNOSIS_INPUT_HASH_MISSING",
      "DIAGNOSIS_INPUT_HASH_MISMATCH",
    ),
    hashBlockCode(
      preflight.identities.evidenceRegistry,
      "EVIDENCE_REGISTRY_HASH_MISSING",
      "EVIDENCE_REGISTRY_HASH_MISMATCH",
    ),
    hashBlockCode(
      preflight.identities.competitorResolution,
      "COMPETITOR_RESOLUTION_HASH_MISSING",
      "COMPETITOR_RESOLUTION_HASH_MISMATCH",
    ),
    hashBlockCode(
      preflight.identities.queryPlan,
      "QUERY_PLAN_HASH_MISSING",
      "QUERY_PLAN_HASH_MISMATCH",
    ),
  ];
  for (const code of identityChecks) if (code) blockedBy.push(code);

  return {
    diagnosisId: preflight.diagnosisId,
    authorized,
    originalFailureEligible,
    runLockExists: preflight.runLockExists,
    repairAttemptCount: preflight.repairAttemptCount,
    evidenceCount: preflight.evidenceCount,
    identityAvailability: {
      diagnosisInputHash:
        Boolean(preflight.identities.diagnosisInput.frozen) &&
        Boolean(preflight.identities.diagnosisInput.current),
      evidenceRegistryHash:
        Boolean(preflight.identities.evidenceRegistry.frozen) &&
        Boolean(preflight.identities.evidenceRegistry.current),
      competitorResolutionHash:
        Boolean(preflight.identities.competitorResolution.frozen) &&
        Boolean(preflight.identities.competitorResolution.current),
      queryPlanHash:
        Boolean(preflight.identities.queryPlan.frozen) && Boolean(preflight.identities.queryPlan.current),
    },
    reusedStages,
    rerunStages,
    providerBudget: {
      bocha: 0,
      crawler: 0,
      deepSeek: rerunStages.length,
      retries: 0,
      newDiagnoses: 0,
    },
    blockedBy,
  };
}

function assertRuntimePlanMatches(
  runtimePlan: RuntimeRecoveryPlan,
  sanitized: SanitizedRecoveryPlan,
): void {
  const same =
    runtimePlan.diagnosisId === sanitized.diagnosisId &&
    runtimePlan.deepSeekCallCap === sanitized.providerBudget.deepSeek &&
    JSON.stringify(runtimePlan.reusedStages) === JSON.stringify(sanitized.reusedStages) &&
    JSON.stringify(runtimePlan.rerunStages) === JSON.stringify(sanitized.rerunStages);
  if (!same) throw new AnalysisRecoveryRunnerError("RUNTIME_PLAN_MISMATCH");
  if (runtimePlan.deepSeekCallCap < 1 || runtimePlan.deepSeekCallCap > 4) {
    throw new AnalysisRecoveryRunnerError("RUNTIME_PLAN_MISMATCH");
  }
}

function delta(after: RecoveryUsage, before: RecoveryUsage): RecoveryUsage {
  return {
    bochaCalls: after.bochaCalls - before.bochaCalls,
    crawlerCalls: after.crawlerCalls - before.crawlerCalls,
    deepSeekCalls: after.deepSeekCalls - before.deepSeekCalls,
    retries: after.retries - before.retries,
  };
}

const PUBLIC_LEAK_KEYS = [
  "repairAttempt",
  "reusedStages",
  "rerunStages",
  "deepSeekCallCap",
  "TECHNICAL_CANARY_REPAIR_AUTHORIZED",
] as const;

export function assertNoRecoveryInternalsInPublicApi(payload: unknown): void {
  const serialized = JSON.stringify(payload ?? null);
  if (PUBLIC_LEAK_KEYS.some((key) => serialized.includes(key))) {
    throw new AnalysisRecoveryRunnerError("PUBLIC_API_RECOVERY_LEAK");
  }
}

export interface AnalysisRecoveryRunnerOutcome {
  plan: SanitizedRecoveryPlan;
  result: RecoveryRuntimeResult;
  usageDelta: RecoveryUsage;
}

/** Execute exactly one repair attempt after all fail-closed checks pass. */
export async function runAnalysisRecoveryRunner(
  deps: AnalysisRecoveryRunnerDependencies,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AnalysisRecoveryRunnerOutcome> {
  const preflight = await deps.readPreflight(ANALYSIS_RECOVERY_DIAGNOSIS_ID);
  const sanitized = buildSanitizedRecoveryPlan(preflight, env);
  deps.printSanitizedPlan(sanitized);

  if (sanitized.blockedBy.length > 0) {
    throw new AnalysisRecoveryRunnerError(sanitized.blockedBy[0]!);
  }

  const runtimePlan = await deps.planRecovery(ANALYSIS_RECOVERY_DIAGNOSIS_ID);
  assertRuntimePlanMatches(runtimePlan, sanitized);
  const usageBefore = await deps.readUsage(ANALYSIS_RECOVERY_DIAGNOSIS_ID);
  const diagnosisCountBefore = await deps.readDiagnosisCount();

  // Intentionally one call and no retry loop. Usage/count postconditions are
  // still checked when the runtime rejects so a failed attempt cannot hide a
  // forbidden side effect.
  let result: RecoveryRuntimeResult | undefined;
  let recoveryError: unknown;
  try {
    result = await deps.resumeRecovery(runtimePlan);
  } catch (error) {
    recoveryError = error;
  }

  const usageAfter = await deps.readUsage(ANALYSIS_RECOVERY_DIAGNOSIS_ID);
  const diagnosisCountAfter = await deps.readDiagnosisCount();
  const usageDelta = delta(usageAfter, usageBefore);

  if (usageDelta.bochaCalls !== 0) throw new AnalysisRecoveryRunnerError("BOCHA_CALL_FORBIDDEN");
  if (usageDelta.crawlerCalls !== 0) throw new AnalysisRecoveryRunnerError("CRAWLER_CALL_FORBIDDEN");
  if (usageDelta.deepSeekCalls > runtimePlan.deepSeekCallCap) {
    throw new AnalysisRecoveryRunnerError("DEEPSEEK_BUDGET_EXCEEDED");
  }
  if (usageDelta.retries !== 0) throw new AnalysisRecoveryRunnerError("AUTOMATIC_RETRY_FORBIDDEN");
  if (diagnosisCountBefore !== preflight.diagnosisCount || diagnosisCountAfter !== diagnosisCountBefore) {
    throw new AnalysisRecoveryRunnerError("NEW_DIAGNOSIS_FORBIDDEN");
  }
  if (recoveryError) throw recoveryError;
  if (!result) throw new Error("RECOVERY_RUNTIME_RETURNED_NO_RESULT");
  if (!result.originalFailurePreserved) {
    throw new AnalysisRecoveryRunnerError("ORIGINAL_FAILURE_NOT_PRESERVED");
  }
  if (result.repairAttempt !== 1) throw new AnalysisRecoveryRunnerError("REPAIR_ATTEMPT_MISMATCH");
  if (!result.repairTimeline.includes("REPAIR_ATTEMPT")) {
    throw new AnalysisRecoveryRunnerError("REPAIR_TIMELINE_MISSING");
  }
  assertNoRecoveryInternalsInPublicApi(result.publicApiPayload);

  return { plan: sanitized, result, usageDelta };
}
