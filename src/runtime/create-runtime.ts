// Production wiring for the diagnoses API.
//
// Providers are selected by an EXPLICIT provider mode (never an implicit
// fixture/scenario default masquerading as production):
//   - "mock" (default this round): inject the scenario mock Bocha + scenario
//     DeepSeek seams from ./live-seams (real Agent C/D code, deterministic mock
//     providers, no network). The Claim–Evidence verifier defaults to the
//     deterministic (zero provider call) strategy inside the state machine.
//   - "real": NOT enabled in this pre-real-sample build. Selecting it fails loud
//     rather than silently falling back to mock or issuing a real Bocha/DeepSeek
//     call — real-sample runs require explicit future authorization.

import { openMigratedDatabase } from "../storage/migrate";
import { SqliteStorageAdapter } from "../storage/sqlite-adapter";
import {
  createLiveEvidencePipeline,
  createLiveReportProducer,
} from "../diagnosis/orchestration/live-seams";
import type {
  EvidencePipeline,
  ReportProducer,
} from "../diagnosis/orchestration/state-machine";
import type { DiagnosesApiDeps } from "./api/diagnoses-handlers";

const DEFAULT_DB_URL = "./data/dev.sqlite";

export type ProviderMode = "mock" | "real";

let singleton: DiagnosesApiDeps | null = null;

function resolveDbUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DB_URL;
}

/** Explicit provider mode; defaults to "mock" for this pre-real-sample build. */
export function resolveProviderMode(): ProviderMode {
  return (process.env.PROVIDER_MODE ?? "mock").toLowerCase() === "real" ? "real" : "mock";
}

/** Select the evidence pipeline + report producer for a provider mode. */
export function buildProviders(mode: ProviderMode): {
  evidence: EvidencePipeline;
  producer: ReportProducer;
} {
  if (mode === "real") {
    throw new Error(
      "PROVIDER_MODE=real is not enabled in this build. Real Bocha/DeepSeek " +
        "sample runs require explicit authorization (pre-real-sample hardening).",
    );
  }
  // Explicit MOCK-MODE injection — deterministic scenario providers only.
  return {
    evidence: createLiveEvidencePipeline(),
    producer: createLiveReportProducer(),
  };
}

/** Lazily open the DB + migrate on first request, then reuse the connection. */
export function getRuntime(): DiagnosesApiDeps {
  if (!singleton) {
    const db = openMigratedDatabase(resolveDbUrl());
    const { evidence, producer } = buildProviders(resolveProviderMode());
    singleton = {
      storage: new SqliteStorageAdapter(db),
      evidence,
      producer,
      // verifier omitted → state machine defaults to the deterministic verifier.
    };
  }
  return singleton;
}

/** Test/reset hook: drop the cached runtime so the next call rebuilds it. */
export function resetRuntime(): void {
  singleton = null;
}
