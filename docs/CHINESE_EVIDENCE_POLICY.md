# Chinese Evidence Policy — ZH_CN_PRIMARY_WITH_OFFICIAL_FALLBACK (V1)

Round-5.1 冻结。中文网络是国内企业诊断的主要证据来源;英文只作官方身份确认与
官方事实兜底,不得成为主要证据基础。

## 1. 查询桶(`src/diagnosis/search/query-planner.ts`)

中文桶:品牌/企业实体、官网、口碑评价、产品与服务、购买决策、如何选择、
使用场景、案例/资质/认证、渠道/经销、售后/服务保障、行业媒体、旗舰店(电商)、
知乎/评测(社区)、竞品对比。英文仅限:`<ASCII品牌> official website / official
site / product` 与 `site:<候选域名>`(官方身份确认、国际竞品官网解析、中文缺失
的官方事实)。ASCII 品牌名的官方域解析英文优先(修复 GoPro 未解析问题);
中文品牌名中文优先。禁止用品牌名拼接 `.com` 猜测域名。

## 2. 证据分层(`src/diagnosis/evidence/tiering.ts`)

| Tier | 含义 |
| --- | --- |
| A | 企业中文官网与官方中文材料 |
| B | 企业/竞品全球官方网站(英文官方补充) |
| C | 政府/协会/中文权威与行业媒体 |
| D | 官方旗舰店与主流电商产品页(jd/tmall/taobao/pdd/suning/1688) |
| E | 中文问答、社区、测评、用户反馈(zhihu/baidu/bilibili/xhs/weibo/douyin…) |

每条证据记录:`language`(zh/other,CJK≥15%判定)、`sourceTier`、
`normalizedDomain`、`dedupeKey`。

## 3. 去重与上限

- Snippet 默认只能作为 CONTEXT_ONLY 候选;关键 Claim 优先使用抓取正文。
- 同域名+近似标题合并(dedupeKey);同一电商域最多2条;同一社区域最多2条;
  重复列表页/参数变体合并。
- 官方证据(Tier A/B)豁免域上限,不被低价值第三方结果挤出预算。

## 4. 统计与产出率

`curateEvidence` 输出 before/after、duplicatesMerged、cappedByDomain、
byTier、chineseCount、englishOfficialFallbackCount;
`computeContentYield(report)` 输出 evidenceUsedByClaims、unusedEvidenceCount、
`contentYieldRate = 进入已发布Claim关系的证据数 / 去重后证据总数`。
不得通过删除必要证据人为提高该比率。

## 5. 公开呈现

证据视图保留原始标题语言,但每条必须有中文摘要(summaryZh)、中文来源/支持
标签,以及语言标注(中文来源 / 英文官方补充)。UNSUPPORTED 不公开。旧报告
(无 language 标注)按 B 类情形处理:下一次真实生成时补全,禁止篡改历史
Canonical。
