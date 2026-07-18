// ============================================================================
// Evidence URL sanitisation (presentation-side).
//
// docs/PRODUCT_TRUTH_RULES.md §6 requires that any URL surfaced in the Evidence
// view be cleaned of credentials and sensitive parameters BEFORE it is shown:
//   username / password / fragment / token / signature / credential /
//   access_key / auth parameters.
//
// This is a pure, dependency-free string transform. It never fabricates or
// rewrites the origin/path — it only strips sensitive material. If the input is
// not a parseable URL it is returned unchanged (evidence URLs are already
// `.url()`-validated upstream, so this is a defensive fallback only).
// ============================================================================

/**
 * Query-parameter keys considered sensitive. Matching is case-insensitive and
 * substring-based so variants like `access_token`, `X-Auth`, `apiKey`,
 * `signature` are all removed.
 */
const SENSITIVE_PARAM_FRAGMENTS = [
  "token",
  "signature",
  "sign",
  "credential",
  "access_key",
  "accesskey",
  "auth",
  "apikey",
  "api_key",
  "secret",
  "password",
  "passwd",
  "pwd",
] as const;

function isSensitiveParam(key: string): boolean {
  const lowered = key.toLowerCase();
  return SENSITIVE_PARAM_FRAGMENTS.some((fragment) => lowered.includes(fragment));
}

/**
 * Return a display-safe copy of an evidence URL with credentials, fragment and
 * sensitive query parameters stripped. Pure; does not mutate input.
 */
export function sanitizeEvidenceUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  // Strip embedded credentials (user:pass@host).
  parsed.username = "";
  parsed.password = "";

  // Strip fragment (may carry tokens/anchors we must not surface).
  parsed.hash = "";

  // Strip sensitive query parameters.
  const keysToDelete: string[] = [];
  parsed.searchParams.forEach((_value, key) => {
    if (isSensitiveParam(key)) {
      keysToDelete.push(key);
    }
  });
  for (const key of keysToDelete) {
    parsed.searchParams.delete(key);
  }

  return parsed.toString();
}
