import { createHash } from "node:crypto";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("HASH_INPUT_NOT_JSON_SERIALIZABLE");
    return encoded;
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

export function stableJson(value: unknown): string {
  return canonicalize(value);
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
