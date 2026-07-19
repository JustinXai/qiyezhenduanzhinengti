import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { DiagnosisReport, type EvidenceItem } from "../src/contracts";
import {
  ClaimEvidenceRelation,
  deriveCoverage,
  type ClaimEvidenceRelation as ClaimEvidenceRelationType,
} from "../src/contracts/claim-evidence";
import type {
  ClaimPublicationSourceContext,
  ResolvedCompetitorSupportEntity,
} from "../src/contracts/independent-support-source";
import { presentReport } from "../src/report/presentation/report-presentation-service";
import {
  chinesePublicReportGuard,
  publishGuard,
} from "../src/report/validation";
import type { CompetitorGapPublicationContextById } from "../src/report/validation/competitor-gap-publication-policy";
import { resolveCandidateSourceFromStorageV1 } from "../src/runtime/candidate-source-resolver";
import {
  CURRENT_TRUTH_REFINALIZER_VERSION,
  refinalizeReportWithCurrentTruthPolicy,
} from "../src/services/diagnosis/refinalize-current-truth-policy";
import { createSchema, openDatabase } from "../src/storage/migrate";
import { canonicalReportJson, SqliteReportRevisionRepository } from "../src/storage/report-revisions";
import { SqliteStorageAdapter } from "../src/storage/sqlite-adapter";

const AUTH_ENV = "ROUND6A_OFFLINE_REFINALIZATION_AUTHORIZED";

const Args = z.object({
  db: z.string().min(1),
  diagnosis: z.string().min(1),
  parentReport: z.string().min(1),
  batchLock: z.string().min(1),
});

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv: readonly string[]): z.infer<typeof Args> {
  const parsed: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/u.exec(arg);
    if (match) parsed[match[1]!] = match[2]!;
  }
  return Args.parse(parsed);
}

function collectStrings(value: unknown, keys: readonly string[]): string[] {
  const out = new Set<string>();
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  function visit(node: unknown, keyHint = ""): void {
    if (typeof node === "string") {
      if (wanted.has(keyHint.toLowerCase()) && node.trim()) out.add(node.trim());
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, keyHint);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, nested] of Object.entries(node as Record<string, unknown>)) {
        if (wanted.has(key.toLowerCase())) {
          if (typeof nested === "string" && nested.trim()) out.add(nested.trim());
          if (Array.isArray(nested)) {
            for (const item of nested) if (typeof item === "string" && item.trim()) out.add(item.trim());
          }
        }
        visit(nested, key);
      }
    }
  }
  visit(value);
  return [...out].sort();
}

function host(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname
      .toLowerCase()
      .replace(/^www\./u, "");
  } catch {
    return value.trim().toLowerCase().replace(/^www\./u, "");
  }
}

function normalizeCompetitorId(name: string): string {
  const digest = sha256(name.trim().toLowerCase()).slice(0, 12);
  return `input_competitor_${digest}`;
}

function firstPartyDomains(report: DiagnosisReport, requestInput: unknown): string[] {
  const domains = new Set<string>();
  domains.add(host(report.companyProfile.website));
  for (const value of collectStrings(requestInput, ["website", "companyWebsite", "url"])) {
    domains.add(host(value));
  }
  for (const item of report.evidence) {
    if (item.sourceType === "FIRST_PARTY_EVIDENCE") domains.add(host(item.sourceDomain));
  }
  return [...domains].filter(Boolean).sort();
}

