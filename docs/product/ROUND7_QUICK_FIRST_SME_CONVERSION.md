# Round-7 产品优先级纠偏：Quick-First SME Conversion Contract

**状态**：立即生效，不中断当前 Round-7

**日期**：2026-07-20

## 背景与目标客户纠偏

### 目标客户重新定位

此前使用的 Insta360、洽洽、科大讯飞、安徽合力等大型知名企业属于真实性和安全 Canary 验证场景，**不能**代表主要商业客户群体。

正式产品服务目标客户群：

| 客户类型 | 特征 |
|---------|------|
| 区域品牌 | 区域性知名度，核心市场在特定省份/城市 |
| 成长型制造企业 | 年营收 5000 万-10 亿，有出口或国内渠道扩张需求 |
| 食品消费企业 | 食品/零食/调味品，B2C 为主 |
| 工业 B2B 企业 | 设备/零部件/B2B 工业品，目标客户为企业采购 |
| 本地服务企业 | 餐饮/家居服务/教育培训，依赖本地搜索 |
| 中小企业 | 公开信息和 AI 认知基础较弱，官网内容不完善 |

**下一次真实商业验证优先使用获得授权的中小企业**，首选候选：安徽乐锦记食品有限公司。

---

## 一、Quick 为第一产品

### 优先级排序

本轮所有实现的优先级：

1. **Quick 报告** — 老板决策页，2-3 分钟阅读
2. **Evidence 展开** — 证据抽屉
3. **Enrichment 资料补充** — Append-only 企业资料收集
4. **Deep 报告** — 完整技术报告

### 约束条件

**Deep 不得阻塞 Quick 内部演示完成。**

不得为了完善 Deep：
- 延迟 Quick 发布
- 增加额外 Provider 调用
- 增加复杂后台
- 扩大本轮数据模型
- 增加完整 SOW 能力

---

## 二、Quick 目标规格

### 定位

**Quick 是老板决策页，不是技术摘要。**

### 文字量规格

| 指标 | 值 |
|------|-----|
| 目标阅读时间 | 2-3 分钟 |
| 目标中文字符 | 400-900 字 |
| 警戒线 | 1200 字 |
| 硬上限 | 1800 字 |

### 功能规格

| 要求 | 说明 |
|------|-----|
| 默认打开 | Quick 是报告默认视图 |
| 视觉专业简洁可信 | 不得有技术枚举、内部审计字段 |
| 响应式布局 | 390px 和 1440px 均正常展示 |
| 首屏 10 秒看懂 | 一屏内展示核心结论和主 CTA |
| 评分透明 | 实测/估算构成必须同屏展示 |
| CTA 首屏可见 | 主 CTA 在约 1.5 屏内必须看到 |

### 禁止内容

Quick 不得包含：
- 技术枚举（如"支持等级：DIRECT_SUPPORT"）
- 恢复状态（如"分析中断，正在恢复"）
- 内部审计字段（如"analysis_recovered: true"）

---

## 三、新增：PublicInformationOpportunityV1

### 定义

**PublicInformationOpportunity（公开信息完善机会）** 是一种确定性展示结构，用于提示企业可以补充的公开信息。

### 它不是什么

- 它**不是** Published Issue（无需 Evidence 发布门禁）
- 它**不是** GEO Opportunity（不影响 Opportunity 统计）
- 它**不是** Competitor Gap（与竞品比较无关）
- 它**不是** 评分扣分项（不影响 Truth Guard 门槛）

### 来源

它来源于 `QuestionCoverageGapV1` 的确定性映射。

### 字段定义

```typescript
interface PublicInformationOpportunityV1 {
  /** 关联的客户问题 ID */
  relatedQuestionId: string;
  
  /** 客户正在问什么 */
  customerQuestion: string;
  
  /** 当前覆盖状态：仅允许 PARTIALLY_SUPPORTED 或 UNANSWERED */
  currentCoverageStatus: "PARTIALLY_SUPPORTED" | "UNANSWERED";
  
  /** 在本次已检查范围内观察到的内容范围 */
  observedScope: string;
  
  /** 缺失的公开信息描述 */
  missingPublicInformation: string;
  
  /** 建议的具体补充动作 */
  suggestedContentAction: string;
  
  /** 潜在商业价值说明 */
  potentialBusinessValue: string;
  
  /** 关联的 Evidence ID 列表 */
  evidenceIds: string[];
  
  /** 措辞模式：必须限定检查范围 */
  wordingMode: "WITHIN_CHECKED_SCOPE";
}
```

