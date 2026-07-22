// ============================================================================
// Round-3 pre-real-sample canaries — data-plane assertions through the REAL
// application boundary (API handlers → runtime state machine → competitor
// resolution → evidence → claims → ClaimEvidenceVerification → publish guard →
// storage → GET → presentation Quick/Deep/Evidence view models).
//
// Mock providers only (PROVIDER_MODE=MOCK), zero network, in-memory SQLite.
// The browser/page-level assertions live in tests/e2e/canary.spec.ts.
// Scenarios are selected by controlled test config (CANARY_MODE + a reserved
// canary host / competitor input), never by ordinary public-API input.
// ============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import { openMigratedDatabase } from "../../src/storage/migrate";
import { SqliteStorageAdapter } from "../../src/storage/sqlite-adapter";
import { buildProviders } from "../../src/runtime/create-runtime";
import {
  handleCreateDiagnosis,
  handleGetDiagnosis,
  type DiagnosisView,
} from "../../src/runtime/api/diagnoses-handlers";
import { presentReport } from "../../src/report/presentation";
import { countQuickVisibleChars } from "../../src/report/validation";

let db: BetterSqlite3.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
  delete process.env.CANARY_MODE;
  vi.restoreAllMocks();
});

function deps() {
  db = openMigratedDatabase(":memory:");
  const storage = new SqliteStorageAdapter(db);
  const { evidence, producer } = buildProviders("MOCK");
  return { storage, evidence, producer };
}

async function runCanary(input: Record<string, unknown>) {
  // Assert zero real network for the whole boundary crossing.
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("unexpected network call in a canary (PROVIDER_MODE=MOCK)");
  }) as typeof fetch);
  const d = deps();
  const created = await handleCreateDiagnosis(d, { website: "https://canary.example.com", ...input });
  expect(created.status).toBe(201);
  const body = created.body as { diagnosisId: string; publicToken: string; status: string };
  const got = await handleGetDiagnosis(d, { id: body.diagnosisId, publicToken: body.publicToken });
  const view = got.body as DiagnosisView;
  const relations = await d.storage.getClaimEvidenceRelations(body.diagnosisId);
  const pruneDecisions = await d.storage.getPruneDecisions(body.diagnosisId);
  expect(fetchSpy).not.toHaveBeenCalled();
  return { body, view, relations, pruneDecisions };
}

describe("Round-3 canaries (data plane, full boundary, MOCK)", () => {
  it("Canary A — first-party product page DIRECTLY supports a product fact", async () => {
    const { body, view, relations } = await runCanary({
      brandName: "金丝雀甲",
      industry: "工业自动化设备",
      competitors: [{ name: "示例竞品", website: "https://competitor-demo.example.net" }],
    });
    expect(body.status).toBe("READY");
    const report = view.report!;
    // A DIRECT relation exists and came from the verifier (never source authority).
    const direct = relations.filter((r) => r.supportLevel === "DIRECT_SUPPORT");
    expect(direct.length).toBeGreaterThan(0);
    expect(direct.every((r) => r.verifierMode === "MOCK_DETERMINISTIC")).toBe(true);
    expect(direct.every((r) => report.evidence.some((e) => e.id === r.evidenceId))).toBe(true);
    // Quick + Deep project from the SAME canonical report; evidence ids match.
    const { quick, deep, evidence } = presentReport(report);
    expect(quick.diagnosisId).toBe(deep.diagnosisId);
    expect(quick.overallScore).toBe(deep.scores.overallScore);
    const evidenceIds = new Set(evidence.items.map((i) => i.id));
    // Round-8 FINAL: coreIssues removed from Quick — skip evidence id check on quick.coreIssues.
    expect(countQuickVisibleChars(quick)).toBeLessThanOrEqual(1800);
  });

  it("Canary B — About-only: the negative 采购验收 claim is pruned (no coverage), report still READY", async () => {
    process.env.CANARY_MODE = "1";
    const { body, view, relations, pruneDecisions } = await runCanary({
      website: "https://about-only.canary.test",
      brandName: "金丝雀乙",
    });
    expect(body.status).toBe("READY");
    const report = view.report!;
    // The negative/missing procurement claim did NOT publish as a core issue.
    expect(report.coreIssues.some((c) => c.statement.includes("采购"))).toBe(false);
    // No relation backs the pruned negative claim with coverage support.
    expect(
      relations.some((r) => r.basis === "MEASUREMENT_BOUNDARY" && r.supportLevel !== "CONTEXT_ONLY"),
    ).toBe(false);
    // A content-supported About strength survives, so the report is non-empty.
    expect(report.strengths.length).toBeGreaterThan(0);
    expect(pruneDecisions).toEqual([
      expect.objectContaining({
        diagnosisId: body.diagnosisId,
        reportId: expect.any(String),
        revisionId: null,
        claimKind: "coreIssue",
        candidateRef: "iss_1",
        reasonCode: "NO_MEASUREMENT_COVERAGE",
        guardRule: "COVERAGE_NOT_ESTABLISHED",
        coverageStatus: "NOT_ESTABLISHED",
      }),
    ]);
    // Quick view surfaces no fabricated procurement core issue (coreIssues removed from Quick in Round-8).
    const { quick } = presentReport(report);
    // The canonical report should not have a procurement core issue either.
    expect(report.coreIssues.some((c) => c.statement.includes("采购"))).toBe(false);
  });

  it("Canary C — AMBIGUOUS competitor yields NO deterministic competitor gap", async () => {
    const { body, view } = await runCanary({ brandName: "金丝雀丙", competitors: ["星辰科技"] });
    expect(body.status).toBe("READY");
    const report = view.report!;
    expect(report.competitorGaps).toEqual([]);
    const { quick } = presentReport(report);
    expect(quick.competitorGapSummary.available).toBe(false);
  });

  it("Public API never leaks verifier internals (justification / version / checkpoint)", async () => {
    const { view } = await runCanary({ brandName: "边界", competitors: ["星辰科技"] });
    const json = JSON.stringify(view);
    for (const forbidden of [
      "justification",
      "verifierVersion",
      "verifierMode",
      "MOCK_DETERMINISTIC",
      "claim-evidence.deterministic",
      "promptVersion",
      "trustGuardVersion",
      "checkpoint",
      "pruneDecisions",
      "independentSupportSourceCount",
      "guardRule",
      "requestId",
      // "coverage" is intentionally kept out — Round-7 questionCoverageGaps uses it legitimately
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});
