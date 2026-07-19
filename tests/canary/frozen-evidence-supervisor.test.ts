import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../scripts/run-frozen-evidence-reanalysis-supervisor.ts", import.meta.url),
  "utf8",
);

describe("Round-5.2C Supervisor private execution seam", () => {
  it("wires only the frozen Evidence runtime and DeepSeek analysis provider", () => {
    expect(source).toContain("reanalyzeFromFrozenEvidence");
    expect(source).toContain("createDeepSeekProvider");
    for (const forbiddenImport of [
      "query-planner",
      "bocha-adapter",
      "guarded-crawler",
      "evidence/normalize",
      "competitors/resolve",
    ]) {
      expect(source).not.toContain(forbiddenImport);
    }
  });

  it("requires process-only real mode, repair authorization, and smoke=false", () => {
    expect(source).toContain('process.env.PROVIDER_MODE !== "REAL"');
    expect(source).toContain('process.env.DIAGNOSIS_SMOKE_MODE !== "false"');
    expect(source).toContain('process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED !== "true"');
    expect(source).toContain('process.env.DEEPSEEK_MODEL !== "deepseek-v4-flash"');
  });

  it("runs existing guards and verifies the three rendered views at 390px", () => {
    for (const required of [
      "verifyReport",
      "publishGuard",
      "chinesePublicReportGuard",
      "frozenEvidenceGuard",
      "width: 390",
      'name: "完整诊断"',
      'name: "证据"',
    ]) {
      expect(source).toContain(required);
    }
  });
});
