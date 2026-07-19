import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import {
  DiagnosisReport,
  REPORT_CONTRACT_VERSION,
  SCORE_CONTRACT_VERSION,
  type EvidenceItem,
} from "../src/contracts";
import { competitorNames, DiagnosisInputSchema } from "../src/runtime/diagnosis-input";
import { loadEnvironment } from "../src/runtime/load-environment";
import { AnalysisRepairAuthorization } from "../src/runtime/analysis-repair-authorization";
import {
  createDeepSeekProvider,
  deepSeekConfigFromEnv,
} from "../src/providers/deepseek/deepseek-adapter";
import {
  AiVisibilityStageOutput,
  ClaimsStageOutput,
  CompanyProfileStageOutput,
  DimensionSignalsStageOutput,
} from "../src/diagnosis/analysis/stage-schemas";
import {
  buildAiVisibilityPrompt,
  buildClaimsPrompt,
  buildCompanyProfilePrompt,
  buildDimensionSignalsPrompt,
  defaultProbes,
  REAL_ANALYSIS_PROMPT_VERSION,
  REPORT_CLAIMS_ZH_PROMPT_VERSION,
} from "../src/diagnosis/analysis/stage-prompts";
import { buildReportFromStageOutputs } from "../src/report/generation";
import {
  assertInsta360FrozenEvidenceIdentity,
  createFrozenEvidenceScopeCoverage,
  type FrozenEvidenceSnapshotV1,
  RECOVERY_CONTRACT_VERSION,
} from "../src/diagnosis/orchestration/recovery/frozen-evidence-contract";
import {
  prepareFrozenEvidenceReanalysis,
  reanalyzeFromFrozenEvidence,
  type FrozenEvidenceFinalizationInput,
  type FrozenEvidenceReanalysisDependencies as RuntimeDependencies,
} from "../src/diagnosis/orchestration/recovery/frozen-evidence-reanalysis";
import { stableHash } from "../src/diagnosis/orchestration/recovery/stable-hash";
import { createSqliteStorageAdapter } from "../src/storage/sqlite-adapter";
import type {
  AnalysisRecoveryStorage,
  AnalysisStage,
  ProviderUsageRecord,
} from "../src/storage/adapter";
import {
  createDeterministicVerifier,
  verifyReport,
  DETERMINISTIC_VERIFIER_VERSION,
} from "../src/diagnosis/verification";
import {
  chinesePublicReportGuard,
  countQuickVisibleChars,
  publishGuard,
} from "../src/report/validation";
import { presentReport } from "../src/report/presentation";
import {
  FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
  FROZEN_EVIDENCE_NEGATIVE_SCOPE_PREFIXES,
  frozenEvidenceGuard,
} from "../src/report/validation/frozen-evidence-guard";
import { applyClaimPublicationPolicyToReport } from "../src/runtime/claim-publication";
import {
  auditAnalysisPrune,
  auditPublicationPrune,
  auditStructuralPrune,
} from "../src/runtime/prune-audit";
import {
  assertNoFrozenEvidenceReanalysisLeak,
  FROZEN_EVIDENCE_REANALYSIS_MODE,
  runFrozenEvidenceReanalysis,
  type FrozenDiagnosisState,
  type FrozenEvidenceReanalysisDependencies as RunnerDependencies,
  type ReanalysisRuntimeResult,
  type ReanalysisUsage,
  type ReportPageVerification,
} from "./frozen-evidence-reanalysis";

