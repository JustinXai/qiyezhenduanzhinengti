// 三阶段路线图 (docs/REPORT_CONTRACT.md §7). Client version shows phase GOALS
// and expected outcomes only — never weekly tasks, hours, material lists,
// pricing, acceptance criteria or a paid SOW.

const PHASES = [
  {
    phase: "阶段一",
    goal: "统一品牌与业务表达",
    outcome: "让客户与 AI 在首屏就能准确理解企业是谁、为谁解决什么问题。",
  },
  {
    phase: "阶段二",
    goal: "覆盖高意向客户问题",
    outcome: "围绕采购决策补齐结构化内容,减少高意向客户在比价阶段的信息缺口。",
  },
  {
    phase: "阶段三",
    goal: "持续测试和更新",
    outcome: "定期复测 AI 问答与内容表现,按证据持续调整,而非一次性交付。",
  },
] as const;

export function Roadmap() {
  return (
    <ol className="space-y-2.5">
      {PHASES.map((p, i) => (
        <li key={p.phase} className="flex gap-3 rounded-xl border border-neutral-200 p-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-900">
              {p.phase} · {p.goal}
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">{p.outcome}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
