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
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-white">
      {/* ── Navigation Bar ────────────────────────────────────── */}
      <nav className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
        {/* Brand mark */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M7 1L13 4V10L7 13L1 10V4L7 1Z"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M7 5L10 6.5V9.5L7 11L4 9.5V6.5L7 5Z"
                fill="white"
                fillOpacity="0.8"
              />
            </svg>
          </div>
          <span className="text-sm font-semibold text-neutral-900 tracking-tight">
            诊断报告
          </span>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
          {TABS.map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setView(tab.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Main Content ──────────────────────────────────────── */}
      <main className="flex-1 px-4 py-6">
        {view === "quick" && <QuickReport vm={quick} onOpenDeep={() => setView("deep")} />}
        {view === "deep" && <DeepReport vm={deep} />}
        {view === "evidence" && <EvidenceView vm={evidence} />}
      </main>
    </div>
  );
}