const PRIVATE_DIR = "E:/企业诊断智能体_private/technical-company-canary-zh-v2";
const V1_PRIVATE_DIR = "E:/企业诊断智能体_private/technical-company-canary-v1";
const DB_PATH = join(PRIVATE_DIR, "technical-canary-zh-v2.sqlite");
const RUN_LOCK_PATH = join(PRIVATE_DIR, "run-lock.json");
const FAILURE_PATH = join(PRIVATE_DIR, "failure-summary.json");
const FULL_DIAGNOSIS_ID = "diag_d9d81ba3428f4696b088870ca7416e49";
const EXPECTED = {
  diagnosisInputHash: "7f83796f15c71668550d3b281055c11830f4d302d93bffc21c8de0fe02b73038",
  evidenceRegistryHash: "9b4ca22dc268d338c8614ba86c17b756594a2a47718b0d883093f9f957e5e7ce",
  normalizedEvidenceHash: "b55c9c779c88815ac36e243fb3a19b0f73296e503646f507cd0ea46010eee4fd",
  databaseFileHash: "41b81c502c6354f4b38ce0a65dd19c933017a73b7f04b7e3a4e2eece86f2f3ce",
  runLockHash: "b86df78852ed7ac06d93ae43c4b5e4b9ee34c43221b74a35ddb6eb224aef48f8",
  evidenceCount: 22,
} as const;
const FROZEN_CLAIMS_PROMPT_VERSION =
  `${REPORT_CLAIMS_ZH_PROMPT_VERSION}.frozen-evidence-scope.v1`;
const UI_PORT = 3102;
const UI_BASE = `http://127.0.0.1:${UI_PORT}`;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fileManifest(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result[relative(root, path).replaceAll("\\", "/")] = sha256File(path);
    }
  };
  visit(root);
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function readFailureSummary(): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(FAILURE_PATH, "utf8")) as Record<string, unknown>;
  const error = parsed.error as Record<string, unknown> | undefined;
  if (
    parsed.finalStatus !== "FAILED" ||
    parsed.failedStage !== "ANALYZING" ||
    error?.code !== "REPORT_CLAIMS_FAILED"
  ) {
    throw new Error("ORIGINAL_FAILURE_MISMATCH");
  }
  return parsed;
}

function usageTotals(rows: ProviderUsageRecord[]): ReanalysisUsage {
  const result: ReanalysisUsage = {
    bochaCalls: 0,
    crawlerCalls: 0,
    deepSeekCalls: 0,
    retries: 0,
  };
  for (const row of rows) {
    const provider = row.provider.toLowerCase();
    if (provider === "bocha") result.bochaCalls += row.callCount;
    if (provider === "crawler") result.crawlerCalls += row.callCount;
    if (provider === "deepseek") result.deepSeekCalls += row.callCount;
    result.retries += row.retryCount;
  }
  return result;
}

function assertProcessAuthorization(): void {
  if (process.env.PROVIDER_MODE !== "REAL") throw new Error("PROVIDER_MODE_MUST_BE_REAL");
  if (process.env.DIAGNOSIS_SMOKE_MODE !== "false") {
    throw new Error("DIAGNOSIS_SMOKE_MODE_MUST_BE_FALSE");
  }
  if (process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED !== "true") {
    throw new Error("TECHNICAL_CANARY_REPAIR_NOT_AUTHORIZED");
  }
  for (const key of ["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"] as const) {
    if (!process.env[key]) throw new Error(`MISSING_${key}`);
  }
  if (process.env.DEEPSEEK_MODEL !== "deepseek-v4-flash") {
    throw new Error("DEEPSEEK_MODEL_MISMATCH");
  }
}

function frozenClaimsPrompt(
  diagnosisInput: ReturnType<typeof DiagnosisInputSchema.parse>,
  evidence: readonly EvidenceItem[],
) {
  const base = buildClaimsPrompt(diagnosisInput, evidence, []);
  return {
    ...base,
    version: FROZEN_CLAIMS_PROMPT_VERSION,
    userPrompt: [
      base.userPrompt,
      "",
      "冻结Evidence再分析附加硬规则:",
      "- competitorGaps必须为[]，不得解析、猜测或补写任何竞品官方网站。",
      `- 缺失型主张必须逐字使用以下范围前缀之一:“${FROZEN_EVIDENCE_NEGATIVE_SCOPE_PREFIXES[0]}”或“${FROZEN_EVIDENCE_NEGATIVE_SCOPE_PREFIXES[1]}”。`,
      "- 缺失型主张至少引用2条相互独立、且属于本次保存范围的首方证据；不足则不要输出。",
      "- 禁止使用“官网没有”“企业完全没有”“搜索结果不存在”“市场上没有”“AI不会推荐”。",
      "- 每条机会必须对应本次coreIssues中的sourceIssueId，并填写具体customerQuestion、recommendedAction和priorityReason；不能满足则不要输出。",
    ].join("\n"),
  };
}

