// Identifier + public-token generation for diagnoses.
// publicToken is the unguessable read-only handle used by the public report
// entry point; it must not be derivable from the diagnosisId.

import { randomUUID } from "node:crypto";

function compactUuid(): string {
  return randomUUID().replace(/-/g, "");
}

export function newDiagnosisId(): string {
  return `diag_${compactUuid()}`;
}

export function newPublicToken(): string {
  return `tok_${compactUuid()}`;
}
