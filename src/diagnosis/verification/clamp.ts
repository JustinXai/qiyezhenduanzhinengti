// ============================================================================
// Shared deterministic clamp — the single source of truth for what support a
// (Claim, Evidence) pair is *allowed* to carry, given the evidence source type,
// the claim polarity, and the measurement boundary.
//
// EVERY strategy's raw verdict passes through here. This is what makes a model
// verdict non-authoritative: DeepSeek may propose DIRECT, but if the
// deterministic preconditions are not met the clamp downgrades or rejects it.
//
// Forbidden shortcuts this enforces (docs/PRODUCT_TRUTH_RULES.md §4, task spec):
//   - first-party page => DIRECT                         (never; needs content match)
//   - competitor page => DIRECT for the enterprise       (never; at most CONTEXT_ONLY)
//   - source authority substituted for semantic support  (never)
//   - a single page DIRECTLY proving a negative/missing   (never; boundary only)
//   - a negative/missing claim published without coverage (rejected → CONTEXT_ONLY)
// ============================================================================

import type { EvidenceItem } from "../../contracts";
import type {
  ClaimEvidenceRelation,
  ClaimPolarity,
  EvidenceCoverage,
  RelationBasis,
} from "../../contracts/claim-evidence";
import type { RawVerdict } from "./types";

type SupportLevel = ClaimEvidenceRelation["supportLevel"];

const RANK: Record<SupportLevel, number> = {
  UNSUPPORTED: 0,
  CONTEXT_ONLY: 1,
  PARTIAL_SUPPORT: 2,
  DIRECT_SUPPORT: 3,
};

function min(a: SupportLevel, b: SupportLevel): SupportLevel {
  return RANK[a] <= RANK[b] ? a : b;
}

export interface ClampedVerdict {
  supportLevel: SupportLevel;
  basis: RelationBasis;
  confidence: number;
  justification: string;
}

/**
 * Apply the deterministic ceiling to one raw verdict.
 *
 * @param raw       the strategy's proposed verdict (mock or model).
 * @param evidence  the resolved candidate evidence item.
 * @param polarity  the claim's deterministically-classified polarity.
 * @param coverage  the run's measurement boundary.
 */
export function clampVerdict(
  raw: RawVerdict,
  evidence: EvidenceItem,
  polarity: ClaimPolarity,
  coverage: EvidenceCoverage,
): ClampedVerdict {
  const source = evidence.sourceType;
  const inScope = coverage.crawledFirstPartyUrls.includes(evidence.url);

  // ---- Negative / missing / "behind competitor" claims --------------------
  // A single page can never DIRECTLY prove an absence. Support is coverage-backed
  // and only from first-party pages actually inside the checked scope.
  if (polarity === "NEGATIVE_MISSING") {
    if (!coverage.boundaryEstablished) {
      // Nothing was checked broadly enough — the page is context, not proof.
      return {
        supportLevel: "CONTEXT_ONLY",
        basis: "CONTENT_MATCH",
        confidence: Math.min(raw.confidence, 0.3),
        justification:
          "负面/缺失型 Claim 无测量边界(coverage 未建立),单页只能作为背景,不能证明缺失。",
      };
    }
    if (source === "FIRST_PARTY_EVIDENCE" && inScope) {
      // The page is part of the checked enterprise surface; that scope membership
      // (NOT its content overlap or authority) is what bounds the negative claim:
      // "本次已检查的公开页面中未发现所述内容". Coverage-backed support is capped
      // at PARTIAL — a bounded absence is never DIRECT proof.
      return {
        supportLevel: "PARTIAL_SUPPORT",
        basis: "MEASUREMENT_BOUNDARY",
        confidence: 0.6,
        justification:
          "负面/缺失型 Claim 由受控官网抓取范围内的首方页面提供边界支持:本次已检查的公开页面中未发现所述内容。",
      };
    }
    // Competitor / observed / out-of-scope evidence can only contextualise a
    // negative claim about the enterprise — never carry it.
    return {
      supportLevel: min(raw.supportLevel, "CONTEXT_ONLY"),
      basis: "CONTENT_MATCH",
      confidence: Math.min(raw.confidence, 0.4),
      justification:
        "负面/缺失型 Claim 的非首方或范围外证据只能作为背景,不能单独支撑对本企业的缺失/落后判断。",
    };
  }

  // ---- Competitor fact ----------------------------------------------------
  if (polarity === "COMPETITOR_FACT") {
    if (source === "COMPETITOR_WEB_EVIDENCE") {
      return {
        supportLevel: raw.supportLevel,
        basis: "CONTENT_MATCH",
        confidence: raw.confidence,
        justification: raw.justification || "竞品公开页面直接展示了该竞品事实。",
      };
    }
    if (source === "OBSERVED_WEB_EVIDENCE") {
      return {
        supportLevel: min(raw.supportLevel, "PARTIAL_SUPPORT"),
        basis: "CONTENT_MATCH",
        confidence: Math.min(raw.confidence, 0.6),
        justification: raw.justification || "第三方观察内容部分支持该竞品事实。",
      };
    }
    // First-party evidence cannot establish a competitor's fact.
    return {
      supportLevel: min(raw.supportLevel, "CONTEXT_ONLY"),
      basis: "CONTENT_MATCH",
      confidence: Math.min(raw.confidence, 0.4),
      justification: "首方证据不能证明竞品的功能事实,仅作背景。",
    };
  }

  // ---- Positive enterprise capability -------------------------------------
  if (source === "FIRST_PARTY_EVIDENCE") {
    // First-party CAN directly state its own capability — but only when the raw
    // verdict is content-backed (the strategy found actual overlap). We never
    // upgrade purely because the source is first-party.
    return {
      supportLevel: raw.supportLevel,
      basis: "CONTENT_MATCH",
      confidence: raw.confidence,
      justification: raw.justification || "首方页面内容直接支持该能力表述。",
    };
  }
  if (source === "OBSERVED_WEB_EVIDENCE") {
    // Third-party mentions can only PARTIALLY support the enterprise's own claim.
    return {
      supportLevel: min(raw.supportLevel, "PARTIAL_SUPPORT"),
      basis: "CONTENT_MATCH",
      confidence: Math.min(raw.confidence, 0.6),
      justification:
        raw.justification || "第三方内容只能部分支持企业自身能力,不能单独作为直接证据。",
    };
  }
  // Competitor evidence cannot support the enterprise's own capability.
  return {
    supportLevel: min(raw.supportLevel, "CONTEXT_ONLY"),
    basis: "CONTENT_MATCH",
    confidence: Math.min(raw.confidence, 0.4),
    justification: "竞品证据不能支持本企业自身能力,仅作背景。",
  };
}
