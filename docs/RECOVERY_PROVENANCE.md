# RECOVERY_PROVENANCE — 重建来源说明

本仓库是 **企业诊断智能体** 的全新独立工程（Clean-Room Rebuild），建立于 2026-07-18。

## 允许参考的输入

- 用户提供的冻结产品要求（本次会话中的完整需求说明）；
- 历史验收摘要；
- 恢复文档；
- 已知评分和报告契约；
- 已知 Provider 可靠性规则。

以上内容已转写为本仓库 `docs/` 下的冻结契约文档（`PROJECT_FREEZE.md` /
`ARCHITECTURE.md` / `PRODUCT_TRUTH_RULES.md` / `REPORT_CONTRACT.md` /
`SCORE_CONTRACT.md` / `PROVIDER_RELIABILITY_CONTRACT.md` /
`SECURITY_INVARIANTS.md`），而非直接复制历史源码。

## 明确排除的输入

本仓库的任何一行源代码都不是以下来源的直接拷贝：

- 残缺旧仓库的 `.git`；
- 旧 worktree 中的文件；
- 来源不明的旧源码拼接；
- 伪装成"已恢复源码"的旧聊天摘要；
- D 盘旧 worktree；
- 残缺工程的 Git 历史；
- TestDisk / PhotoRec / 旧 stash 的恢复产物。

## 本仓库的起点

`git init` 于空目录，独立 Git 历史，首个提交为
`chore(rebuild): initialize enterprise diagnosis baseline`，Tag `rebuild-baseline-v0`。

后续每一次功能实现都必须来自：本仓库内新写的代码、或本仓库 `docs/` 内已冻结的契约
文档，不允许引用本文档列出的排除来源。
