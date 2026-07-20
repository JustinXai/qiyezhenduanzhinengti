"use client";

import { useState } from "react";
import type {
  DeepReportViewModel,
  EvidenceViewModel,
  QuickReportViewModel,
} from "../../src/contracts";
import { QuickReport } from "./quick-report";
import { DeepReport } from "./deep-report";
import { EvidenceView } from "./evidence-view";

type ViewKey = "quick" | "deep" | "evidence";

const TABS: { key: ViewKey; label: string }[] = [
  { key: "quick", label: "快速版" },
  { key: "deep", label: "完整诊断" },
  { key: "evidence", label: "证据" },
];

interface ReportExperienceProps {
  quick: QuickReportViewModel;
  deep: DeepReportViewModel;
  evidence: EvidenceViewModel;
}

/**
 * Client shell that switches between the three read views. Switching is pure
 * local state over already-computed view models — it NEVER re-fetches, re-scores
 * or creates a new task (docs/ARCHITECTURE.md). Quick is the default view.
 */
export function ReportExperience({ quick, deep, evidence }: ReportExperienceProps) {
  const [view, setView] = useState<ViewKey>("quick");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-white">
      <nav className="sticky top-0 z-10 flex gap-1 border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur">
        {TABS.map((tab) => {
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => setView(tab.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 px-4 py-4">
        {view === "quick" && <QuickReport vm={quick} onOpenDeep={() => setView("deep")} />}
        {view === "deep" && <DeepReport vm={deep} />}
        {view === "evidence" && <EvidenceView vm={evidence} />}
      </main>
    </div>
  );
}
