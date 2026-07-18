// ============================================================================
// scripts/provider-canary.ts — Round-4 Provider Canary V1.
//
// Minimal, single-shot connectivity + strict-parse + security-boundary probe for
// the two paid providers (Bocha web-search, DeepSeek structured JSON). It is the
// pre-real-sample gate that MUST run green before any technical-company canary.
//
// Hard safety rails (see docs/qa/PROVIDER_CANARY_V1.md):
//   • Uses ONLY the official adapters (createBochaProvider / createDeepSeekProvider)
//     and the official strict parser (parseStageJson). No adapter bypass, no
//     bespoke lenient JSON handling, no relaxing of parsing to "make it pass".
//   • At most ONE real request per provider, ZERO retries, at most TWO real calls
//     total — enforced structurally by a budgeted fetch that THROWS on the 2nd
//     per-provider / 3rd total call rather than silently making a paid request.
//   • REAL mode is fail-closed: unauthorized or unconfigured → REAL_PROVIDER_NOT_
//     AUTHORIZED, NEVER a silent fallback to the mock providers.
//   • Creates no diagnosis, writes no report, persists no evidence, crawls no page.
//   • Telemetry is a whitelist: hashes + shape booleans + timings + usage only.
//     Never the API key, Authorization header, full prompt, or full response body.
//     Raw bodies are held transiently in memory for shape inspection and are never
//     written to disk or committed.
//
// This module exports pure, injectable functions so the guard tests exercise every
// invariant with a mocked fetch and ZERO network. `main()` runs only when invoked
// directly (tsx scripts/provider-canary.ts) and is the sole thing that touches the
// clock, the network, and the private (repo-external) artifact directory.
// ============================================================================

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import {
  BOCHA_WEB_SEARCH_ENDPOINT,
  createBochaProvider,
} from "../src/providers/bocha/bocha-adapter";
import {
  createDeepSeekProvider,
  deepSeekConfigFromEnv,
  DEFAULT_DEEPSEEK_MODEL,
} from "../src/providers/deepseek/deepseek-adapter";
import { parseStageJson } from "../src/providers/deepseek/stage-schema";
import { assertUrlAllowed } from "../src/security/crawler/ssrf-guard";
import { normalizeEvidence } from "../src/diagnosis/evidence/normalize";
import type { WebSearchResultItem } from "../src/providers/types";

// ---------------------------------------------------------------------------
// Constants — frozen canary inputs & budget.
// ---------------------------------------------------------------------------

/** Total / per-provider paid-call budget. The budgeted fetch enforces both. */
export const CANARY_BUDGET = { totalMax: 2, perProviderMax: 1 } as const;

/** Zero retries for both providers (Bocha adapter default is 2 → overridden). */
export const CANARY_MAX_RETRIES = 0;

/** Frozen Bocha probe: brand-name site lookup, three results, no page fetch. */
export const BOCHA_CANARY_QUERY = "Insta360 官方网站";
export const BOCHA_CANARY_COUNT = 3;

/** Frozen DeepSeek probe. Tiny deterministic JSON echo; 256-token ceiling. */
export const DEEPSEEK_CANARY_MAX_TOKENS = 256;
export const DEEPSEEK_CANARY_SYSTEM_PROMPT =
  "你是结构化JSON接口。必须仅输出合法json对象，不得输出Markdown代码块、解释、前后缀或额外文本。";
export const DEEPSEEK_CANARY_USER_PROMPT =
  '请返回一个合法json对象，字段和值必须与下面完全一致：\n\n' +
  '{\n  "status": "ok",\n  "purpose": "enterprise-diagnosis-provider-canary",\n  "version": 1\n}';

/** Frozen strict Zod schema for the DeepSeek answer (never relaxed to pass). */
export const DEEPSEEK_CANARY_SCHEMA = z.object({
  status: z.literal("ok"),
  purpose: z.literal("enterprise-diagnosis-provider-canary"),
  version: z.literal(1),
});

