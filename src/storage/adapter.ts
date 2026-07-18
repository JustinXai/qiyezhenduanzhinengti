// StorageAdapter isolates the DB implementation from callers.
// Owned by Agent E (runtime-api). Baseline defines the shape only.

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

export interface StorageAdapter {
  createDiagnosisRequest(input: {
    id: string;
    inputJson: string;
    publicToken: string;
  }): Promise<void>;
  updateDiagnosisStatus(id: string, status: DiagnosisStatus): Promise<void>;
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
