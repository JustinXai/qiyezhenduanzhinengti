// ============================================================================
// Shared environment loader for CLI tools (Round-4B).
//
// Next's web/app runtime auto-loads `.env.local` + `.env`; standalone `tsx` CLI
// entrypoints do NOT. This is the single, shared loader those CLI tools call
// BEFORE reading `process.env`, so there is exactly ONE env-loading mechanism in
// the repo (no per-script dotenv). It wraps Next's official `@next/env`.
//
// Invariants:
//   1. Loads at most once per process (idempotent; `force` only for tests).
//   2. Reads `.env.local` then `.env` from the project root via @next/env.
//   3. Never prints environment values (the @next/env logger is silenced).
//   4. Never overrides a variable that was already set explicitly in the process
//      environment (shell/PowerShell wins over the file) — enforced by snapshot +
//      restore so it is deterministic regardless of @next/env internals.
//   5. File loading can be disabled for tests (`skipFileLoad` / `LOAD_ENV_SKIP=1`);
//      note @next/env already skips `.env.local` when NODE_ENV==='test'.
//   6. SERVER-ONLY: throws if imported into a browser bundle.
//   7. Carries NO `NEXT_PUBLIC_*` provider config — provider secrets never reach
//      the client (see tests/runtime/load-environment.test.ts).
// ============================================================================

import { loadEnvConfig } from "@next/env";

/** The only variables this loader is responsible for (server-side provider config). */
export const MANAGED_ENV_KEYS = [
  "BOCHA_API_KEY",
  "BOCHA_BASE_URL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "PROVIDER_MODE",
  "PROVIDER_CANARY_AUTHORIZED",
  "DIAGNOSIS_SMOKE_MODE",
] as const;

export interface LoadEnvironmentOptions {
  /** Project root to read `.env.local`/`.env` from. Defaults to `process.cwd()`. */
  dir?: string;
  /** Skip file loading entirely (hermetic tests). */
  skipFileLoad?: boolean;
  /** Force a reload even if already loaded (tests only). */
  force?: boolean;
}

let loaded = false;

const silentLog = { info: () => {}, error: () => {} };

/**
 * Load `.env.local` + `.env` for a CLI process, once. Server-only. Never prints
 * values. Process-explicit variables always win over file values.
 */
export function loadEnvironment(options: LoadEnvironmentOptions = {}): void {
  if (typeof window !== "undefined") {
    throw new Error("loadEnvironment() is server-only and must not run in the browser.");
  }
  if (loaded && !options.force) return;

  if (options.skipFileLoad || process.env.LOAD_ENV_SKIP === "1") {
    loaded = true;
    return;
  }

  const dir = options.dir ?? process.cwd();

  // Snapshot the managed keys that are ALREADY set in the process so file values
  // can never clobber an explicit shell/PowerShell setting (invariant 4).
  const preset = new Map<string, string>();
  for (const key of MANAGED_ENV_KEYS) {
    const v = process.env[key];
    if (typeof v === "string") preset.set(key, v);
  }

  // @next/env: dev=false → loads `.env.local` (unless NODE_ENV==='test') then `.env`.
  loadEnvConfig(dir, false, silentLog, options.force ?? false);

  for (const [key, value] of preset) process.env[key] = value;

  loaded = true;
}

/** Test hook: allow a subsequent load to run again. */
export function resetEnvironmentLoadedFlag(): void {
  loaded = false;
}
