# BOSS Demo Runbook V1
# Enterprise Diagnosis Agent - Quick First MVP Demo

**Version:** 1.0
**Branch:** release/quick-first-mvp-v1
**Commit:** 594aea1e709f1695b948b9003aba41f32538e717
**Port:** 36120
**Company Demo Data:** 安徽乐锦记食品有限公司

---

## Prerequisites

### System Requirements
- Node.js >= 20
- pnpm package manager
- Windows PowerShell 5.1+ or PowerShell Core
- Network access to localhost:36120

### Environment Check
Before starting, verify the following:

```powershell
# 1. Check git branch
git branch --show-current
# Expected: release/quick-first-mvp-v1

# 2. Check database exists
Test-Path ./data/lejinji-canary.db
# Expected: True

# 3. Check DB has lejinji report
node -e "const db=require('better-sqlite3')('./data/lejinji-canary.db'); console.log(db.prepare(\"SELECT id FROM reports WHERE diagnosis_id='diag_577375be226c4c2f862af6e5bc6c8580'\").get()?.id)"
# Expected: 369855b3-5273-44e5-b8ca-f717b5fadb41
```

### Start the Demo Server

```powershell
# Using the launcher script (recommended)
.\scripts\start-enterprise-diagnosis-demo.ps1

# Or manually
npx next start -p 36120
```

### Health Check Commands

```powershell
# Check if server is running
Get-NetTCPConnection -LocalPort 36120

# Test homepage
Invoke-WebRequest -Uri http://localhost:36120/ -Method GET

# Test report endpoint
Invoke-WebRequest -Uri http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319 -Method GET
```

---

## Demo Sequence

### Step 1: Open Enterprise Diagnosis Homepage

**URL:** http://localhost:36120/

**What to show:**
- Clean, professional homepage for 企业诊断智能体
- Enterprise information collection form
- Explanation of the diagnosis process

**Talking points:**
> "This is our enterprise diagnosis platform. The process is simple - we collect basic information about the company, then our AI agents search the internet for public data to assess the company's digital presence and marketing opportunities."

**Screenshot guidance:** Full browser capture of homepage showing the main interface

---

### Step 2: View Enterprise Info Form

**URL:** http://localhost:36120/

**What to show:**
- Form fields for company information
- Industry/category selection
- Expected diagnosis duration notice

**Talking points:**
> "We only need basic information - company name and industry. The system will handle everything else automatically."

**Screenshot guidance:** Close-up of the form section with highlighted input fields

---

### Step 3: Explain Real Diagnosis Timing

**Talking points:**
> "A real diagnosis takes approximately 23 seconds. During this time, our agents:
> - Search multiple data sources simultaneously
> - Collect evidence about the company's public presence
> - Analyze marketing channel opportunities
> - Generate a comprehensive report with scores and recommendations"

**Demo shortcut:** Since we have pre-generated data for Lejinji, we can show the finished report directly

---

### Step 4: Open Lejinji Quick Report

**URL:** http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319

**What to show:**
- Full diagnosis report for 安徽乐锦记食品有限公司
- Overall score and category breakdown
- Quick summary section

**Talking points:**
> "Here's a completed diagnosis for 安徽乐锦记食品有限公司, a food manufacturing company. The report shows an overall score and breaks down performance across multiple dimensions."

**Screenshot guidance:** Full report page showing score card and summary

---

### Step 5: View Score and Measurement Composition

**URL:** http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319

**What to show:**
- Overall score with visual indicator
- Individual dimension scores (雷达图 if available)
- Score breakdown by category

**Talking points:**
> "The score is calculated from multiple dimensions. Each dimension has a specific weight and is based on evidence gathered from public sources."

**Screenshot guidance:** Score section with breakdown visualization

---

### Step 6: View Public Information Opportunities

**URL:** http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319

**What to show:**
- List of marketing channel opportunities
- Platform recommendations
- Opportunity categories

**Talking points:**
> "Based on the analysis, we identify specific opportunities where the company can improve its public presence. Each opportunity is backed by evidence from our research."

**Screenshot guidance:** Opportunities section with highlighted items

---

### Step 7: Expand Evidence View

**URL:** http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319

**What to show:**
- Expandable evidence sections
- Source citations
- Support levels for each claim

**Talking points:**
> "Every finding in this report is backed by evidence. We show the source, the authority level, and how strongly the evidence supports the conclusion. This is crucial for B2B trust."

**Screenshot guidance:** Expanded evidence panel with source details

---

### Step 8: Open Deep Report

**URL:** http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319

**Navigation:** Look for "Deep Report" or "详细报告" link/button

**What to show:**
- More comprehensive analysis
- Additional diagnostic dimensions
- Detailed recommendations

**Talking points:**
> "For companies that want deeper insights, we offer a comprehensive deep report with additional diagnostic dimensions and more detailed recommendations."

**Screenshot guidance:** Deep report page header and first section

---

### Step 9: Show CTA Section

**URL:** http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319

**What to show:**
- Call-to-action for full service
- Contact information
- Next steps

**Talking points:**
> "This report demonstrates our capability. For companies ready to take action, we offer a full service that includes implementation support and ongoing monitoring."

**Screenshot guidance:** CTA section with contact options

---

### Step 10: Show Print Version

**URL:** http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319

**Navigation:** Look for "Print" or "打印" button

**What to show:**
- Print-optimized layout
- Clean formatting for PDF export
- Professional presentation format

**Talking points:**
> "Reports can be printed or exported as PDF for sharing with stakeholders who may not have access to the live system."

**Screenshot guidance:** Print preview showing clean layout

---

## Troubleshooting Common Issues

### Server Won't Start

**Symptom:** Port 36120 already in use

**Solution:**
```powershell
# Find what's using the port
Get-NetTCPConnection -LocalPort 36120

# Kill the process if safe
Stop-Process -Id <PID> -Force
```

### Database Not Found

**Symptom:** DB validation fails

**Solution:**
- Verify working directory is the project root
- Check that ./data/lejinji-canary.db exists
- Ensure the database has the lejinji report data

### Report Page Returns 404

**Symptom:** Report endpoint not accessible

**Solution:**
1. Verify server is running: `Get-NetTCPConnection -LocalPort 36120`
2. Check server logs for errors
3. Restart server if needed

### Page Loads Slowly

**Symptom:** Initial page load takes > 5 seconds

**Solution:**
- This is normal for first request (SSR rendering)
- Subsequent pages load faster (static generation)
- Check network latency to localhost

---

## Demo Data Reference

| Field | Value |
|-------|-------|
| Company | 安徽乐锦记食品有限公司 |
| Diagnosis ID | diag_577375be226c4c2f862af6e5bc6c8580 |
| Report ID | 369855b3-5273-44e5-b8ca-f717b5fadb41 |
| Report Token | tok_1e28531d23774261af449977b88d9319 |
| Industry | 食品制造 |
| Source | Round 7 Canary |

---

## Quick Reference URLs

| Page | URL |
|------|-----|
| Homepage | http://localhost:36120/ |
| Lejinji Report | http://localhost:36120/report/tok_1e28531d23774261af449977b88d9319 |
| API - Diagnoses | http://localhost:36120/api/diagnoses |
| API - Diagnosis (ID) | http://localhost:36120/api/diagnoses/diag_577375be226c4c2f862af6e5bc6c8580 |

---

**Document Version:** 1.0
**Last Updated:** 2026-07-20
**Maintainer:** Enterprise Diagnosis Agent Team
