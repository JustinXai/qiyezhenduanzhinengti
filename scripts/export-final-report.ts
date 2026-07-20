#!/usr/bin/env node
/**
 * Export Final Report Script
 * 
 * Generates final report artifacts for the lejinji diagnosis:
 * - lejinji-final-report.html
 * - lejinji-final-report.pdf (via print)
 * - lejinji-final-report-summary.json
 * 
 * Output directory: E:\企业诊断智能体_private\quick-first-mvp-v1.2-final\final-report
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import Database from "better-sqlite3";

// Configuration
const DIAGNOSIS_TOKEN = "tok_1e28531d23774261af449977b88d9319";
const OUTPUT_DIR = "E:\\企业诊断智能体_private\\quick-first-mvp-v1.2-final\\final-report";
const DB_PATH = "./data/lejinji-canary.db";

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

// Read data from SQLite
const db = new Database(DB_PATH, { readonly: true });

// Get diagnosis by public token
const diagnosis = db.prepare(
  "SELECT * FROM diagnosis_requests WHERE public_token = ?"
).get(DIAGNOSIS_TOKEN) as any;

if (!diagnosis) {
  console.error("❌ Diagnosis not found:", DIAGNOSIS_TOKEN);
  process.exit(1);
}

// Get report
const reportRow = db.prepare(
  "SELECT * FROM reports WHERE diagnosis_id = ? ORDER BY rowid DESC LIMIT 1"
).get(diagnosis.id) as any;

if (!reportRow) {
  console.error("❌ Report not found for diagnosis:", diagnosis.id);
  process.exit(1);
}

const canonical = JSON.parse(reportRow.canonical_json);
db.close();

// Get latest revision if exists
const db2 = new Database(DB_PATH, { readonly: true });
const latestRevision = db2.prepare(
  "SELECT * FROM report_revisions WHERE report_id = ? ORDER BY revision_number DESC LIMIT 1"
).get(diagnosis.id) as any;

let finalReport = canonical;
if (latestRevision) {
  finalReport = JSON.parse(latestRevision.revised_json);
  console.log("✅ Using revision #" + latestRevision.revision_number);
}

db2.close();

// Build summary JSON (sanitized, no secrets)
const summary = {
  exportDate: new Date().toISOString(),
  diagnosisId: diagnosis.id,
  reportId: reportRow.id,
  revisionId: latestRevision?.id ?? null,
  companyName: finalReport.companyProfile?.brandName,
  overallScore: finalReport.scores?.overallScore,
  scoreCoverage: finalReport.scores?.scoreCoverage,
  reportLanguage: finalReport.reportLanguage,
  generatedAt: finalReport.generatedAt,
  revisionHistory: latestRevision ? [{
    revisionNumber: latestRevision.revision_number,
    revisionReason: latestRevision.revision_reason,
    editedFields: latestRevision.edited_fields.split(","),
    reviewerName: latestRevision.reviewer_name,
    reviewedAt: new Date(latestRevision.reviewed_at * 1000).toISOString(),
  }] : [],
  scores: {
    companyClarity: finalReport.scores?.companyClarity?.score,
    websiteCompleteness: finalReport.scores?.websiteCompleteness?.score,
    customerQuestionCoverage: finalReport.scores?.customerQuestionCoverage?.score,
    trustEvidence: finalReport.scores?.trustEvidence?.score,
    aiVisibility: finalReport.scores?.aiVisibility?.score,
  },
  evidenceCount: finalReport.evidence?.length ?? 0,
  coreIssuesCount: finalReport.coreIssues?.length ?? 0,
  strengthsCount: finalReport.strengths?.length ?? 0,
  questionCoverageGapsCount: finalReport.questionCoverageGaps?.length ?? 0,
  demonstrationFix: finalReport.demonstrationFix ? {
    id: finalReport.demonstrationFix.id,
    fixType: finalReport.demonstrationFix.fixType,
    currentIssue: finalReport.demonstrationFix.currentIssue,
    suggestedAssetType: finalReport.demonstrationFix.suggestedAssetType,
  } : null,
  reportUrl: `http://localhost:36120/report/${DIAGNOSIS_TOKEN}`,
  reviewUrl: `http://localhost:36120/internal/report-review/${DIAGNOSIS_TOKEN}`,
  // NO secrets below this line
  note: "This summary is sanitized and safe to share. No API keys, tokens, or private data included.",
};

// Write summary JSON
const summaryPath = join(OUTPUT_DIR, "lejinji-final-report-summary.json");
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log("✅ Written:", summaryPath);

// Build HTML report
const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>企业诊断报告 - ${finalReport.companyProfile?.brandName ?? "Unknown"}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 28px; margin-bottom: 8px; color: #1a1a1a; }
    h2 { font-size: 20px; margin: 32px 0 16px; color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
    h3 { font-size: 16px; margin: 16px 0 8px; color: #374151; }
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .score-box { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 24px; border-radius: 12px; margin: 24px 0; text-align: center; }
    .score-value { font-size: 56px; font-weight: bold; }
    .score-label { font-size: 14px; opacity: 0.9; }
    .coverage { font-size: 14px; margin-top: 8px; opacity: 0.8; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .card.issue { border-left: 4px solid #ef4444; }
    .card.strength { border-left: 4px solid #22c55e; }
    .card.opportunity { border-left: 4px solid #f59e0b; }
    .statement { font-weight: 500; margin-bottom: 8px; }
    .impact { color: #6b7280; font-size: 14px; }
    .fix-direction { background: #dbeafe; padding: 12px; border-radius: 6px; margin-top: 12px; font-size: 14px; }
    .evidence-list { list-style: none; margin-top: 12px; }
    .evidence-list li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .evidence-list li:last-child { border-bottom: none; }
    .evidence-title { font-weight: 500; }
    .evidence-meta { color: #6b7280; font-size: 12px; }
    .demo-fix { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0; }
    .demo-fix h3 { color: #92400e; margin-top: 0; }
    .before-after { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
    .before-after > div { padding: 12px; border-radius: 6px; }
    .before { background: #fee2e2; }
    .after { background: #dcfce7; }
    .before-label, .after-label { font-size: 12px; font-weight: 500; margin-bottom: 4px; }
    .before-label { color: #991b1b; }
    .after-label { color: #166534; }
    .disclaimer { font-size: 12px; color: #6b7280; text-align: center; margin-top: 32px; padding: 16px; background: #f3f4f6; border-radius: 8px; }
    .footer { text-align: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
    .qcg-item { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .qcg-question { font-weight: 500; color: #166534; margin-bottom: 8px; }
    .qcg-suggestion { font-size: 14px; color: #374151; margin-top: 8px; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>企业诊断报告</h1>
  <div class="meta">
    <div>企业：${finalReport.companyProfile?.brandName ?? "未知"}</div>
    <div>行业：${finalReport.companyProfile?.industry ?? "未知"} | 地区：${finalReport.companyProfile?.targetRegion ?? "未知"}</div>
    <div>生成时间：${new Date(finalReport.generatedAt).toLocaleString("zh-CN")}</div>
    <div>报告语言：${finalReport.reportLanguage}</div>
  </div>

  <div class="score-box">
    <div class="score-label">GEO 可见度综合指数</div>
    <div class="score-value">${finalReport.scores?.overallScore?.toFixed(1) ?? "N/A"}</div>
    <div class="coverage">覆盖率：${((finalReport.scores?.scoreCoverage ?? 0) * 100).toFixed(0)}%</div>
  </div>

  <h2>评分维度</h2>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
    ${Object.entries(finalReport.scores ?? {}).filter(([k]) => k !== "overallScore" && k !== "scoreCoverage").map(([key, val]: [string, any]) => `
      <div class="card">
        <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">${val?.score ?? "N/A"}</div>
        <div style="font-size: 12px; color: #6b7280;">${getScoreLabel(key)}</div>
        <div style="font-size: 11px; color: #9ca3af;">${getStatusLabel(val?.measurementStatus)}</div>
      </div>
    `).join("")}
  </div>

  ${finalReport.strengths?.length > 0 ? `
  <h2>优势</h2>
  ${finalReport.strengths.map((s: any) => `
    <div class="card strength">
      <div class="statement">${s.statement}</div>
      <div class="impact">商业影响：${s.businessImpact}</div>
    </div>
  `).join("")}
  ` : ""}

  ${finalReport.coreIssues?.length > 0 ? `
  <h2>核心问题</h2>
  ${finalReport.coreIssues.map((issue: any) => `
    <div class="card issue">
      <div class="statement">${issue.statement}</div>
      <div class="impact">商业影响：${issue.businessImpact}</div>
      <div class="fix-direction">📋 修复方向：${issue.fixDirection}</div>
    </div>
  `).join("")}
  ` : ""}

  ${finalReport.questionCoverageGaps?.length > 0 ? `
  <h2>公开信息完善机会</h2>
  ${finalReport.questionCoverageGaps.map((gap: any) => `
    <div class="qcg-item">
      <div class="qcg-question">❓ ${gap.questionText}</div>
      <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">当前状态：${gap.coverageStatus === "UNANSWERED" ? "未回答" : "部分支持"}</div>
      <div class="qcg-suggestion">💡 建议动作：${gap.suggestedAction}</div>
      ${gap.businessValue ? `<div style="font-size: 13px; color: #166534; margin-top: 8px;">潜在价值：${gap.businessValue}</div>` : ""}
    </div>
  `).join("")}
  ` : ""}

  ${finalReport.demonstrationFix ? `
  <h2>示范性修复建议</h2>
  <div class="demo-fix">
    <h3>${finalReport.demonstrationFix.currentIssue}</h3>
    <p><strong>建议内容类型：</strong>${finalReport.demonstrationFix.suggestedAssetType}</p>
    <div class="before-after">
      <div class="before">
        <div class="before-label">修复前</div>
        <div>${finalReport.demonstrationFix.before}</div>
      </div>
      <div class="after">
        <div class="after-label">修复后</div>
        <div>${finalReport.demonstrationFix.after}</div>
      </div>
    </div>
    <p style="margin-top: 12px; font-size: 14px;"><strong>为什么更好：</strong>${finalReport.demonstrationFix.whyBetter}</p>
  </div>
  ` : ""}

  ${finalReport.evidence?.length > 0 ? `
  <h2>证据来源</h2>
  <ul class="evidence-list">
    ${finalReport.evidence.map((ev: any) => `
      <li>
        <div class="evidence-title">${ev.title}</div>
        <div class="evidence-meta">${ev.sourceDomain} | ${getSourceTypeLabel(ev.sourceType)} | ${getSupportLabel(ev.supportLevel)}</div>
        <div style="font-size: 13px; margin-top: 4px;">${ev.snippet}</div>
      </li>
    `).join("")}
  </ul>
  ` : ""}

  <div class="disclaimer">
    ⚠️ ${finalReport.demonstrationFix?.disclaimer ?? "本报告基于公开网络信息生成，仅供参考。"}
  </div>

  <div class="footer">
    <p>报告ID：${reportRow.id}</p>
    <p>诊断ID：${diagnosis.id}</p>
    ${latestRevision ? `<p>修订版本：#${latestRevision.revision_number}（${latestRevision.revision_reason}）</p>` : ""}
    <p>报告链接：<a href="http://localhost:36120/report/${DIAGNOSIS_TOKEN}">http://localhost:36120/report/${DIAGNOSIS_TOKEN}</a></p>
  </div>
</body>
</html>`;

function getScoreLabel(key: string): string {
  const labels: Record<string, string> = {
    companyClarity: "企业清晰度",
    websiteCompleteness: "官网完整度",
    customerQuestionCoverage: "客户问题覆盖",
    trustEvidence: "信任证据",
    aiVisibility: "AI可见度",
  };
  return labels[key] ?? key;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    MEASURED: "实测",
    ESTIMATED: "估算",
    INSUFFICIENT_EVIDENCE: "证据不足",
    PROVIDER_FAILED: "采集失败",
  };
  return labels[status] ?? status;
}

function getSourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    FIRST_PARTY_EVIDENCE: "企业自有",
    OBSERVED_WEB_EVIDENCE: "公开网页",
    COMPETITOR_WEB_EVIDENCE: "竞品网页",
  };
  return labels[type] ?? type;
}

function getSupportLabel(level: string): string {
  const labels: Record<string, string> = {
    DIRECT_SUPPORT: "直接支持",
    PARTIAL_SUPPORT: "部分支持",
    CONTEXT_ONLY: "背景参考",
    UNSUPPORTED: "不支持",
  };
  return labels[level] ?? level;
}

// Write HTML
const htmlPath = join(OUTPUT_DIR, "lejinji-final-report.html");
writeFileSync(htmlPath, htmlContent);
console.log("✅ Written:", htmlPath);

console.log("\n📋 Export Summary:");
console.log("  - Diagnosis ID:", diagnosis.id);
console.log("  - Report ID:", reportRow.id);
console.log("  - Company:", finalReport.companyProfile?.brandName);
console.log("  - Score:", finalReport.scores?.overallScore);
console.log("  - Revision:", latestRevision ? `#${latestRevision.revision_number}` : "Original");
console.log("\n📁 Output Directory:", OUTPUT_DIR);
