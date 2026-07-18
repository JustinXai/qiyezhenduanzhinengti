import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqliteDatabase } from "../../src/storage/migrate";
import {
  SqliteStorageAdapter,
  createSqliteStorageAdapter,
} from "../../src/storage/sqlite-adapter";
import type { EvidenceRecordInput } from "../../src/storage/adapter";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";

const FIXED_NOW = new Date("2026-07-18T00:00:00.000Z");

describe("SqliteStorageAdapter round-trip", () => {
  let db: SqliteDatabase;
  let adapter: SqliteStorageAdapter;

  beforeEach(() => {
    const created = createSqliteStorageAdapter({
      filename: ":memory:",
      now: () => FIXED_NOW,
      idFactory: (() => {
        let n = 0;
        return () => `id_${++n}`;
      })(),
    });
    db = created.db;
    adapter = created.adapter;
  });

  afterEach(() => {
    db.close();
  });

  it("creates and reads back a diagnosis request as CREATED", async () => {
    await adapter.createDiagnosisRequest({
      id: "diag_1",
      inputJson: JSON.stringify({ website: "https://example.com" }),
      publicToken: "tok_1",
    });
    const rec = await adapter.getDiagnosisRequest("diag_1");
    expect(rec).not.toBeNull();
    expect(rec!.status).toBe("CREATED");
    expect(rec!.publicToken).toBe("tok_1");
    expect(rec!.createdAt.getTime()).toBe(FIXED_NOW.getTime());
  });

  it("looks up by public token", async () => {
    await adapter.createDiagnosisRequest({
      id: "diag_2",
      inputJson: "{}",
      publicToken: "tok_public_2",
    });
    const rec = await adapter.getDiagnosisRequestByPublicToken("tok_public_2");
    expect(rec?.id).toBe("diag_2");
    expect(await adapter.getDiagnosisRequestByPublicToken("nope")).toBeNull();
  });

  it("updates status and throws when the id is unknown", async () => {
    await adapter.createDiagnosisRequest({
      id: "diag_3",
      inputJson: "{}",
      publicToken: "tok_3",
    });
    await adapter.updateDiagnosisStatus("diag_3", "READY");
    expect((await adapter.getDiagnosisRequest("diag_3"))!.status).toBe("READY");
    await expect(adapter.updateDiagnosisStatus("missing", "READY")).rejects.toThrow();
  });

  it("round-trips evidence rows including nullable columns", async () => {
    const items: EvidenceRecordInput[] = SAMPLE_DIAGNOSIS_REPORT.evidence.map((e) => ({
      id: e.id,
      diagnosisId: "diag_4",
      sourceType: e.sourceType,
      sourceDomain: e.sourceDomain,
      url: e.url,
      title: e.title,
      snippet: e.snippet,
      authorityLevel: e.authorityLevel,
      supportLevel: e.supportLevel,
      fetchedAt: new Date(e.fetchedAt),
    }));
    await adapter.saveEvidence(items);
    const back = await adapter.getEvidence("diag_4");
    expect(back).toHaveLength(items.length);
    const first = back.find((e) => e.id === "ev_first_home")!;
    expect(first.sourceType).toBe("FIRST_PARTY_EVIDENCE");
    expect(first.supportLevel).toBe("DIRECT_SUPPORT");
    expect(first.url).toBe("https://example-equip.com/");
  });

  it("saveEvidence is a no-op for an empty list and upserts on conflict", async () => {
    await adapter.saveEvidence([]);
    expect(await adapter.getEvidence("diag_x")).toEqual([]);
    const row: EvidenceRecordInput = {
      id: "ev_dup",
      diagnosisId: "diag_5",
      sourceType: "FIRST_PARTY_EVIDENCE",
      sourceDomain: "a.com",
      url: "https://a.com/",
      title: "first",
      snippet: null,
      authorityLevel: "OWNED",
      supportLevel: "DIRECT_SUPPORT",
      fetchedAt: FIXED_NOW,
    };
    await adapter.saveEvidence([row]);
    await adapter.saveEvidence([{ ...row, title: "second" }]);
    const back = await adapter.getEvidence("diag_5");
    expect(back).toHaveLength(1);
    expect(back[0]!.title).toBe("second");
  });

  it("stores and reads back a canonical report", async () => {
    const canonical = JSON.stringify(SAMPLE_DIAGNOSIS_REPORT);
    await adapter.saveReport({
      id: "rep_1",
      diagnosisId: "diag_6",
      reportContractVersion: SAMPLE_DIAGNOSIS_REPORT.reportContractVersion,
      scoreContractVersion: SAMPLE_DIAGNOSIS_REPORT.scoreContractVersion,
      canonicalJson: canonical,
    });
    const stored = await adapter.getReport("diag_6");
    expect(stored).not.toBeNull();
    expect(stored!.canonicalJson).toBe(canonical);
    expect(JSON.parse(stored!.canonicalJson)).toEqual(SAMPLE_DIAGNOSIS_REPORT);
    expect(await adapter.getReport("diag_absent")).toBeNull();
  });

  it("records and lists provider usage", async () => {
    await adapter.recordProviderUsage({
      id: "usage_1",
      diagnosisId: "diag_7",
      provider: "bocha",
      stage: "SEARCHING",
      callCount: 2,
    });
    await adapter.recordProviderUsage({
      id: "usage_2",
      diagnosisId: "diag_7",
      provider: "deepseek",
      stage: "ANALYZING",
      callCount: 1,
      retryCount: 1,
      errorCode: null,
      costEstimate: 0.01,
    });
    const usage = await adapter.getProviderUsage("diag_7");
    expect(usage).toHaveLength(2);
    expect(usage[0]!.provider).toBe("bocha");
    expect(usage[0]!.callCount).toBe(2);
    expect(usage[1]!.retryCount).toBe(1);
    expect(usage[1]!.costEstimate).toBe(0.01);
  });

  it("saves checkpoints and finds a reusable one only on an exact key match", async () => {
    const key = {
      diagnosisId: "diag_8",
      stage: "ANALYZING",
      inputHash: "hash_abc",
      reportContractVersion: "1.0.0",
      scoreContractVersion: "1.0.0",
      providerModel: "deepseek-v4-flash",
      promptVersion: "p1",
      trustGuardVersion: "g1",
    };
    expect(await adapter.findReusableCheckpoint(key)).toBeNull();
    await adapter.saveCheckpoint({ ...key, outputJson: '{"cached":true}' });
    const hit = await adapter.findReusableCheckpoint(key);
    expect(hit?.outputJson).toBe('{"cached":true}');
    // A differing hash misses.
    expect(
      await adapter.findReusableCheckpoint({ ...key, inputHash: "other" }),
    ).toBeNull();
  });
});