### 措辞约束

**必须**使用的限定语：

> "在本次已检查的公开页面和搜索结果中……"

**禁止**使用的表达：
- "企业没有……"
- "官网完全缺失……"
- "用户一定找不到……"
- "AI 不会推荐……"
- "排名很差……"

### 数量限制

Quick 最多显示 **3 个** PublicInformationOpportunity。

---

## 四、Quick 首屏结构

### 首屏固定模块（按顺序）

1. **一句话诊断结论** — 品牌 + GEO 可见度基础指数 + 最核心发现
2. **综合分或暂未测得** — 带数值和测量构成
3. **实测/公开网页估算构成** — 透明展示测量来源
4. **最重要的公开信息完善机会** — 1 个最优先的 PublicInformationOpportunity
5. **主 CTA** — "预约报告解读"

### 首屏布局规则

- 首屏约 1.5 个手机屏幕内必须看到主 CTA
- 综合分统一命名为 **"GEO可见度基础指数"**
- 已有优势/最优先问题/最优先机会 仅在通过发布 Guard 时显示

### 后续模块（动态显示）

| 模块 | 显示条件 |
|------|----------|
| AI 当前理解 | 有 VALID 测试样本时 |
| 公开信息完善机会（最多3个） | 有 QuestionCoverageGap 时 |
| 核心问题 | 有 DIRECT_SUPPORT 问题时 |
| GEO Opportunity | 有可信血统的 Opportunity 时 |
| 三步行动建议 | 始终显示 |
| 次 CTA | 始终显示 |

**模块为空时隐藏，不补通用内容。**

---

## 五、行动建议与正式 Opportunity 分离

### 阶段一 Quick 行动建议

阶段一 Quick 可以展示"**建议先做的 3 件事**"，其来源可以是 QuestionCoverageGap 的确定性映射。

#### 示例映射

| 来源 | 行动建议 |
|------|----------|
| 产品选型问题缺失 | 建立产品选购 FAQ |
| 采购流程不清楚 | 补充团购/采购流程页面 |
| 资质案例未展示 | 集中展示资质和案例 |

### PUBLIC_INFORMATION_ACTION 标记

该行动建议内容**必须标记**为 `PUBLIC_INFORMATION_ACTION`。

- 它**不是**已验证的正式 GEO Opportunity
- 它**不进入** Opportunity 统计
- 它**不影响** Truth Guard 门槛

### 正式 GEO Opportunity 门禁

正式 GEO Opportunity 必须同时满足以下条件才可进入报告：

| 条件 | 说明 |
|------|------|
| Published Issue | 关联已发布的核心问题 |
| 有效 Evidence | 至少 1 条 DIRECT_SUPPORT |
| sourceIssueId | 必须指向已发布 Issue |
| customerQuestion | 客户正在问什么 |
| 具体行动 | recommendedAction 明确可执行 |
| 发布门禁 | 通过 Evidence Semantic Guard |

---

## 六、销售用词边界

### 优先使用的词汇

| 场景 | 推荐用词 |
|------|----------|
| 机会描述 | AI问答覆盖机会 |
| 机会描述 | 公开信息完善机会 |
| 机会描述 | 品牌事实表达机会 |
| 机会描述 | 客户决策内容机会 |
| 机会描述 | 产品与服务结构化机会 |

### 禁止使用的词汇

在**没有真实排名、Probe 或需求数据时**，不得使用：

| 禁用词汇 | 原因 |
|---------|------|
| 排名提升空间巨大 | 夸大效果 |
| 曝光一定增长 | 绝对化承诺 |
| AI排名靠后 | 缺乏客观基准 |
| 能快速霸屏 | 不切实际 |
| 抢占第一 | 无法保证 |
| 保证推荐 | 违反真实性 |

---

