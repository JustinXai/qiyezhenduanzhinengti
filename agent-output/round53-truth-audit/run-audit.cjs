const { createHash } = require("node:crypto");
const {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join } = require("node:path");
const Database = require("better-sqlite3");

const DIAGNOSIS_ID = "diag_d9d81ba3428f4696b088870ca7416e49";
const V2_DIR = "E:\\企业诊断智能体_private\\technical-company-canary-zh-v2";
const DATABASE_NAME = "technical-canary-zh-v2.sqlite";
const OUTPUT_PATH = join(__dirname, "truth-gate-audit.json");
const DATABASE_PATHS = [DATABASE_NAME, `${DATABASE_NAME}-wal`, `${DATABASE_NAME}-shm`]
  .map((name) => join(V2_DIR, name))
  .filter(existsSync);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileIdentity = (path) => ({
  name: basename(path),
  bytes: statSync(path).size,
  sha256: sha256(readFileSync(path)),
});
const sourceIdentity = () => DATABASE_PATHS.map(fileIdentity);

function relationCounts(relations) {
  const counts = { DIRECT_SUPPORT: 0, PARTIAL_SUPPORT: 0, CONTEXT_ONLY: 0 };
  for (const relation of relations) counts[relation.support_level] += 1;
  return counts;
}

function sourceIdentityForDomain(domain) {
  const lowered = domain.toLowerCase();
  if (lowered === "insta360.com" || lowered.endsWith(".insta360.com")) return "insta360.com";
  if (lowered === "insta360.cn" || lowered.endsWith(".insta360.cn")) return "insta360.cn";
  return lowered;
}

function claimLocations(kind, id, quick, deep) {
  const locations = [];
  if (kind === "strength") {
    if (quick.topStrength?.id === id) locations.push("Quick.topStrength");
    const deepIndex = deep.strengths.findIndex((claim) => claim.id === id);
    if (deepIndex >= 0) locations.push(`Deep.strengths[${deepIndex}]`);
  } else if (kind === "coreIssue") {
    if (quick.topIssue?.id === id) locations.push("Quick.topIssue", "Quick.headlineConclusion");
    const quickIndex = quick.coreIssues.findIndex((claim) => claim.id === id);
    if (quickIndex >= 0) locations.push(`Quick.coreIssues[${quickIndex}]`);
    const deepIndex = deep.coreIssues.findIndex((claim) => claim.id === id);
    if (deepIndex >= 0) locations.push(`Deep.coreIssues[${deepIndex}]`);
  } else if (kind === "geoOpportunity") {
    if (quick.topOpportunity?.id === id) locations.push("Quick.topOpportunity");
    const quickIndex = quick.geoOpportunities.findIndex((claim) => claim.id === id);
    if (quickIndex >= 0) locations.push(`Quick.geoOpportunities[${quickIndex}]`);
    const deepIndex = deep.geoOpportunities.findIndex((claim) => claim.id === id);
    if (deepIndex >= 0) locations.push(`Deep.geoOpportunities[${deepIndex}]`);
  } else if (kind === "competitorGap") {
    const deepIndex = deep.competitorGaps.findIndex((claim) => claim.id === id);
    if (deepIndex >= 0) locations.push(`Deep.competitorGaps[${deepIndex}]`);
  } else if (kind === "demonstrationFix" && quick.demonstrationFix?.id === id) {
    locations.push("Quick.demonstrationFix");
  }
  return locations;
}

function rankClaims(claims, evidenceById) {
  const supportCount = (claim, supportLevel) =>
    claim.evidenceIds.filter((id) => evidenceById.get(id)?.support_level === supportLevel).length;
  const typeRank = (claim) => (claim.claimType === "DIAGNOSTIC_INFERENCE" ? 0 : 1);
  return claims
    .map((claim, index) => ({
      claim,
      index,
      key: [
        typeRank(claim),
        -supportCount(claim, "DIRECT_SUPPORT"),
        -supportCount(claim, "PARTIAL_SUPPORT"),
        -claim.evidenceIds.length,
      ],
    }))
    .sort((left, right) => {
      for (let index = 0; index < left.key.length; index += 1) {
        const difference = left.key[index] - right.key[index];
        if (difference !== 0) return difference;
      }
      return left.index - right.index;
    })
    .map(({ claim }) => claim);
}

