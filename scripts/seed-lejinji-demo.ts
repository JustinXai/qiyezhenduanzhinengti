// Seed script to populate the demo database with the Lejinji report
// Round-7.4: Enhanced with provenance tracking and safety guards
import Database from "better-sqlite3";
import { openMigratedDatabase } from "../src/storage/migrate";
import type { DiagnosisReport } from "../src/contracts";

// ============================================================================
// Safety Guards (Round-7.4)
// Seed can ONLY execute when ALL of the following are true:
// 1. DEMO_SEED_ENABLED=true
// 2. APP_MODE=DEMO
// 3. Target database filename contains "demo"
// ============================================================================

function enforceSeedSafety(): void {
  const demoEnabled = (process.env.DEMO_SEED_ENABLED ?? "").trim().toLowerCase() === "true";
  const appMode = (process.env.APP_MODE ?? "").trim().toUpperCase();
  const dbPath = process.env.DATABASE_URL ?? DB_PATH;
  const isDemoDb = dbPath.toLowerCase().includes("demo");

  if (!demoEnabled) {
    throw new Error(
      "[seed] BLOCKED: DEMO_SEED_ENABLED must be 'true' to run seed. " +
      "Refusing to seed production databases."
    );
  }

  if (appMode !== "DEMO") {
    throw new Error(
      "[seed] BLOCKED: APP_MODE must be 'DEMO' to run seed. " +
      "Current APP_MODE='" + appMode + "'. Refusing to seed non-demo environments."
    );
  }

  if (!isDemoDb) {
    throw new Error(
      "[seed] BLOCKED: Target database '" + dbPath + "' does not contain 'demo' in filename. " +
      "Seed script only writes to explicit demo databases. " +
      "Refusing to seed: " + dbPath
    );
  }

  console.log("[seed] Safety guards passed: DEMO_SEED_ENABLED=true, APP_MODE=DEMO, demo database.");
}

// Configuration
const DB_PATH = "./data/lejinji-canary.db";
const DIAGNOSIS_ID = "diag_577375be226c4c2f862af6e5bc6c8580";
const REPORT_ID = "369855b3-5273-44e5-b8ca-f717b5fadb41";
const PUBLIC_TOKEN = "tok_1e28531d23774261af449977b88d9319";

