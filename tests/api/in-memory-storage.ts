// In-memory StorageAdapter for handler tests.
//
// Proves the API handlers depend only on the StorageAdapter contract (not on
// SQLite): they run identically against this Map-backed backend. Not a *.test.ts
// file, so vitest does not collect it as a suite.

import type {
  AnalysisCheckpointRecord,
  DiagnosisRequestRecord,
  DiagnosisStatus,
  EvidenceRecord,
  EvidenceRecordInput,
  ProviderUsageInput,
  ProviderUsageRecord,
  PruneDecisionRecord,
  PruneDecisionRecordInput,
  ClaimPublicationDecisionBatchInput,
  ClaimPublicationDecisionRecord,
  SaveReportInput,
  StorageAdapter,
  StoredReport,
} from "../../src/storage/adapter";

interface CheckpointEntry {
  id: string;
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

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly requests = new Map<string, DiagnosisRequestRecord>();
  private readonly evidence = new Map<string, EvidenceRecord[]>();
  private readonly reports = new Map<string, StoredReport>();
  private readonly usage: ProviderUsageRecord[] = [];
  private readonly checkpoints: CheckpointEntry[] = [];
  private readonly pruneDecisions: PruneDecisionRecord[] = [];
  private readonly publicationDecisions: ClaimPublicationDecisionRecord[] = [];
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  async createDiagnosisRequest(input: {
    id: string;
    inputJson: string;
    publicToken: string;
  }): Promise<void> {
    const ts = this.now();
    this.requests.set(input.id, {
      id: input.id,
      status: "CREATED",
      inputJson: input.inputJson,
      publicToken: input.publicToken,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  async updateDiagnosisStatus(id: string, status: DiagnosisStatus): Promise<void> {
    const rec = this.requests.get(id);
    if (!rec) throw new Error(`updateDiagnosisStatus: no request ${id}`);
    rec.status = status;
    rec.updatedAt = this.now();
  }

  async getDiagnosisRequest(id: string): Promise<DiagnosisRequestRecord | null> {
    const rec = this.requests.get(id);
    return rec ? { ...rec } : null;
  }

  async getDiagnosisRequestByPublicToken(
    publicToken: string,
  ): Promise<DiagnosisRequestRecord | null> {
    for (const rec of this.requests.values()) {
      if (rec.publicToken === publicToken) return { ...rec };
    }
    return null;
  }

  async saveEvidence(items: EvidenceRecordInput[]): Promise<void> {
    for (const it of items) {
      const list = this.evidence.get(it.diagnosisId) ?? [];
      const idx = list.findIndex((e) => e.id === it.id);
      const rec: EvidenceRecord = { ...it };
      if (idx >= 0) list[idx] = rec;
      else list.push(rec);
      this.evidence.set(it.diagnosisId, list);
    }
  }

  async getEvidence(diagnosisId: string): Promise<EvidenceRecord[]> {
    return (this.evidence.get(diagnosisId) ?? []).map((e) => ({ ...e }));
  }

  async saveReport(input: SaveReportInput): Promise<void> {
    this.reports.set(input.diagnosisId, { ...input, createdAt: this.now() });
  }

  async getReport(diagnosisId: string): Promise<StoredReport | null> {
    const rec = this.reports.get(diagnosisId);
    return rec ? { ...rec } : null;
  }

  async recordProviderUsage(input: ProviderUsageInput): Promise<void> {
    this.usage.push({
      id: input.id,
      diagnosisId: input.diagnosisId,
      provider: input.provider,
      stage: input.stage,
      callCount: input.callCount ?? 0,
      retryCount: input.retryCount ?? 0,
      errorCode: input.errorCode ?? null,
      costEstimate: input.costEstimate ?? null,
      createdAt: this.now(),
    });
  }

  async getProviderUsage(diagnosisId: string): Promise<ProviderUsageRecord[]> {
    return this.usage
      .filter((u) => u.diagnosisId === diagnosisId)
      .map((u) => ({ ...u }));
  }

  async appendPruneDecisions(items: PruneDecisionRecordInput[]): Promise<void> {
    this.pruneDecisions.push(...items.map((item) => ({ ...structuredClone(item) })));
  }

  async getPruneDecisions(diagnosisId: string): Promise<PruneDecisionRecord[]> {
    return this.pruneDecisions
      .filter((item) => item.diagnosisId === diagnosisId)
      .map((item) => structuredClone(item));
  }

  async appendClaimPublicationDecisionBatch(
    batch: ClaimPublicationDecisionBatchInput,
  ): Promise<void> {
    this.publicationDecisions.push(
      ...batch.decisions.map((item) => structuredClone(item)),
    );
  }

  async getClaimPublicationDecisions(
    diagnosisId: string,
  ): Promise<ClaimPublicationDecisionRecord[]> {
    return this.publicationDecisions
      .filter((item) => item.diagnosisId === diagnosisId)
      .map((item) => structuredClone(item));
  }

  async saveCheckpoint(checkpoint: {
    diagnosisId: string;
    stage: string;
    inputHash: string;
    outputJson: string;
    reportContractVersion: string;
    scoreContractVersion: string;
    providerModel: string;
    promptVersion: string;
    trustGuardVersion: string;
  }): Promise<void> {
    this.checkpoints.push({
      id: `${checkpoint.diagnosisId}:${checkpoint.stage}:${this.checkpoints.length + 1}`,
      ...checkpoint,
      completedAt: this.now(),
    });
  }

  async findReusableCheckpoint(query: {
    diagnosisId: string;
    stage: string;
    inputHash: string;
    reportContractVersion: string;
    scoreContractVersion: string;
    providerModel: string;
    promptVersion: string;
    trustGuardVersion: string;
  }): Promise<{ outputJson: string } | null> {
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      const c = this.checkpoints[i]!;
      if (
        c.diagnosisId === query.diagnosisId &&
        c.stage === query.stage &&
        c.inputHash === query.inputHash &&
        c.reportContractVersion === query.reportContractVersion &&
        c.scoreContractVersion === query.scoreContractVersion &&
        c.providerModel === query.providerModel &&
        c.promptVersion === query.promptVersion &&
        c.trustGuardVersion === query.trustGuardVersion
      ) {
        return { outputJson: c.outputJson };
      }
    }
    return null;
  }

  async getLatestCheckpoint(
    diagnosisId: string,
    stage: string,
  ): Promise<AnalysisCheckpointRecord | null> {
    const checkpoint = [...this.checkpoints]
      .reverse()
      .find((item) => item.diagnosisId === diagnosisId && item.stage === stage);
    return checkpoint ? structuredClone(checkpoint) : null;
  }
}