function presentationProjection(report, evidenceById) {
  const strengths = rankClaims(report.strengths, evidenceById);
  const coreIssues = rankClaims(report.coreIssues, evidenceById);
  const geoOpportunities = rankClaims(report.geoOpportunities, evidenceById);
  const competitorGaps = report.competitorGaps.filter((gap) =>
    gap.evidenceIds.some((id) => ["DIRECT_SUPPORT", "PARTIAL_SUPPORT"].includes(evidenceById.get(id)?.support_level)),
  );
  return {
    quick: {
      topStrength: strengths[0] ?? null,
      topIssue: coreIssues[0] ?? null,
      topOpportunity: geoOpportunities[0] ?? null,
      coreIssues: coreIssues.slice(0, 3),
      geoOpportunities: geoOpportunities.slice(0, 3),
      demonstrationFix: report.demonstrationFix,
      competitorGapSummary: competitorGaps.length > 0 ? "AVAILABLE" : "INSUFFICIENT_EVIDENCE",
    },
    deep: {
      strengths,
      coreIssues,
      geoOpportunities: geoOpportunities.slice(0, 5),
      competitorGaps,
    },
  };
}

function negativeCoverage(statement, relations) {
  const phrase = [
    "在本次保存的公开证据中，暂未发现",
    "基于本次保存的公开页面和搜索证据，相关说明仍不充分",
  ].find((candidate) => statement.includes(candidate));
  const boundaryRelations = relations.filter((relation) => relation.basis === "MEASUREMENT_BOUNDARY");
  return {
    isNegativeOrMissing: /暂未发现|未发现|缺乏|缺少|不充分|不足/.test(statement),
    wordingBounded: Boolean(phrase),
    boundingPhrase: phrase ?? null,
    measurementBoundaryRelationCount: boundaryRelations.length,
    boundaryEstablishedForClaim: Boolean(phrase) && boundaryRelations.length > 0,
    limitations: [
      "仅覆盖本次保存的公开页面和搜索证据，不代表完整搜索覆盖。",
      "历史查询计划不可验证，本次未重新搜索或抓取。",
    ],
  };
}

function semanticAssessment(id) {
  if (id === "iss_1") {
    return {
      status: "CONTRADICTORY_SIGNAL_REQUIRES_CONFIRMATION",
      exactSignal: "ev_4e33f5fd snippet contains ‘产品对比’ while the claim says the frozen public scope did not reveal systematic product-comparison content",
      consequence: "Not eligible for Quick; retain only as a bounded Deep needs-confirmation observation after offline refinalization.",
    };
  }
  if (id === "iss_2") {
    return {
      status: "PARTIAL_BOUNDED_MATCH",
      exactSignal: "ev_08d8fb26 and ev_46b7297c explicitly show email-only contact for bulk purchase/customization/agency; absence of cases/process/credentials remains coverage-bounded, not direct.",
      consequence: "Not eligible for Quick; may remain a bounded Deep needs-confirmation observation.",
    };
  }
  if (id === "iss_3") {
    return {
      status: "CONTRADICTORY_SIGNAL_REQUIRES_CONFIRMATION",
      exactSignal: "ev_11461056 within the same frozen registry contains ‘日常家庭记录，外出旅拍还是运动拍摄’, a scenario signal inconsistent with a broad absence inference.",
      consequence: "Not eligible for Quick; retain only as a bounded Deep needs-confirmation observation after offline refinalization.",
    };
  }
  return { status: "TRACEABLE", exactSignal: null, consequence: null };
}

