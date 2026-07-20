import { describe, expect, it, vi } from "vitest";
import {
  createDeepSeekProvider,
  DEFAULT_DEEPSEEK_MODEL,
  type DeepSeekConfig,
} from "../../src/providers/deepseek";
import { RETRYABLE_PROVIDER_ERRORS } from "../../src/providers/types";

const CONFIG: DeepSeekConfig = {
  apiKey: "test-key",
  baseUrl: "https://deepseek.test",
  model: DEFAULT_DEEPSEEK_MODEL,
  timeoutMs: 5_000,
};

/** Build a mock fetch returning a JSON `Response`. NEVER touches the real API. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatEnvelope(content: string, finishReason = "stop") {
  return {
    choices: [{ finish_reason: finishReason, message: { content } }],
  };
}

function callWith(fetchImpl: typeof fetch) {
  const provider = createDeepSeekProvider(CONFIG, { fetch: fetchImpl });
  return provider.completeJson({
    stage: "unit-test",
    systemPrompt: "sys",
    userPrompt: "user",
    maxTokens: 512,
  });
}

describe("DeepSeek adapter — request construction", () => {
  it("posts to /chat/completions with the frozen structured defaults", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(chatEnvelope(JSON.stringify({ ok: 1 }))),
    ) as unknown as typeof fetch;

    const res = await callWith(fetchMock);
    expect(res.ok).toBe(true);

    const spy = fetchMock as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://deepseek.test/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(body.stream).toBe(false);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.max_tokens).toBe(512);
    expect(body.messages).toHaveLength(2);
  });

  it("returns parsed JSON from choices[0].message.content on success", async () => {
    const payload = { brandName: "示例", industry: "SaaS" };
    const fetchMock = (async () =>
      jsonResponse(chatEnvelope(JSON.stringify(payload)))) as unknown as typeof fetch;
    const res = await callWith(fetchMock);
    expect(res).toEqual({ ok: true, json: payload });
  });

  it("sends an explicitly configured temperature without changing the default path", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(chatEnvelope(JSON.stringify({ ok: 1 }))),
    ) as unknown as typeof fetch;
    const provider = createDeepSeekProvider(
      { ...CONFIG, temperature: 0 },
      { fetch: fetchMock },
    );
    await provider.completeJson({
      stage: "claims-shadow",
      systemPrompt: "sys",
      userPrompt: "user",
      maxTokens: 4096,
    });
    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string).temperature).toBe(0);

    const defaultFetch = vi.fn(async () =>
      jsonResponse(chatEnvelope(JSON.stringify({ ok: 1 }))),
    ) as unknown as typeof fetch;
    await callWith(defaultFetch);
    const [, defaultInit] = (defaultFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(defaultInit.body as string)).not.toHaveProperty("temperature");
  });

  it("strips a BOM and trims but never repairs malformed JSON", async () => {
    const fetchMock = (async () =>
      jsonResponse(chatEnvelope("﻿  {\"a\":1}  "))) as unknown as typeof fetch;
    const res = await callWith(fetchMock);
    expect(res).toEqual({ ok: true, json: { a: 1 } });
  });
});

describe("DeepSeek adapter — envelope error classification", () => {
  const cases: Array<{ name: string; envelope: unknown; code: string }> = [
    {
      name: "empty choices",
      envelope: { choices: [] },
      code: "PROVIDER_EMPTY_CHOICES",
    },
    {
      name: "missing choices array",
      envelope: { id: "x" },
      code: "PROVIDER_INVALID_RESPONSE_SHAPE",
    },
    {
      name: "empty final content",
      envelope: { choices: [{ finish_reason: "stop", message: { content: "   " } }] },
      code: "PROVIDER_EMPTY_FINAL_CONTENT",
    },
    {
      name: "reasoning_content is not a fallback",
      envelope: {
        choices: [{ finish_reason: "stop", message: { content: "", reasoning_content: "{\"a\":1}" } }],
      },
      code: "PROVIDER_EMPTY_FINAL_CONTENT",
    },
    {
      name: "truncated output",
      envelope: { choices: [{ finish_reason: "length", message: { content: "{\"a\":" } }] },
      code: "PROVIDER_TRUNCATED_OUTPUT",
    },
    {
      name: "content filtered",
      envelope: { choices: [{ finish_reason: "content_filter", message: { content: "" } }] },
      code: "PROVIDER_CONTENT_FILTERED",
    },
    {
      name: "invalid json content",
      envelope: { choices: [{ finish_reason: "stop", message: { content: "not json {" } }] },
      code: "PROVIDER_INVALID_JSON",
    },
  ];

  for (const c of cases) {
    it(`classifies ${c.name} as ${c.code}`, async () => {
      const fetchMock = (async () => jsonResponse(c.envelope)) as unknown as typeof fetch;
      const res = await callWith(fetchMock);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe(c.code);
    });
  }

  it("classifies a non-JSON 200 body as invalid response shape", async () => {
    const fetchMock = (async () =>
      new Response("<html>not json</html>", { status: 200 })) as unknown as typeof fetch;
    const res = await callWith(fetchMock);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PROVIDER_INVALID_RESPONSE_SHAPE");
  });
});

describe("DeepSeek adapter — HTTP status classification", () => {
  const cases: Array<{ name: string; status: number; body: unknown; code: string; retryable: boolean }> = [
    { name: "401", status: 401, body: { error: { message: "bad key" } }, code: "PROVIDER_AUTH_FAILED", retryable: false },
    { name: "402 balance", status: 402, body: { error: { message: "insufficient balance" } }, code: "PROVIDER_QUOTA_EXCEEDED", retryable: false },
    { name: "429 quota", status: 429, body: { error: { message: "quota exceeded" } }, code: "PROVIDER_QUOTA_EXCEEDED", retryable: false },
    { name: "429 rate", status: 429, body: { error: { message: "too many requests" } }, code: "PROVIDER_RATE_LIMITED", retryable: true },
    { name: "400 context", status: 400, body: { error: { code: "context_length_exceeded", message: "maximum context length" } }, code: "PROVIDER_CONTEXT_LIMIT", retryable: false },
    { name: "400 too large", status: 400, body: { error: { message: "request entity too large" } }, code: "PROVIDER_REQUEST_TOO_LARGE", retryable: false },
    { name: "400 generic", status: 400, body: { error: { message: "bad param" } }, code: "PROVIDER_INVALID_REQUEST", retryable: false },
    { name: "413", status: 413, body: { error: { message: "payload too large" } }, code: "PROVIDER_REQUEST_TOO_LARGE", retryable: false },
    { name: "404 model", status: 404, body: { error: { message: "model not found" } }, code: "PROVIDER_MODEL_UNAVAILABLE", retryable: true },
    { name: "503 resource", status: 503, body: { error: { message: "insufficient system resource" } }, code: "PROVIDER_INSUFFICIENT_RESOURCE", retryable: false },
    { name: "500", status: 500, body: { error: { message: "boom" } }, code: "PROVIDER_UPSTREAM_5XX", retryable: true },
    { name: "502", status: 502, body: { error: { message: "bad gateway" } }, code: "PROVIDER_UPSTREAM_5XX", retryable: true },
  ];

  for (const c of cases) {
    it(`maps ${c.name} → ${c.code} (retryable=${c.retryable})`, async () => {
      const fetchMock = (async () => jsonResponse(c.body, c.status)) as unknown as typeof fetch;
      const res = await callWith(fetchMock);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(c.code);
        expect(res.error.retryable).toBe(c.retryable);
        expect(res.error.retryable).toBe(RETRYABLE_PROVIDER_ERRORS.has(res.error.code));
      }
    });
  }
});

describe("DeepSeek adapter — transport + guard errors", () => {
  it("maps AbortError to a retryable timeout", async () => {
    const fetchMock = (async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;
    const res = await callWith(fetchMock);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("PROVIDER_TIMEOUT");
      expect(res.error.retryable).toBe(true);
    }
  });

  it("maps a TypeError network failure to a retryable connection failure", async () => {
    const fetchMock = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const res = await callWith(fetchMock);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("PROVIDER_CONNECTION_FAILED");
      expect(res.error.retryable).toBe(true);
    }
  });

  it("fails fast without calling fetch when the API key is missing", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const provider = createDeepSeekProvider({ ...CONFIG, apiKey: "" }, { fetch: fetchMock });
    const res = await provider.completeJson({ stage: "s", systemPrompt: "", userPrompt: "", maxTokens: 256 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PROVIDER_AUTH_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-positive maxTokens before making a request", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const provider = createDeepSeekProvider(CONFIG, { fetch: fetchMock });
    const res = await provider.completeJson({ stage: "s", systemPrompt: "", userPrompt: "", maxTokens: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PROVIDER_INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid explicit temperature before making a request", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const provider = createDeepSeekProvider(
      { ...CONFIG, temperature: 3 },
      { fetch: fetchMock },
    );
    const res = await provider.completeJson({
      stage: "claims-shadow",
      systemPrompt: "",
      userPrompt: "",
      maxTokens: 4096,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PROVIDER_INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
