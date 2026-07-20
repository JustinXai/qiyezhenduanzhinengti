import type { DemonstrationFix } from "../../src/contracts";
import { EvidenceTag } from "./badges";

const FIX_TYPE_LABELS: Record<DemonstrationFix["fixType"], string> = {
  ENTITY_DESCRIPTION: "实体描述",
  FAQ_EXAMPLE: "FAQ 示例",
  BEFORE_AFTER_STRUCTURE: "结构对比",
};

/**
 * 示范修复 (docs/REPORT_CONTRACT.md §5). Rendered only when the report carries a
 * demonstrationFix; the Quick view hides this module entirely when it is null.
 * The disclaimer is rendered from the Canonical value (frozen Zod literal), so
 * it stays byte-exact with src/contracts/index.ts — never retyped here.
 */
export function DemonstrationFixCard({ fix }: { fix: DemonstrationFix }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
          {FIX_TYPE_LABELS[fix.fixType]}
        </span>
        <EvidenceTag count={fix.evidenceIds.length} />
      </div>

      <dl className="space-y-2 text-xs leading-relaxed">
        <div>
          <dt className="font-semibold text-neutral-500">当前问题</dt>
          <dd className="text-neutral-700">{fix.currentIssue}</dd>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-neutral-50 p-2">
            <dt className="mb-1 font-semibold text-neutral-500">修复前</dt>
            <dd className="text-neutral-700">{fix.before}</dd>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2">
            <dt className="mb-1 font-semibold text-emerald-700">修复后结构</dt>
            <dd className="text-neutral-700">{fix.after}</dd>
          </div>
        </div>
        <div>
          <dt className="font-semibold text-neutral-500">为什么更利于客户与 AI 理解</dt>
          <dd className="text-neutral-700">{fix.whyBetter}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-500">建议资产类型</dt>
          <dd className="text-neutral-700">{fix.suggestedAssetType}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-500">需要企业确认</dt>
          <dd className="text-neutral-700">{fix.customerConfirmationNeeded}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-500">GEO 团队可交付</dt>
          <dd className="text-neutral-700">{fix.geoTeamDeliverable}</dd>
        </div>
      </dl>

      <p className="mt-2.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800">
        {fix.disclaimer}
      </p>
    </div>
  );
}