// Lejinji Report (mock data for demo purposes)
const lejinjiReport: DiagnosisReport = {
  reportContractVersion: "1.0.0",
  scoreContractVersion: "1.0.0",
  reportLanguage: "zh-CN",
  diagnosisId: DIAGNOSIS_ID,
  publicToken: PUBLIC_TOKEN,
  generatedAt: "2026-07-19T00:00:00.000Z",
  companyProfile: {
    brandName: "安徽乐锦记食品有限公司",
    website: "https://www.lejinji.com",
    industry: "食品消费",
    productOrService: "休闲零食",
    targetRegion: "华东地区",
    competitors: [],
    unresolvedQuestions: [
      "产品购买渠道信息不够明确",
      "品牌加盟合作政策未公开",
    ],
  },
  scores: {
    companyClarity: {
      score: 68,
      measurementStatus: "MEASURED",
      confidence: 0.75,
      evidenceIds: ["ev_1"],
    },
    websiteCompleteness: {
      score: 55,
      measurementStatus: "MEASURED",
      confidence: 0.7,
      evidenceIds: ["ev_1"],
    },
    customerQuestionCoverage: {
      score: 48,
      measurementStatus: "ESTIMATED",
      confidence: 0.5,
      evidenceIds: [],
    },
    trustEvidence: {
      score: 62,
      measurementStatus: "MEASURED",
      confidence: 0.65,
      evidenceIds: ["ev_2"],
    },
    aiVisibility: {
      score: null,
      measurementStatus: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      evidenceIds: [],
    },
    overallScore: 58.2,
    scoreCoverage: 0.8,
  },
  aiVisibilityTests: [
    {
      id: "aiv_1",
      questionCategory: "PURCHASE_DECISION",
      question: "华东地区有哪些知名的休闲零食品牌？",
      status: "VALID",
      brandMentioned: false,
      accuracy: "NOT_MENTIONED",
      recommendationStrength: "NONE",
      modelUsed: "deepseek-v4-flash",
      testedAt: "2026-07-19T00:00:00.000Z",
      evidenceIds: [],
    },
    {
      id: "aiv_2",
      questionCategory: "BRAND_DIRECT",
      question: "安徽乐锦记主要生产什么产品？",
      status: "VALID",
      brandMentioned: true,
      accuracy: "PARTIAL",
      recommendationStrength: "WEAK",
      modelUsed: "deepseek-v4-flash",
      testedAt: "2026-07-19T00:00:00.000Z",
      evidenceIds: ["ev_1"],
    },
  ],
  strengths: [
    {
      id: "str_1",
      claimType: "DIAGNOSTIC_INFERENCE",
      statement: "官网展示了休闲零食产品线",
      businessImpact: "潜在客户可以快速了解企业提供的产品类型",
      evidenceIds: ["ev_1"],
    },
  ],
  coreIssues: [
    {
      id: "iss_1",
      claimType: "DIAGNOSTIC_INFERENCE",
      statement: "官网缺少明确的购买渠道信息",
      businessImpact: "客户无法快速找到购买途径，可能流失至其他品牌",
      evidenceIds: ["ev_1"],
      fixDirection: "在官网添加购买渠道页面或电商平台入口链接",
    },
    {
      id: "iss_2",
      claimType: "DIAGNOSTIC_INFERENCE",
      statement: "品牌加盟合作信息不透明",
      businessImpact: "潜在合作伙伴无法获取合作政策，错过合作机会",
      evidenceIds: ["ev_1"],
      fixDirection: "建立招商加盟页面或展示联系方式",
    },
  ],
  competitorGaps: [],
  geoOpportunities: [],
  demonstrationFix: {
    id: "demo_1",
    fixType: "FAQ_EXAMPLE",
    currentIssue: "官网缺少购买渠道信息",
    suggestedAssetType: "购买渠道页面",
    before: "官网未展示任何购买渠道或电商入口",
    after: "新增购买渠道页面，包含天猫、京东、拼多多等主流电商平台入口",
    whyBetter: "客户可以直接跳转至购买页面，提升转化率",
    customerConfirmationNeeded: "确认各电商平台的官方旗舰店链接",
    geoTeamDeliverable: "电商平台入口链接清单",
    evidenceIds: ["ev_1"],
    disclaimer: "示范内容仅用于展示优化方向，正式发布前需结合企业真实材料确认。",
  },
  questionCoverageGaps: [
    {
      questionId: "q_pub_1",
      questionText: "这个品牌的产品在哪里可以买到？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次搜索结果中未找到购买渠道信息",
      missingInformation: "线上购买渠道（天猫/京东/拼多多）和线下商超信息",
      suggestedAction: "在官网添加购买渠道页面或电商平台入口",
      businessValue: "降低客户购买门槛，直接转化潜在客户",
      evidenceIds: [],
    },
    {
      questionId: "q_pub_2",
      questionText: "品牌有没有加盟合作的机会？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次未搜索到任何关于加盟或合作的信息",
      missingInformation: "加盟合作政策、联系方式或招商页面入口",
      suggestedAction: "建立加盟合作页面或展示企业联系方式",
      businessValue: "拓展 B2B 渠道和经销商网络",
      evidenceIds: [],
    },
    {
      questionId: "q_pub_3",
      questionText: "品牌的产品口感如何？有哪些口味可以选择？",
      coverageStatus: "PARTIALLY_SUPPORTED",
      observedScope: "官网产品页面列出了部分产品名称，但未找到口感描述",
      missingInformation: "产品口感描述和口味选择列表",
      suggestedAction: "在官网产品页面补充产品口感描述和口味列表",
      businessValue: "帮助客户快速了解产品特点，提升购买决策效率",
      evidenceIds: ["ev_1"],
    },
  ],
  evidence: [
    {
      id: "ev_1",
      title: "安徽乐锦记食品有限公司 - 官网",
      sourceDomain: "lejinji.com",
      sourceType: "FIRST_PARTY_EVIDENCE",
      authorityLevel: "OWNED",
      supportLevel: "DIRECT_SUPPORT",
      fetchedAt: "2026-07-19T00:00:00.000Z",
      snippet: "安徽乐锦记食品有限公司，专注休闲零食生产与销售。",
      url: "https://www.lejinji.com",
    },
    {
      id: "ev_2",
      title: "行业媒体对乐锦记的报道",
      sourceDomain: "food-industry.example.net",
      sourceType: "OBSERVED_WEB_EVIDENCE",
      authorityLevel: "MEDIA",
      supportLevel: "CONTEXT_ONLY",
      fetchedAt: "2026-07-19T00:00:00.000Z",
      snippet: "报道提及该企业在华东地区休闲食品市场的参与情况。",
      url: "https://food-industry.example.net/lejinji",
    },
  ],
};

function seedDatabase(): void {
  // Enforce safety guards before any database operation
  enforceSeedSafety();

  console.log(`[seed] Creating database at ${DB_PATH}...`);

  const db = openMigratedDatabase(DB_PATH);

  // Insert diagnosis request
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT OR REPLACE INTO diagnosis_requests (id, status, input_json, public_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    DIAGNOSIS_ID,
    "READY",
    JSON.stringify(lejinjiReport.companyProfile),
    PUBLIC_TOKEN,
    now,
    now
  );

  // Insert report with MOCK_SEED provenance (Round-7.4)
  db.prepare(`
    INSERT OR REPLACE INTO reports (id, diagnosis_id, report_contract_version, score_contract_version, canonical_json, created_at, report_provenance, demo_only)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    REPORT_ID,
    DIAGNOSIS_ID,
    lejinjiReport.reportContractVersion,
    lejinjiReport.scoreContractVersion,
    JSON.stringify(lejinjiReport),
    now,
    "MOCK_SEED",
    1
  );

  // Insert evidence
  const insertEvidence = db.prepare(`
    INSERT OR REPLACE INTO evidence (id, diagnosis_id, source_type, source_domain, url, title, snippet, authority_level, support_level, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const ev of lejinjiReport.evidence) {
    insertEvidence.run(
      ev.id,
      DIAGNOSIS_ID,
      ev.sourceType,
      ev.sourceDomain,
      ev.url,
      ev.title,
      ev.snippet,
      ev.authorityLevel,
      ev.supportLevel,
      Math.floor(new Date(ev.fetchedAt).getTime() / 1000)
    );
  }

  db.close();

  console.log("[seed] Database seeded successfully!");
  console.log(`[seed] Diagnosis ID: ${DIAGNOSIS_ID}`);
  console.log(`[seed] Report ID: ${REPORT_ID}`);
  console.log(`[seed] Public Token: ${PUBLIC_TOKEN}`);
  console.log(`[seed] Brand: ${lejinjiReport.companyProfile.brandName}`);
}

seedDatabase();