/** Typed canary-level codes distinct from the provider-runtime error taxonomy. */
export const CANARY_CODE = {
  NOT_AUTHORIZED: "REAL_PROVIDER_NOT_AUTHORIZED",
  BUDGET_EXCEEDED: "CANARY_BUDGET_EXCEEDED",
} as const;

export type Env = Record<string, string | undefined>;

// ---------------------------------------------------------------------------
// Authorization & configuration gates (fail-closed; never fall back to MOCK).
// ---------------------------------------------------------------------------

export interface AuthResult {
  ok: boolean;
  code?: string;
  reason?: string;
}

/**
 * A real canary may run ONLY when the server-controlled mode is explicitly REAL
 * and an operator has explicitly authorized the paid canary phase. Neither can be
 * influenced by request/query/page input (that is the runtime's contract; here we
 * read the process env the operator set).
 */
export function isCanaryAuthorized(env: Env): AuthResult {
  const mode = (env.PROVIDER_MODE ?? "").trim().toUpperCase();
  const authorized = (env.PROVIDER_CANARY_AUTHORIZED ?? "").trim().toLowerCase() === "true";
  if (mode !== "REAL") {
    return { ok: false, code: CANARY_CODE.NOT_AUTHORIZED, reason: "PROVIDER_MODE is not REAL" };
  }
  if (!authorized) {
    return { ok: false, code: CANARY_CODE.NOT_AUTHORIZED, reason: "PROVIDER_CANARY_AUTHORIZED is not true" };
  }
  return { ok: true };
}

/** Env vars reported (presence only) at start-up per Phase 3. */
export const REPORTED_ENV_KEYS = [
  "BOCHA_API_KEY",
  "BOCHA_BASE_URL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
] as const;

/** Hard-required config per provider for a real call to be permitted at all. */
const REQUIRED_CONFIG: Record<"bocha" | "deepseek", readonly string[]> = {
  bocha: ["BOCHA_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
};

export function isPresent(env: Env, key: string): boolean {
  const v = env[key];
  return typeof v === "string" && v.trim().length > 0;
}

export function providerConfigMissing(provider: "bocha" | "deepseek", env: Env): string[] {
  return REQUIRED_CONFIG[provider].filter((k) => !isPresent(env, k));
}

/** Presence map (never values) for the operator-facing start-up report. */
export function envPresence(env: Env): Record<string, "PRESENT" | "MISSING"> {
  const out: Record<string, "PRESENT" | "MISSING"> = {};
  for (const k of REPORTED_ENV_KEYS) out[k] = isPresent(env, k) ? "PRESENT" : "MISSING";
  return out;
}

// ---------------------------------------------------------------------------
// Budgeted, capturing fetch — the single choke-point for real network I/O.
// ---------------------------------------------------------------------------

export class CanaryBudgetError extends Error {
  readonly code = CANARY_CODE.BUDGET_EXCEEDED;
  constructor(message: string) {
    super(message);
    this.name = "CanaryBudgetError";
  }
}

export interface CallCounters {
  total: number;
  perProvider: Record<string, number>;
}

export function freshCounters(): CallCounters {
  return { total: 0, perProvider: {} };
}

/**
 * Transient per-call capture. `rawText` is held ONLY in memory for shape
 * inspection and is deliberately excluded from every persisted summary.
 */
export interface RawCapture {
  callCount: number;
  httpStatus: number | null;
  contentType: string | null;
  startedAt: string | null;
  completedAt: string | null;
  latencyMs: number | null;
  rawSha256: string | null;
  rawText: string | null;
}

function emptyCapture(): RawCapture {
  return {
    callCount: 0,
    httpStatus: null,
    contentType: null,
    startedAt: null,
    completedAt: null,
    latencyMs: null,
    rawSha256: null,
    rawText: null,
  };
}

/**
 * Wrap a base fetch so that (a) the per-provider (1) and total (2) paid-call
 * budgets are enforced BEFORE the request leaves — a violation throws instead of
 * making the call — and (b) status/timing/content-type and a SHA-256 of the raw
 * body are captured for telemetry from a CLONE, leaving the original body intact
 * for the official adapter to parse.
 */
export function createCapturingFetch(
  provider: string,
  baseFetch: typeof fetch,
  counters: CallCounters,
  budget: { totalMax: number; perProviderMax: number } = CANARY_BUDGET,
): { fetch: typeof fetch; capture: RawCapture } {
  const capture = emptyCapture();
  const wrapped = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (counters.total >= budget.totalMax) {
      throw new CanaryBudgetError(`total real-call budget (${budget.totalMax}) exhausted`);
    }
    if ((counters.perProvider[provider] ?? 0) >= budget.perProviderMax) {
      throw new CanaryBudgetError(
        `per-provider real-call budget (${budget.perProviderMax}) exhausted for ${provider}`,
      );
    }
    counters.total += 1;
    counters.perProvider[provider] = (counters.perProvider[provider] ?? 0) + 1;
    capture.callCount += 1;

    capture.startedAt = new Date().toISOString();
    const t0 = performance.now();
    const res = await baseFetch(input, init);
    const t1 = performance.now();
    capture.completedAt = new Date().toISOString();
    capture.latencyMs = Math.round((t1 - t0) * 1000) / 1000;
    capture.httpStatus = res.status;
    capture.contentType = res.headers.get("content-type");
    try {
      const raw = await res.clone().text();
      capture.rawText = raw;
      capture.rawSha256 = createHash("sha256").update(raw).digest("hex");
    } catch {
      // Leave hash/rawText null; the adapter still owns the authoritative read.
    }
    return res;
  }) as typeof fetch;
  return { fetch: wrapped, capture };
}

