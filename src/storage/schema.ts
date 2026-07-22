import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Baseline schema per PROJECT_FREEZE / ARCHITECTURE contracts.
// Owned by Agent E (runtime-api) after baseline; extend, do not fork.

export const diagnosisRequests = sqliteTable("diagnosis_requests", {
  id: text("id").primaryKey(),
  status: text("status").notNull(), // CREATED..READY|FAILED, see StorageAdapter
  inputJson: text("input_json").notNull(),
  publicToken: text("public_token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  sourceType: text("source_type").notNull(), // FIRST_PARTY_EVIDENCE | OBSERVED_WEB_EVIDENCE | COMPETITOR_WEB_EVIDENCE
  sourceDomain: text("source_domain").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  snippet: text("snippet"),
  authorityLevel: text("authority_level"),
  supportLevel: text("support_level"), // DIRECT_SUPPORT | PARTIAL_SUPPORT | CONTEXT_ONLY | UNSUPPORTED
  acquisitionLevel: text("acquisition_level"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  reportContractVersion: text("report_contract_version").notNull(),
  scoreContractVersion: text("score_contract_version").notNull(),
  canonicalJson: text("canonical_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const providerUsage = sqliteTable("provider_usage", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  executionProfile: text("execution_profile"),
  provider: text("provider").notNull(), // bocha | deepseek
  stage: text("stage").notNull(),
  callCount: integer("call_count").notNull().default(0),
  hardLimit: integer("hard_limit"),
  retryCount: integer("retry_count").notNull().default(0),
  status: text("status"),
  errorCode: text("error_code"),
  costEstimate: real("cost_estimate"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Round-3 additive: verified Claim–Evidence semantic relations. Each row is one
// (Claim, Evidence) support judgement produced by the ClaimEvidenceVerifier and
// used by the publish guard for the §4 decision. Additive only.
export const claimEvidenceRelations = sqliteTable("claim_evidence_relations", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  claimId: text("claim_id").notNull(),
  claimKind: text("claim_kind").notNull(), // coreIssue | strength | geoOpportunity | competitorGap
  evidenceId: text("evidence_id").notNull(),
  supportLevel: text("support_level").notNull(), // DIRECT_SUPPORT | PARTIAL_SUPPORT | CONTEXT_ONLY | UNSUPPORTED
  confidence: real("confidence").notNull(),
  justification: text("justification"),
  basis: text("basis").notNull(), // CONTENT_MATCH | MEASUREMENT_BOUNDARY
  verifierMode: text("verifier_mode").notNull(), // MOCK_DETERMINISTIC | DEEPSEEK_STRUCTURED
  verifierVersion: text("verifier_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const analysisCheckpoints = sqliteTable("analysis_checkpoints", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  stage: text("stage").notNull(),
  inputHash: text("input_hash").notNull(),
  outputJson: text("output_json").notNull(),
  reportContractVersion: text("report_contract_version").notNull(),
  scoreContractVersion: text("score_contract_version").notNull(),
  providerModel: text("provider_model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  trustGuardVersion: text("trust_guard_version").notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }).notNull(),
});

// Round-5.2B: append-only attempt rows for individually validated analysis
// outputs. Failed rows retain only a category plus sanitized metadata; raw
// provider responses and prompts never belong in this table.
export const analysisStageRuns = sqliteTable("analysis_stage_runs", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  stage: text("stage").notNull(),
  attempt: integer("attempt").notNull(),
  status: text("status").notNull(),
  inputHash: text("input_hash").notNull(),
  evidenceRegistryHash: text("evidence_registry_hash").notNull(),
  // Strict resume stores both hashes. Frozen-Evidence Reanalysis deliberately
  // stores NULL because those historical artifacts were never persisted.
  competitorResolutionHash: text("competitor_resolution_hash"),
  queryPlanHash: text("query_plan_hash"),
  frozenEvidenceSnapshotHash: text("frozen_evidence_snapshot_hash"),
  outputJson: text("output_json"),
  outputHash: text("output_hash"),
  schemaVersion: text("schema_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  providerModel: text("provider_model").notNull(),
  providerUsageId: text("provider_usage_id"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  errorCategory: text("error_category"),
  errorMetadataJson: text("error_metadata_json"),
});

// The original diagnosis failure remains untouched. This ledger records the
// separately authorized repair and is deliberately limited to one attempt by
// the adapter's atomic begin operation.
export const analysisRepairAttempts = sqliteTable("analysis_repair_attempts", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  repairAttempt: integer("repair_attempt").notNull(),
  originalFailureStage: text("original_failure_stage").notNull(),
  authorizedAt: integer("authorized_at", { mode: "timestamp" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  status: text("status").notNull(),
  reusedStages: text("reused_stages").notNull(),
  rerunStages: text("rerun_stages").notNull(),
  providerCallDelta: integer("provider_call_delta").notNull().default(0),
  resultState: text("result_state"),
  failureCategory: text("failure_category"),
  recoveryMode: text("recovery_mode")
    .notNull()
    .default("STRICT_CHECKPOINT_RESUME"),
  missingHistoricalProvenance: text("missing_historical_provenance")
    .notNull()
    .default("[]"),
  frozenEvidenceSnapshotJson: text("frozen_evidence_snapshot_json"),
  frozenEvidenceSnapshotHash: text("frozen_evidence_snapshot_hash"),
});

// Round-6: immutable audit ledger for every candidate removed before public
// report publication. The source analysis-stage output remains untouched;
// decisions are appended as separate rows and never folded into Canonical JSON.
export const pruneDecisions = sqliteTable("prune_decisions", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  reportId: text("report_id"),
  revisionId: text("revision_id"),
  stageRunId: text("stage_run_id").notNull(),
  claimKind: text("claim_kind").notNull(),
  candidateRef: text("candidate_ref").notNull(),
  sourceIssueId: text("source_issue_id"),
  reasonCode: text("reason_code").notNull(),
  guardRule: text("guard_rule").notNull(),
  evidenceIdsJson: text("evidence_ids_json").notNull(),
  independentSupportSourceCount: integer("independent_support_source_count").notNull(),
  directCount: integer("direct_count").notNull(),
  partialCount: integer("partial_count").notNull(),
  contextCount: integer("context_count").notNull(),
  coverageStatus: text("coverage_status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  algorithmVersion: text("algorithm_version").notNull(),
});

// Round-6A: one immutable final disposition for EVERY source candidate. This
// complements (and never replaces or duplicates) the prune-only historical
// ledger above.
export const claimPublicationDecisions = sqliteTable("claim_publication_decisions", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id").notNull(),
  reportId: text("report_id"),
  revisionId: text("revision_id"),
  stageRunId: text("stage_run_id"),
  legacyCheckpointId: text("legacy_checkpoint_id"),
  candidateSourceProvenance: text("candidate_source_provenance").notNull(),
  candidateSourcePayloadHash: text("candidate_source_payload_hash").notNull(),
  candidateRef: text("candidate_ref").notNull(),
  claimKind: text("claim_kind").notNull(),
  publicationStatus: text("publication_status").notNull(),
  reasonCode: text("reason_code").notNull(),
  guardRule: text("guard_rule").notNull(),
  evidenceIdsJson: text("evidence_ids_json").notNull(),
  directCount: integer("direct_count").notNull(),
  partialCount: integer("partial_count").notNull(),
  contextCount: integer("context_count").notNull(),
  independentSupportSourceCount: integer("independent_support_source_count").notNull(),
  coverageStatus: text("coverage_status").notNull(),
  algorithmVersion: text("algorithm_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
