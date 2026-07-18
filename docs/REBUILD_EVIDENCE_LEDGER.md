# REBUILD_EVIDENCE_LEDGER

记录重建过程中每一次「决策 / 已知事实 / 待确认事实」的台账，供后续 Agent 与人工审查
追溯依据，避免把未验证的假设当成既定事实。

## 格式

每条记录：

```
- [YYYY-MM-DD] <KNOWN|DECISION|UNKNOWN> <主题> — <说明> (来源: <会话/文档>)
```

## 台账

- [2026-07-18] DECISION 重建独立于任何旧仓库，Git 历史从空目录 `git init` 开始 —
  不复制旧 `.git`、不修复旧 worktree、不拼接旧源码。(来源: 本次 Supervisor 会话冻结指令)
- [2026-07-18] KNOWN GitHub 远程 `https://github.com/JustinXai/qiyezhenduanzhinengti.git`
  当前为空仓库（`git ls-remote` 无任何 ref），可安全作为 `origin/main` 的起点。
- [2026-07-18] DECISION 五项评分权重、Quick 8 模块结构、AI 可见度单一事实源规则、
  Provider 错误分类与重试策略，均按用户在本次会话中给出的冻结说明原样落地到
  `docs/*.md` 与 `src/contracts/index.ts`，未做任何产品范围外推。
- [2026-07-18] UNKNOWN 真实博查 / DeepSeek API Key 尚未配置到 `.env`（仅有
  `.env.example` 占位）。真实样本运行前必须由用户在本地补齐，Supervisor/Agent 不得
  询问或代填密钥值。
- [2026-07-18] UNKNOWN Mock Provider 的具体 Fixture 内容（各阶段 DeepSeek 结构化输出
  样例）尚未编写，留给 Agent D 在 `tests/providers/` 补充。

后续每个 Agent 在自己的 `agent-output/<agent-name>/CHECKPOINT.md` 中新增台账条目，
并由 Supervisor 汇总同步回本文件的关键决策部分（非逐条照抄）。
