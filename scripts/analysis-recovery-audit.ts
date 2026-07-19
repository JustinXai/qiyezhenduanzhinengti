import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import Database from "better-sqlite3";
import {
  AiVisibilityStageOutput,
  ClaimsStageOutput,
  CompanyProfileStageOutput,
  DimensionSignalsStageOutput,
} from "../src/diagnosis/analysis/stage-schemas";

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type SqlValue = Buffer | JsonPrimitive;
type SqlRow = Record<string, SqlValue>;

interface CliOptions {
  v1Dir: string;
  v2Dir: string;
  diagnosisPrefix: string;
}

interface FileHash {
  name: string;
  bytes: number;
  sha256: string;
}

interface StageAssessment {
  status: "RECOVERABLE" | "NOT_RECOVERABLE" | "INVALID" | "NOT_AVAILABLE";
  reason: string;
  source: string | null;
  inputHash: string | null;
  promptVersion: string | null;
  providerModel: string | null;
  completedAt: number | null;
  outputHash: string | null;
  schemaValid: boolean;
}

interface CheckpointRow extends SqlRow {
  stage: string;
  input_hash: string;
  output_json: string;
  provider_model: string;
  prompt_version: string;
  completed_at: number;
}

const DEFAULT_V1 = "E:\\企业诊断智能体_private\\technical-company-canary-v1";
const DEFAULT_V2 = "E:\\企业诊断智能体_private\\technical-company-canary-zh-v2";

function sha256Bytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function stableHash(value: unknown): string {
  return sha256Bytes(stableStringify(value));
}

function fileHash(path: string): FileHash {
  const bytes = readFileSync(path);
  return { name: basename(path), bytes: bytes.length, sha256: sha256Bytes(bytes) };
}

function filesRecursively(root: string, cursor = root): string[] {
  const entries = readdirSync(cursor, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(cursor, entry.name);
    if (entry.isDirectory()) paths.push(...filesRecursively(root, path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths.sort((a, b) => {
    const left = relative(root, a).replaceAll("\\", "/");
    const right = relative(root, b).replaceAll("\\", "/");
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function directoryManifest(root: string): { directoryHash: string; files: FileHash[] } {
  const files = filesRecursively(root).map((path) => ({
    ...fileHash(path),
    name: relative(root, path).replaceAll("\\", "/"),
  }));
  return { directoryHash: stableHash(files), files };
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    v1Dir: DEFAULT_V1,
    v2Dir: DEFAULT_V2,
    diagnosisPrefix: "diag_d9d",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--v1" && value) options.v1Dir = value;
    else if (key === "--v2" && value) options.v2Dir = value;
    else if (key === "--diagnosis" && value) options.diagnosisPrefix = value;
    else continue;
    i += 1;
  }
  return options;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function jsonSafeSqlValue(value: SqlValue): JsonValue {
  if (Buffer.isBuffer(value)) return { bufferSha256: sha256Bytes(value), bytes: value.length } as unknown as JsonValue;
  return value;
}

function logicalDatabaseManifest(db: Database.Database): {
  databaseHash: string;
  integrityCheck: string;
  tables: Array<{ name: string; rowCount: number; schemaHash: string; rowsHash: string }>;
} {
  const tableRows = db
    .prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string; sql: string }>;
  const tables = tableRows.map(({ name, sql }) => {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all() as Array<{
      name: string;
      pk: number;
    }>;
    const primary = columns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    const orderColumns = primary.length > 0 ? primary : columns.map((column) => column.name);
    const orderSql = orderColumns.map(quoteIdentifier).join(", ");
    const rows = db
      .prepare(`SELECT * FROM ${quoteIdentifier(name)}${orderSql ? ` ORDER BY ${orderSql}` : ""}`)
      .all() as SqlRow[];
    const safeRows = rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, jsonSafeSqlValue(value)])),
    );
    return {
      name,
      rowCount: rows.length,
      schemaHash: sha256Bytes(sql ?? ""),
      rowsHash: stableHash(safeRows),
    };
  });
  const integrity = db.pragma("integrity_check", { simple: true });
  return {
    databaseHash: stableHash(tables),
    integrityCheck: typeof integrity === "string" ? integrity : String(integrity),
    tables,
  };
}

const STAGE_KEYS = {
  PROFILE: ["brandName", "competitors", "industry", "productOrService", "targetRegion", "unresolvedQuestions"],
  SCORING: ["companyClarity", "customerQuestionCoverage", "trustEvidence", "websiteCompleteness"],
  AI_VISIBILITY: ["tests"],
  CLAIMS: ["competitorGaps", "coreIssues", "demonstrationFix", "geoOpportunities", "strengths"],
} as const;

type StageName = keyof typeof STAGE_KEYS;

const STAGE_SCHEMAS = {
  PROFILE: CompanyProfileStageOutput,
  SCORING: DimensionSignalsStageOutput,
  AI_VISIBILITY: AiVisibilityStageOutput,
  CLAIMS: ClaimsStageOutput,
} as const;

function stageOf(value: unknown): StageName | null {
  if (value === null || Array.isArray(value) || typeof value !== "object") return null;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const [stage, expected] of Object.entries(STAGE_KEYS) as Array<[StageName, readonly string[]]>) {
    if (keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index])) {
      return stage;
    }
  }
  return null;
}

