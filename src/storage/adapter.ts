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
}