function stageDefinitions(model: string): RuntimeDependencies["stages"] {
  return {
    REPORT_PROFILE: {
      schemaVersion: "CompanyProfileStageOutput.v1",
      promptVersion: REAL_ANALYSIS_PROMPT_VERSION,
      providerModel: model,
      validator: CompanyProfileStageOutput,
    },
    REPORT_SCORING: {
      schemaVersion: "DimensionSignalsStageOutput.v1",
      promptVersion: REAL_ANALYSIS_PROMPT_VERSION,
      providerModel: model,
      validator: DimensionSignalsStageOutput,
    },
    REPORT_AI_VISIBILITY: {
      schemaVersion: "AiVisibilityStageOutput.v1",
      promptVersion: REAL_ANALYSIS_PROMPT_VERSION,
      providerModel: model,
      validator: AiVisibilityStageOutput,
    },
    REPORT_CLAIMS: {
      schemaVersion: "ClaimsStageOutput.v2.1",
      promptVersion: FROZEN_CLAIMS_PROMPT_VERSION,
      providerModel: model,
      validator: ClaimsStageOutput,
    },
  };
}

async function deterministicFinalizer(
  storage: AnalysisRecoveryStorage,
  input: FrozenEvidenceFinalizationInput,
  model: string,
): Promise<{ resultState: "READY" }> {
  const diagnosisInput = DiagnosisInputSchema.parse(input.diagnosisInput);
  const outputs = {
    ...input.outputs,
    REPORT_CLAIMS: {
      ...(input.outputs.REPORT_CLAIMS as Record<string, unknown>),
      competitorGaps: [],
    },
  };
  const built = buildReportFromStageOutputs({
    identity: {
      diagnosisId: input.diagnosisId,
      publicToken: input.publicToken,
      generatedAt: new Date().toISOString(),
    },
    profileInput: {
      website: diagnosisInput.website,
      providedBrandName: diagnosisInput.brandName,
      providedCompetitors: competitorNames(diagnosisInput.competitors),
    },
    aiVisibilityInput: {
      brandName: diagnosisInput.brandName ?? new URL(diagnosisInput.website).hostname,
      modelUsed: model,
      testedAt: new Date().toISOString(),
    },
    evidence: input.normalizedEvidence,
    stageOutputs: {
      companyProfile: outputs.REPORT_PROFILE,
      dimensionSignals: outputs.REPORT_SCORING,
      aiVisibility: outputs.REPORT_AI_VISIBILITY,
      claims: outputs.REPORT_CLAIMS,
    },
  });
  if (!built.ok) throw new Error(`CANONICAL_BUILD_FAILED:${built.stage}`);

  const candidate = DiagnosisReport.parse({
    ...built.report,
    competitorGaps: [],
    companyProfile: {
      ...built.report.companyProfile,
      unresolvedQuestions: [
        ...new Set([
          ...built.report.companyProfile.unresolvedQuestions,
          FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
        ]),
      ],
    },
  });
  const coverage = createFrozenEvidenceScopeCoverage({
    snapshot: input.snapshot,
    evidence: candidate.evidence,
  });

  await storage.updateDiagnosisStatus(input.diagnosisId, "CLAIM_EVIDENCE_VERIFICATION");
  const verification = await verifyReport({
    report: candidate,
    coverage,
    strategy: createDeterministicVerifier(),
  });
  if (!verification.ok) throw new Error("CLAIM_EVIDENCE_ILLEGAL_REFERENCE");

  const publicationResult = applyClaimPublicationPolicyToReport({
    report: candidate,
    relations: verification.relations,
    coverage,
    coverageScope: "FROZEN_EVIDENCE",
  });
  const published = publicationResult.report;
  const views = presentReport(published);
  const publicPayload = {
    diagnosisId: input.diagnosisId,
    status: "READY",
    report: published,
  };

  const publication = publishGuard({
    report: published,
    relations: verification.relations,
    coverage,
    coverageScope: "FROZEN_EVIDENCE",
    viewModels: {
      quick: views.quick,
      deep: views.deep,
      evidenceView: views.evidence,
    },
  });
  if (!publication.ok) {
    throw new Error(`PUBLISH_GUARD_BLOCKED:${publication.violations.map((v) => v.rule).join(",")}`);
  }
  const chinese = chinesePublicReportGuard(views);
  if (!chinese.ok) {
    throw new Error(`CHINESE_PUBLIC_REPORT_GUARD_BLOCKED:${chinese.violations.map((v) => v.rule).join(",")}`);
  }
  const frozen = frozenEvidenceGuard({
    recoveryMode: FROZEN_EVIDENCE_REANALYSIS_MODE,
    coverageMode: input.coverageMode,
    competitorResolutionStatus: input.competitorResolutionStatus,
    snapshot: input.snapshot,
    current: {
      diagnosisId: input.diagnosisId,
      diagnosisInputHash: input.snapshot.diagnosisInputHash,
      evidenceRegistryHash: input.snapshot.evidenceRegistryHash,
      normalizedEvidenceHash: input.snapshot.normalizedEvidenceHash,
      evidenceCount: input.snapshot.evidenceCount,
      sortedEvidenceIdsHash: input.snapshot.sortedEvidenceIdsHash,
      evidenceUrlsHash: input.snapshot.evidenceUrlsHash,
      firstPartyEvidenceCount: input.snapshot.firstPartyEvidenceCount,
      observedEvidenceCount: input.snapshot.observedEvidenceCount,
      competitorEvidenceCount: input.snapshot.competitorEvidenceCount,
      languageDistribution: input.snapshot.languageDistribution,
      sourceTierDistribution: input.snapshot.sourceTierDistribution,
    },
    activityDelta: { evidenceCreated: 0, searchRecordsCreated: 0, crawlerRecordsCreated: 0 },
    report: published,
    relations: verification.relations,
    presentation: {
      quickCompetitorLimitation:
        views.quick.competitorGapSummary.available
          ? ""
          : views.quick.competitorGapSummary.reason,
      deepCompetitorLimitation:
        views.deep.companyProfile.unresolvedQuestions.find(
          (item) => item === FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
        ) ?? "",
    },
    publicApiPayload: publicPayload,
  });
  if (!frozen.ok) {
    throw new Error(`FROZEN_EVIDENCE_GUARD_BLOCKED:${frozen.violations.map((v) => v.rule).join(",")}`);
  }

  await storage.updateDiagnosisStatus(input.diagnosisId, "VALIDATING_REPORT");
  if (storage.saveClaimEvidenceRelations && verification.relations.length > 0) {
    await storage.saveClaimEvidenceRelations(
      verification.relations.map((relation) => ({
        id: randomUUID(),
        diagnosisId: input.diagnosisId,
        claimId: relation.claimId,
        claimKind: relation.claimKind,
        evidenceId: relation.evidenceId,
        supportLevel: relation.supportLevel,
        confidence: relation.confidence,
        justification: relation.justification,
        basis: relation.basis,
        verifierMode: relation.verifierMode,
        verifierVersion: relation.verifierVersion,
      })),
    );
  }
  await storage.saveCheckpoint({
    diagnosisId: input.diagnosisId,
    stage: "CLAIM_EVIDENCE_VERIFICATION",
    inputHash: stableHash({ report: published, coverage }),
    outputJson: JSON.stringify(verification.relations),
    reportContractVersion: REPORT_CONTRACT_VERSION,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    providerModel: "MOCK_DETERMINISTIC",
    promptVersion: DETERMINISTIC_VERIFIER_VERSION,
    trustGuardVersion: "claim-evidence-gate.v1",
  });
  const reportId = randomUUID();
  const stageRunId = `REPORT_CLAIMS:${input.snapshotHash}`;
  const createdAt = new Date();
  const pruneDecisions = [
    ...built.prunedCandidates.map((candidate) =>
      auditAnalysisPrune({
        context: {
          id: randomUUID(),
          diagnosisId: input.diagnosisId,
          reportId,
          revisionId: null,
          stageRunId,
          createdAt,
        },
        candidate,
      }),
    ),
    ...publicationResult.prunes.map((prune) => {
      const context = {
        id: randomUUID(),
        diagnosisId: input.diagnosisId,
        reportId,
        revisionId: null,
        stageRunId,
        createdAt,
      };
      return prune.type === "POLICY"
        ? auditPublicationPrune({ context, candidate: prune.candidate, decision: prune.decision })
        : auditStructuralPrune({
            context,
            candidate: prune.candidate,
            reasonCode: prune.reasonCode,
            guardRule: prune.guardRule,
            coverageStatus: prune.coverageStatus,
          });
    }),
  ];
  if (pruneDecisions.length > 0) {
    if (!storage.appendPruneDecisions) throw new Error("PRUNE_AUDIT_STORAGE_UNAVAILABLE");
    await storage.appendPruneDecisions(pruneDecisions);
  }
  await storage.saveReport({
    id: reportId,
    diagnosisId: input.diagnosisId,
    reportContractVersion: published.reportContractVersion,
    scoreContractVersion: published.scoreContractVersion,
    canonicalJson: JSON.stringify(published),
  });
  await storage.updateDiagnosisStatus(input.diagnosisId, "READY");
  return { resultState: "READY" };
}