function walkJson(value: unknown, visit: (candidate: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) walkJson(item, visit);
  }
}

function parsedJson(value: unknown): unknown | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function discoverStructuredOutputs(
  db: Database.Database,
  v2Dir: string,
): Array<{ stage: StageName; source: string; schemaValid: boolean; outputHash: string }> {
  const discoveries = new Map<string, { stage: StageName; source: string; schemaValid: boolean; outputHash: string }>();
  const inspect = (value: unknown, source: string) => {
    walkJson(value, (candidate) => {
      const stage = stageOf(candidate);
      if (!stage) return;
      const outputHash = stableHash(candidate);
      const result = STAGE_SCHEMAS[stage].safeParse(candidate);
      const key = `${stage}:${outputHash}`;
      if (!discoveries.has(key)) discoveries.set(key, { stage, source, schemaValid: result.success, outputHash });
    });
  };

  for (const path of filesRecursively(v2Dir).filter((path) => path.endsWith(".json"))) {
    try {
      inspect(JSON.parse(readFileSync(path, "utf8")), `artifact:${relative(v2Dir, path).replaceAll("\\", "/")}`);
    } catch {
      // Invalid JSON is not a recoverable structured output.
    }
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  for (const { name } of tables) {
    const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(name)}`).all() as SqlRow[];
    for (const [rowIndex, row] of rows.entries()) {
      for (const [column, value] of Object.entries(row)) {
        const parsed = parsedJson(value);
        if (parsed !== null) inspect(parsed, `sqlite:${name}[${rowIndex}].${column}`);
      }
    }
  }
  return [...discoveries.values()].sort((a, b) => a.stage.localeCompare(b.stage) || a.source.localeCompare(b.source));
}

function checkpointStage(stage: StageName): readonly string[] {
  switch (stage) {
    case "PROFILE":
      return ["REPORT_PROFILE", "PROFILE", "company_profile"];
    case "SCORING":
      return ["REPORT_SCORING", "SCORING", "dimension_signals"];
    case "AI_VISIBILITY":
      return ["REPORT_AI_VISIBILITY", "AI_VISIBILITY", "ai_visibility"];
    case "CLAIMS":
      return ["REPORT_CLAIMS", "CLAIMS", "claims"];
  }
}

function assessStage(
  stage: StageName,
  checkpoints: CheckpointRow[],
  discoveries: ReturnType<typeof discoverStructuredOutputs>,
  claimsFailureRecorded: boolean,
): StageAssessment {
  const checkpoint = checkpoints.find((row) => checkpointStage(stage).includes(row.stage));
  if (checkpoint) {
    let output: unknown;
    try {
      output = JSON.parse(checkpoint.output_json);
    } catch {
      return {
        status: stage === "CLAIMS" ? "INVALID" : "NOT_RECOVERABLE",
        reason: "checkpoint output_json is not valid JSON",
        source: `analysis_checkpoints:${checkpoint.stage}`,
        inputHash: checkpoint.input_hash || null,
        promptVersion: checkpoint.prompt_version || null,
        providerModel: checkpoint.provider_model || null,
        completedAt: checkpoint.completed_at || null,
        outputHash: sha256Bytes(checkpoint.output_json),
        schemaValid: false,
      };
    }
    const validation = STAGE_SCHEMAS[stage].safeParse(output);
    const metadataComplete = Boolean(
      checkpoint.input_hash &&
        checkpoint.prompt_version &&
        checkpoint.prompt_version !== "n/a" &&
        checkpoint.provider_model &&
        checkpoint.provider_model !== "n/a" &&
        checkpoint.completed_at,
    );
    const recoverable = validation.success && metadataComplete;
    return {
      status: recoverable ? "RECOVERABLE" : stage === "CLAIMS" && !validation.success ? "INVALID" : "NOT_RECOVERABLE",
      reason: recoverable
        ? "schema-valid checkpoint with all required provenance metadata"
        : !validation.success
          ? "checkpoint output fails the stage schema"
          : "checkpoint is missing required provenance metadata",
      source: `analysis_checkpoints:${checkpoint.stage}`,
      inputHash: checkpoint.input_hash || null,
      promptVersion: checkpoint.prompt_version || null,
      providerModel: checkpoint.provider_model || null,
      completedAt: checkpoint.completed_at || null,
      outputHash: stableHash(output),
      schemaValid: validation.success,
    };
  }

  const discovery = discoveries.find((item) => item.stage === stage);
  if (discovery) {
    return {
      status: stage === "CLAIMS" && !discovery.schemaValid ? "INVALID" : "NOT_RECOVERABLE",
      reason: discovery.schemaValid
        ? "structured output exists, but no co-located input hash, prompt version, model, and completion time"
        : "candidate structured output fails the stage schema",
      source: discovery.source,
      inputHash: null,
      promptVersion: null,
      providerModel: null,
      completedAt: null,
      outputHash: discovery.outputHash,
      schemaValid: discovery.schemaValid,
    };
  }

  return {
    status: stage === "CLAIMS" ? "NOT_AVAILABLE" : "NOT_RECOVERABLE",
    reason:
      stage === "CLAIMS" && claimsFailureRecorded
        ? "schema failure is recorded, but the invalid provider payload itself was not persisted"
        : "no complete structured stage output was persisted",
    source: null,
    inputHash: null,
    promptVersion: null,
    providerModel: null,
    completedAt: null,
    outputHash: null,
    schemaValid: false,
  };
}

function readFailureCode(v2Dir: string): string | null {
  const path = join(v2Dir, "run-lock.json");
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return typeof parsed.errorCode === "string" ? parsed.errorCode : null;
  } catch {
    return null;
  }
}

function readFailureSummary(v2Dir: string): {
  finalStatus: string | null;
  failedStage: string | null;
  errorCode: string | null;
  errorMessageHash: string | null;
  errorPath: string | null;
  timeline: Array<{ status: string; at: string }>;
  aggregates: {
    diagnosisCount: number | null;
    persistedBochaCalls: number | null;
    persistedDeepseekCalls: number | null;
    persistedCrawlerAttempts: number | null;
    persistedRetries: number | null;
  };
  runLogLineHashes: Array<{ length: number; sha256: string }>;
} | null {
  const path = join(v2Dir, "failure-summary.json");
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const error = value.error as Record<string, unknown> | undefined;
    const aggregates = value.aggregates as Record<string, unknown> | undefined;
    const message = typeof error?.message === "string" ? error.message : null;
    const timeline = Array.isArray(value.timeline)
      ? value.timeline.flatMap((item) => {
          if (item === null || typeof item !== "object") return [];
          const row = item as Record<string, unknown>;
          return typeof row.status === "string" && typeof row.at === "string"
            ? [{ status: row.status, at: row.at }]
            : [];
        })
      : [];
    const runLog = Array.isArray(value.runLog) ? value.runLog : [];
    const numberOrNull = (candidate: unknown) => (typeof candidate === "number" ? candidate : null);
    return {
      finalStatus: typeof value.finalStatus === "string" ? value.finalStatus : null,
      failedStage: typeof value.failedStage === "string" ? value.failedStage : null,
      errorCode: typeof error?.code === "string" ? error.code : null,
      errorMessageHash: message ? sha256Bytes(message) : null,
      errorPath: message?.includes("demonstrationFix.currentIssue")
        ? "demonstrationFix.currentIssue: Required"
        : null,
      timeline,
      aggregates: {
        diagnosisCount: numberOrNull(aggregates?.diagnosisCount),
        persistedBochaCalls: numberOrNull(aggregates?.bochaCalls),
        persistedDeepseekCalls: numberOrNull(aggregates?.deepseekCalls),
        persistedCrawlerAttempts: numberOrNull(aggregates?.crawlerAttempts),
        persistedRetries: numberOrNull(aggregates?.retries),
      },
      runLogLineHashes: runLog.map((line) => {
        const text = typeof line === "string" ? line : stableStringify(line);
        return { length: text.length, sha256: sha256Bytes(text) };
      }),
    };
  } catch {
    return null;
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.v1Dir) || !statSync(options.v1Dir).isDirectory()) throw new Error("V1 directory not found");
  if (!existsSync(options.v2Dir) || !statSync(options.v2Dir).isDirectory()) throw new Error("V2 directory not found");

  const databaseName = "technical-canary-zh-v2.sqlite";
  const databasePaths = [databaseName, `${databaseName}-wal`, `${databaseName}-shm`]
    .map((name) => join(options.v2Dir, name))
    .filter(existsSync);
  if (!databasePaths.some((path) => basename(path) === databaseName)) throw new Error("V2 SQLite database not found");

  const sourceHashesBefore = databasePaths.map(fileHash);
  const v1Before = directoryManifest(options.v1Dir);
  const v2Before = directoryManifest(options.v2Dir);
  const tempDir = mkdtempSync(join(tmpdir(), "analysis-recovery-audit-"));
  try {
    for (const source of databasePaths) copyFileSync(source, join(tempDir, basename(source)));
    const copiedDatabasePath = join(tempDir, databaseName);
    const db = new Database(copiedDatabasePath, { readonly: true, fileMustExist: true });
    db.pragma("query_only = ON");
    try {
      const diagnoses = db
        .prepare(
          "SELECT id, status, input_json, created_at, updated_at FROM diagnosis_requests WHERE id LIKE ? ORDER BY id",
        )
        .all(`${options.diagnosisPrefix}%`) as Array<{
        id: string;
        status: string;
        input_json: string;
        created_at: number;
        updated_at: number;
      }>;
      if (diagnoses.length !== 1) throw new Error(`expected one diagnosis matching prefix; found ${diagnoses.length}`);
      const diagnosis = diagnoses[0]!;
      const diagnosisInput = JSON.parse(diagnosis.input_json) as JsonValue;
      const evidenceRows = db
        .prepare(
          "SELECT id, diagnosis_id, source_type, source_domain, url, title, snippet, authority_level, support_level, fetched_at FROM evidence WHERE diagnosis_id = ? ORDER BY id",
        )
        .all(diagnosis.id) as SqlRow[];
      const checkpoints = db
        .prepare(
          "SELECT stage, input_hash, output_json, provider_model, prompt_version, completed_at FROM analysis_checkpoints WHERE diagnosis_id = ? ORDER BY completed_at, stage",
        )
        .all(diagnosis.id) as CheckpointRow[];
      const usages = db
        .prepare(
          "SELECT provider, stage, SUM(call_count) callCount, SUM(retry_count) retryCount, error_code errorCode FROM provider_usage WHERE diagnosis_id = ? GROUP BY provider, stage, error_code ORDER BY provider, stage, error_code",
        )
        .all(diagnosis.id) as Array<{
        provider: string;
        stage: string;
        callCount: number;
        retryCount: number;
        errorCode: string | null;
      }>;
      const relations = db
        .prepare("SELECT COUNT(*) count FROM claim_evidence_relations WHERE diagnosis_id = ?")
        .get(diagnosis.id) as { count: number };
      const reports = db
        .prepare("SELECT COUNT(*) count FROM reports WHERE diagnosis_id = ?")
        .get(diagnosis.id) as { count: number };

      const normalizing = checkpoints.find((row) => row.stage === "NORMALIZING_EVIDENCE");
      let normalizedEvidenceHash: string | null = null;
      let normalizedEvidenceCount: number | null = null;
      if (normalizing) {
        try {
          const output = JSON.parse(normalizing.output_json) as unknown;
          normalizedEvidenceHash = stableHash(output);
          normalizedEvidenceCount = Array.isArray(output) ? output.length : null;
        } catch {
          // Keep null: a corrupt checkpoint is not a stable evidence snapshot.
        }
      }

      const discoveries = discoverStructuredOutputs(db, options.v2Dir);
      const failureCode = readFailureCode(options.v2Dir);
      const stages = {
        profile: assessStage("PROFILE", checkpoints, discoveries, failureCode === "REPORT_CLAIMS_FAILED"),
        scoring: assessStage("SCORING", checkpoints, discoveries, failureCode === "REPORT_CLAIMS_FAILED"),
        aiVisibility: assessStage("AI_VISIBILITY", checkpoints, discoveries, failureCode === "REPORT_CLAIMS_FAILED"),
        claims: assessStage("CLAIMS", checkpoints, discoveries, failureCode === "REPORT_CLAIMS_FAILED"),
      };
      const logicalDatabase = logicalDatabaseManifest(db);

      const sourceHashesAfter = databasePaths.map(fileHash);
      const v1After = directoryManifest(options.v1Dir);
      const v2After = directoryManifest(options.v2Dir);
      const sourceDatabaseUnchanged = stableStringify(sourceHashesBefore) === stableStringify(sourceHashesAfter);
      const v1Unchanged = v1Before.directoryHash === v1After.directoryHash;
      const v2Unchanged = v2Before.directoryHash === v2After.directoryHash;
      if (!sourceDatabaseUnchanged || !v1Unchanged || !v2Unchanged) {
        throw new Error("source artifacts changed during read-only audit");
      }

      const durableBundle = sourceHashesBefore.filter((item) => item.name !== `${databaseName}-shm`);
      const report = {
        auditVersion: "analysis-recovery-forensics.v1",
        hashAlgorithm: "SHA-256",
        canonicalization: "recursive object-key sort; array order preserved; UTF-8 JSON without whitespace",
        diagnosis: {
          id: diagnosis.id,
          status: diagnosis.status,
          createdAt: diagnosis.created_at,
          updatedAt: diagnosis.updated_at,
          diagnosisInputHash: stableHash(diagnosisInput),
        },
        hashes: {
          evidenceRegistryHash: stableHash(
            evidenceRows.map((row) =>
              Object.fromEntries(Object.entries(row).map(([key, value]) => [key, jsonSafeSqlValue(value)])),
            ),
          ),
          normalizedEvidenceStableHash: normalizedEvidenceHash,
          competitorResolutionHash: null,
          competitorResolutionHashStatus: "NOT_AVAILABLE: complete CompetitorResolution was not persisted",
          queryPlanHash: null,
          queryPlanHashStatus: "NOT_AVAILABLE: planned/executed query plan was not persisted",
          v1DirectoryHash: v1Before.directoryHash,
          v2DirectoryHash: v2Before.directoryHash,
          v2DatabaseHash: logicalDatabase.databaseHash,
          v2DurableBundleHash: stableHash(durableBundle),
          runLockHash: fileHash(join(options.v2Dir, "run-lock.json")).sha256,
        },
        evidence: {
          registryCount: evidenceRows.length,
          normalizedCheckpointCount: normalizedEvidenceCount,
        },
        stages,
        storage: {
          integrityCheck: logicalDatabase.integrityCheck,
          tables: logicalDatabase.tables,
          checkpoints: checkpoints.map((row) => ({
            stage: row.stage,
            inputHash: row.input_hash,
            promptVersion: row.prompt_version,
            providerModel: row.provider_model,
            completedAt: row.completed_at,
            outputHash: sha256Bytes(row.output_json),
          })),
          providerUsage: usages,
          claimEvidenceRelationCount: relations.count,
          reportCount: reports.count,
          discoveredStagePayloads: discoveries,
          privateRunLog: readFailureSummary(options.v2Dir),
        },
        sourceFiles: {
          v2Files: v2Before.files,
          v1Files: v1Before.files,
          sourceDatabaseUnchanged,
          v1Unchanged,
          v2Unchanged,
        },
        completionMarker: "READY_FOR_RECOVERY_DECISION",
      };
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } finally {
      db.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
