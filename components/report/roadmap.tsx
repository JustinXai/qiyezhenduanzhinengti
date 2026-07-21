// Round-9: 优先行动路线 (REPORT_PRODUCTIZATION_V2)
// 三阶段路线图，输出导向，不含SOW时长承诺。

const PHASES = [
  {
    phase: "阶段一",
    title: "完善企业基础信息",
    output: "品牌、产品、服务结构化内容",
  },
  {
    phase: "阶段二",
    title: "覆盖客户决策问题",
    output: "FAQ、场景页、案例页",
  },
  {
    phase: "阶段三",
    title: "持续优化和监测",
    output: "持续检测和内容迭代",
  },
] as const;

export function Roadmap() {
  return (
    <div className="space-y-3">
      {PHASES.map((p, i) => (
        <div key={p.phase} className="flex gap-4 rounded-xl border border-neutral-200 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-bold text-neutral-700">
            {i + 1}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-400">{p.phase}</span>
              <span className="text-sm font-semibold text-neutral-900">{p.title}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
              <span className="font-medium text-neutral-400">输出：</span>
              <span>{p.output}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