async function waitForUi(): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(UI_BASE, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error("UI_SERVER_NOT_READY");
}

function startUiServer(): ChildProcess {
  return spawn("pnpm", ["exec", "next", "dev", "-p", String(UI_PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROVIDER_MODE: "MOCK",
      TECHNICAL_CANARY_REPAIR_AUTHORIZED: "false",
      DIAGNOSIS_RECOVERY_MODE: "",
      DIAGNOSIS_SMOKE_MODE: "true",
      DATABASE_URL: DB_PATH,
      PORT: String(UI_PORT),
    },
    shell: true,
    windowsHide: true,
    stdio: "ignore",
  });
}

async function stopUiServer(server: ChildProcess): Promise<void> {
  if (!server.pid) return;
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      shell: true,
      windowsHide: true,
      stdio: "ignore",
    });
    killer.once("exit", () => resolve());
    killer.once("error", () => resolve());
  });
}

async function verifyRenderedPages(
  storage: AnalysisRecoveryStorage,
  snapshot: FrozenEvidenceSnapshotV1,
): Promise<ReportPageVerification> {
  const record = await storage.getDiagnosisRequest(FULL_DIAGNOSIS_ID);
  const stored = await storage.getReport(FULL_DIAGNOSIS_ID);
  if (!record || !stored) throw new Error("REPORT_NOT_STORED");
  const report = DiagnosisReport.parse(JSON.parse(stored.canonicalJson));
  const quickCharacterCount = countQuickVisibleChars(presentReport(report).quick);
  const server = startUiServer();
  try {
    await waitForUi();
    const api = await fetch(
      `${UI_BASE}/api/diagnoses/${record.id}?publicToken=${record.publicToken}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!api.ok) throw new Error(`PUBLIC_API_HTTP_${api.status}`);
    const publicPayload: unknown = await api.json();
    assertNoFrozenEvidenceReanalysisLeak(publicPayload, snapshot);

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${UI_BASE}/report/${record.publicToken}`, { waitUntil: "networkidle" });
      const quickRendered = await page.getByTestId("geo-index").isVisible();
      const mobileHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      await page.screenshot({ path: join(PRIVATE_DIR, "recovery-quick-mobile.png"), fullPage: true });

      await page.getByRole("button", { name: "完整诊断", exact: true }).click();
      const deepRendered = (await page.locator("body").innerText()).includes(
        FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
      );
      await page.screenshot({ path: join(PRIVATE_DIR, "recovery-deep-mobile.png"), fullPage: true });

      await page.getByRole("button", { name: "证据", exact: true }).click();
      const evidenceRendered = (await page.locator("body").innerText()).includes("证据附件");
      await page.screenshot({ path: join(PRIVATE_DIR, "recovery-evidence-mobile.png"), fullPage: true });
      return {
        quickRendered,
        deepRendered,
        evidenceRendered,
        reportLanguage: report.reportLanguage,
        quickCharacterCount,
        mobileViewportWidth: 390,
        mobileHorizontalOverflow,
        evidenceCount: report.evidence.length,
      };
    } finally {
      await browser.close();
    }
  } finally {
    await stopUiServer(server);
  }
}

