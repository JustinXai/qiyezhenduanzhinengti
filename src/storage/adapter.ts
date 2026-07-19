// StorageAdapter isolates the DB implementation from callers.
// Owned by Agent E (runtime-api). Baseline defined the minimal shape; this
// round extends it with the diagnosis-request / evidence / report /
// provider-usage access the state machine and API need. Extensions stay
// additive so any mock or alternative backend can implement the same contract.

export type DiagnosisStatus =
  | "CREATED"
  | "VALIDATING"
  | "SEARCHING"
  | "CRAWLING"
  | "NORMALIZING_EVIDENCE"
  | "ANALYZING"
  // Round-3: structured Claim–Evidence semantic verification, between ANALYZING
  // and VALIDATING_REPORT. See docs/ARCHITECTURE.md state machine.
  | "CLAIM_EVIDENCE_VERIFICATION"
  | "VALIDATING_REPORT"
  | "READY"
  | "FAILED";

// ---------------------------------------------------------------------------
// Record shapes (persistence-facing; independent of the canonical report Zod
// types so the storage layer never depends on report internals).
// ---------------------------------------------------------------------------

export interface DiagnosisRequestRecord {
  id: string;
  status: DiagnosisStatus;
  inputJson: string;
  publicToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvidenceRecordInput {
  id: string;
  diagnosisId: string;
  sourceType: string;
  sourceDomain: string;
  url: string;
  title: string | null;
  snippet: string | null;
  authorityLevel: string | null;
  supportLevel: string | null;
  fetchedAt: Date;
}

export type EvidenceRecord = EvidenceRecordInput;

export interface SaveReportInput {
  id: string;
  diagnosisId: string;
  reportContractVersion: string;
  scoreContractVersion: string;
  canonicalJson: string;
}

export interface StoredReport extends SaveReportInput {
  createdAt: Date;
}

// Round-3 additive: persisted Claim–Evidence relations (traceability — 职责 9).
export interface ClaimEvidenceRelationRecordInput {
  id: string;
  diagnosisId: string;
  claimId: string;
  claimKind: string;
  evidenceId: string;
  supportLevel: string;
  confidence: number;
  justification: string | null;
  basis: string;
  verifierMode: string;
  verifierVersion: string;
}

export interface ClaimEvidenceRelationRecord extends ClaimEvidenceRelationRecordInput {
  createdAt: Date;
}

export interface ProviderUsageInput {
  id: string;
  diagnosisId: string;
  provider: string;
  stage: string;
  callCount?: number;
  retryCount?: number;
  errorCode?: string | null;
  costEstimate?: number | null;
}

export interface ProviderUsageRecord {
  id: string;
  diagnosisId: string;
  provider: string;
  stage: string;
  callCount: number;
  retryCount: number;
  errorCode: string | null;
  costEstimate: number | null;
  createdAt: Date;
}

export const PRUNE_DECISION_REASON_CODES = [
  "NO_VALID_EVIDENCE",
  "INVALID_EVIDENCE_REFERENCE",
  "INVALID_SOURCE_ISSUE_REFERENCE",
  "INSUFFICIENT_DIRECT_SUPPORT",
  "INSUFFICIENT_INDEPENDENT_SUPPORT",
  "FROZEN_SCOPE_PREFIX_MISSING",
  "COVERAGE_NOT_ESTABLISHED",
  // Round-6 uses these precise runtime reasons. The two older codes above stay
  // accepted for append-only historical rows and frozen-recovery compatibility.
  "NO_MEASUREMENT_COVERAGE",
  "MISSING_COVERAGE_PREFIX",
  "DUPLICATED_EVIDENCE_SET",
  "GENERIC_OR_UNACTIONABLE",
  "UNVERIFIED_COMPETITOR_ASSERTION",
  "BANNED_OR_OVERPROMISING_COPY",
  "SYSTEM_FAILURE_NOT_BUSINESS_ISSUE",
] as const;

export type PruneDecisionReasonCode = (typeof PRUNE_DECISION_REASON_CODES)[number];

export type PruneDecisionCoverageStatus =
  | "NOT_REQUIRED"
  | "ESTABLISHED_AND_BOUNDED"
  | "NOT_ESTABLISHED"
  | "SCOPE_LIMITATION_MISSING";

/** Complete, internal-only audit record for one removed generation candidate. */
export interface PruneDecisionRecordInput {
  id: string;
  diagnosisId: string;
  /** Exactly one of reportId/revisionId must be present. */
  reportId: string | null;
  revisionId: string | null;
  stageRunId: string;
  claimKind: string;
  candidateRef: string;
  sourceIssueId: string | null;
  reasonCode: PruneDecisionReasonCode;
  guardRule: string;
  evidenceIds: string[];
  independentSupportSourceCount: number;
  directCount: number;
  partialCount: number;
  contextCount: number;
  coverageStatus: PruneDecisionCoverageStatus;
  createdAt: Date;
  algorithmVersion: string;
}

export type PruneDecisionRecord = PruneDecisionRecordInput;

export const ANALYSIS_STAGES = [
  "REPORT_PROFILE",
  "REPORT_SCORING",
  "REPORT_AI_VISIBILITY",
  "REPORT_CLAIMS",
] as const;

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];
export type AnalysisStageRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export interface AnalysisStageRunRecord {
  id: string;
  diagnosisId: string;
  stage: AnalysisStage;
  attempt: number;
  status: AnalysisStageRunStatus;
  inputHash: string;
  evidenceRegistryHash: string;
  /** Null only for the explicit FROZEN_EVIDENCE_REANALYSIS mode. */
  competitorResolutionHash: string | null;
  /** Null only for the explicit FROZEN_EVIDENCE_REANALYSIS mode. */
  queryPlanHash: string | null;
  frozenEvidenceSnapshotHash: string | null;
  outputJson: string | null;
  outputHash: string | null;
  schemaVersion: string;
  promptVersion: string;
  providerModel: string;
  providerUsageId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  errorCategory: string | null;
  errorMetadataJson: string | null;
}

