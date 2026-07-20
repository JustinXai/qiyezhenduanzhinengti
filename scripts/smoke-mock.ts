// ============================================================================
// scripts/smoke-mock.ts — Agent G (qa-ci) mock vertical-slice smoke.
//
// A near end-to-end run of the diagnosis pipeline using ONLY mocks + the shared
// canonical fixture. It never touches real Bocha/DeepSeek endpoints. Layers that
// live in this worktree are wired for real; layers that live in other worktrees
// (orchestration/assembly in Agent D/E, presentation in Agent F) are marked as
// INTEGRATION SEAMs and stood in with the canonical SAMPLE report so the chain
// still proves wire-compatibility of the shapes everyone shares.
//
// Chain:
//   [1] search        — mock Bocha web search              (real, src/providers/mock)
//   [2] analysis      — mock DeepSeek structured completion (real, src/providers/mock)
//   [3] assembly SEAM — canonical DiagnosisReport           (SAMPLE stand-in; Agent D)
//   [4] contract      — DiagnosisReport.parse validation    (real, src/contracts; Agent B)
//   [5] storage       — in-memory StorageAdapter round-trip (real shape; Agent E)
//   [6] presentation  — Quick/Deep/Evidence view models     (smoke projection; Agent F)
//   [7] product-truth — no banned copy in projected strings (real, shared guard)
//
// MUST exit 0.
// ============================================================================
import { createMockBochaProvider } from "../src/providers/mock/bocha.mock";
import { createMockDeepSeekProvider } from "../src/providers/mock/deepseek.mock";
import {
  DiagnosisReport,
  QuickReportViewModel,
  DeepReportViewModel,
  EvidenceViewModel,
  type DiagnosisReport as DiagnosisReportType,
  type QuickReportViewModel as QuickReportViewModelType,
  type DeepReportViewModel as DeepReportViewModelType,
  type EvidenceViewModel as EvidenceViewModelType,
} from "../src/contracts";
import { SAMPLE_DIAGNOSIS_REPORT } from "../src/fixtures/sample-report";
import type {
  StorageAdapter,
  DiagnosisRequestRecord,
  EvidenceRecord,
  StoredReport,
  ProviderUsageRecord,
} from "../src/storage/adapter";
import { findBannedTerms } from "../tests/fixtures/banned-terms";
import { loadEnvironment } from "../src/runtime/load-environment";
import {
  computeMeasurementComposition,
  estimationNoticeFor,
} from "../src/report/presentation/measurement-composition";
import {
  ZH_SOURCE_TYPE_LABEL,
  zhSupportLabel,
} from "../src/report/presentation/zh-labels";

let step = 0;
function ok(msg: string): void {
  step += 1;
  console.log(`[smoke:mock] [${step}] OK — ${msg}`);
}
function seam(msg: string): void {
  console.log(`[smoke:mock]     ↳ INTEGRATION SEAM: ${msg}`);
}
function fail(msg: string): never {
  throw new Error(msg);
}

// ---------------------------------------------------------------------------
// [5] Minimal in-memory StorageAdapter — exercises the real interface shape
// (Agent E owns the better-sqlite3 implementation) without a DB dependency.
// ---------------------------------------------------------------------------
function createInMemoryStorage(): StorageAdapter {
  const requests = new Map<string, DiagnosisRequestRecord>();
  const evidenceByDiagnosis = new Map<string, EvidenceRecord[]>();
  const reports = new Map<string, StoredReport>();
  const usage = new Map<string, ProviderUsageRecord[]>();
  const checkpoints = new Map<string, string>();
  const key = (q: { diagnosisId: string; stage: string; inputHash: string }): string =>
    `${q.diagnosisId}::${q.stage}::${q.inputHash}`;
  const epoch = new Date(0);

  return {
    async createDiagnosisRequest(input) {
      requests.set(input.id, {
        id: input.id,
        status: "CREATED",
        inputJson: input.inputJson,
        publicToken: input.publicToken,
        createdAt: epoch,
        updatedAt: epoch,
      });
    },
    async updateDiagnosisStatus(id, status) {
      const r = requests.get(id);
      if (r) {
        r.status = status;
        r.updatedAt = epoch;
      }
    },
    async getDiagnosisRequest(id) {
      return requests.get(id) ?? null;
    },
    async getDiagnosisRequestByPublicToken(publicToken) {
      for (const r of requests.values()) if (r.publicToken === publicToken) return r;
      return null;
    },
    async saveEvidence(items) {
      for (const item of items) {
        const arr = evidenceByDiagnosis.get(item.diagnosisId) ?? [];
        arr.push(item);
        evidenceByDiagnosis.set(item.diagnosisId, arr);
      }
    },
    async getEvidence(diagnosisId) {
      return evidenceByDiagnosis.get(diagnosisId) ?? [];
    },
    async saveReport(input) {
      reports.set(input.diagnosisId, { ...input, createdAt: epoch });
    },
    async getReport(diagnosisId) {
      return reports.get(diagnosisId) ?? null;
    },
    async recordProviderUsage(input) {
      const arr = usage.get(input.diagnosisId) ?? [];
      arr.push({
        id: input.id,
        diagnosisId: input.diagnosisId,
        provider: input.provider,
        stage: input.stage,
        callCount: input.callCount ?? 0,
        retryCount: input.retryCount ?? 0,
        errorCode: input.errorCode ?? null,
        costEstimate: input.costEstimate ?? null,
        createdAt: epoch,
      });
      usage.set(input.diagnosisId, arr);
    },
    async getProviderUsage(diagnosisId) {
      return usage.get(diagnosisId) ?? [];
    },
    async saveCheckpoint(cp) {
      checkpoints.set(key(cp), cp.outputJson);
    },
    async findReusableCheckpoint(q) {
      const outputJson = checkpoints.get(key(q));
      return outputJson ? { outputJson } : null;
    },
  };
}

