// Round-7.4: Report provenance verification utilities
// These functions help verify the authenticity of reports before display/export

export type ReportProvenance = "REAL_PROVIDER_CANONICAL" | "MOCK_SEED" | "MANUAL_REVISION" | "ENRICHMENT_REVISION";

export interface ProvenanceVerification {
  isAuthentic: boolean;
  provenance: ReportProvenance;
  demoOnly: boolean;
  hasProviderUsage: boolean;
  hasStageRuns: boolean;
  hasEvidence: boolean;
  reason?: string;
}

/**
 * Verify that a report can be considered authentic (REAL_PROVIDER_CANONICAL)
 * by checking for required pipeline artifacts.
 */
export function verifyReportAuthenticity(params: {
  provenance: ReportProvenance;
  demoOnly: boolean;
  providerUsageCount: number;
  stageRunCount: number;
  evidenceCount: number;
}): ProvenanceVerification {
  const { provenance, demoOnly, providerUsageCount, stageRunCount, evidenceCount } = params;

  // MOCK_SEED is never authentic
  if (provenance === "MOCK_SEED") {
    return {
      isAuthentic: false,
      provenance,
      demoOnly: true,
      hasProviderUsage: providerUsageCount > 0,
      hasStageRuns: stageRunCount > 0,
      hasEvidence: evidenceCount > 0,
      reason: "Report is MOCK_SEED - created by seed script, not real provider",
    };
  }

  // MANUAL_REVISION and ENRICHMENT_REVISION need to trace back to REAL_PROVIDER_CANONICAL
  if (provenance === "MANUAL_REVISION" || provenance === "ENRICHMENT_REVISION") {
    // These can be considered authentic IF they have provider artifacts
    // (the parent report must be REAL_PROVIDER_CANONICAL, verified separately)
    if (providerUsageCount === 0 || stageRunCount === 0) {
      return {
        isAuthentic: false,
        provenance,
        demoOnly,
        hasProviderUsage: providerUsageCount > 0,
        hasStageRuns: stageRunCount > 0,
        hasEvidence: evidenceCount > 0,
        reason: `Revision report lacks provider artifacts - parent must be REAL_PROVIDER_CANONICAL`,
      };
    }
    return {
      isAuthentic: true,
      provenance,
      demoOnly,
      hasProviderUsage: providerUsageCount > 0,
      hasStageRuns: stageRunCount > 0,
      hasEvidence: evidenceCount > 0,
    };
  }

  // REAL_PROVIDER_CANONICAL requires provider artifacts
  if (provenance === "REAL_PROVIDER_CANONICAL") {
    const missingArtifacts: string[] = [];
    if (providerUsageCount === 0) missingArtifacts.push("provider_usage");
    if (stageRunCount === 0) missingArtifacts.push("analysis_stage_runs");
    if (evidenceCount === 0) missingArtifacts.push("evidence");

    if (missingArtifacts.length > 0) {
      return {
        isAuthentic: false,
        provenance,
        demoOnly,
        hasProviderUsage: providerUsageCount > 0,
        hasStageRuns: stageRunCount > 0,
        hasEvidence: evidenceCount > 0,
        reason: `REAL_PROVIDER_CANONICAL report missing artifacts: ${missingArtifacts.join(", ")}`,
      };
    }

    return {
      isAuthentic: true,
      provenance,
      demoOnly: false,
      hasProviderUsage: true,
      hasStageRuns: true,
      hasEvidence: true,
    };
  }

  return {
    isAuthentic: false,
    provenance,
    demoOnly,
    hasProviderUsage: providerUsageCount > 0,
    hasStageRuns: stageRunCount > 0,
    hasEvidence: evidenceCount > 0,
    reason: "Unknown provenance value",
  };
}

/**
 * Check if a report can be published to external systems (Feishu, etc.)
 */
export function canPublishReport(params: {
  provenance: ReportProvenance;
  demoOnly: boolean;
  isAuthentic: boolean;
}): { canPublish: boolean; reason?: string } {
  const { provenance, demoOnly, isAuthentic } = params;

  if (demoOnly) {
    return {
      canPublish: false,
      reason: "demoOnly reports cannot be published to external systems",
    };
  }

  if (provenance === "MOCK_SEED") {
    return {
      canPublish: false,
      reason: "MOCK_SEED reports cannot be published",
    };
  }

  if (!isAuthentic) {
    return {
      canPublish: false,
      reason: "Report authenticity verification failed",
    };
  }

  return { canPublish: true };
}