export interface StartAnalysisStageRunInput {
  id: string;
  diagnosisId: string;
  stage: AnalysisStage;
  attempt: number;
  inputHash: string;
  evidenceRegistryHash: string;
  competitorResolutionHash: string | null;
  queryPlanHash: string | null;
  frozenEvidenceSnapshotHash?: string | null;
  schemaVersion: string;
  promptVersion: string;
  providerModel: string;
}

export type AnalysisRepairStatus = "RUNNING" | "SUCCEEDED" | "FAILED";
export type AnalysisRecoveryReusedStage = AnalysisStage | "EVIDENCE_REGISTRY";

export interface AnalysisRepairAttemptRecord {
  diagnosisId: string;
  repairAttempt: number;
  originalFailureStage: string;
  authorizedAt: Date;
  startedAt: Date;
  completedAt: Date | null;
  status: AnalysisRepairStatus;
  reusedStages: AnalysisRecoveryReusedStage[];
  rerunStages: AnalysisStage[];
  providerCallDelta: number;
  resultState: string | null;
  failureCategory: string | null;
  recoveryMode: "STRICT_CHECKPOINT_RESUME" | "FROZEN_EVIDENCE_REANALYSIS";
  missingHistoricalProvenance: string[];
  frozenEvidenceSnapshotJson: string | null;
  frozenEvidenceSnapshotHash: string | null;
}

export interface BeginAnalysisRepairAttemptInput {
  diagnosisId: string;
  repairAttempt: number;
  originalFailureStage: string;
  authorizedAt: Date;
  reusedStages: AnalysisRecoveryReusedStage[];
  rerunStages: AnalysisStage[];
  recoveryMode?: "STRICT_CHECKPOINT_RESUME" | "FROZEN_EVIDENCE_REANALYSIS";
  missingHistoricalProvenance?: string[];
  frozenEvidenceSnapshotJson?: string | null;
  frozenEvidenceSnapshotHash?: string | null;
}

export interface AnalysisCheckpointRecord {
  diagnosisId: string;
  stage: string;
  inputHash: string;
  outputJson: string;
  reportContractVersion: string;
  scoreContractVersion: string;
  providerModel: string;
  promptVersion: string;
  trustGuardVersion: string;
  completedAt: Date;
}

