import type { ClaimEvidenceRelation } from "../contracts/claim-evidence";
import type {
  PersistedRound53FinalizationSource,
  Round53FinalizationSourceStorage,
} from "../services/diagnosis/round53-offline-finalizer";
import { ANALYSIS_STAGES, type AnalysisStage } from "./adapter";
import type { SqliteDatabase } from "./migrate";

interface StageRow {
  stage: AnalysisStage;
  status: "SUCCEEDED";
  output_json: string;
  output_hash: string;
}

interface RelationRow {
  claim_id: string;
  claim_kind: ClaimEvidenceRelation["claimKind"];
  evidence_id: string;
  support_level: ClaimEvidenceRelation["supportLevel"];
  confidence: number;
  justification: string | null;
  basis: ClaimEvidenceRelation["basis"];
  verifier_mode: ClaimEvidenceRelation["verifierMode"];
  verifier_version: string;
}

/** Read-only binding from actual SQLite recovery ledgers to the offline finalizer. */
export class SqliteRound53FinalizationSourceStorage
  implements Round53FinalizationSourceStorage
{
  constructor(private readonly db: SqliteDatabase) {}

  async loadPersistedSource(
    diagnosisId: string,
  ): Promise<PersistedRound53FinalizationSource | null> {
    const diagnosis = this.db
      .prepare("SELECT id FROM diagnosis_requests WHERE id = ?")
      .get(diagnosisId) as { id: string } | undefined;
    if (!diagnosis) return null;

    const stageOutputs = {} as PersistedRound53FinalizationSource["stageOutputs"];
    for (const stage of ANALYSIS_STAGES) {
      const row = this.db
        .prepare(
          `SELECT stage, status, output_json, output_hash
           FROM analysis_stage_runs
           WHERE diagnosis_id = ? AND stage = ? AND status = 'SUCCEEDED'
             AND output_json IS NOT NULL AND output_hash IS NOT NULL
           ORDER BY completed_at DESC, attempt DESC LIMIT 1`,
        )
        .get(diagnosisId, stage) as StageRow | undefined;
      if (!row) return null;
      stageOutputs[stage] = {
        stage,
        status: "SUCCEEDED",
        outputJson: row.output_json,
        outputHash: row.output_hash,
      };
    }

    const relationRows = this.db
      .prepare(
        `SELECT claim_id, claim_kind, evidence_id, support_level, confidence,
                justification, basis, verifier_mode, verifier_version
         FROM claim_evidence_relations
         WHERE diagnosis_id = ? ORDER BY claim_kind, claim_id, evidence_id`,
      )
      .all(diagnosisId) as RelationRow[];
    return {
      diagnosisId,
      stageOutputs,
      claimEvidenceRelations: relationRows.map((row) => ({
        claimId: row.claim_id,
        claimKind: row.claim_kind,
        evidenceId: row.evidence_id,
        supportLevel: row.support_level,
        confidence: row.confidence,
        justification: row.justification ?? "",
        basis: row.basis,
        verifierMode: row.verifier_mode,
        verifierVersion: row.verifier_version,
      })),
    };
  }
}