// ---------------------------------------------------------------------------
// Redaction helpers.
// ---------------------------------------------------------------------------

/** Strip anything key-shaped from a free-text provider message before logging. */
export function sanitizeMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9]{6,}/g, "[REDACTED_KEY]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[REDACTED_HEX]")
    .slice(0, 240);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Persisted (repo-external, desensitized) telemetry — an explicit whitelist.
// ---------------------------------------------------------------------------

export interface PersistedProviderSummary {
  provider: "bocha" | "deepseek";
  endpointHost: string;
  model: string | null;
  outcome: "PASS" | "FAIL" | "BLOCKED";
  success: boolean;
  errorCategory: string | null;
  retryable: boolean | null;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
  latencyMs: number | null;
  httpStatus: number | null;
  contentType: string | null;
  requestChars: number | null;
  outputChars: number | null;
  resultCount: number | null;
  tokenUsage: { inputTokens: number | null; outputTokens: number | null } | null;
  responseShape: Record<string, boolean>;
  rawSha256: string | null;
  sanitizedSummary: string;
}

export interface ProviderCanaryResult {
  provider: "bocha" | "deepseek";
  outcome: "PASS" | "FAIL" | "BLOCKED";
  errorCategory: string | null;
  requestCount: number;
  checks: Record<string, boolean>;
  telemetry: PersistedProviderSummary;
}

/** A canary that never made a call: BLOCKED (fail-closed) or FAIL (budget breach). */
function stoppedResult(
  provider: "bocha" | "deepseek",
  endpointHost: string,
  model: string | null,
  outcome: "BLOCKED" | "FAIL",
  errorCategory: string,
  reason: string,
): ProviderCanaryResult {
  return {
    provider,
    outcome,
    errorCategory,
    requestCount: 0,
    checks: {},
    telemetry: {
      provider,
      endpointHost,
      model,
      outcome,
      success: false,
      errorCategory,
      retryable: false,
      attempt: 0,
      startedAt: null,
      completedAt: null,
      latencyMs: null,
      httpStatus: null,
      contentType: null,
      requestChars: null,
      outputChars: null,
      resultCount: null,
      tokenUsage: null,
      responseShape: {},
      rawSha256: null,
      sanitizedSummary: sanitizeMessage(reason),
    },
  };
}

