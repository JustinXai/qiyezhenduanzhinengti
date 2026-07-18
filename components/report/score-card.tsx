import type { ScoreBlock } from "../../src/contracts";
import { SCORE_DIMENSION_WEIGHTS } from "../../src/contracts";
import {
  DIMENSION_LABELS,
  DIMENSION_WEIGHT_LABELS,
  MEASUREMENT_STATUS_LABELS,
  OVERALL_SCORE_LABEL,
  formatPercent,
  formatScore,
} from "./labels";
import { Badge } from "./badges";

interface ScoreHeadlineProps {
  overallScore: number | null;
  scoreCoverage: number;
}

/**
 * The composite index headline (Quick module 1). Renders the frozen name
 * "GEO可见度基础指数". A null score (coverage < 70%) is shown as "暂不评分",
 * never as 0.
 */
export function ScoreHeadline({ overallScore, scoreCoverage }: ScoreHeadlineProps) {
  const hasScore = overallScore !== null;
  return (
    // data-testid="geo-index" wraps the whole composite-index headline (frozen
    // label + value) so tests can assert both the canonical name and the score.
    <div data-testid="geo-index" className="rounded-xl bg-neutral-900 p-4 text-white">
      <p className="text-xs text-neutral-300">{OVERALL_SCORE_LABEL}</p>
      <div className="mt-1 flex items-end gap-2">
        {hasScore ? (
          <>
            <span className="text-4xl font-bold leading-none">{formatScore(overallScore)}</span>
            <span className="pb-1 text-sm text-neutral-400">/ 100</span>
          </>
        ) : (
          <span className="text-lg font-semibold text-neutral-200">覆盖不足,暂不评分</span>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-400">评分覆盖率 {formatPercent(scoreCoverage)}</p>
    </div>
  );
}

const DIMENSION_ORDER = Object.keys(SCORE_DIMENSION_WEIGHTS) as (keyof typeof SCORE_DIMENSION_WEIGHTS)[];

/**
 * Full five-dimension breakdown (Deep view). Weights are shown for transparency
 * but are read from the frozen contract — never recomputed here.
 */
export function ScoreBreakdown({ scores }: { scores: ScoreBlock }) {
  return (
    <ul className="space-y-3">
      {DIMENSION_ORDER.map((key) => {
        const dim = scores[key];
        const pct = dim.score === null ? 0 : dim.score;
        return (
          <li key={key}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-neutral-800">
                {DIMENSION_LABELS[key]}
                <span className="ml-1 text-xs text-neutral-400">权重 {DIMENSION_WEIGHT_LABELS[key]}</span>
              </span>
              <span className="tabular-nums text-neutral-900">{formatScore(dim.score)}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-neutral-800"
                style={{ width: dim.score === null ? "0%" : `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
              <Badge tone="muted">{MEASUREMENT_STATUS_LABELS[dim.measurementStatus]}</Badge>
              <span>置信度 {dim.confidence.toFixed(2)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
