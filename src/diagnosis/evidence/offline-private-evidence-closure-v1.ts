import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import {
  buildCustomerEvidenceRequestPackV1,
  planEvidenceClosureV1,
  type EvidenceClosureCandidateV1,
} from "./evidence-closure-planner-v1";

interface DecisionRow {
  diagnosis_id: string;
  candidate_ref: string;
  claim_kind: string;
  publication_status: string;
  reason_code: string;
  evidence_ids_json: string;
  direct_count: number;
  partial_count: number;
  context_count: number;
  independent_support_source_count: number;
  created_at: number;
}

export interface PrivateClosureCompanyInputV1 {
  companyKey: string;
  databasePath: string;
}

function parseEvidenceIds(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("INVALID_DECISION_EVIDENCE_IDS");
  }
  return [...new Set(parsed)];
}

function readLatestPrunedCandidates(input: PrivateClosureCompanyInputV1): {
  diagnosisId: string;
  candidates: EvidenceClosureCandidateV1[];
  generatedAt: string;
} {
  const db = new Database(input.databasePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT diagnosis_id, candidate_ref, claim_kind, publication_status,
                reason_code, evidence_ids_json, direct_count, partial_count,
                context_count, independent_support_source_count, created_at
           FROM claim_publication_decisions
          ORDER BY created_at DESC, candidate_ref ASC`,
      )
      .all() as DecisionRow[];
    if (rows.length === 0) {
      const diagnosis = db
        .prepare("SELECT id, created_at FROM diagnosis_requests ORDER BY created_at DESC LIMIT 1")
        .get() as { id: string; created_at: number } | undefined;
      if (!diagnosis) throw new Error("DIAGNOSIS_NOT_FOUND");
      return {
        diagnosisId: diagnosis.id,
        candidates: [],
        generatedAt: new Date(diagnosis.created_at * 1000).toISOString(),
      };
    }
    const diagnosisId = rows[0]!.diagnosis_id;
    if (rows.some((row) => row.diagnosis_id !== diagnosisId)) {
      throw new Error("MULTIPLE_DIAGNOSES_IN_DECISION_LEDGER");
    }
    const latestByCandidate = new Map<string, DecisionRow>();
    for (const row of rows) {
      const key = `${row.claim_kind}\u0000${row.candidate_ref}`;
      if (!latestByCandidate.has(key)) latestByCandidate.set(key, row);
    }
    const candidates = [...latestByCandidate.values()]
      .filter(
        (row) =>
          row.publication_status === "PRUNED" ||
          row.publication_status === "DEEP_NEEDS_CONFIRMATION",
      )
      .map((row): EvidenceClosureCandidateV1 => ({
        candidateRef: row.candidate_ref,
        claimKind: row.claim_kind,
        publicationStatus: row.publication_status as EvidenceClosureCandidateV1["publicationStatus"],
        reasonCode: row.reason_code,
        evidenceIds: parseEvidenceIds(row.evidence_ids_json),
        directCount: row.direct_count,
        partialCount: row.partial_count,
        contextCount: row.context_count,
        independentSupportSourceCount: row.independent_support_source_count,
      }));
    return {
      diagnosisId,
      candidates,
      generatedAt: new Date(rows[0]!.created_at * 1000).toISOString(),
    };
  } finally {
    db.close();
  }
}

export function generatePrivateEvidenceClosureArtifactsV1(input: {
  outputDirectory: string;
  companies: readonly PrivateClosureCompanyInputV1[];
}): Array<{
  companyKey: string;
  candidateCount: number;
  selectedCandidateCount: number;
  slotCount: number;
  requestCount: number;
}> {
  const outputDirectory = resolve(input.outputDirectory);
  const workspaceRelative = relative(process.cwd(), outputDirectory);
  if (workspaceRelative === "" || (!workspaceRelative.startsWith("..") && !isAbsolute(workspaceRelative))) {
    throw new Error("PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY");
  }
  mkdirSync(outputDirectory, { recursive: true });
  const summary = input.companies.map((company) => {
    if (!/^[a-z0-9-]+$/u.test(company.companyKey)) throw new Error("INVALID_COMPANY_KEY");
    const source = readLatestPrunedCandidates(company);
    const plan = planEvidenceClosureV1({
      diagnosisId: source.diagnosisId,
      companyKey: company.companyKey,
      generatedAt: source.generatedAt,
      candidates: source.candidates,
    });
    const requestPack = buildCustomerEvidenceRequestPackV1({ plan });
    writeFileSync(
      join(outputDirectory, `${company.companyKey}-evidence-closure-plan-v1.json`),
      `${JSON.stringify(plan, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    writeFileSync(
      join(outputDirectory, `${company.companyKey}-customer-evidence-request-pack-v1.json`),
      `${JSON.stringify(requestPack, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    return {
      companyKey: company.companyKey,
      candidateCount: source.candidates.length,
      selectedCandidateCount: plan.selectedCandidateRefs.length,
      slotCount: plan.slots.length,
      requestCount: requestPack.requests.length,
    };
  });
  writeFileSync(join(outputDirectory, "evidence-closure-summary-v1.json"), `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return summary;
}
