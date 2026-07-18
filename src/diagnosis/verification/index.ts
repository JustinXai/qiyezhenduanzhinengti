// ============================================================================
// Public surface of the Claim–Evidence verification module.
// ============================================================================

export {
  classifyPolarity,
  overlap,
  textFeatures,
  type ClassifiableClaim,
  type OverlapResult,
} from "./classify";
export { clampVerdict, type ClampedVerdict } from "./clamp";
export {
  createDeterministicVerifier,
  DETERMINISTIC_VERIFIER_VERSION,
} from "./deterministic-verifier";
export {
  createDeepSeekVerifierStrategy,
  VerifierProviderError,
  type DeepSeekVerifierOptions,
} from "./deepseek-verifier";
export {
  extractVerifiableClaims,
  verifyReport,
  type VerifyReportInput,
} from "./verify-report";
export type {
  AssessPairsInput,
  AssessPairsResult,
  RawVerdict,
  VerifiableClaim,
  VerifierStrategy,
  VerifyReportResult,
} from "./types";
