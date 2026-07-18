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
//   REAL (Round-5): requires the full preflight — provider config PLUS the
//     independent server-side TECHNICAL_COMPANY_CANARY_AUTHORIZED=true switch
//     with DIAGNOSIS_SMOKE_MODE=false. All three come ONLY from server env;
//     no request field, query parameter or page input can enable them. When
//     satisfied, the real seams (real Bocha + guarded crawler + real DeepSeek,
//     frozen TECHNICAL_COMPANY_CANARY_V1 budget) are injected. It NEVER falls
//     back to MOCK; an unsatisfied preflight throws a typed error
//     (REAL_PROVIDER_NOT_AUTHORIZED / TECHNICAL_COMPANY_CANARY_NOT_AUTHORIZED).

import { openMigratedDatabase } from "../storage/migrate";
import { SqliteStorageAdapter } from "../storage/sqlite-adapter";
import {
  createLiveEvidencePipeline,
  createLiveReportProducer,
} from "../diagnosis/orchestration/live-seams";
import { createRealSeams } from "../diagnosis/orchestration/real-seams";
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
  TECHNICAL_CANARY_NOT_AUTHORIZED: "TECHNICAL_COMPANY_CANARY_NOT_AUTHORIZED",
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
 * The independent full-diagnosis authorization switch (Round-5). Provider-canary
 * authorization does NOT imply full-diagnosis authorization: a real diagnosis
 * additionally requires TECHNICAL_COMPANY_CANARY_AUTHORIZED=true and
 * DIAGNOSIS_SMOKE_MODE=false, both read ONLY from controlled server env —
 * never from a request body, query string, header or page parameter.
 */
export function technicalCanaryAuthorized(env: Env = process.env): boolean {
  const authorized =
    (env.TECHNICAL_COMPANY_CANARY_AUTHORIZED ?? "").trim().toLowerCase() === "true";
  const smokeOff = (env.DIAGNOSIS_SMOKE_MODE ?? "").trim().toLowerCase() === "false";
  return authorized && smokeOff;
}

/**
 * Real-provider preflight. Returns null when real mode may proceed; otherwise a
 * typed error. It NEVER returns mock providers as a fallback.
 */
export function realProviderPreflight(env: Env = process.env): ProviderModeError | null {
  const missing = REAL_REQUIRED_KEYS.filter((k) => !(env[k] && env[k]!.trim().length > 0));
  if (missing.length > 0) {
    return new ProviderModeError(
      PROVIDER_ERROR.NOT_AUTHORIZED,
      `REAL provider mode is missing required configuration: ${missing.join(", ")}. ` +
        "Real Bocha/DeepSeek runs are not authorized without it.",
    );
  }
  if (!technicalCanaryAuthorized(env)) {
    // Configured, but the independent full-diagnosis switch is off — never
    // silently downgrade to mock.
    return new ProviderModeError(
      PROVIDER_ERROR.TECHNICAL_CANARY_NOT_AUTHORIZED,
      "REAL full diagnosis requires the server-side TECHNICAL_COMPANY_CANARY_AUTHORIZED=true " +
        "switch with DIAGNOSIS_SMOKE_MODE=false.",
    );
  }
  return null;
}

/** Select the evidence pipeline + report producer for a provider mode. */
export function buildProviders(
  mode: ProviderMode,
  env: Env = process.env,
): { evidence: EvidencePipeline; producer: ReportProducer } {
  if (mode === "REAL") {
    const preflightError = realProviderPreflight(env);
    // Fail loud with a typed error; do NOT fall back to mock providers.
    if (preflightError) throw preflightError;
    const real = createRealSeams(env as NodeJS.ProcessEnv);
    return { evidence: real.evidence, producer: real.producer };
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
