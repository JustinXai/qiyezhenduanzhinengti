// DeepSeek StructuredCompletionProvider adapter.
//
// Contract (AGENTS.md §5, docs/PROVIDER_RELIABILITY_CONTRACT.md):
//   - default model deepseek-v4-flash
//   - stream=false, response_format={type:"json_object"}, thinking={type:"disabled"}
//   - only parse choices[0].message.content; reasoning_content is never the final JSON
//   - no JSON extraction from prose; only trim + BOM strip; no quote/comma/bracket repair
//   - maxTokens is per-stage (never a blanket 256 in production)
//
// The network dependency (`fetch`) is injected so tests drive it with a mock and
// NEVER touch the real DeepSeek API.

import type { ProviderFailure, StructuredCompletionProvider } from "../types";
import { classifyEnvelope } from "./envelope";
import { classifyHttpStatus, classifyTransportError, makeFailure } from "./error-classification";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_TIMEOUT_MS = 60_000;

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** Optional explicit sampling temperature. Shadow comparisons set this equally for both models. */
  temperature?: number;
}

export interface DeepSeekDeps {
  /** Injected fetch. Tests pass a deterministic mock; production passes global fetch. */
  fetch: typeof fetch;
}

/** Build config from environment variables (used by real runtime wiring, not tests). */
export function deepSeekConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DeepSeekConfig {
  const apiKey = env.DEEPSEEK_API_KEY ?? "";
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
    model: env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
  };
}

function buildRequestBody(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature?: number,
): string {
  return JSON.stringify({
    model,
    stream: false,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
}

/** Read the response body as parsed JSON, or undefined if it is not JSON. */
async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createDeepSeekProvider(
  config: DeepSeekConfig,
  deps: DeepSeekDeps,
): StructuredCompletionProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  const model = config.model ?? DEFAULT_DEEPSEEK_MODEL;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${baseUrl}/chat/completions`;

  return {
    async completeJson({ systemPrompt, userPrompt, maxTokens }) {
      if (!config.apiKey) {
        return { ok: false, error: fail("PROVIDER_AUTH_FAILED", "Missing DEEPSEEK_API_KEY") };
      }
      if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
        return { ok: false, error: fail("PROVIDER_INVALID_REQUEST", `Invalid maxTokens: ${maxTokens}`) };
      }
      if (
        config.temperature !== undefined &&
        (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2)
      ) {
        return {
          ok: false,
          error: fail("PROVIDER_INVALID_REQUEST", `Invalid temperature: ${config.temperature}`),
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await deps.fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          body: buildRequestBody(
            model,
            systemPrompt,
            userPrompt,
            maxTokens,
            config.temperature,
          ),
          signal: controller.signal,
        });
      } catch (err) {
        return { ok: false, error: classifyTransportError(err) };
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const body = await readJsonBody(res);
        return { ok: false, error: classifyHttpStatus(res.status, body) };
      }

      const body = await readJsonBody(res);
      if (body === undefined) {
        return {
          ok: false,
          error: fail("PROVIDER_INVALID_RESPONSE_SHAPE", "200 response body was not valid JSON"),
        };
      }

      const envelope = classifyEnvelope(body);
      if (!envelope.ok) {
        return { ok: false, error: envelope.error };
      }
      return { ok: true, json: envelope.json };
    },
  };
}

function fail(code: ProviderFailure["code"], message: string): ProviderFailure {
  return makeFailure(code, message);
}
