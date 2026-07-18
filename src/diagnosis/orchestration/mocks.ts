// Round-1 mock seam implementations.
//
// These stand in for Agent C (search/crawl/evidence) and Agent D (report
// generator) so the state machine, storage and API can be built and tested in
// isolation. They are deterministic and perform NO network or provider I/O.
// At integration these are swapped for the real engines — the seam interfaces
// in ./state-machine.ts are the contract that must not drift.

import {
  SAMPLE_DIAGNOSIS_REPORT,
  buildSampleReport,
} from "../../fixtures/sample-report";
import type { EvidenceItem } from "../../contracts";
import type {
  EvidencePipeline,
  ReportProducer,
} from "./state-machine";

// INTEGRATION SEAM (Agent C search/evidence). Offline, deterministic.
export function createMockEvidencePipeline(opts?: {
  evidence?: EvidenceItem[];
}): EvidencePipeline {
  const evidence = opts?.evidence ?? SAMPLE_DIAGNOSIS_REPORT.evidence;
  return {
    async search(ctx) {
      return {
        data: { queries: [ctx.input.website, ctx.input.brandName ?? ""] },
        usage: [{ provider: "bocha", stage: "SEARCHING", callCount: 1 }],
      };
    },
    async crawl() {
      return {
        data: { pagesCrawled: evidence.length },
        usage: [
          { provider: "bocha", stage: "CRAWLING", callCount: evidence.length },
        ],
      };
    },
    async normalize() {
      return { evidence: structuredClone(evidence) };
    },
  };
}

// INTEGRATION SEAM (Agent D report generator). Offline, deterministic.
// Returns the shared canonical sample, rebound to the live diagnosis identity
// so the report references the request that produced it.
export function createMockReportProducer(): ReportProducer {
  return {
    async produce(ctx) {
      const report = buildSampleReport({
        diagnosisId: ctx.diagnosisId,
        publicToken: ctx.publicToken,
      });
      return {
        ok: true,
        report,
        usage: [{ provider: "deepseek", stage: "ANALYZING", callCount: 1 }],
      };
    },
  };
}
