# Chinese Report Contract (zh-CN) — V1

Round-5.1 冻结。本文件定义公开报告的语言契约;与 `docs/REPORT_CONTRACT.md`
(结构契约)配合,不替代它。

## 1. 语言冻结

- Canonical `DiagnosisReport.reportLanguage = "zh-CN"`(Zod 字面量;旧数据由
  default 填充;由装配器盖章)。
- V1 唯一公开语言;用户表单、URL 参数、前端切换都不能改变它。
- 所有客户可见生成字段(结论、优势、问题、机会、竞品发现、示范修复、路线图、
  评分与测量说明、AI 可见度说明、证据摘要)必须为简体中文。
- 允许保留原文:企业/品牌名、产品型号、URL、证据原始标题,以及必要缩写
  (GEO / AI / API / FAQ / CTA / B2B / VR 等)。
- 禁止:仅在展示层翻译标签而 Canonical 正文仍为英文;中英双语重复内容;
  英文整句解释。

## 2. 公开映射(唯一程序来源)

单一来源:`src/report/presentation/zh-labels.ts`。页面、Guard、烟雾投影
一律从这里导入;任何第二张翻译表都是契约违规。

| 内部值 | 公开中文 |
| --- | --- |
| MEASURED | 实测 |
| ESTIMATED | 公开网页估算 |
| INSUFFICIENT_EVIDENCE | 证据不足 |
| PROVIDER_FAILED | 暂未测得 |
| DIRECT_SUPPORT | 直接支持 |
| PARTIAL_SUPPORT | 部分支持 |
| CONTEXT_ONLY | 背景参考 |
| UNSUPPORTED | (不得公开;展示层过滤) |
| OWNED / MEDIA | 企业自有 / 第三方媒体 |
| language: zh / other | 中文来源 / 英文官方补充 |

## 3. ChinesePublicReportGuard

`src/report/validation/chinese-public-report-guard.ts`,覆盖 Quick / Deep /
Evidence 三个投影,检查:整句英文、内部枚举、状态机名、英文技术报错、英文
CTA、半角 `! ? ;` 标点、UNSUPPORTED 泄漏、中文证据摘要缺失、reportLanguage。
Guard 失败即发布阻断。

## 4. measurementComposition(§八)

`src/report/presentation/measurement-composition.ts` 按冻结权重
(20/20/25/20/15)计算 实测/公开网页估算/证据不足/暂未测得 的权重份额;
Quick 与 Deep 展示同一份投影结果,前端不得重算。估算 > 实测时必须显示:
「本报告多数维度基于本次公开网页和搜索证据估算,建议结合企业内部资料进一步确认。」
不得只显示"覆盖率100%"。

## 5. Quick 中文成交版(§十)

目标 600–1000 可见中文字符,警戒 1200,硬上限 1800(超限 Guard 失败)。
决策顺序:一句话结论 → 评分与测量构成 → 最重要问题 → 最优先机会 → 主CTA →
AI样本 → 竞品 → 其他问题 → 示范修复 → 三阶段 → 底部CTA。上限:AI样本2、
竞品差距1、问题3、示范修复1、机会3。模块不足:不补齐、不显示空壳、编号
基于实际可见模块连续(testid 采用语义键 `quick-module-<key>`)。

## 6. 机会血统(§八)

GeoOpportunity 携带 `sourceIssueId`(必须指向已发布 Issue)、
`recommendedAction`(具体 GEO 动作)、`priorityReason`(优先理由);
旧报告字段可缺省。被剪枝的候选记录 reasonCode
(见 `src/contracts/claim-reason-codes.ts`),剪枝原因不得公开为企业问题。
