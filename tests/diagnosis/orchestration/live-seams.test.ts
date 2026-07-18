import { describe, expect, it } from "vitest";
import {
  createLiveEvidencePipeline,
  createLiveReportProducer,
} from "../../../src/diagnosis/orchestration/live-seams";
import { publishGuard } from "../../../src/report/validation";
import {
  parseDiagnosisInput,
  type DiagnosisInput,
} from "../../../src/runtime/diagnosis-input";
import type {
  EvidenceStageContext,
  ReportProducerContext,
} from "../../../src/diagnosis/orchestration/state-machine";

const CLOCK = () => new Date("2026-07-18T00:00:00.000Z");

function input(raw: Record<string, unknown>): DiagnosisInput {
  const res = parseDiagnosisInput({ website: "https://example-equip.com", ...raw });
  if (!res.ok) throw new Error(`bad fixture input: ${JSON.stringify(res.issues)}`);
  return res.input;
}

/** Drive the evidence pipeline + report producer across the orchestration seam. */
async function run(inp: DiagnosisInput) {
  const pipeline = createLiveEvidencePipeline();
  const producer = createLiveReportProducer(CLOCK);
  const ctx: EvidenceStageContext = { diagnosisId: "diag_1", input: inp };
  const s = await pipeline.search(ctx);
  const c = await pipeline.crawl(ctx, s);
  const n = await pipeline.normalize(ctx, c);
  const pctx: ReportProducerContext = {
    diagnosisId: "diag_1",
    publicToken: "tok_1",
    input: inp,
    evidence: n.evidence,
  };
  const produced = await producer.produce(pctx);
  return { evidence: n.evidence, produced };
}

describe("live-seams competitor resolution wiring", () => {
  it("no hard-coded competitor host: with no competitors nothing is competitor evidence", async () => {
    const { evidence, produced } = await run(input({}));
    expect(evidence.some((e) => e.sourceType === "COMPETITOR_WEB_EVIDENCE")).toBe(false);
    expect(produced.ok).toBe(true);
    if (produced.ok) {
      // 无法确认 → 不得生成确定性竞品差距.
      expect(produced.report.competitorGaps).toEqual([]);
    }
  });

  it("USER_CONFIRMED competitor domain drives competitor evidence + a labelled gap", async () => {
    const { evidence, produced } = await run(
      input({ competitors: [{ name: "示例竞品", website: "https://competitor-demo.example.net" }] }),
    );
    const competitorEv = evidence.filter((e) => e.sourceType === "COMPETITOR_WEB_EVIDENCE");
    expect(competitorEv.length).toBeGreaterThan(0);
    expect(competitorEv.every((e) => e.sourceDomain === "competitor-demo.example.net")).toBe(true);
    expect(produced.ok).toBe(true);
    if (produced.ok) {
      expect(produced.report.competitorGaps.length).toBeGreaterThan(0);
      expect(produced.report.competitorGaps[0]!.competitorName).toBe("示例竞品");
    }
  });

  it("name-only RESOLVED competitor contributes its official page as competitor evidence", async () => {
    const { evidence, produced } = await run(input({ competitors: ["GoPro"] }));
    expect(evidence.some((e) => e.sourceDomain === "gopro.com" && e.sourceType === "COMPETITOR_WEB_EVIDENCE")).toBe(true);
    expect(produced.ok).toBe(true);
    if (produced.ok) {
      expect(produced.report.competitorGaps[0]!.competitorName).toBe("GoPro");
    }
  });

  it("AMBIGUOUS competitor produces NO competitor evidence and NO deterministic gap", async () => {
    const { evidence, produced } = await run(input({ competitors: ["星辰科技"] }));
    expect(evidence.some((e) => e.sourceType === "COMPETITOR_WEB_EVIDENCE")).toBe(false);
    expect(produced.ok).toBe(true);
    if (produced.ok) expect(produced.report.competitorGaps).toEqual([]);
  });

  it("produces a report that passes the Agent B publish guard", async () => {
    const { produced } = await run(
      input({ competitors: [{ name: "示例竞品", website: "https://competitor-demo.example.net" }] }),
    );
    expect(produced.ok).toBe(true);
    if (produced.ok) {
      const guard = publishGuard({ report: produced.report });
      expect(guard.ok).toBe(true);
    }
  });

  it("is deterministic for the same request", async () => {
    const a = await run(input({ competitors: ["GoPro"] }));
    const b = await run(input({ competitors: ["GoPro"] }));
    expect(a.produced.ok && b.produced.ok).toBe(true);
    if (a.produced.ok && b.produced.ok) {
      expect(JSON.stringify(a.produced.report)).toBe(JSON.stringify(b.produced.report));
    }
  });
});
