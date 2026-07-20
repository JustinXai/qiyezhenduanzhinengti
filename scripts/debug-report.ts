// Debug script to check report loading
import { openMigratedDatabase } from "@/src/storage/migrate";
import { SqliteStorageAdapter } from "@/src/storage/sqlite-adapter";

async function debug() {
  const db = openMigratedDatabase("./data/lejinji-canary.db");
  const adapter = new SqliteStorageAdapter(db);

  const diagnosisId = "diag_577375be226c4c2f862af6e5bc6c8580";

  console.log("Looking for report with diagnosisId:", diagnosisId);

  // Direct DB query
  const direct = db.prepare("SELECT * FROM reports WHERE diagnosis_id = ?").get(diagnosisId);
  console.log("Direct DB query result:", !!direct);

  // Adapter query
  const adapterResult = await adapter.getReport(diagnosisId);
  console.log("Adapter getReport result:", !!adapterResult);

  if (adapterResult) {
    console.log("Report ID:", adapterResult.id);
    console.log("Canonical JSON length:", adapterResult.canonicalJson.length);
  }

  db.close();
}

debug().catch(console.error);