function main() {
  const sourceBefore = sourceIdentity();
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "round53-truth-audit-"));
  try {
    for (const path of DATABASE_PATHS) copyFileSync(path, join(temporaryDirectory, basename(path)));
    const copiedDatabasePath = join(temporaryDirectory, DATABASE_NAME);
    const database = new Database(copiedDatabasePath, { readonly: true, fileMustExist: true });
    database.pragma("query_only = ON");
    try {
      const diagnosis = database
        .prepare("SELECT id, status, input_json, public_token, created_at, updated_at FROM diagnosis_requests WHERE id = ?")
        .get(DIAGNOSIS_ID);
      const reportRows = database
        .prepare("SELECT id, canonical_json, created_at FROM reports WHERE diagnosis_id = ? ORDER BY created_at, id")
        .all(DIAGNOSIS_ID);
      const relationRows = database
        .prepare("SELECT claim_id, claim_kind, evidence_id, support_level, confidence, justification, basis, verifier_mode, verifier_version FROM claim_evidence_relations WHERE diagnosis_id = ? ORDER BY claim_id, evidence_id")
        .all(DIAGNOSIS_ID);
      const evidenceRows = database
        .prepare("SELECT id, source_type, source_domain, url, title, snippet, authority_level, support_level, fetched_at FROM evidence WHERE diagnosis_id = ? ORDER BY id")
        .all(DIAGNOSIS_ID);
      const providerUsage = database
        .prepare("SELECT provider, stage, call_count, retry_count, error_code, created_at FROM provider_usage WHERE diagnosis_id = ? ORDER BY created_at, id")
        .all(DIAGNOSIS_ID);
      const repairAttempts = database
        .prepare("SELECT repair_attempt, status, recovery_mode, result_state, provider_call_delta, frozen_evidence_snapshot_hash FROM analysis_repair_attempts WHERE diagnosis_id = ? ORDER BY repair_attempt")
        .all(DIAGNOSIS_ID);

      if (!diagnosis) throw new Error("DIAGNOSIS_NOT_FOUND");
      if (reportRows.length !== 1) throw new Error(`EXPECTED_ONE_ORIGINAL_REPORT_FOUND_${reportRows.length}`);
      const report = JSON.parse(reportRows[0].canonical_json);
      const evidenceById = new Map(evidenceRows.map((evidence) => [evidence.id, evidence]));
      const projection = presentationProjection(report, evidenceById);
      const published = [
        ...report.strengths.map((claim) => ({ ...claim, kind: "strength" })),
        ...report.coreIssues.map((claim) => ({ ...claim, kind: "coreIssue" })),
        ...report.geoOpportunities.map((claim) => ({ ...claim, kind: "geoOpportunity" })),
        ...report.competitorGaps.map((claim) => ({ ...claim, kind: "competitorGap" })),
        ...(report.demonstrationFix ? [{ ...report.demonstrationFix, kind: "demonstrationFix" }] : []),
      ];

      const claimAudits = published.map((claim) => {
        const relations = relationRows.filter((relation) => relation.claim_id === claim.id);
        const counts = relationCounts(relations);
        const partialDomains = relations
          .filter((relation) => relation.support_level === "PARTIAL_SUPPORT")
          .map((relation) => evidenceById.get(relation.evidence_id)?.source_domain)
          .filter(Boolean);
        const independentPartialSources = [...new Set(partialDomains.map(sourceIdentityForDomain))];
        const directOrTwoIndependentPartial =
          counts.DIRECT_SUPPORT >= 1 || independentPartialSources.length >= 2;
        const quickCoreIssueThreshold = claim.kind !== "coreIssue" || counts.DIRECT_SUPPORT >= 1;
        return {
          id: claim.id,
          kind: claim.kind,
          claimType: claim.claimType,
          statement: claim.statement,
          published: true,
          evidenceIds: claim.evidenceIds,
          relationCounts: counts,
          relationDomains: [...new Set(relations.map((relation) => evidenceById.get(relation.evidence_id)?.source_domain).filter(Boolean))],
          partialSupportDomains: [...new Set(partialDomains)],
          independentPartialSourceIdentities: independentPartialSources,
          locations: claimLocations(claim.kind, claim.id, projection.quick, projection.deep),
          coverage: negativeCoverage(claim.statement ?? claim.currentIssue ?? "", relations),
          thresholds: {
            quickCoreIssueRequiresAtLeastOneDirect: {
              applicable: claim.kind === "coreIssue",
              required: "DIRECT_SUPPORT >= 1",
              observed: counts.DIRECT_SUPPORT,
              status: quickCoreIssueThreshold ? "PASS" : "FAIL",
            },
            strengthOrOpportunityRequiresDirectOrTwoIndependentPartial: {
              applicable: claim.kind === "strength" || claim.kind === "geoOpportunity",
              required: "DIRECT_SUPPORT >= 1 OR independent PARTIAL_SUPPORT sources >= 2",
              observed: {
                direct: counts.DIRECT_SUPPORT,
                independentPartialSources: independentPartialSources.length,
              },
              status:
                claim.kind !== "strength" && claim.kind !== "geoOpportunity"
                  ? "NOT_APPLICABLE"
                  : directOrTwoIndependentPartial
                    ? "PASS"
                    : "FAIL",
            },
          },
          semanticAssessment: semanticAssessment(claim.id),
          relations: relations.map((relation) => ({
            evidenceId: relation.evidence_id,
            supportLevel: relation.support_level,
            confidence: relation.confidence,
            basis: relation.basis,
            justification: relation.justification,
            sourceType: evidenceById.get(relation.evidence_id)?.source_type ?? null,
            sourceDomain: evidenceById.get(relation.evidence_id)?.source_domain ?? null,
            url: evidenceById.get(relation.evidence_id)?.url ?? null,
            canonicalEvidenceSupportLevel: evidenceById.get(relation.evidence_id)?.support_level ?? null,
          })),
        };
      });

      const quickIssueFailures = claimAudits.filter(
        (claim) =>
          claim.kind === "coreIssue" &&
          claim.locations.some((location) => location.startsWith("Quick.")) &&
          claim.thresholds.quickCoreIssueRequiresAtLeastOneDirect.status === "FAIL",
      );
      const contradictoryIssues = claimAudits.filter(
        (claim) => claim.kind === "coreIssue" && claim.semanticAssessment.status.startsWith("CONTRADICTORY_SIGNAL"),
      );
      const profileRecoveryLimitation = report.companyProfile.unresolvedQuestions.find((question) =>
        question.includes("本次恢复"),
      );
      const sourceAfter = sourceIdentity();
      const sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
      if (!sourceUnchanged) throw new Error("SOURCE_DATABASE_ARTIFACTS_CHANGED_DURING_AUDIT");

      const audit = {
        schemaVersion: "round53.truth-gate-audit.v1",
        round: "Round-5.3",
        diagnosisId: DIAGNOSIS_ID,
        auditMode: "COPIED_SQLITE_QUERY_ONLY",
        invariants: {
          realProviderCalls: 0,
          networkCalls: 0,
          diagnosisCreates: 0,
          recoveryRuns: 0,
          sourceDatabaseWrites: 0,
          sourceDatabaseArtifactsUnchanged: sourceUnchanged,
        },
        sourceDatabaseArtifactsBefore: sourceBefore,
        sourceDatabaseArtifactsAfter: sourceAfter,
        persistedState: {
          diagnosisStatus: diagnosis.status,
          reportRows: reportRows.map((row) => ({ id: row.id, createdAt: row.created_at })),
          reportCount: reportRows.length,
          evidenceCount: evidenceRows.length,
          relationCount: relationRows.length,
          relationCountForPublishedClaims: claimAudits.reduce(
            (total, claim) => total + Object.values(claim.relationCounts).reduce((sum, count) => sum + count, 0),
            0,
          ),
          providerUsageRowsReadOnlyBaseline: providerUsage,
          repairAttemptsReadOnlyBaseline: repairAttempts,
        },
        frozenThresholds: {
          quickCoreIssue: "at least one DIRECT_SUPPORT relation",
          strengthAndOpportunity: "at least one DIRECT_SUPPORT OR two independent PARTIAL_SUPPORT sources",
          negativeConclusion: "coverage-bounded wording and at least one MEASUREMENT_BOUNDARY relation",
          opportunityZeroAllowed: true,
        },
        presentation: {
          quickCoreIssueIds: projection.quick.coreIssues.map((claim) => claim.id),
          quickTopIssueId: projection.quick.topIssue?.id ?? null,
          quickTopStrengthId: projection.quick.topStrength?.id ?? null,
          quickOpportunityIds: projection.quick.geoOpportunities.map((claim) => claim.id),
          quickCompetitorGapSummary: projection.quick.competitorGapSummary,
          deepStrengthIds: projection.deep.strengths.map((claim) => claim.id),
          deepCoreIssueIds: projection.deep.coreIssues.map((claim) => claim.id),
          deepOpportunityIds: projection.deep.geoOpportunities.map((claim) => claim.id),
          deepCompetitorGapIds: projection.deep.competitorGaps.map((claim) => claim.id),
          demonstrationFixId: report.demonstrationFix?.id ?? null,
        },
        publishedYield: {
          strengths: report.strengths.length,
          coreIssues: report.coreIssues.length,
          geoOpportunities: report.geoOpportunities.length,
          competitorGaps: report.competitorGaps.length,
          demonstrationFix: report.demonstrationFix !== null,
        },
        claims: claimAudits,
        emptyPublishedKinds: [
          ...(report.geoOpportunities.length === 0 ? ["geoOpportunity"] : []),
          ...(report.competitorGaps.length === 0 ? ["competitorGap"] : []),
          ...(report.demonstrationFix === null ? ["demonstrationFix"] : []),
        ],
        systemFailureMasqueradeAudit: {
          publishedClaimMentionsRecoveryOrProviderFailure: claimAudits.some((claim) =>
            /恢复|Provider|抓取失败|系统失败/i.test(claim.statement ?? ""),
          ),
          deepProfileMeasurementLimitation: profileRecoveryLimitation ?? null,
          classification: profileRecoveryLimitation
            ? "MEASUREMENT_LIMITATION_NOT_SCORED_OR_PUBLISHED_AS_ENTERPRISE_ISSUE"
            : "NONE",
        },
        findings: [
          ...quickIssueFailures.map((claim) => ({
            severity: "POLICY_VIOLATION",
            code: "QUICK_CORE_ISSUE_WITHOUT_DIRECT_SUPPORT",
            claimId: claim.id,
            exact: `Quick publishes ${claim.id} with DIRECT_SUPPORT=0`,
          })),
          ...(projection.quick.topIssue && quickIssueFailures.some((claim) => claim.id === projection.quick.topIssue.id)
            ? [{
                severity: "POLICY_VIOLATION",
                code: "QUICK_HEADLINE_PROMOTES_UNDIRECTED_ISSUE",
                claimId: projection.quick.topIssue.id,
                exact: "Quick.topIssue also enters Quick.headlineConclusion despite DIRECT_SUPPORT=0",
              }]
            : []),
          ...contradictoryIssues.map((claim) => ({
            severity: "POLICY_VIOLATION",
            code: "NEGATIVE_ISSUE_HAS_CONTRADICTORY_FROZEN_SIGNAL",
            claimId: claim.id,
            exact: claim.semanticAssessment.exactSignal,
          })),
        ],
        checks: {
          everyPublishedClaimTraceableToEvidence: claimAudits.every(
            (claim) => claim.evidenceIds.length > 0 && claim.relations.length === claim.evidenceIds.length,
          ),
          everyNegativeClaimCoverageBounded: claimAudits
            .filter((claim) => claim.coverage.isNegativeOrMissing)
            .every((claim) => claim.coverage.boundaryEstablishedForClaim),
          noGlobalizedNegativeWording: claimAudits.every(
            (claim) => !/全网(都|均)?(?:没有|不存在)|完全没有|绝对不存在/.test(claim.statement ?? ""),
          ),
          noSystemFailurePublishedAsEnterpriseIssue: !claimAudits.some((claim) =>
            /恢复|Provider|抓取失败|系统失败/i.test(claim.statement ?? ""),
          ),
          quickCoreIssueDirectThreshold: quickIssueFailures.length === 0,
          strengthAndOpportunityThreshold: claimAudits
            .filter((claim) => claim.kind === "strength" || claim.kind === "geoOpportunity")
            .every(
              (claim) =>
                claim.thresholds.strengthOrOpportunityRequiresDirectOrTwoIndependentPartial.status === "PASS",
            ),
          noEvidenceMismatch: contradictoryIssues.length === 0,
        },
        requiredDisposition: {
          quick: "REMOVE_ALL_THREE_CORE_ISSUES_AND_DERIVED_TOP_ISSUE_HEADLINE_UNTIL_DIRECT_SUPPORT_EXISTS",
          deep: "RETAIN_PARTIAL_NEGATIVE_OBSERVATIONS_ONLY_AS_NEEDS_CONFIRMATION_WITH_COVERAGE_LIMITATIONS",
          providerCallsRequired: 0,
          recoveryRerunRequired: false,
          originalCanonicalMustRemainPreserved: true,
        },
        conclusion: quickIssueFailures.length > 0 || contradictoryIssues.length > 0 ? "POLICY_VIOLATION" : "TRUTH_GATE_PASS",
      };
      writeFileSync(OUTPUT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
      process.stdout.write(`${audit.conclusion}\n${OUTPUT_PATH}\n`);
    } finally {
      database.close();
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main();
