import { DiagnoseForm } from "../components/diagnose-form";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen flex-col items-center">
      {/* Hero Section */}
      <section className="w-full bg-gradient-to-b from-neutral-50 to-white px-6 pt-16 pb-12 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-500 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            企业级 AI 诊断工具
          </div>
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            企业诊断智能体
          </h1>
          <p className="text-base leading-relaxed text-neutral-500 sm:text-lg">
            基于公开信息与 AI 认知，快速发现企业在客户决策场景中的可见度机会。
          </p>
        </div>
      </section>

      {/* Capabilities */}
      <section className="w-full bg-white px-6 py-10">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
          {CAPABILITIES.map((cap) => (
            <div
              key={cap.title}
              className="flex flex-col items-center gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center transition hover:border-neutral-200 hover:shadow-sm"
            >
              <span className="text-2xl" aria-hidden>
                {cap.icon}
              </span>
              <span className="text-xs font-medium text-neutral-700 leading-snug">
                {cap.title}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Form Section */}
      <section className="w-full flex-1 bg-white px-6 pb-16 pt-4">
        <div className="mx-auto max-w-md">
          <DiagnoseForm />
        </div>
      </section>
    </main>
  );
}

const CAPABILITIES = [
  {
    icon: "🔍",
    title: "公开信息诊断",
  },
  {
    icon: "🧠",
    title: "AI 认知样本",
  },
  {
    icon: "📋",
    title: "客户问题覆盖",
  },
  {
    icon: "📎",
    title: "证据可追溯",
  },
] as const;