function competitorNames(report: DiagnosisReport, requestInput: unknown): string[] {
  return [
    ...new Set([
      ...report.companyProfile.competitors,
      ...collectStrings(requestInput, ["competitor", "competitors", "competitorName"]),
    ]),
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
}

function competitorEntities(
  report: DiagnosisReport,
  names: readonly string[],
): ResolvedCompetitorSupportEntity[] {
  return names.map((name) => {
    const matchingEvidence = report.evidence.filter(
      (item) =>
        item.sourceType === "COMPETITOR_WEB_EVIDENCE" &&
        (item.title.includes(name) || item.snippet.includes(name)),
    );
    return {
      competitorEntityId: normalizeCompetitorId(name),
      domains: [...new Set(matchingEvidence.map((item) => host(item.sourceDomain)).filter(Boolean))].sort(),
      evidenceIds: matchingEvidence.map((item) => item.id).sort(),
    };
  });
}

function buildCompetitorGapContexts(input: {
  report: DiagnosisReport;
  entities: readonly ResolvedCompetitorSupportEntity[];
  names: readonly string[];
}): CompetitorGapPublicationContextById {
  const byName = new Map(input.names.map((name) => [name, normalizeCompetitorId(name)]));
  const entityIds = new Set(input.entities.map((item) => item.competitorEntityId));
  return Object.fromEntries(
    input.report.competitorGaps.map((gap) => {
      const entityId = byName.get(gap.competitorName) ?? null;
      return [
        gap.id,
        {
          competitorNameSource: entityId ? "USER_INPUT" : "UNVERIFIED",
          competitorEntityId: entityId && entityIds.has(entityId) ? entityId : null,
          comparisonDimension: "",
          currentCompanyComparisonDimension: "",
          competitorComparisonDimension: "",
          conclusionWithinEvidence: false,
          negativeOrMissing: true,
          currentCompanyCoverageEstablished: true,
          competitorCoverageEstablished: true,
          boundedScope: true,
        },
      ];
    }),
  );
}

function relationsFromStorage(
  rows: Awaited<ReturnType<SqliteStorageAdapter["getClaimEvidenceRelations"]>>,
): ClaimEvidenceRelationType[] {
  return rows.map((row) => ({
    claimId: row.claimId,
    claimKind: row.claimKind,
    evidenceId: row.evidenceId,
    supportLevel: row.supportLevel,
    confidence: row.confidence,
    justification: row.justification ?? "",
    basis: row.basis,
    verifierMode: row.verifierMode,
    verifierVersion: row.verifierVersion,
  })).map((row) => ClaimEvidenceRelation.parse(row));
}

function canonicalEvidence(record: Awaited<ReturnType<SqliteStorageAdapter["getEvidence"]>>[number]): EvidenceItem {
  return {
    id: record.id,
    title: record.title ?? "",
    sourceDomain: record.sourceDomain,
    sourceType: record.sourceType as EvidenceItem["sourceType"],
    authorityLevel: record.authorityLevel ?? "",
    supportLevel: record.supportLevel as EvidenceItem["supportLevel"],
    fetchedAt: record.fetchedAt.toISOString(),
    snippet: record.snippet ?? "",
    url: record.url,
  };
}

async function main(): Promise<void> {
  if (process.env[AUTH_ENV] !== "true") {
    throw new Error(`${AUTH_ENV}=true is required for append-only refinalization`);
  }
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolve(args.db);
  const batchLockPath = resolve(args.batchLock);
  const batchLockBefore = readFileSync(batchLockPath);

  const db = openDatabase(dbPath);
  try {
    createSchema(db);
    const storage = new SqliteStorageAdapter(db);
    const revisions = new SqliteReportRevisionRepository(db);
    const stored = await storage.getReport(args.diagnosis);
    if (!stored) throw new Error("REFINALIZE_REPORT_NOT_FOUND");
    if (stored.id !== args.parentReport) {
      throw new Error(`REFINALIZE_PARENT_REPORT_NOT_CURRENT:${stored.id}`);
    }
    const canonicalBefore = stored.canonicalJson;
    const originalCanonicalBefore = (
      db.prepare("SELECT canonical_json FROM reports WHERE id = ?").get(args.parentReport) as
        | { canonical_json: string }
        | undefined
    )?.canonical_json;
    if (!originalCanonicalBefore) throw new Error("REFINALIZE_ORIGINAL_ROW_NOT_FOUND");
    const report = DiagnosisReport.parse(JSON.parse(stored.canonicalJson));
    const request = await storage.getDiagnosisRequest(args.diagnosis);
    const requestInput = request ? JSON.parse(request.inputJson) as unknown : {};
    const [evidenceRecords, relationRecords, historicalPrunes, providerUsageBefore] =
      await Promise.all([
        storage.getEvidence(args.diagnosis),
        storage.getClaimEvidenceRelations(args.diagnosis),
        storage.getPruneDecisions(args.diagnosis),
        storage.getProviderUsage(args.diagnosis),
      ]);
    const evidence = evidenceRecords.map(canonicalEvidence);
    const domains = firstPartyDomains(report, requestInput);
    const names = competitorNames(report, requestInput);
    const entities = competitorEntities(report, names);
    const sourceContext: ClaimPublicationSourceContext = {
      companyId: args.diagnosis,
      firstPartyDomains: domains,
      competitorEntities: entities,
    };
    const coverage = deriveCoverage({
      evidence,
      firstPartyDomains: domains,
      executedQueries: collectStrings(requestInput, ["query", "queries", "customerQuestion"]),
    });
    const candidateSource = await resolveCandidateSourceFromStorageV1(storage, args.diagnosis);
    if (!candidateSource.ok) {
      throw new Error(`REFINALIZE_CANDIDATE_SOURCE:${candidateSource.error.code}`);
    }
    const competitorGapContexts = buildCompetitorGapContexts({
      report,
      entities,
      names,
    });

    const result = await refinalizeReportWithCurrentTruthPolicy(
      {
        diagnosisId: args.diagnosis,
        expectedParentReportId: args.parentReport,
        revisionReason: "Round-6A current truth policy append-only revision",
        algorithmVersion: CURRENT_TRUTH_REFINALIZER_VERSION,
      },
      {
        revisions,
        candidateSource: candidateSource.value,
        relations: relationsFromStorage(relationRecords),
        coverage,
        sourceContext,
        competitorGapContexts,
        historicalPruneDecisions: historicalPrunes,
        assertTruthGuards: (candidate) => {
          const guard = publishGuard({
            report: candidate,
            relations: relationsFromStorage(relationRecords),
            coverage,
            sourceContext,
            competitorGapContexts,
            viewModels: presentReport(candidate),
          });
          if (!guard.ok) throw new Error(`REFINALIZE_PUBLISH_GUARD:${JSON.stringify(guard.violations)}`);
        },
        assertPresentation: (candidate) => {
          const guard = chinesePublicReportGuard(presentReport(candidate));
          if (!guard.ok) throw new Error(`REFINALIZE_CHINESE_GUARD:${JSON.stringify(guard.violations)}`);
        },
      },
    );

    const storedAfter = await storage.getReport(args.diagnosis);
    const providerUsageAfter = await storage.getProviderUsage(args.diagnosis);
    const batchLockAfter = readFileSync(batchLockPath);
    if (sha256(batchLockBefore) !== sha256(batchLockAfter)) {
      throw new Error("REFINALIZE_BATCH_LOCK_CHANGED");
    }
    const originalCanonicalAfter = (
      db.prepare("SELECT canonical_json FROM reports WHERE id = ?").get(args.parentReport) as
        | { canonical_json: string }
        | undefined
    )?.canonical_json;
    if (sha256(originalCanonicalBefore) !== sha256(originalCanonicalAfter ?? "")) {
      throw new Error("REFINALIZE_ORIGINAL_CANONICAL_HASH_CHANGED");
    }
    if (JSON.stringify(providerUsageBefore) !== JSON.stringify(providerUsageAfter)) {
      throw new Error("REFINALIZE_PROVIDER_USAGE_CHANGED");
    }
    if (!storedAfter || storedAfter.id !== result.revision.id) {
      throw new Error("REFINALIZE_REVISION_NOT_CURRENT");
    }
    const revised = DiagnosisReport.parse(JSON.parse(storedAfter.canonicalJson));
    const decisions = await storage.getClaimPublicationDecisions(args.diagnosis);
    const output = {
      ok: true,
      diagnosisId: args.diagnosis,
      parentReportId: args.parentReport,
      revisionId: result.revision.id,
      providerCalls: result.providerCalls,
      candidateDecisionCount: result.candidateDecisionCount,
      persistedCandidateDecisionCount: decisions.filter((item) => item.revisionId === result.revision.id).length,
      newPruneDecisionCount: result.newPruneDecisionCount,
      originalCanonicalHash: sha256(canonicalBefore),
      revisedCanonicalHash: sha256(canonicalReportJson(revised)),
      batchLockHash: sha256(batchLockAfter),
      providerUsageHash: sha256(JSON.stringify(providerUsageAfter)),
      counts: {
        strengths: revised.strengths.length,
        coreIssues: revised.coreIssues.length,
        competitorGaps: revised.competitorGaps.length,
        geoOpportunities: revised.geoOpportunities.length,
        demonstrationFix: revised.demonstrationFix === null ? 0 : 1,
        evidence: revised.evidence.length,
      },
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