function blockedResult(
  provider: "bocha" | "deepseek",
  endpointHost: string,
  model: string | null,
  reason: string,
): ProviderCanaryResult {
  return stoppedResult(provider, endpointHost, model, "BLOCKED", CANARY_CODE.NOT_AUTHORIZED, reason);
}

/** True when spending one more paid call for `provider` would breach a budget. */
export function budgetExceeded(
  counters: CallCounters,
  provider: string,
  budget: { totalMax: number; perProviderMax: number } = CANARY_BUDGET,
): boolean {
  return (
    counters.total >= budget.totalMax || (counters.perProvider[provider] ?? 0) >= budget.perProviderMax
  );
}

// ---------------------------------------------------------------------------
// Bocha canary (Phase 5).
// ---------------------------------------------------------------------------

export interface CanaryRunOptions {
  env: Env;
  /** Base fetch to wrap. Defaults to global fetch; tests inject a mock. */
  baseFetch?: typeof fetch;
  /** Shared budget counter across providers (defaults to a fresh, isolated one). */
  counters?: CallCounters;
}

export async function runBochaCanary(opts: CanaryRunOptions): Promise<ProviderCanaryResult> {
  const { env } = opts;
  const endpointHost = hostOf(BOCHA_WEB_SEARCH_ENDPOINT);

  const auth = isCanaryAuthorized(env);
  if (!auth.ok) return blockedResult("bocha", endpointHost, null, auth.reason ?? "not authorized");

  const missing = providerConfigMissing("bocha", env);
  if (missing.length > 0) {
    return blockedResult("bocha", endpointHost, null, `missing required config: ${missing.join(", ")}`);
  }

  const counters = opts.counters ?? freshCounters();
  if (budgetExceeded(counters, "bocha")) {
    return stoppedResult("bocha", endpointHost, null, "FAIL", CANARY_CODE.BUDGET_EXCEEDED, "paid-call budget exhausted");
  }
  const baseFetch = opts.baseFetch ?? (globalThis.fetch as typeof fetch);
  const { fetch: capturingFetch, capture } = createCapturingFetch("bocha", baseFetch, counters);

  const provider = createBochaProvider({
    apiKey: env.BOCHA_API_KEY,
    fetchImpl: capturingFetch,
    maxRetries: CANARY_MAX_RETRIES,
  });

  let searchError: { code: string; retryable: boolean; message: string } | null = null;
  let results: WebSearchResultItem[] = [];
  try {
    const out = await provider.search(BOCHA_CANARY_QUERY, { limit: BOCHA_CANARY_COUNT });
    if (out.ok) {
      results = out.results;
    } else {
      searchError = { code: out.error.code, retryable: out.error.retryable, message: out.error.message };
    }
  } catch (err) {
    const code = err instanceof CanaryBudgetError ? CANARY_CODE.BUDGET_EXCEEDED : "PROVIDER_UNKNOWN";
    searchError = { code, retryable: false, message: err instanceof Error ? err.message : String(err) };
  }

  // "Valid result" = has a non-empty title AND an http/https URL.
  const validResults = results.filter((r) => r.title.trim().length > 0 && isHttpUrl(r.url));
  const urlsSsrfSafe = validResults.every((r) => assertUrlAllowed(r.url).ok);
  // Normalize to Evidence candidates in-memory (NO DB write) and re-check safety.
  const evidence = normalizeEvidence(validResults, { companyDomains: [] });
  const normalizedSafe = evidence.every((e) => assertUrlAllowed(e.url).ok);

  const checks: Record<string, boolean> = {
    http200: capture.httpStatus === 200,
    outerJsonValid: capture.rawSha256 !== null && searchError?.code !== "PROVIDER_INVALID_JSON",
    adapterSchemaOk: searchError === null,
    atLeastOneValidResult: validResults.length >= 1,
    everyValidHasTitleAndHttpUrl:
      validResults.length >= 1 && validResults.every((r) => r.title.trim().length > 0 && isHttpUrl(r.url)),
    urlsPassSsrfGuard: urlsSsrfSafe,
    normalizedNoPrivateOrMetadata: normalizedSafe,
    latencyRecorded: typeof capture.latencyMs === "number",
    singleRequest: capture.callCount === 1,
  };

  const passed = searchError === null && Object.values(checks).every(Boolean);
  const outcome: ProviderCanaryResult["outcome"] = passed ? "PASS" : "FAIL";
  const errorCategory = searchError?.code ?? (passed ? null : "PROVIDER_UNKNOWN");

  const outputChars = results.reduce((n, r) => n + r.title.length + r.snippet.length, 0);
  const telemetry: PersistedProviderSummary = {
    provider: "bocha",
    endpointHost,
    model: null,
    outcome,
    success: passed,
    errorCategory,
    retryable: searchError?.retryable ?? null,
    attempt: capture.callCount,
    startedAt: capture.startedAt,
    completedAt: capture.completedAt,
    latencyMs: capture.latencyMs,
    httpStatus: capture.httpStatus,
    contentType: capture.contentType,
    requestChars: BOCHA_CANARY_QUERY.length,
    outputChars,
    resultCount: results.length,
    tokenUsage: null,
    responseShape: checks,
    rawSha256: capture.rawSha256,
    sanitizedSummary: searchError
      ? `bocha ${searchError.code}: ${sanitizeMessage(searchError.message)}`
      : `bocha ok — ${results.length} result(s), ${validResults.length} valid, hosts=[${validResults
          .map((r) => hostOf(r.url))
          .join(", ")}]`,
  };

  // The transient raw body never leaves this function.
  capture.rawText = null;

  return { provider: "bocha", outcome, errorCategory, requestCount: capture.callCount, checks, telemetry };
}

