// ============================================================================
// Round-3 pre-real-sample canaries.
//
// Each canary drives the FULL stack with mock providers only:
//   API handler → runtime → evidence pipeline (Agent C) → claims (Agent D)
//   → ClaimEvidenceVerifier → publish guard (Agent B) → storage → report read
//   → presentation (Quick/Deep from the same canonical report).
// No real Bocha/DeepSeek, no network. Uses an in-memory SQLite database.
// ============================================================================
import { afterEach, describe, expect, it } from "vitest";
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
import { publishGuard } from "../../src/report/validation";
import {
  createDeterministicVerifier,
  verifyReport,
} from "../../src/diagnosis/verification";
import { emptyCoverage } from "../../src/contracts/claim-evidence";

let db: BetterSqlite3.Database | null = null;

function deps() {
  db = openMigratedDatabase(":memory:");
  const storage = new SqliteStorageAdapter(db);
  const { evidence, producer } = buildProviders("mock");
  return { storage, evidence, producer };
}

afterEach(() => {
  db?.close();
  db = null;
});

async function createAndRead(input: Record<string, unknown>) {
  const d = deps();
  const created = await handleCreateDiagnosis(d, {
    website: "https://canary-demo.example.com",
    ...input,
  });
  expect(created.status).toBe(201);
  const body = created.body as { diagnosisId: string; publicToken: string; status: string };
  const got = await handleGetDiagnosis(d, { id: body.diagnosisId, publicToken: body.publicToken });
  const view = got.body as DiagnosisView;
  const relations = await d.storage.getClaimEvidenceRelations(body.diagnosisId);
  return { body, view, relations, storage: d.storage };
}

describe("Round-3 canaries (full stack, mock providers)", () => {
  it("Canary A — first-party product page DIRECTLY supports a product fact (DIRECT_SUPPORT)", async () => {
    const { body, view, relations } = await createAndRead({
      brandName: "金丝雀甲",
      industry: "工业自动化设备",
      competitors: [{ name: "示例竞品", website: "https://competitor-demo.example.net" }],
    });
    expect(body.status).toBe("READY");
    expect(view.report).not.toBeNull();
    // At least one relation was verified to DIRECT_SUPPORT — and it came from the
    // verifier (never from source authority).
    const direct = relations.filter((r) => r.supportLevel === "DIRECT_SUPPORT");
    expect(direct.length).toBeGreaterThan(0);
    expect(direct.every((r) => r.verifierMode === "MOCK_DETERMINISTIC")).toBe(true);
    // Quick + Deep are projected from the SAME canonical report.
    const { quick, deep } = presentReport(view.report!);
    expect(quick.diagnosisId).toBe(deep.diagnosisId);
    expect(quick.overallScore).toBe(deep.scores.overallScore);
  });

  it("Canary B — an About-page attempt to support a missing-procurement claim cannot publish WITHOUT coverage", async () => {
    // Produce a real canonical report (it contains negative/missing core issues
    // e.g. 「缺少面向采购决策的常见问题解答内容」), then re-verify it with an EMPTY
    // measurement boundary: a negative claim with no coverage must be rejected.
    const { view } = await createAndRead({ brandName: "金丝雀乙", industry: "工业自动化设备" });
    const report = view.report!;
    expect(report.coreIssues.length).toBeGreaterThan(0);

    const noCoverage = emptyCoverage();
    const { relations } = await verifyReport({
      report,
      coverage: noCoverage,
      strategy: createDeterministicVerifier(),
    });
    const guard = publishGuard({ report, relations, coverage: noCoverage });
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      // The block is a §4 evidence-support violation (negative claim unbounded).
      expect(guard.violations.some((v) => v.rule.startsWith("TRUTH_4_"))).toBe(true);
    }
  });

  it("Canary C — an AMBIGUOUS competitor yields NO deterministic competitor gap", async () => {
    const { body, view } = await createAndRead({
      brandName: "金丝雀丙",
      competitors: ["星辰科技"], // ambiguous fixture → AMBIGUOUS
    });
    expect(body.status).toBe("READY");
    const report = view.report!;
    expect(report.competitorGaps).toEqual([]);
    // Quick view surfaces the conditional "insufficient evidence" state, not a gap.
    const { quick } = presentReport(report);
    expect(quick.competitorGapSummary.available).toBe(false);
  });
});
