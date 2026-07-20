// 建议推进路径 (docs/REPORT_CONTRACT.md §7). Client version shows phase GOALS
// and expected outcomes only — compressed to single compact module.
// Never weekly tasks, hours, material lists, pricing, acceptance criteria or a paid SOW.

import { ROADMAP_PHASE_GOALS } from "../../src/product/customer-copy";

const PHASES = [
  {
    phase: "先补齐",
    goal: ROADMAP_PHASE_GOALS[0],
    outcome: "让客户与 AI 在首屏就能准确理解企业是谁、为谁解决什么问题。",
  },
  {
    phase: "再覆盖",
    goal: ROADMAP_PHASE_GOALS[1],
    outcome: "围绕采购决策补齐结构化内容，减少高意向客户在比价阶段的信息缺口。",
  },
  {
    phase: "最后持续",
    goal: ROADMAP_PHASE_GOALS[2],
    outcome: "定期复测 AI 问答与内容表现，按证据持续调整，而非一次性交付。",
  },
] as const;

export function Roadmap() {
  return (
    <div className="space-y-2">
      {PHASES.map((p, i) => (
        <div key={p.phase} className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
            {i + 1}
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-900">
              {p.phase}：{p.goal}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{p.outcome}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
