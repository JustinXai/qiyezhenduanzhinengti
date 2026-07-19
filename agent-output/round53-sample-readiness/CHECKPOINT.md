# Round-5.3 Agent W Checkpoint

状态：`THREE_COMPANY_SAMPLE_HARNESS_READY`

## 交付

- 新增纯离线三企业样本统计器与固定 10 项聚合 Gate。
- 新增 3 公司 Mock fixture：2 家有可信 Opportunity，1 家 Opportunity=0 但保持 `sparseButTruthful`。
- 新增公司级指标、真实性、Opportunity 血统、Demonstration Fix、Quick 字符、页面切换调用和测量构成回归。
- 新增 `docs/qa/THREE_COMPANY_SAMPLE_CONTRACT.md`。

## 约束证明

- 真实 Provider 调用：0
- 网络访问：0
- 新真实 Diagnosis：0
- V1/V2 数据库写入：0
- `src/fixtures/` 修改：0
- 固定补齐 Opportunity：0
- Claim–Evidence 阈值调整：0

## 验证

- `pnpm exec vitest run tests/qa/round53-three-company-sample.test.ts`：10/10 PASS
- `pnpm typecheck`：PASS
- `pnpm test`：55 files / 660 tests PASS
