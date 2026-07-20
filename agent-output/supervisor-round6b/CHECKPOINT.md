# Round-6B Supervisor Checkpoint

## Status

`COMPLETED_INTERNAL_LAB`

## Decisions

- Primary yield root cause: `MULTI_FACTOR`
- Model: `INSUFFICIENT_EVIDENCE_TO_SWITCH`；正式默认保持 FLASH
- Product flow: `ADOPT_TWO_STAGE_PUBLIC_PLUS_ENRICHMENT`（`DESIGN_REVIEW`）
- Pilot: `READY_FOR_INTERNAL_DEMO_ONLY`

## Provider and mutation audit

- Bocha: 0
- Crawler: 0
- DeepSeek Claims Shadow: 6（Flash 3 / Pro 3）
- Retries: 0
- New real Diagnoses: 0
- Canonical / Evidence / ClaimEvidenceRelation writes: 0
- Raw model responses persisted: false

Shadow artifact SHA-256:
`5C72DD4C16F968FA37B406DEB48543633071F773B67DB54EEEF84827498CB5FB`。

## Immutable baseline audit

- 三家 SQLite 与三份 sanitized Canonical Hash 均与开场基线一致；
- batch-run-lock 与 continuation Hash 均一致；
- Insta360 V1/V2 整树 Hash 均一致；
- main local/remote refs 均未变化；
- Production Truth Guard tag 仍解引用至 `f432589a75622a74380d595e97b38f6c52132ce4`；
- Integration 仅合入授权的 Gate 9 聚合语义修复，现为
  `03d8332bc6462e3ef2477d157898f8bd08280ab4`；
- 聚合 JSON 仅做离线 Gate 9 修正，SHA-256
  `112DD4C1AE47A766D3868596A3C19E44A809DB0CC4CD3B7F51172D5F1837F887`。

## Quality gates

- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS（78 files / 850 tests）
- `pnpm build`: PASS
- `pnpm smoke:mock`: PASS
- `pnpm security:check`: PASS（SSRF 52/52）
- `pnpm test:e2e`: PASS（独立端口 36106，16/16）
- `pnpm audit --prod`: PASS（0 known vulnerabilities）

首次 E2E 使用默认端口时误复用了另一工作区已有服务，全部请求被该实例的 CSRF Guard 拒绝。
仓库中不存在该错误码；改用独立端口启动本分支服务后 16/16 PASS，未修改 CSRF 或测试代码。

## Stop conditions

未执行 Evidence Closure、客户试用、生产部署或 main 合并。Closure/Enrichment 仍默认关闭。