// ---------------------------------------------------------------------------
// DeepSeek canary (Phase 6).
// ---------------------------------------------------------------------------

interface DeepSeekEnvelopeShape {
  choicesCount: number | null;
  finishReason: string | null;
  contentPresent: boolean;
  contentLength: number | null;
  reasoningContentPresent: boolean;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
}

/** Telemetry-only inspection of the raw envelope. NEVER the authoritative parse. */
function inspectDeepSeekEnvelope(rawText: string | null): DeepSeekEnvelopeShape {
  const empty: DeepSeekEnvelopeShape = {
    choicesCount: null,
    finishReason: null,
    contentPresent: false,
    contentLength: null,
    reasoningContentPresent: false,
    usage: null,
  };
  if (!rawText) return empty;
  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    return empty;
  }
  if (!body || typeof body !== "object") return empty;
  const b = body as Record<string, unknown>;
  const choices = Array.isArray(b.choices) ? b.choices : null;
  const first = choices && choices.length > 0 ? (choices[0] as Record<string, unknown>) : null;
  const message = first && typeof first.message === "object" && first.message
    ? (first.message as Record<string, unknown>)
    : null;
  const content = message && typeof message.content === "string" ? message.content : null;
  const usageObj = b.usage && typeof b.usage === "object" ? (b.usage as Record<string, unknown>) : null;
  return {
    choicesCount: choices ? choices.length : null,
    finishReason: first && typeof first.finish_reason === "string" ? first.finish_reason : null,
    contentPresent: typeof content === "string" && content.trim().length > 0,
    contentLength: typeof content === "string" ? content.length : null,
    reasoningContentPresent: message ? message.reasoning_content != null : false,
    usage: usageObj
      ? {
          inputTokens: typeof usageObj.prompt_tokens === "number" ? usageObj.prompt_tokens : null,
          outputTokens: typeof usageObj.completion_tokens === "number" ? usageObj.completion_tokens : null,
        }
      : null,
  };
}