// ---------------------------------------------------------------------------
// [6] Smoke presentation projections. The real ReportPresentationService lives
// in src/report/presentation (Agent F); these minimal projections only prove
// the canonical report can satisfy the frozen view-model contracts. They reuse
// canonical text verbatim and never fabricate marketing copy.
// ---------------------------------------------------------------------------
function projectQuick(report: DiagnosisReportType): QuickReportViewModelType {
  const measured = Object.entries(report.scores)
    .filter(([k]) => !["overallScore", "scoreCoverage"].includes(k))
    .filter(([, v]) => (v as { measurementStatus?: string }).measurementStatus === "MEASURED").length;

  const validSamples = report.aiVisibilityTests.filter((t) => t.status === "VALID").slice(0, 2);
  const topIssue = report.coreIssues[0] ?? null;

  const composition = computeMeasurementComposition(report.scores);
  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    reportLanguage: report.reportLanguage,
    brandName: report.companyProfile.brandName,
    reportDate: report.generatedAt,
    // Reuse canonical text; no fabricated claim.
    headlineConclusion: topIssue?.statement ?? "证据不足,暂不给出企业特定结论。",
    overallScore: report.scores.overallScore,
    scoreCoverage: report.scores.scoreCoverage,
    measurementStatusSummary: `${measured}/5 项维度已实测`,
    measurementComposition: composition,
    estimationNotice: estimationNoticeFor(composition),
    topStrength: report.strengths[0] ?? null,
    topIssue,
    topOpportunity: report.geoOpportunities[0] ?? null,
    // aiVisibilitySamples removed from Quick
    competitorGapSummary:
      report.competitorGaps.length > 0
        ? { available: true, gaps: report.competitorGaps }
        : { available: false, reason: "已收到竞品输入,但本次公开证据不足,暂不做确定性比较。" },
    coreIssues: report.coreIssues.slice(0, 3),
    demonstrationFix: report.demonstrationFix,
    geoOpportunities: report.geoOpportunities.slice(0, 3),
    // New fields
    questionCoverageStats: { totalQuestions: 0, fullySupportedCount: 0, partiallySupportedCount: 0, unansweredCount: 0 },
    keyCustomerQuestions: [],
    priorityDirections: [],
  };
}

function projectDeep(report: DiagnosisReportType): DeepReportViewModelType {
  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    companyProfile: report.companyProfile,
    scores: report.scores,
    aiVisibilityTests: report.aiVisibilityTests,
    strengths: report.strengths,
    coreIssues: report.coreIssues,
    competitorGaps: report.competitorGaps,
    geoOpportunities: report.geoOpportunities,
    measurementNotes: [
      "本报告为当前模型、当前时间、当前问题集的诊断样本,不代表全网 AI 推荐率。",
    ],
  };
}

function projectEvidence(report: DiagnosisReportType): EvidenceViewModelType {
  return {
    items: report.evidence.map((e) => ({
      id: e.id,
      title: e.title,
      sourceDomain: e.sourceDomain,
      sourceType: e.sourceType,
      authorityLevel: e.authorityLevel,
      supportLevel: e.supportLevel,
      fetchedAt: e.fetchedAt,
      snippet: e.snippet,
      url: e.url,
      // Labels come from the SINGLE zh source (§五) — no smoke-local table.
      summaryZh: `来自 ${e.sourceDomain} 的${ZH_SOURCE_TYPE_LABEL[e.sourceType]},在本报告中作为${zhSupportLabel(e.supportLevel)}证据使用。`,
      supportLabel: zhSupportLabel(e.supportLevel),
      sourceTypeLabel: ZH_SOURCE_TYPE_LABEL[e.sourceType],
    })),
  };
}

