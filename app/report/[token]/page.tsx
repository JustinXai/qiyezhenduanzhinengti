import Link from "next/link";
import { presentReport } from "../../../src/report/presentation";
import { ReportExperience } from "../../../components/report/report-experience";
import { getRuntime } from "../../../src/runtime/create-runtime";
import {
  handleGetDiagnosis,
  type DiagnosisView,
} from "../../../src/runtime/api/diagnoses-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real data source (Agent E API): the report is looked up by its public token
// through the same handler the HTTP route uses, so the page renders exactly the
// canonical report that was produced, validated, guarded and stored — never a
// fixture. The presentation service projects that one report into Quick / Deep /
// Evidence view models.
async function loadReport(token: string) {
  const result = await handleGetDiagnosis(getRuntime(), { id: token, publicToken: token });
  if (result.status !== 200) return null;
  return (result.body as DiagnosisView).report;
}

interface ReportPageProps {
  params: Promise<{ token: string }>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { token } = await params;
  const report = await loadReport(token);

  if (!report) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">未找到诊断报告</h1>
        <p className="text-sm text-neutral-500">
          该报告可能尚未生成完成,或链接无效。请返回首页重新发起诊断。
        </p>
        <Link href="/" className="text-sm font-medium text-neutral-900 underline">
          返回首页
        </Link>
      </main>
    );
  }

  const { quick, deep, evidence } = presentReport(report);
  return <ReportExperience quick={quick} deep={deep} evidence={evidence} />;
}