## 七、内部 Mock 验收场景

### A. 食品类区域企业

**特征**：公开信息较少

**验收标准**：
- Quick 能输出 2-3 个公开信息完善机会
- 即使 Published Issue 和正式 Opportunity 为 0
- 阶段一仍应具备商业可读性

### B. 工业 B2B 中小企业

**特征**：产品选型、售后、案例问题回答不足

**验收标准**：
- Quick 能够给出清晰补充方向
- "建议先做的 3 件事"具有可操作性

### C. 本地服务企业

**特征**：服务流程、价格边界、案例、地域覆盖不清

**验收标准**：
- Quick 能够形成客户决策问题清单
- 老板能在 3 分钟内看懂核心发现

### Mock 声明

**所有内容均为 Mock，不得冒充真实企业事实。**

---

## 八、下一次真实商业验证

### 验证目标

Round-7 完成后，不再运行大型知名企业。

### 验证企业

**优先候选**：安徽乐锦记食品有限公司（已获得授权的中小企业）

### 验证指标

| 指标 | 验收标准 |
|------|----------|
| Quick 页面是否漂亮 | 视觉专业、简洁、可信 |
| 生成时间 | 是否在 90 秒内生成 |
| 公开信息完善机会 | 是否有 2-3 个真实机会 |
| 老板理解度 | 是否在 3 分钟内看懂 |
| 预约意愿 | 是否自然愿意预约解读 |
| 资料补充意愿 | 是否愿意补充企业资料 |

### 阶段目标

**不要求**第一阶段必须生成正式 Opportunity 或 Demo Fix。

完成后再决定是否扩展第二家和第三家中小企业。

---

## 九、技术实现要点

### 数据流

```
QuestionCoverageGapV1
    ↓ 确定性映射
PublicInformationOpportunityV1
    ↓ 渲染
Quick 报告模块
```

### QuickReportViewModel 扩展

```typescript
// 新增字段
publicInformationOpportunities: PublicInformationOpportunityV1[]; // max 3

publicInformationActions: PublicInformationActionV1[]; // max 3

// 来源标记
interface PublicInformationActionV1 {
  actionText: string;
  sourceType: "PUBLIC_INFORMATION_ACTION"; // 标记来源
}
```

### 组件变更

| 组件 | 变更 |
|------|------|
| QuickReport | 新增 PublicInformationOpportunity 模块 |
| QuickReport | 新增 PUBLIC_INFORMATION_ACTION 行动建议模块 |
| zh-labels | 新增 PublicInformationOpportunity 标签映射 |
| report-presentation-service | 新增 QuestionCoverageGap → PublicInformationOpportunity 映射逻辑 |

---

## 十、验收检查清单

### Quick 页面

- [ ] 默认打开 Quick 视图
- [ ] 中文字符数在 400-900 目标范围内
- [ ] 警戒线 1200 字以内
- [ ] 硬上限 1800 字
- [ ] 首屏 10 秒看懂
- [ ] CTA 首屏可见
- [ ] 无技术枚举
- [ ] 无恢复状态
- [ ] 无内部审计字段

### PublicInformationOpportunity

- [ ] 最多显示 3 个
- [ ] 使用限定语"在本次已检查的公开页面和搜索结果中……"
- [ ] 不使用禁用表达
- [ ] 不进入 Opportunity 统计
- [ ] 不影响 Truth Guard 门槛

### 行动建议

- [ ] 标记为 PUBLIC_INFORMATION_ACTION
- [ ] 不冒充正式 GEO Opportunity
- [ ] 最多显示 3 个

### 销售用词

- [ ] 使用推荐词汇
- [ ] 不使用禁用词汇

---

## 十一、里程碑

| 阶段 | 目标 | 状态 |
|------|------|------|
| Round-7 启动 | 本文档生效 | ✅ |
| Quick 页面重构 | 实现新首屏结构 + PublicInformationOpportunity | 🔄 进行中 |
| Mock 验收 | 3 个场景内部验收 | ⏳ 待开始 |
| 真实中小企业验证 | 安徽乐锦记 | ⏳ 待开始 |

---

**本文档立即生效，不中断当前 Round-7 工作。**
