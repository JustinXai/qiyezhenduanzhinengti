// Public entrypoint for the report presentation layer (Agent F).
export {
  presentReport,
  toQuickReportViewModel,
  toDeepReportViewModel,
  toEvidenceViewModel,
  toEnterpriseReportViewModel,
  sanitizeEvidenceUrl,
  COMPETITOR_INSUFFICIENT_EVIDENCE_REASON,
  COMPETITOR_NOT_PROVIDED_REASON,
} from "./report-presentation-service";
export type { ReportPresentation } from "./report-presentation-service";
