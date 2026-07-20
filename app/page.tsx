import { DiagnoseForm } from "../components/diagnose-form";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">企业诊断智能体</h1>
        <p className="text-sm text-neutral-500">
          输入企业官网,生成一份基于公开证据的 GEO 可见度诊断报告。
        </p>
      </div>
      <DiagnoseForm />
    </main>
  );
}