// ---------------------------------------------------------------------------
// StorageAdapter contract.
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  // -- diagnosis_requests -----------------------------------------------------
  createDiagnosisRequest(input: {
    id: string;
    inputJson: string;
    publicToken: string;
  }): Promise<void>;
  updateDiagnosisStatus(id: string, status: DiagnosisStatus): Promise<void>;
  getDiagnosisRequest(id: string): Promise<DiagnosisRequestRecord | null>;
  getDiagnosisRequestByPublicToken(
    publicToken: string,
  ): Promise<DiagnosisRequestRecord | null>;

  // -- evidence ---------------------------------------------------------------
  saveEvidence(items: EvidenceRecordInput[]): Promise<void>;
  getEvidence(diagnosisId: string): Promise<EvidenceRecord[]>;

  // -- reports ----------------------------------------------------------------
  saveReport(input: SaveReportInput): Promise<void>;
  getReport(diagnosisId: string): Promise<StoredReport | null>;

  // -- provider_usage ---------------------------------------------------------
  recordProviderUsage(input: ProviderUsageInput): Promise<void>;
  getProviderUsage(diagnosisId: string): Promise<ProviderUsageRecord[]>;

  // -- claim_evidence_relations (Round-3, OPTIONAL) ---------------------------
  // Optional so existing/alternative backends (in-memory test doubles) remain
  // valid without implementing them; the state machine calls them only if present.
  saveClaimEvidenceRelations?(items: ClaimEvidenceRelationRecordInput[]): Promise<void>;
  getClaimEvidenceRelations?(diagnosisId: string): Promise<ClaimEvidenceRelationRecord[]>;

  // -- prune_decisions (Round-6, internal append-only ledger) ----------------
  appendPruneDecisions?(items: PruneDecisionRecordInput[]): Promise<void>;
  getPruneDecisions?(diagnosisId: string): Promise<PruneDecisionRecord[]>;

  // -- analysis_checkpoints ---------------------------------------------------
  saveCheckpoint(checkpoint: {
    diagnosisId: string;
    stage: string;
    inputHash: string;
    outputJson: string;
    reportContractVersion: string;
    scoreContractVersion: string;
    providerModel: string;
    promptVersion: string;
    trustGuardVersion: string;
  }): Promise<void>;
  findReusableCheckpoint(query: {
    diagnosisId: string;
    stage: string;
    inputHash: string;
    reportContractVersion: string;
    scoreContractVersion: string;
    providerModel: string;
    promptVersion: string;
    trustGuardVersion: string;
  }): Promise<{ outputJson: string } | null>;
  getLatestCheckpoint?(
    diagnosisId: string,
    stage: string,
  ): Promise<AnalysisCheckpointRecord | null>;

  // -- Round-5.2B analysis recovery (optional for legacy/in-memory adapters) --
  countDiagnosisRequests?(): Promise<number>;
  startAnalysisStageRun?(input: StartAnalysisStageRunInput): Promise<void>;
  completeAnalysisStageRun?(input: {
    id: string;
    outputJson: string;
    outputHash: string;
    providerUsageId: string | null;
  }): Promise<void>;
  failAnalysisStageRun?(input: {
    id: string;
    errorCategory: string;
    errorMetadataJson: string;
    providerUsageId: string | null;
  }): Promise<void>;
  findReusableAnalysisStageRun?(query: {
    diagnosisId: string;
    stage: AnalysisStage;
    inputHash: string;
    evidenceRegistryHash: string;
    competitorResolutionHash: string;
    queryPlanHash: string;
    schemaVersion: string;
    promptVersion: string;
    providerModel: string;
  }): Promise<AnalysisStageRunRecord | null>;
  getAnalysisStageRuns?(diagnosisId: string): Promise<AnalysisStageRunRecord[]>;
  beginAnalysisRepairAttempt?(input: BeginAnalysisRepairAttemptInput): Promise<void>;
  completeAnalysisRepairAttempt?(input: {
    diagnosisId: string;
    repairAttempt: number;
    status: Exclude<AnalysisRepairStatus, "RUNNING">;
    providerCallDelta: number;
    resultState: string;
    failureCategory: string | null;
  }): Promise<void>;
  getAnalysisRepairAttempts?(
    diagnosisId: string,
  ): Promise<AnalysisRepairAttemptRecord[]>;
}

/** Storage capabilities required by the non-public frozen-Evidence recovery. */
export interface AnalysisRecoveryStorage extends StorageAdapter {
  countDiagnosisRequests(): Promise<number>;
  startAnalysisStageRun(input: StartAnalysisStageRunInput): Promise<void>;
  completeAnalysisStageRun(input: {
    id: string;
    outputJson: string;
    outputHash: string;
    providerUsageId: string | null;
  }): Promise<void>;
  failAnalysisStageRun(input: {
    id: string;
    errorCategory: string;
    errorMetadataJson: string;
    providerUsageId: string | null;
  }): Promise<void>;
  findReusableAnalysisStageRun(query: {
    diagnosisId: string;
    stage: AnalysisStage;
    inputHash: string;
    evidenceRegistryHash: string;
    competitorResolutionHash: string;
    queryPlanHash: string;
    schemaVersion: string;
    promptVersion: string;
    providerModel: string;
  }): Promise<AnalysisStageRunRecord | null>;
  getAnalysisStageRuns(diagnosisId: string): Promise<AnalysisStageRunRecord[]>;
  beginAnalysisRepairAttempt(input: BeginAnalysisRepairAttemptInput): Promise<void>;
  completeAnalysisRepairAttempt(input: {
    diagnosisId: string;
    repairAttempt: number;
    status: Exclude<AnalysisRepairStatus, "RUNNING">;
    providerCallDelta: number;
    resultState: string;
    failureCategory: string | null;
  }): Promise<void>;
  getAnalysisRepairAttempts(diagnosisId: string): Promise<AnalysisRepairAttemptRecord[]>;
  getLatestCheckpoint(
    diagnosisId: string,
    stage: string,
  ): Promise<AnalysisCheckpointRecord | null>;
}
