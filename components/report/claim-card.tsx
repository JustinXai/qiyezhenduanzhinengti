import type { ReactNode } from "react";
import type { CoreIssue, GeoOpportunity, Strength } from "../../src/contracts";
import { ClaimTypeBadge, EvidenceTag } from "./badges";

interface CardShellProps {
  statement: string;
  claimType: "DIAGNOSTIC_INFERENCE" | "UNVERIFIED_HYPOTHESIS";
  evidenceCount: number;
  children?: ReactNode;
}

function CardShell({ statement, claimType, evidenceCount, children }: CardShellProps) {
  return (
    <article className="rounded-xl border border-neutral-200 p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <ClaimTypeBadge claimType={claimType} />
        <EvidenceTag count={evidenceCount} />
      </div>
      <p className="text-sm font-medium text-neutral-900">{statement}</p>
      {children && <dl className="mt-2 space-y-1.5">{children}</dl>}
    </article>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="text-xs leading-relaxed">
      <dt className="inline font-semibold text-neutral-500">{term}:</dt>{" "}
      <dd className="inline text-neutral-700">{children}</dd>
    </div>
  );
}

/** 已有优势 card. */
export function StrengthItem({ strength }: { strength: Strength }) {
  return (
    <CardShell
      statement={strength.statement}
      claimType={strength.claimType}
      evidenceCount={strength.evidenceIds.length}
    >
      <Row term="业务价值">{strength.businessImpact}</Row>
    </CardShell>
  );
}

/** 核心问题 card (docs/REPORT_CONTRACT.md §4). */
export function IssueItem({ issue }: { issue: CoreIssue }) {
  return (
    <CardShell
      statement={issue.statement}
      claimType={issue.claimType}
      evidenceCount={issue.evidenceIds.length}
    >
      <Row term="业务影响">{issue.businessImpact}</Row>
      <Row term="修复方向">{issue.fixDirection}</Row>
    </CardShell>
  );
}

/** GEO 机会 card (docs/REPORT_CONTRACT.md §6). */
export function OpportunityItem({ opportunity }: { opportunity: GeoOpportunity }) {
  return (
    <CardShell
      statement={opportunity.statement}
      claimType={opportunity.claimType}
      evidenceCount={opportunity.evidenceIds.length}
    >
      <Row term="客户在问">{opportunity.customerQuestion}</Row>
      <Row term="内容空位">{opportunity.contentGap}</Row>
      <Row term="业务影响">{opportunity.businessImpact}</Row>
      {opportunity.recommendedAction && <Row term="建议动作">{opportunity.recommendedAction}</Row>}
      {opportunity.priorityReason && <Row term="优先理由">{opportunity.priorityReason}</Row>}
    </CardShell>
  );
}
