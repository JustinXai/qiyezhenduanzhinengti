import { DiagnoseForm } from "../components/diagnose-form";

// ============================================================================
// 企业诊断智能体 — 首页 (Round-8 FINAL MVP)
// ============================================================================

export default function HomePage() {
  return (
    <main className="min-h-screen w-full bg-neutral-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-stretch gap-6 px-4 py-8 sm:px-6 sm:py-12">
        {/* 标题区 */}
        <header className="flex flex-col items-center gap-3 text-center sm:gap-4">
          <h1
            className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl"
            data-testid="home-title"
          >
            企业诊断智能体
          </h1>
          <p
            className="max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-base"
            data-testid="home-subtitle"
          >
            基于公开信息与客户决策问题分析，帮助企业发现AI搜索时代的信息建设机会。
          </p>

          {/* 能力点 */}
          <ul
            className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-neutral-500 sm:text-sm"
            data-testid="home-capabilities"
          >
            <li className="inline-flex items-center gap-1.5">
              <Dot /> 公开信息诊断
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Dot /> 客户决策问题覆盖
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Dot /> 证据可追溯
            </li>
          </ul>
        </header>

        {/* 表单卡片 */}
        <DiagnoseForm />

        <footer className="pb-4 pt-2 text-center text-xs text-neutral-400">
          本报告基于公开网络信息生成,结果不承诺排名或经营结果。
        </footer>
      </div>
    </main>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400"
    />
  );
}
