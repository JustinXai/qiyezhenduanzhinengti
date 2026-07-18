import type { ReactNode } from "react";
import type {
  EvidenceSourceType,
  EvidenceSupportLevel,
} from "../../src/contracts";
import {
  CLAIM_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  SUPPORT_LEVEL_LABELS,
} from "./labels";

type Tone = "neutral" | "positive" | "warning" | "info" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  positive: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-sky-50 text-sky-700",
  muted: "bg-neutral-50 text-neutral-500",
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
}

/** Small pill label. Reusable base for all report tags. */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

const SUPPORT_TONE: Record<EvidenceSupportLevel, Tone> = {
  DIRECT_SUPPORT: "positive",
  PARTIAL_SUPPORT: "info",
  CONTEXT_ONLY: "muted",
  UNSUPPORTED: "warning",
};

/** Evidence support-level tag (直接支持 / 部分支持 / ...). */
export function SupportLevelBadge({ level }: { level: EvidenceSupportLevel }) {
  return <Badge tone={SUPPORT_TONE[level]}>{SUPPORT_LEVEL_LABELS[level]}</Badge>;
}

/** Evidence source-type tag (第一方 / 公开网络 / 竞品). */
export function SourceTypeBadge({ type }: { type: EvidenceSourceType }) {
  return <Badge tone="neutral">{SOURCE_TYPE_LABELS[type]}</Badge>;
}

/** Claim provenance tag (诊断推断 / 待确认假设). */
export function ClaimTypeBadge({
  claimType,
}: {
  claimType: keyof typeof CLAIM_TYPE_LABELS;
}) {
  return (
    <Badge tone={claimType === "DIAGNOSTIC_INFERENCE" ? "neutral" : "warning"}>
      {CLAIM_TYPE_LABELS[claimType]}
    </Badge>
  );
}

/**
 * Evidence-count tag summarising how many evidence items back a claim. Renders
 * the count only; the actual items live in the Evidence view.
 */
export function EvidenceTag({ count }: { count: number }) {
  return <Badge tone="info">Evidence · {count}</Badge>;
}
