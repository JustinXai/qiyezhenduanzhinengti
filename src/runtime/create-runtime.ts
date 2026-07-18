// Production wiring for the diagnoses API.
//
// Builds a process-wide singleton binding the real SQLite-backed storage to the
// round-1 mock seams. When Agent C's evidence pipeline and Agent D's report
// generator land, swap the two `createMock*` calls below for their real
// factories — the DiagnosesApiDeps shape and the handlers stay unchanged.

import { openMigratedDatabase } from "../storage/migrate";
import { SqliteStorageAdapter } from "../storage/sqlite-adapter";
import {
  createMockEvidencePipeline,
  createMockReportProducer,
} from "../diagnosis/orchestration/mocks";
import type { DiagnosesApiDeps } from "./api/diagnoses-handlers";

const DEFAULT_DB_URL = "./data/dev.sqlite";

let singleton: DiagnosesApiDeps | null = null;

function resolveDbUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DB_URL;
}

/** Lazily open the DB + migrate on first request, then reuse the connection. */
export function getRuntime(): DiagnosesApiDeps {
  if (!singleton) {
    const db = openMigratedDatabase(resolveDbUrl());
    singleton = {
      storage: new SqliteStorageAdapter(db),
      // INTEGRATION SEAM (Agent C search/evidence) — offline mock for round 1.
      evidence: createMockEvidencePipeline(),
      // INTEGRATION SEAM (Agent D report generator) — offline mock for round 1.
      producer: createMockReportProducer(),
    };
  }
  return singleton;
}

/** Test/reset hook: drop the cached runtime so the next call rebuilds it. */
export function resetRuntime(): void {
  singleton = null;
}