function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) for (const i of value) collectStrings(i, acc);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, acc);
  return acc;
}

async function main(): Promise<void> {
  // Shared env loader before any process.env read (this smoke stays MOCK-only).
  loadEnvironment();
  const smokeMode = process.env.DIAGNOSIS_SMOKE_MODE ?? "(unset)";
  console.log(`[smoke:mock] starting mock vertical slice (DIAGNOSIS_SMOKE_MODE=${smokeMode})`);

  // [1] search layer
  const bocha = createMockBochaProvider();
  const search = await bocha.search("华东地区柔性装配线供应商", { limit: 3 });
  if (!search.ok) fail("mock bocha search failed");
  if (search.results.length === 0) fail("mock bocha returned no results");
  ok(`search: ${search.results.length} mock result(s)`);

  // [2] analysis layer
  const deepseek = createMockDeepSeekProvider();
  const completion = await deepseek.completeJson({
    stage: "company-analysis",
    systemPrompt: "smoke",
    userPrompt: "smoke",
    maxTokens: 512,
  });
  if (!completion.ok) fail("mock deepseek completion failed");
  ok("analysis: mock deepseek structured completion");

  // [3] canonical assembly (integration seam)
  const report = SAMPLE_DIAGNOSIS_REPORT;
  ok("assembly: adopted canonical DiagnosisReport");
  seam("real report assembly lives in src/report/generation (Agent D); smoke uses SAMPLE.");

  // [4] contract validation (Agent B guard proxy)
  const parsed = DiagnosisReport.parse(report);
  if (parsed.diagnosisId !== report.diagnosisId) fail("contract parse changed identity");
  ok("contract: DiagnosisReport.parse validated the canonical report");

  // [5] storage round-trip
  const storage = createInMemoryStorage();
  await storage.createDiagnosisRequest({
    id: report.diagnosisId,
    inputJson: JSON.stringify(report.companyProfile),
    publicToken: report.publicToken,
  });
  await storage.updateDiagnosisStatus(report.diagnosisId, "READY");
  const checkpointMeta = {
    diagnosisId: report.diagnosisId,
    stage: "final-report",
    inputHash: "smoke-hash",
    reportContractVersion: report.reportContractVersion,
    scoreContractVersion: report.scoreContractVersion,
    providerModel: "deepseek-v4-flash",
    promptVersion: "smoke",
    trustGuardVersion: "smoke",
  };
  await storage.saveCheckpoint({ ...checkpointMeta, outputJson: JSON.stringify(report) });
  const reused = await storage.findReusableCheckpoint(checkpointMeta);
  if (!reused) fail("storage round-trip: checkpoint not found");
  const roundTripped = DiagnosisReport.parse(JSON.parse(reused.outputJson));
  if (roundTripped.publicToken !== report.publicToken) fail("storage round-trip lost data");
  ok("storage: save → findReusableCheckpoint → re-parse round-trip preserved the report");
  seam("real StorageAdapter (better-sqlite3) lives in src/storage (Agent E); smoke uses in-memory.");

  // [6] presentation projections validated against the frozen view-model contracts
  const quick = QuickReportViewModel.parse(projectQuick(report));
  const deep = DeepReportViewModel.parse(projectDeep(report));
  const evidence = EvidenceViewModel.parse(projectEvidence(report));
  ok(
    `presentation: Quick(${quick.coreIssues.length} issues, ${quick.priorityDirections.length} directions) ` +
      `/ Deep(${deep.aiVisibilityTests.length} tests) / Evidence(${evidence.items.length} items) projected + validated`,
  );
  seam("real ReportPresentationService lives in src/report/presentation (Agent F); smoke projects minimally.");

  // [7] product-truth spot check over the customer-visible Quick strings
  const quickStrings = collectStrings(quick);
  const banned = quickStrings.flatMap((s) => findBannedTerms(s)).map((b) => b.term);
  if (banned.length > 0) fail(`banned copy in projected Quick view: ${banned.join(", ")}`);
  ok("product-truth: no banned copy in projected Quick view");

  console.log(`[smoke:mock] PASSED — ${step} chain steps green, no real providers touched.`);
}

main().catch((err) => {
  console.error("[smoke:mock] FAILED", err);
  process.exit(1);
});