export async function runDeepSeekCanary(opts: CanaryRunOptions): Promise<ProviderCanaryResult> {
  const { env } = opts;
  const cfg = deepSeekConfigFromEnv(env as NodeJS.ProcessEnv);
  const endpointHost = hostOf(`${cfg.baseUrl ?? "https://api.deepseek.com"}/chat/completions`);
  const model = cfg.model ?? DEFAULT_DEEPSEEK_MODEL;

  const auth = isCanaryAuthorized(env);
  if (!auth.ok) return blockedResult("deepseek", endpointHost, model, auth.reason ?? "not authorized");

  const missing = providerConfigMissing("deepseek", env);
  if (missing.length > 0) {
    return blockedResult("deepseek", endpointHost, model, `missing required config: ${missing.join(", ")}`);
  }

  const counters = opts.counters ?? freshCounters();
  if (budgetExceeded(counters, "deepseek")) {
    return stoppedResult("deepseek", endpointHost, model, "FAIL", CANARY_CODE.BUDGET_EXCEEDED, "paid-call budget exhausted");
  }
  const baseFetch = opts.baseFetch ?? (globalThis.fetch as typeof fetch);
  const { fetch: capturingFetch, capture } = createCapturingFetch("deepseek", baseFetch, counters);

  const provider = createDeepSeekProvider(cfg, { fetch: capturingFetch });

  let completionError: { code: string; retryable: boolean; message: string } | null = null;
  let answer: unknown = undefined;
  try {
    const out = await provider.completeJson({
      stage: "provider-canary",
      systemPrompt: DEEPSEEK_CANARY_SYSTEM_PROMPT,
      userPrompt: DEEPSEEK_CANARY_USER_PROMPT,
      maxTokens: DEEPSEEK_CANARY_MAX_TOKENS,
    });
    if (out.ok) {
      answer = out.json;
    } else {
      completionError = { code: out.error.code, retryable: out.error.retryable, message: out.error.message };
    }
  } catch (err) {
    const code = err instanceof CanaryBudgetError ? CANARY_CODE.BUDGET_EXCEEDED : "PROVIDER_UNKNOWN";
    completionError = { code, retryable: false, message: err instanceof Error ? err.message : String(err) };
  }

  const shape = inspectDeepSeekEnvelope(capture.rawText);
  const contentTypeJson = (capture.contentType ?? "").toLowerCase().includes("json");

  // Strict Zod validation via the OFFICIAL parser (produces PROVIDER_SCHEMA_MISMATCH).
  let zodValid = false;
  let schemaError: string | null = null;
  if (answer !== undefined) {
    const parsed = parseStageJson("provider-canary", DEEPSEEK_CANARY_SCHEMA, answer);
    zodValid = parsed.ok;
    if (!parsed.ok) schemaError = parsed.error.code;
  }

  const checks: Record<string, boolean> = {
    http200: capture.httpStatus === 200,
    contentTypeJson,
    outerShapeValid: completionError?.code !== "PROVIDER_INVALID_RESPONSE_SHAPE" && shape.choicesCount !== null,
    exactlyOneChoice: shape.choicesCount === 1,
    finishReasonStop: shape.finishReason === "stop",
    finalContentPresent: shape.contentPresent,
    jsonParsed: answer !== undefined && completionError?.code !== "PROVIDER_INVALID_JSON",
    zodValid,
    singleRequest: capture.callCount === 1,
  };

  const passed = completionError === null && zodValid && Object.values(checks).every(Boolean);
  const outcome: ProviderCanaryResult["outcome"] = passed ? "PASS" : "FAIL";
  const errorCategory =
    completionError?.code ?? (!zodValid && answer !== undefined ? schemaError : passed ? null : "PROVIDER_UNKNOWN");

  const telemetry: PersistedProviderSummary = {
    provider: "deepseek",
    endpointHost,
    model,
    outcome,
    success: passed,
    errorCategory,
    retryable: completionError?.retryable ?? null,
    attempt: capture.callCount,
    startedAt: capture.startedAt,
    completedAt: capture.completedAt,
    latencyMs: capture.latencyMs,
    httpStatus: capture.httpStatus,
    contentType: capture.contentType,
    requestChars: DEEPSEEK_CANARY_SYSTEM_PROMPT.length + DEEPSEEK_CANARY_USER_PROMPT.length,
    outputChars: shape.contentLength,
    resultCount: null,
    tokenUsage: shape.usage,
    responseShape: {
      ...checks,
      reasoningContentPresent: shape.reasoningContentPresent,
    },
    rawSha256: capture.rawSha256,
    sanitizedSummary: completionError
      ? `deepseek ${completionError.code}: ${sanitizeMessage(completionError.message)}`
      : `deepseek ${outcome.toLowerCase()} — finish_reason=${shape.finishReason ?? "n/a"}, ` +
        `choices=${shape.choicesCount ?? "n/a"}, zod=${zodValid}, ` +
        `reasoning_content=${shape.reasoningContentPresent ? "present" : "absent"}`,
  };

  capture.rawText = null;

  return { provider: "deepseek", outcome, errorCategory, requestCount: capture.callCount, checks, telemetry };
}

