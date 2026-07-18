import type { EvidenceViewModel } from "../../src/contracts";
import { Section } from "./section";
import { EvidenceList } from "./evidence-list";

/**
 * Evidence view (docs/PRODUCT_TRUTH_RULES.md §6). Lists every evidence item the
 * report references. URLs are sanitised upstream by the presentation service.
 */
export function EvidenceView({ vm }: { vm: EvidenceViewModel }) {
  return (
    <div className="space-y-1">
      <Section title="证据附件" subtitle={`共 ${vm.items.length} 条 · 链接已脱敏,默认折叠`}>
        <EvidenceList items={vm.items} />
      </Section>
    </div>
  );
}
