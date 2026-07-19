/**
 * Server-only capability for the one-off technical-canary repair. The value is
 * nominal (private field) and can only be constructed after reading process
 * environment; request bodies, URLs and form values cannot enable recovery.
 */
export class AnalysisRepairAuthorization {
  readonly diagnosisId: string;
  readonly authorizedAt: Date;
  readonly #serverCapability = true;

  private constructor(diagnosisId: string, authorizedAt: Date) {
    this.diagnosisId = diagnosisId;
    this.authorizedAt = authorizedAt;
  }

  static fromServerEnvironment(diagnosisId: string): AnalysisRepairAuthorization {
    if (process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED !== "true") {
      throw new Error("TECHNICAL_CANARY_REPAIR_NOT_AUTHORIZED");
    }
    return new AnalysisRepairAuthorization(diagnosisId, new Date());
  }

  assertFor(diagnosisId: string): void {
    // Reading the private field also makes forged prototype-shaped values fail.
    if (!this.#serverCapability || this.diagnosisId !== diagnosisId) {
      throw new Error("TECHNICAL_CANARY_REPAIR_AUTHORIZATION_MISMATCH");
    }
  }
}
