// Strict JSON parsing for DeepSeek structured output.
//
// PROVIDER_RELIABILITY_CONTRACT: "不自动修复引号、逗号或括号;只允许 trim 和去除 BOM"
// and "不从自然语言中截取 JSON". We therefore only strip a leading BOM and trim
// surrounding whitespace before JSON.parse. No quote/comma/bracket repair, no
// substring extraction of a JSON blob embedded in prose.

const BOM = "﻿";

export type StrictJsonResult =
  | { ok: true; value: unknown }
  | { ok: false };

/**
 * Parse `raw` as JSON after only stripping a leading BOM and trimming
 * whitespace. Any structural malformation fails (no auto-repair).
 */
export function parseStrictJson(raw: string): StrictJsonResult {
  let text = raw;
  if (text.startsWith(BOM)) {
    text = text.slice(BOM.length);
  }
  text = text.trim();
  if (text.length === 0) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
