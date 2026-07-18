import Link from "next/link";
import { SAMPLE_DIAGNOSIS_REPORT } from "../src/fixtures/sample-report";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">企业诊断智能体</h1>
      <p className="text-sm text-neutral-500">
        Clean-Room Rebuild baseline. 企业输入表单与诊断流程由 Agent F / Agent E 实现。
      </p>
      {/* INTEGRATION SEAM (Agent E API): sample report entry point for this round. */}
      <Link
        href={`/report/${SAMPLE_DIAGNOSIS_REPORT.publicToken}`}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        查看示例诊断报告
      </Link>
    </main>
  );
}