async function main(): Promise<void> {
  loadEnvironment();
  assertProcessAuthorization();
  for (const path of [PRIVATE_DIR, V1_PRIVATE_DIR, DB_PATH, RUN_LOCK_PATH, FAILURE_PATH]) {
    if (!existsSync(path)) throw new Error(`REQUIRED_ARTIFACT_MISSING:${basename(path)}`);
  }
  const failureBefore = sha256File(FAILURE_PATH);
  const runLockBefore = sha256File(RUN_LOCK_PATH);
  const databaseBefore = sha256File(DB_PATH);
  const v1Before = fileManifest(V1_PRIVATE_DIR);
  if (runLockBefore !== EXPECTED.runLockHash) throw new Error("RUN_LOCK_HASH_MISMATCH");
  if (databaseBefore !== EXPECTED.databaseFileHash) throw new Error("DATABASE_FILE_HASH_MISMATCH");
  readFailureSummary();

  const deepSeekConfig = deepSeekConfigFromEnv();
  const model = deepSeekConfig.model ?? "deepseek-v4-flash";
  const deepSeek = createDeepSeekProvider(deepSeekConfig, { fetch: globalThis.fetch });
  const { adapter: storage, db } = createSqliteStorageAdapter({ filename: DB_PATH });
  const authorization = AnalysisRepairAuthorization.fromServerEnvironment(FULL_DIAGNOSIS_ID);
  const capturedAt = new Date();
  const definitions = stageDefinitions(model);

  const invokeDeepSeekStage: RuntimeDependencies["invokeDeepSeekStage"] = async ({ stage, stageInput }) => {
    const diagnosisInput = DiagnosisInputSchema.parse(stageInput.diagnosisInput);
    const evidence = stageInput.normalizedEvidence;
    const prompt =
      stage === "REPORT_PROFILE"
        ? buildCompanyProfilePrompt(diagnosisInput, evidence)
        : stage === "REPORT_SCORING"
          ? buildDimensionSignalsPrompt(diagnosisInput, evidence)
          : stage === "REPORT_AI_VISIBILITY"
            ? buildAiVisibilityPrompt(diagnosisInput, defaultProbes(diagnosisInput))
            : frozenClaimsPrompt(diagnosisInput, evidence);
    if (prompt.version !== definitions[stage].promptVersion) {
      throw new Error("PROMPT_VERSION_MISMATCH");
    }
    const completion = await deepSeek.completeJson({
      stage,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxTokens: prompt.maxTokens,
    });
    if (!completion.ok) {
      const error = new Error(completion.error.code) as Error & { code?: string };
      error.code = completion.error.code;
      throw error;
    }
    return { rawJson: JSON.stringify(completion.json) };
  };

  const runtimeDeps: RuntimeDependencies = {
    storage,
    authorization,
    expected: {
      diagnosisId: FULL_DIAGNOSIS_ID,
      diagnosisInputHash: EXPECTED.diagnosisInputHash,
      evidenceRegistryHash: EXPECTED.evidenceRegistryHash,
      normalizedEvidenceHash: EXPECTED.normalizedEvidenceHash,
      evidenceCount: EXPECTED.evidenceCount,
      databaseFileHash: EXPECTED.databaseFileHash,
      runLockHash: EXPECTED.runLockHash,
      recoveryContractVersion: RECOVERY_CONTRACT_VERSION,
      originalFailureStage: "REPORT_CLAIMS_FAILED",
    },
    loadFrozenArtifactIdentity: async () => ({
      databaseFileHash: databaseBefore,
      runLockHash: runLockBefore,
    }),
    stages: definitions,
    invokeDeepSeekStage,
    finalizeRecoveredAnalysis: (input) => deterministicFinalizer(storage, input, model),
    assertSnapshotIdentity: assertInsta360FrozenEvidenceIdentity,
    now: () => capturedAt,
  };

  let cachedPlan = await prepareFrozenEvidenceReanalysis(runtimeDeps);
  const failure = readFailureSummary();
  const runnerDeps: RunnerDependencies = {
    loadFrozenEvidenceSnapshot: async () => cachedPlan.snapshot,
    loadDiagnosis: async (): Promise<FrozenDiagnosisState> => {
      const diagnosis = await storage.getDiagnosisRequest(FULL_DIAGNOSIS_ID);
      if (!diagnosis) throw new Error("DIAGNOSIS_NOT_FOUND");
      return {
        diagnosisId: diagnosis.id,
        status: diagnosis.status,
        phase: failure.failedStage as string,
        failureCode: (failure.error as Record<string, unknown>).code as string,
        evidenceCount: (await storage.getEvidence(diagnosis.id)).length,
        repairAttemptCount: (await storage.getAnalysisRepairAttempts(diagnosis.id)).length,
        diagnosisCount: await storage.countDiagnosisRequests(),
      };
    },
    prepareRuntime: async () => {
      cachedPlan = await prepareFrozenEvidenceReanalysis(runtimeDeps);
      return cachedPlan;
    },
    executeRuntime: async (input): Promise<ReanalysisRuntimeResult> => {
      if (input.plan.snapshotHash !== cachedPlan.snapshotHash) throw new Error("RUNNER_PLAN_CHANGED");
      const result = await reanalyzeFromFrozenEvidence(runtimeDeps);
      const diagnosis = await storage.getDiagnosisRequest(FULL_DIAGNOSIS_ID);
      const attempts = await storage.getAnalysisRepairAttempts(FULL_DIAGNOSIS_ID);
      return {
        diagnosisId: FULL_DIAGNOSIS_ID,
        finalStatus: diagnosis?.status ?? "FAILED",
        repairAttempt: result.repairAttempt,
        originalFailurePreserved:
          sha256File(FAILURE_PATH) === failureBefore &&
          attempts[0]?.originalFailureStage === "REPORT_CLAIMS_FAILED",
        repairTimeline: ["FAILED", FROZEN_EVIDENCE_REANALYSIS_MODE, result.resultState],
      };
    },
    invokeDeepSeekStage: invokeDeepSeekStage as RunnerDependencies["invokeDeepSeekStage"],
    finalizeRecoveredAnalysis: (async (input: { diagnosisId: string; stageOutputs: Readonly<Record<AnalysisStage, unknown>> }) => {
      if (input.diagnosisId !== FULL_DIAGNOSIS_ID || Object.keys(input.stageOutputs).length !== 4) {
        throw new Error("FINALIZER_INPUT_MISMATCH");
      }
      return { resultState: "READY" as const };
    }) as RunnerDependencies["finalizeRecoveredAnalysis"],
    readUsage: async (diagnosisId) => usageTotals(await storage.getProviderUsage(diagnosisId)),
    readFrozenActivity: async (diagnosisId) => {
      const usage = await storage.getProviderUsage(diagnosisId);
      return {
        evidence: (await storage.getEvidence(diagnosisId)).length,
        searchRecords: usage
          .filter((row) => row.provider.toLowerCase() === "bocha")
          .reduce((total, row) => total + row.callCount, 0),
        crawlerRecords: usage
          .filter((row) => row.provider.toLowerCase() === "crawler")
          .reduce((total, row) => total + row.callCount, 0),
      };
    },
    readDiagnosisCount: () => storage.countDiagnosisRequests(),
    readPublicApiPayload: async (diagnosisId) => {
      const diagnosis = await storage.getDiagnosisRequest(diagnosisId);
      const report = await storage.getReport(diagnosisId);
      return {
        diagnosisId,
        status: diagnosis?.status,
        report: report ? DiagnosisReport.parse(JSON.parse(report.canonicalJson)) : null,
      };
    },
    verifyReportPages: () => verifyRenderedPages(storage, cachedPlan.snapshot),
    printSanitizedPlan: (plan) => {
      console.log(JSON.stringify(plan, null, 2));
    },
  };

  try {
    const outcome = await runFrozenEvidenceReanalysis(runnerDeps);
    const stored = await storage.getReport(FULL_DIAGNOSIS_ID);
    if (!stored) throw new Error("FINAL_REPORT_MISSING");
    const report = DiagnosisReport.parse(JSON.parse(stored.canonicalJson));
    const views = presentReport(report);
    const stageRuns = await storage.getAnalysisStageRuns(FULL_DIAGNOSIS_ID);
    const attempts = await storage.getAnalysisRepairAttempts(FULL_DIAGNOSIS_ID);
    const relations = await storage.getClaimEvidenceRelations?.(FULL_DIAGNOSIS_ID);
    const v1After = fileManifest(V1_PRIVATE_DIR);
    if (stableHash(v1After) !== stableHash(v1Before)) throw new Error("V1_ARTIFACTS_CHANGED");
    if (sha256File(RUN_LOCK_PATH) !== runLockBefore) throw new Error("RUN_LOCK_CHANGED");
    if (sha256File(FAILURE_PATH) !== failureBefore) throw new Error("ORIGINAL_FAILURE_CHANGED");
    mkdirSync(PRIVATE_DIR, { recursive: true });
    writeFileSync(
      join(PRIVATE_DIR, "frozen-evidence-reanalysis-summary.json"),
      JSON.stringify(
        {
          status: "PASS",
          recoveryMode: FROZEN_EVIDENCE_REANALYSIS_MODE,
          diagnosisId: FULL_DIAGNOSIS_ID,
          snapshot: cachedPlan.snapshot,
          originalFailurePreserved: true,
          repairAttempt: attempts[0] ?? null,
          stageRuns: stageRuns.map((run) => ({
            stage: run.stage,
            status: run.status,
            outputHash: run.outputHash,
            promptVersion: run.promptVersion,
            providerModel: run.providerModel,
          })),
          providerUsageDelta: outcome.usageDelta,
          finalState: "READY",
          claimsSchema: "PASS",
          claimEvidence: { relationCount: relations?.length ?? 0, verifier: DETERMINISTIC_VERIFIER_VERSION },
          contentYield: {
            strengths: report.strengths.length,
            coreIssues: report.coreIssues.length,
            geoOpportunities: report.geoOpportunities.length,
            competitorGaps: report.competitorGaps.length,
            demonstrationFix: report.demonstrationFix !== null,
          },
          scores: report.scores,
          quick: { characters: countQuickVisibleChars(views.quick), ...outcome.pages },
          deep: { rendered: outcome.pages.deepRendered },
          evidence: { rendered: outcome.pages.evidenceRendered, count: report.evidence.length },
          reportHash: stableHash(report),
          v1Unchanged: true,
          runLockUnchanged: true,
          originalFailureFileUnchanged: true,
        },
        null,
        2,
      ),
    );
    console.log("FROZEN_EVIDENCE_REANALYSIS_PASS");
  } finally {
    db.close();
    delete process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED;
    delete process.env.DIAGNOSIS_RECOVERY_MODE;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error(`[frozen-evidence-supervisor] ${message}`);
    process.exitCode = 1;
  });
}
