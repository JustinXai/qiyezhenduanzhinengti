// Production wiring for the diagnoses API.
//
// Builds a process-wide singleton binding the real SQLite-backed storage to the
// round-1 mock seams. When Agent C's evidence pipeline and Agent D's report
// generator land, swap the two `createMock*` calls below for their real
// factories — the DiagnosesApiDeps shape and the handlers stay unchanged.

import { openMigratedDatabase } from "../storage/migrate";
import { SqliteStorageAdapter } from "../storage/sqlite-adapter";
import {
  createLiveEvidencePipeline,
  createLiveReportProducer,
} from "../diagnosis/orchestration/live-seams";
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
      // Real Agent C search planning + evidence normalization over a mock Bocha
      // provider (no real web search / crawl).
      evidence: createLiveEvidencePipeline(),
      // Real Agent D staged analysis + report assembly over a scenario DeepSeek
      // provider (no real DeepSeek call).
      producer: createLiveReportProducer(),
    };
  }
  return singleton;
}

/** Test/reset hook: drop the cached runtime so the next call rebuilds it. */
export function resetRuntime(): void {
  singleton = null;
}