// ---------------------------------------------------------------------------
// Orchestration + determination (Phase 8).
// ---------------------------------------------------------------------------

export interface CanaryDetermination {
  bocha: "PASS" | "FAIL";
  deepseek: "PASS" | "FAIL";
  overall: "PASS" | "PASS_WITH_BLOCKER" | "FAIL" | "BLOCKED_REAL_PROVIDER_NOT_AUTHORIZED";
  readyForTechnicalCompanyCanary: "YES" | "NO";
}

export function determine(
  bocha: ProviderCanaryResult,
  deepseek: ProviderCanaryResult,
): CanaryDetermination {
  const bochaPass = bocha.outcome === "PASS";
  const deepseekPass = deepseek.outcome === "PASS";
  const anyBudgetBreach =
    bocha.errorCategory === CANARY_CODE.BUDGET_EXCEEDED ||
    deepseek.errorCategory === CANARY_CODE.BUDGET_EXCEEDED;
  const bothBlocked = bocha.outcome === "BLOCKED" && deepseek.outcome === "BLOCKED";

  let overall: CanaryDetermination["overall"];
  if (anyBudgetBreach) {
    overall = "FAIL"; // exceeded budget / duplicate request → hard fail
  } else if (bochaPass && deepseekPass) {
    overall = "PASS";
  } else if (bothBlocked) {
    overall = "BLOCKED_REAL_PROVIDER_NOT_AUTHORIZED";
  } else if (bochaPass !== deepseekPass && bocha.outcome !== "BLOCKED" && deepseek.outcome !== "BLOCKED") {
    overall = "PASS_WITH_BLOCKER"; // one real success, one classified failure, no security issue
  } else {
    overall = "FAIL";
  }

  return {
    bocha: bochaPass ? "PASS" : "FAIL",
    deepseek: deepseekPass ? "PASS" : "FAIL",
    overall,
    readyForTechnicalCompanyCanary: bochaPass && deepseekPass ? "YES" : "NO",
  };
}

// ---------------------------------------------------------------------------
// Cost (Phase 7): computed only from an approved price config; else UNKNOWN.
// ---------------------------------------------------------------------------

export function resolveCost(): { amount: string; note: string } {
  // No approved provider price configuration exists in this repo. Per the round
  // contract we NEVER fabricate a $0 — we report UNKNOWN.
  return {
    amount: "UNKNOWN",
    note: "No approved provider price config present in repo; cost not fabricated.",
  };
}

// ---------------------------------------------------------------------------
// main() — the ONLY code that touches network, clock and the private directory.
// ---------------------------------------------------------------------------

