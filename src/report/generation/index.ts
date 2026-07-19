export {
  assembleReport,
  buildReportFromStageOutputs,
  type AssembleReportInput,
  type AssembleReportResult,
  type BuildReportInput,
  type BuildReportResult,
  type ReportIdentity,
  type StageOutputs,
} from "./assemble-report";
export type { AnalysisPruneCandidate } from "../../diagnosis/analysis/claims";
export {
  computeOverall,
  SCORE_COVERAGE_THRESHOLD,
  type DimensionScoreMap,
  type OverallScoreResult,
} from "./score-seam";
