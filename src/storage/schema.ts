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
  provider: text("provider").notNull(), // bocha | deepseek
  stage: text("stage").notNull(),
  callCount: integer("call_count").notNull().default(0),
  retryCount: integer("retry_count").notNull().default(0),
  errorCode: text("error_code"),
  costEstimate: real("cost_estimate"),
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