const DEFAULT_PRIVATE_DIR = "E:/企业诊断智能体_private/provider-canary-v1";

function redactUnknown(value: unknown): unknown {
  // Defensive final pass: JSON round-trip a copy and scrub key-shaped strings.
  const json = JSON.stringify(value, (_k, v) => (typeof v === "string" ? sanitizeMessage(v) : v));
  return JSON.parse(json);
}

async function main(): Promise<void> {
  const env = process.env as Env;
  const privateDir = env.CANARY_PRIVATE_DIR || DEFAULT_PRIVATE_DIR;
  mkdirSync(privateDir, { recursive: true });

  const presence = envPresence(env);
  const auth = isCanaryAuthorized(env);

  const lines: string[] = [];
  const log = (m: string) => {
    lines.push(m);
    console.log(m);
  };

  log(`[provider-canary] PROVIDER_MODE authorized=${auth.ok}${auth.ok ? "" : ` (${auth.reason})`}`);
  for (const k of REPORTED_ENV_KEYS) log(`[provider-canary] env ${k}: ${presence[k]}`);
  log(`[provider-canary] bocha endpoint host: ${hostOf(BOCHA_WEB_SEARCH_ENDPOINT)}`);
  const dsCfg = deepSeekConfigFromEnv(env as NodeJS.ProcessEnv);
  log(`[provider-canary] deepseek endpoint host: ${hostOf(`${dsCfg.baseUrl}/chat/completions`)}, model: ${dsCfg.model}`);

  // Shared budget across both providers (total ≤ 2). Providers stay independent:
  // a Bocha failure/block never prevents the DeepSeek probe from running.
  const counters = freshCounters();
  const bocha = await runBochaCanary({ env, counters });
  log(`[provider-canary] BOCHA outcome=${bocha.outcome} category=${bocha.errorCategory ?? "none"} requests=${bocha.requestCount}`);
  const deepseek = await runDeepSeekCanary({ env, counters });
  log(`[provider-canary] DEEPSEEK outcome=${deepseek.outcome} category=${deepseek.errorCategory ?? "none"} requests=${deepseek.requestCount}`);

  const determination = determine(bocha, deepseek);
  const cost = resolveCost();
  const totalRealCalls = counters.total;

  log(`[provider-canary] TOTAL_REAL_PROVIDER_CALLS=${totalRealCalls} RETRIES=0`);
  log(`[provider-canary] OVERALL=${determination.overall} READY=${determination.readyForTechnicalCompanyCanary}`);

  const summary = {
    round: "provider-canary-v1",
    authorized: auth.ok,
    authReason: auth.ok ? null : auth.reason,
    envPresence: presence,
    bocha: bocha.telemetry,
    deepseek: deepseek.telemetry,
    determination,
    totalRealProviderCalls: totalRealCalls,
    totalRetries: 0,
    cost,
  };

  writeFileSync(join(privateDir, "bocha-telemetry.json"), JSON.stringify(redactUnknown(bocha.telemetry), null, 2));
  writeFileSync(join(privateDir, "deepseek-telemetry.json"), JSON.stringify(redactUnknown(deepseek.telemetry), null, 2));
  writeFileSync(join(privateDir, "summary.json"), JSON.stringify(redactUnknown(summary), null, 2));
  writeFileSync(join(privateDir, "run-log.txt"), lines.join("\n") + "\n");

  log(`[provider-canary] private artifacts written to ${privateDir}`);

  // Never exit non-zero for a "blocked" (fail-closed) run — that is the correct,
  // safe outcome. Exit non-zero only for a security/budget FAIL so CI catches it.
  if (determination.overall === "FAIL") process.exitCode = 1;
}

// Run only when invoked directly (never on import by the guard tests).
const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /provider-canary\.(ts|js)$/.test(process.argv[1] ?? "");

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[provider-canary] fatal: ${sanitizeMessage(err instanceof Error ? err.message : String(err))}`);
    process.exitCode = 1;
  });
}
