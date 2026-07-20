// 三阶段路线图 (docs/REPORT_CONTRACT.md §7). Client version shows phase GOALS
// and expected outcomes only — never weekly tasks, hours, material lists,
// pricing, acceptance criteria or a paid SOW. The frozen phase-goal names come
// from the single product-copy source; the outcome prose is presentation UI.

import { ROADMAP_PHASE_GOALS } from "../../src/product/customer-copy";

const PHASES = [
  {
    phase: "阶段一",
    goal: ROADMAP_PHASE_GOALS[0],
    outcome: "让客户与 AI 在首屏就能准确理解企业是谁、为谁解决什么问题。",
  },
  {
    phase: "阶段二",
    goal: ROADMAP_PHASE_GOALS[1],
    outcome: "围绕采购决策补齐结构化内容，减少高意向客户在比价阶段的信息缺口。",
  },
  {
    phase: "阶段三",
    goal: ROADMAP_PHASE_GOALS[2],
    outcome: "定期复测 AI 问答与内容表现，按证据持续调整，而非一次性交付。",
  },
] as const;

export function Roadmap() {
  return (
    <ol className="space-y-3">
      {PHASES.map((p, i) => (
        <li key={p.phase} className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-sm font-bold text-white">
            {i + 1}
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-900">
              {p.phase} · {p.goal}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{p.outcome}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
