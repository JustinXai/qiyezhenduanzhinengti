// ============================================================================
// ServerEnv — the single source of truth for interpreting server-side provider
// configuration (Round-4B). Env strings are validated/normalized HERE with Zod;
// adapters and CLI tools consume the typed result rather than re-reading and
// re-interpreting `process.env` themselves.
//
//   .env.local → loadEnvironment() → ServerEnv → *Config → provider adapters
//
// This module NEVER logs values. It is server-only (imported by CLI tools and
// server runtime, never client code). It intentionally ignores any `NEXT_PUBLIC_*`
// variable — provider secrets are never client-exposed.
// ============================================================================

import { z } from "zod";

/** Normalize `PROVIDER_MODE`: anything other than an explicit REAL is MOCK. */
const providerMode = z.preprocess(
  (v) => (typeof v === "string" && v.trim().toUpperCase() === "REAL" ? "REAL" : "MOCK"),
  z.enum(["MOCK", "REAL"]),
);

/** Coerce a boolean-ish string. Default provided by callers via `.default`. */
const boolFrom = (def: boolean) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return def;
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    return def;
  }, z.boolean());

const optStr = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1))
  .optional();

/**
 * The raw, normalized server environment. Provider secrets are optional here —
 * whether they are REQUIRED depends on the selected config (development vs canary).
 */
export const ServerEnvSchema = z.object({
  BOCHA_API_KEY: optStr,
  BOCHA_BASE_URL: optStr,
  DEEPSEEK_API_KEY: optStr,
  DEEPSEEK_BASE_URL: optStr,
  DEEPSEEK_MODEL: optStr,
  PROVIDER_MODE: providerMode.default("MOCK"),
  PROVIDER_CANARY_AUTHORIZED: boolFrom(false).default(false),
  DIAGNOSIS_SMOKE_MODE: boolFrom(true).default(true),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

type RawEnv = Record<string, string | undefined>;

/** Pick + validate the managed keys from a raw env into a typed ServerEnv. */
export function parseServerEnv(env: RawEnv = process.env): ServerEnv {
  return ServerEnvSchema.parse({
    BOCHA_API_KEY: env.BOCHA_API_KEY,
    BOCHA_BASE_URL: env.BOCHA_BASE_URL,
    DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: env.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: env.DEEPSEEK_MODEL,
    PROVIDER_MODE: env.PROVIDER_MODE,
    PROVIDER_CANARY_AUTHORIZED: env.PROVIDER_CANARY_AUTHORIZED,
    DIAGNOSIS_SMOKE_MODE: env.DIAGNOSIS_SMOKE_MODE,
  });
}

// --- Development config: the everyday default. Keys may be present; MOCK. -------

export interface DevelopmentConfig {
  providerMode: "MOCK" | "REAL";
  smokeMode: boolean;
  canaryAuthorized: boolean;
}

export function resolveDevelopmentConfig(env: RawEnv = process.env): DevelopmentConfig {
  const parsed = parseServerEnv(env);
  return {
    providerMode: parsed.PROVIDER_MODE,
    smokeMode: parsed.DIAGNOSIS_SMOKE_MODE,
    canaryAuthorized: parsed.PROVIDER_CANARY_AUTHORIZED,
  };
}

// --- Provider canary config: strict, fail-closed real-provider requirements. ---

/** The five provider settings + two authorization switches a real canary needs. */
export const ProviderCanaryConfigSchema = z.object({
  BOCHA_API_KEY: z.string().trim().min(1),
  BOCHA_BASE_URL: z.string().trim().min(1),
  DEEPSEEK_API_KEY: z.string().trim().min(1),
  DEEPSEEK_BASE_URL: z.string().trim().min(1),
  DEEPSEEK_MODEL: z.string().trim().min(1),
  PROVIDER_MODE: z.literal("REAL"),
  PROVIDER_CANARY_AUTHORIZED: z.literal(true),
});

export type ProviderCanaryConfig = z.infer<typeof ProviderCanaryConfigSchema>;

export type ProviderCanaryConfigResult =
  | { ok: true; config: ProviderCanaryConfig }
  | { ok: false; code: "REAL_PROVIDER_NOT_AUTHORIZED"; missing: string[]; reason: string };

/**
 * Resolve the strict real-canary config, or a fail-closed reason. NEVER falls back
 * to MOCK and NEVER returns secret values in the failure path (only key NAMES).
 */
export function resolveProviderCanaryConfig(env: RawEnv = process.env): ProviderCanaryConfigResult {
  const base = parseServerEnv(env);
  const candidate = {
    BOCHA_API_KEY: base.BOCHA_API_KEY,
    BOCHA_BASE_URL: base.BOCHA_BASE_URL,
    DEEPSEEK_API_KEY: base.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: base.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: base.DEEPSEEK_MODEL,
    PROVIDER_MODE: base.PROVIDER_MODE,
    PROVIDER_CANARY_AUTHORIZED: base.PROVIDER_CANARY_AUTHORIZED,
  };
  const parsed = ProviderCanaryConfigSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, config: parsed.data };

  // Report only the offending FIELD NAMES — never their values.
  const missing = Array.from(new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "<root>"))));
  return {
    ok: false,
    code: "REAL_PROVIDER_NOT_AUTHORIZED",
    missing,
    reason: `real provider canary config incomplete: ${missing.join(", ")}`,
  };
}
