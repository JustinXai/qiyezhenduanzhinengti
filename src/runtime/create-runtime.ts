// Production wiring for the diagnoses API.
//
// Providers are selected by an EXPLICIT, controlled provider mode — never an
// implicit fixture/scenario default masquerading as production, and never a
// value that a request body, query string or page parameter can influence.
//
//   MOCK (default this build): inject the scenario mock Bocha + scenario DeepSeek
//     seams from ./live-seams (real Agent C/D code, deterministic mock providers,
//     no network, no provider cost). The Claim–Evidence verifier defaults to the
//     deterministic (zero provider call) strategy inside the state machine.
//   REAL: must pass a preflight (required provider config + explicit canary
//     authorization). It NEVER silently falls back to MOCK; when it cannot be
//     satisfied it throws a typed error (REAL_PROVIDER_NOT_AUTHORIZED /
//     PROVIDER_CANARY_REQUIRED). Real Bocha/DeepSeek execution is NOT enabled in
//     this pre-real-sample build.

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

export type ProviderMode = "MOCK" | "REAL";

/** Typed provider-mode error codes (never leaked to the public report/page). */
export const PROVIDER_ERROR = {
  NOT_AUTHORIZED: "REAL_PROVIDER_NOT_AUTHORIZED",
  CANARY_REQUIRED: "PROVIDER_CANARY_REQUIRED",
} as const;

export class ProviderModeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderModeError";
    this.code = code;
  }
}

type Env = Record<string, string | undefined>;

let singleton: DiagnosesApiDeps | null = null;

function resolveDbUrl(env: Env = process.env): string {
  return env.DATABASE_URL ?? DEFAULT_DB_URL;
}

/**
 * The provider mode comes ONLY from controlled server configuration
 * (`PROVIDER_MODE` env). It is never derived from a request body, query string,
 * header or page parameter. Anything other than an explicit "REAL" is MOCK.
 */
export function resolveProviderMode(env: Env = process.env): ProviderMode {
  return (env.PROVIDER_MODE ?? "MOCK").trim().toUpperCase() === "REAL" ? "REAL" : "MOCK";
}

/** Required real-provider configuration keys (checked before any real call). */
const REAL_REQUIRED_KEYS = ["BOCHA_API_KEY", "DEEPSEEK_API_KEY"] as const;

/**
 * Real-provider preflight. Returns null when real mode could proceed; otherwise a
 * typed error. It NEVER returns mock providers as a fallback.
 * This build: real execution is not authorized, so a fully-configured real mode
 * still stops at PROVIDER_CANARY_REQUIRED.
 */
export function realProviderPreflight(env: Env = process.env): ProviderModeError | null {
  const missing = REAL_REQUIRED_KEYS.filter((k) => !(env[k] && env[k]!.trim().length > 0));
  if (missing.length > 0) {
    return new ProviderModeError(
      PROVIDER_ERROR.NOT_AUTHORIZED,
      `REAL provider mode is missing required configuration: ${missing.join(", ")}. ` +
        "Real Bocha/DeepSeek runs are not authorized in this build.",
    );
  }
  // Configured, but real execution still requires an authorized provider-canary
  // phase that this build does not enable — never silently downgrade to mock.
  return new ProviderModeError(
    PROVIDER_ERROR.CANARY_REQUIRED,
    "REAL provider mode requires an authorized provider-canary phase, which is not " +
      "enabled in this pre-real-sample build.",
  );
}

/** Select the evidence pipeline + report producer for a provider mode. */
export function buildProviders(
  mode: ProviderMode,
  env: Env = process.env,
): { evidence: EvidencePipeline; producer: ReportProducer } {
  if (mode === "REAL") {
    // Fail loud with a typed error; do NOT fall back to mock providers.
    throw realProviderPreflight(env) ?? new ProviderModeError(PROVIDER_ERROR.CANARY_REQUIRED, "REAL not enabled.");
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
