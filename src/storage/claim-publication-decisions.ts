import type {
  ClaimPublicationDecisionBatchInput,
  ClaimPublicationDecisionCandidateKey,
  ClaimPublicationDecisionRecordInput,
} from "./adapter";
import type { SqliteDatabase } from "./migrate";

function candidateKey(candidate: ClaimPublicationDecisionCandidateKey): string {
  return `${candidate.claimKind}\u0000${candidate.candidateRef}`;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`CLAIM_PUBLICATION_DECISION_${field}_REQUIRED`);
}

export function validateClaimPublicationDecisionBatch(
  batch: ClaimPublicationDecisionBatchInput,
): void {
  const expected = new Set<string>();
  for (const candidate of batch.expectedCandidates) {
    assertNonEmpty(candidate.claimKind, "CLAIM_KIND");
    assertNonEmpty(candidate.candidateRef, "CANDIDATE_REF");
    const key = candidateKey(candidate);
    if (expected.has(key)) throw new Error("CLAIM_PUBLICATION_EXPECTED_CANDIDATE_DUPLICATE");
    expected.add(key);
  }
  if (expected.size !== batch.decisions.length) {
    throw new Error("CLAIM_PUBLICATION_DECISION_COUNT_MISMATCH");
  }

  const actual = new Set<string>();
  let lineage: string | null = null;
  let source: string | null = null;
  for (const decision of batch.decisions) {
    assertNonEmpty(decision.id, "ID");
    assertNonEmpty(decision.diagnosisId, "DIAGNOSIS_ID");
    assertNonEmpty(decision.reasonCode, "REASON_CODE");
    assertNonEmpty(decision.guardRule, "GUARD_RULE");
    assertNonEmpty(decision.algorithmVersion, "ALGORITHM_VERSION");
    if (!/^[a-f0-9]{64}$/u.test(decision.candidateSourcePayloadHash)) {
      throw new Error("CLAIM_PUBLICATION_DECISION_PAYLOAD_HASH_INVALID");
    }
    if ((decision.reportId === null) === (decision.revisionId === null)) {
      throw new Error("CLAIM_PUBLICATION_DECISION_REQUIRES_EXACTLY_ONE_PUBLICATION_LINEAGE");
    }
    if ((decision.stageRunId === null) === (decision.legacyCheckpointId === null)) {
      throw new Error("CLAIM_PUBLICATION_DECISION_REQUIRES_EXACTLY_ONE_CANDIDATE_SOURCE");
    }
    if (
      (decision.candidateSourceProvenance === "ANALYSIS_STAGE_RUN") !==
      (decision.stageRunId !== null)
    ) {
      throw new Error("CLAIM_PUBLICATION_DECISION_SOURCE_PROVENANCE_MISMATCH");
    }
    for (const count of [
      decision.directCount,
      decision.partialCount,
      decision.contextCount,
      decision.independentSupportSourceCount,
    ]) {
      if (!Number.isInteger(count) || count < 0) {
        throw new Error("CLAIM_PUBLICATION_DECISION_SUPPORT_COUNT_INVALID");
      }
    }
    if (Number.isNaN(decision.createdAt.getTime())) {
      throw new Error("CLAIM_PUBLICATION_DECISION_CREATED_AT_INVALID");
    }
    const key = candidateKey(decision);
    if (!expected.has(key)) throw new Error("CLAIM_PUBLICATION_DECISION_UNEXPECTED_CANDIDATE");
    if (actual.has(key)) throw new Error("CLAIM_PUBLICATION_DECISION_DUPLICATE_CANDIDATE");
    actual.add(key);

    const currentLineage = decision.reportId ?? decision.revisionId!;
    const currentSource = decision.stageRunId ?? decision.legacyCheckpointId!;
    lineage ??= currentLineage;
    source ??= currentSource;
    if (lineage !== currentLineage) throw new Error("CLAIM_PUBLICATION_DECISION_MIXED_LINEAGE");
    if (source !== currentSource) throw new Error("CLAIM_PUBLICATION_DECISION_MIXED_SOURCE");
  }
  if (actual.size !== expected.size) throw new Error("CLAIM_PUBLICATION_DECISION_SET_MISMATCH");
}

export function insertClaimPublicationDecisionBatch(
  db: SqliteDatabase,
  batch: ClaimPublicationDecisionBatchInput,
): void {
  validateClaimPublicationDecisionBatch(batch);
  const insert = db.prepare(
    `INSERT INTO claim_publication_decisions
       (id, diagnosis_id, report_id, revision_id, stage_run_id,
        legacy_checkpoint_id, candidate_source_provenance,
        candidate_source_payload_hash, candidate_ref, claim_kind,
        publication_status, reason_code, guard_rule, evidence_ids_json,
        direct_count, partial_count, context_count,
        independent_support_source_count, coverage_status, algorithm_version,
        created_at)
     VALUES
       (@id, @diagnosis_id, @report_id, @revision_id, @stage_run_id,
        @legacy_checkpoint_id, @candidate_source_provenance,
        @candidate_source_payload_hash, @candidate_ref, @claim_kind,
        @publication_status, @reason_code, @guard_rule, @evidence_ids_json,
        @direct_count, @partial_count, @context_count,
        @independent_support_source_count, @coverage_status, @algorithm_version,
        @created_at)`,
  );
  for (const decision of batch.decisions) {
    insert.run({
      id: decision.id,
      diagnosis_id: decision.diagnosisId,
      report_id: decision.reportId,
      revision_id: decision.revisionId,
      stage_run_id: decision.stageRunId,
      legacy_checkpoint_id: decision.legacyCheckpointId,
      candidate_source_provenance: decision.candidateSourceProvenance,
      candidate_source_payload_hash: decision.candidateSourcePayloadHash,
      candidate_ref: decision.candidateRef,
      claim_kind: decision.claimKind,
      publication_status: decision.publicationStatus,
      reason_code: decision.reasonCode,
      guard_rule: decision.guardRule,
      evidence_ids_json: JSON.stringify([...new Set(decision.evidenceIds)]),
      direct_count: decision.directCount,
      partial_count: decision.partialCount,
      context_count: decision.contextCount,
      independent_support_source_count: decision.independentSupportSourceCount,
      coverage_status: decision.coverageStatus,
      algorithm_version: decision.algorithmVersion,
      created_at: Math.floor(decision.createdAt.getTime() / 1000),
    });
  }
}

export function withRevisionPublicationLineage(input: {
  revisionId: string;
  diagnosisId: string;
  expectedCandidates: ClaimPublicationDecisionCandidateKey[];
  decisions: Array<
    Omit<ClaimPublicationDecisionRecordInput, "id" | "reportId" | "revisionId" | "diagnosisId">
  >;
}): ClaimPublicationDecisionBatchInput {
  return {
    expectedCandidates: input.expectedCandidates,
    decisions: input.decisions.map((decision, index) => ({
      ...decision,
      id: `${input.revisionId}:publication-decision:${index + 1}`,
      diagnosisId: input.diagnosisId,
      reportId: null,
      revisionId: input.revisionId,
    })),
  };
}
