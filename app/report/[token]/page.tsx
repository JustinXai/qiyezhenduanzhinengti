import { presentReport } from "../../../src/report/presentation";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../../src/fixtures/sample-report";
import { ReportExperience } from "../../../components/report/report-experience";

// INTEGRATION SEAM (Agent E API):
// Real reports are served by Agent E from app/api (Canonical DiagnosisReport,
// looked up by publicToken). In this round the page renders the shared sample
// report projected through the presentation service, so the Quick/Deep/Evidence
// experience is exercised end-to-end without a live backend.
//
// Per the Agent G e2e contract, when DIAGNOSIS_SMOKE_MODE is truthy the page
// MUST render SAMPLE_DIAGNOSIS_REPORT through the presentation service — which is
// exactly this round's behaviour (the sample is the only data source here).
//
// When Agent E's endpoint lands, keep the smoke-mode branch and add the real
// lookup keyed on `token`; the rest of this component is unchanged because it
// only consumes the presentation view models.
async function loadReport(token: string) {
  if (!token) throw new Error("缺少报告 token");
  return SAMPLE_DIAGNOSIS_REPORT;
}

interface ReportPageProps {
  params: Promise<{ token: string }>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { token } = await params;
  const report = await loadReport(token);
  const { quick, deep, evidence } = presentReport(report);

  return <ReportExperience quick={quick} deep={deep} evidence={evidence} />;
}
