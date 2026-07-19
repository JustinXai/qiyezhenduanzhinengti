import { describe, expect, it, vi } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import { deriveCoverage } from "../../src/contracts/claim-evidence";
import {
  CanaryBudgetTracker,
  createRealReportProducer,
} from "../../src/diagnosis/orchestration/real-seams";
import { runDiagnosisPipeline, type EvidencePipeline } from "../../src/diagnosis/orchestration/state-machine";
import type { StructuredCompletionProvider } from "../../src/providers/types";
import { openMigratedDatabase } from "../../src/storage/migrate";
import { SqliteStorageAdapter } from "../../src/storage/sqlite-adapter";

const NOW = new Date("2026-07-20T01:00:00.000Z");

function stageOutputs(evidenceId: string): unknown[] {
  return [
    {
      brandName: "示例智能装备",
      industry: "工业自动化设备",
      productOrService: "柔性装配线",
      targetRegion: "华东",
      competitors: [],
      unresolvedQuestions: [],
    },
    {
      companyClarity: {
        criteria: [
          { key: "brandIdentityClear", rating: "PRESENT" },
          { key: "offeringClear", rating: "PRESENT" },
          { key: "targetCustomerClear", rating: "PARTIAL" },
          { key: "valuePropositionClear", rating: "PARTIAL" },
        ],
        evidenceIds: [evidenceId],
      },
      websiteCompleteness: {
        criteria: [
          { key: "productInfo", rating: "PRESENT" },
          { key: "companyBackground", rating: "PRESENT" },
          { key: "contactChannel", rating: "PARTIAL" },
          { key: "processOrPricing", rating: "PARTIAL" },
          { key: "caseOrProof", rating: "PARTIAL" },
        ],
        evidenceIds: [evidenceId],
      },
      customerQuestionCoverage: {
        criteria: [
          { key: "purchaseDecisionQuestions", rating: "PARTIAL" },
          { key: "comparisonQuestions", rating: "PARTIAL" },
          { key: "deliveryAndAfterSales", rating: "PARTIAL" },
          { key: "structuredFaq", rating: "PARTIAL" },
        ],
        evidenceIds: [evidenceId],
      },
      trustEvidence: {
        criteria: [
          { key: "thirdPartyCredentials", rating: "PARTIAL" },
          { key: "verifiableCases", rating: "PARTIAL" },
          { key: "mediaOrPublicMentions", rating: "PARTIAL" },
          { key: "customerTestimonials", rating: "PARTIAL" },
        ],
        evidenceIds: [evidenceId],
      },
    },
    {
      tests: [
        {
          id: "aiv_1",
          questionCategory: "BRAND_DIRECT",
          question: "示例智能装备提供什么产品?",
          answerText: "提供柔性装配线。",
          accuracy: "ACCURATE",
          recommendationStrength: "MODERATE",
          evidenceIds: [evidenceId],
        },
        {
          id: "aiv_2",
          questionCategory: "PURCHASE_DECISION",
          question: "柔性装配线如何选择?",
          answerText: "应核验交付能力。",
          accuracy: "PARTIAL",
          recommendationStrength: "WEAK",
          evidenceIds: [evidenceId],
        },
        {
          id: "aiv_3",
          questionCategory: "BRAND_DIRECT",
          question: "示例智能装备服务哪些地区?",
          answerText: "主要面向华东。",
          accuracy: "ACCURATE",
          recommendationStrength: "MODERATE",
          evidenceIds: [evidenceId],
        },
      ],
    },
    {
      strengths: [],
      coreIssues: [],
      geoOpportunities: [],
      competitorGaps: [],
      demonstrationFix: null,
    },
  ];
}

describe("normal REAL runtime analysis_stage_runs", () => {
  it("persists every strictly validated stage before Canonical finalization", async () => {
    const db = openMigratedDatabase(":memory:");
    const storage = new SqliteStorageAdapter(db, { now: () => NOW });
    await storage.createDiagnosisRequest({
      id: "diag_normal_stage_runs",
      inputJson: JSON.stringify({ website: "https://example-equip.com" }),
      publicToken: "tok_normal_stage_runs",
    });
    const evidence = buildSampleReport().evidence;
    const coverage = deriveCoverage({
      evidence,
      firstPartyDomains: ["example-equip.com"],
      executedQueries: ["示例智能装备 官网"],
    });
    const pipeline: EvidencePipeline = {
      async search() {
        return { data: {} };
      },
      async crawl(_ctx, result) {
        return result;
      },
      async normalize() {
        return {
          evidence,
          coverage,
          analysisProvenance: {
            evidenceRegistryHash: "a".repeat(64),
            competitorResolutionHash: "b".repeat(64),
            queryPlanHash: "c".repeat(64),
          },
        };
      },
    };
    const outputs = stageOutputs(evidence[0]!.id);
    let call = 0;
    const deepseek: StructuredCompletionProvider = {
      completeJson: vi.fn(async () => ({ ok: true as const, json: outputs[call++] })),
    };
    const producer = createRealReportProducer({
      deepseek,
      tracker: new CanaryBudgetTracker(),
      model: "deepseek-v4-flash",
      clock: () => NOW,
    });
    const order: string[] = [];
    const complete = storage.completeAnalysisStageRun.bind(storage);
    vi.spyOn(storage, "completeAnalysisStageRun").mockImplementation(async (input) => {
      await complete(input);
      order.push(`stage:${input.id}`);
    });
    const saveReport = storage.saveReport.bind(storage);
    vi.spyOn(storage, "saveReport").mockImplementation(async (input) => {
      order.push("report");
      await saveReport(input);
    });
    let id = 0;
    const result = await runDiagnosisPipeline(
      { storage, evidence: pipeline, producer, idFactory: () => `id_${++id}`, clock: () => NOW },
      {
        diagnosisId: "diag_normal_stage_runs",
        publicToken: "tok_normal_stage_runs",
        input: { website: "https://example-equip.com", brandName: "示例智能装备" },
      },
    );

    expect(result.ok).toBe(true);
    expect(deepseek.completeJson).toHaveBeenCalledTimes(4);
    const runs = await storage.getAnalysisStageRuns("diag_normal_stage_runs");
    expect(runs.map((run) => [run.stage, run.status])).toEqual([
      ["REPORT_AI_VISIBILITY", "SUCCEEDED"],
      ["REPORT_CLAIMS", "SUCCEEDED"],
      ["REPORT_PROFILE", "SUCCEEDED"],
      ["REPORT_SCORING", "SUCCEEDED"],
    ]);
    expect(runs.every((run) => run.outputJson !== null && run.outputHash !== null)).toBe(true);
    expect(runs.every((run) => run.providerUsageId !== null)).toBe(true);
    expect(order.slice(0, 4).every((entry) => entry.startsWith("stage:"))).toBe(true);
    expect(order[4]).toBe("report");
    const usage = await storage.getProviderUsage("diag_normal_stage_runs");
    expect(usage.filter((item) => item.provider === "deepseek")).toHaveLength(4);
    db.close();
  });
});
