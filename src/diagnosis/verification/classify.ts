// ============================================================================
// Deterministic claim classification + evidence/claim text overlap.
//
// Both the verifier (assigning support) and the publish guard (gating) use these
// SAME pure helpers so a model can never reclassify a negative claim as positive
// to escape the measurement-boundary rules.
// ============================================================================

import type { ClaimKind, ClaimPolarity } from "../../contracts/claim-evidence";

// Markers that make a statement negative / missing / gap / "behind competitor".
// Kept intentionally broad — a false-negative here would let an unbounded
// absolute-fact negative claim through, which is the failure we must prevent.
const NEGATIVE_MARKERS = [
  "缺少",
  "缺乏",
  "缺失",
  "没有",
  "未提供",
  "未覆盖",
  "未明确",
  "未说明",
  "未展示",
  "未发现",
  "不足",
  "不够",
  "欠缺",
  "尚未",
  "暂未",
  "落后",
  "无法",
  "无系统",
  "无结构",
  "空白",
  "短板",
  "gap",
  "missing",
  "lack",
] as const;

// A bare "无" (none) is negative but too short to match as a substring safely;
// handle it via a dedicated check so "无锡" (a place) etc. do not trip it.
const BARE_NONE = /(?:^|[，。、;:\s])无(?![损谓])/u;

export interface ClassifiableClaim {
  kind: ClaimKind;
  /** All text fields that describe what the claim asserts. */
  text: string;
}

/**
 * Deterministically classify a claim's polarity.
 * - competitorGap claims are COMPETITOR_FACT (verified against competitor evidence).
 * - any claim whose text contains a negative / missing marker is NEGATIVE_MISSING
 *   (boundary-gated) — this takes priority so a "本企业落后" claim is never
 *   treated as a positive capability.
 * - everything else is ENTERPRISE_CAPABILITY.
 */
export function classifyPolarity(claim: ClassifiableClaim): ClaimPolarity {
  const text = claim.text.toLowerCase();
  const negative =
    NEGATIVE_MARKERS.some((m) => text.includes(m.toLowerCase())) || BARE_NONE.test(claim.text);

  // A competitor-gap statement is inherently "competitor has X, we lack X". The
  // enterprise-negative half is handled by the coreIssue that mirrors it; the
  // competitorGap relation itself is judged as a competitor fact. But if the
  // statement is purely about the enterprise being behind, keep it negative.
  if (claim.kind === "competitorGap") return "COMPETITOR_FACT";

  if (negative) return "NEGATIVE_MISSING";
  return "ENTERPRISE_CAPABILITY";
}

// ---------------------------------------------------------------------------
// Lightweight bilingual overlap. Chinese has no word boundaries, so we compare
// CJK character bigrams plus lowercased alphanumeric tokens. This is a semantic
// SIGNAL, not a source-authority shortcut.
// ---------------------------------------------------------------------------

const CJK = /[㐀-鿿]/;

export function textFeatures(raw: string): Set<string> {
  const features = new Set<string>();
  const s = raw.toLowerCase();

  // Alphanumeric tokens (length >= 2).
  for (const m of s.matchAll(/[a-z0-9]{2,}/g)) features.add(m[0]);

  // CJK bigrams.
  const chars = [...raw];
  for (let i = 0; i < chars.length - 1; i++) {
    const a = chars[i]!;
    const b = chars[i + 1]!;
    if (CJK.test(a) && CJK.test(b)) features.add(a + b);
  }
  return features;
}

export interface OverlapResult {
  shared: number;
  claimFeatureCount: number;
}

/** Count shared features between a claim's text and an evidence's title+snippet. */
export function overlap(claimText: string, evidenceText: string): OverlapResult {
  const claimF = textFeatures(claimText);
  const evF = textFeatures(evidenceText);
  let shared = 0;
  for (const f of claimF) if (evF.has(f)) shared += 1;
  return { shared, claimFeatureCount: claimF.size };
}
