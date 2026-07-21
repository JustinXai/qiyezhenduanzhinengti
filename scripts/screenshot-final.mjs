import { chromium } from '@playwright/test';
import * as fs from 'fs';

const BASE = 'http://localhost:3701';
const OUT = 'E:/企业诊断智能体_private/final-product-review';
const TOKEN = 'tok_eece7b9e61004a899f4013d5bf0f7dee';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: null });

  const desktop = async (name, url, opts = {}) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/${name}`, fullPage: opts.fullPage ?? false });
    const body = await page.evaluate(() => document.body.scrollHeight);
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    await page.close();
    return { height: body, overflow };
  };

  const mobile = async (name, url) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
    await page.close();
  };

  console.log('=== HOME DESKTOP ===');
  const h1 = await desktop('01-home-desktop.png', `${BASE}/`, { fullPage: false });
  console.log('Height:', h1.height, 'Overflow:', h1.overflow);

  console.log('=== HOME MOBILE ===');
  await mobile('02-home-mobile.png', `${BASE}/`);

  console.log('=== REPORT PAGE DESKTOP (first fold) ===');
  const r1 = await desktop('03-report-first-page-desktop.png', `${BASE}/report/${TOKEN}`, { fullPage: false });
  console.log('Height:', r1.height, 'Overflow:', r1.overflow);

  console.log('=== REPORT PAGE DESKTOP (full) ===');
  const r2 = await desktop('04-report-full-desktop.png', `${BASE}/report/${TOKEN}`, { fullPage: true });
  console.log('Height:', r2.height, 'Overflow:', r2.overflow);

  console.log('=== REPORT MOBILE ===');
  await mobile('05-report-mobile.png', `${BASE}/report/${TOKEN}`);

  // Scroll report to specific sections - use page.evaluate to scroll by position
  const reportPage = await context.newPage();
  await reportPage.setViewportSize({ width: 1440, height: 900 });
  await reportPage.goto(`${BASE}/report/${TOKEN}`, { waitUntil: 'networkidle' });
  await reportPage.waitForTimeout(1000);

  // Get page height and scroll to sections at 1/3, 2/3, and near end
  const pageHeight = await reportPage.evaluate(() => document.body.scrollHeight);
  console.log('Report page height:', pageHeight);

  // Section 05 - scroll to 35% of page
  await reportPage.evaluate((pct) => window.scrollTo(0, document.body.scrollHeight * pct), 0.35);
  await reportPage.waitForTimeout(800);
  await reportPage.screenshot({ path: `${OUT}/06-opportunity-map.png`, fullPage: false });
  const section05Text = await reportPage.locator('body').textContent();
  console.log('06 contains 05:', section05Text.includes('05'));
  console.log('06 contains 机会:', section05Text.includes('机会'));

  // Section 08 - scroll to 75% of page
  await reportPage.evaluate((pct) => window.scrollTo(0, document.body.scrollHeight * pct), 0.75);
  await reportPage.waitForTimeout(800);
  await reportPage.screenshot({ path: `${OUT}/07-service-direction.png`, fullPage: false });
  const section08Text = await reportPage.locator('body').textContent();
  console.log('07 contains 08:', section08Text.includes('08'));

  // Section 09 - scroll to 90% of page
  await reportPage.evaluate((pct) => window.scrollTo(0, document.body.scrollHeight * pct), 0.90);
  await reportPage.waitForTimeout(800);
  await reportPage.screenshot({ path: `${OUT}/08-evidence-section.png`, fullPage: false });
  const section09Text = await reportPage.locator('body').textContent();
  console.log('08 contains 09:', section09Text.includes('09'));

  await reportPage.close();

  // Check HTML for forbidden content
  const html = fs.readFileSync('C:/Users/Administrator/.cursor/projects/e-worktrees/agent-tools/report-fresh.html', 'utf8');
  const checks = {
    '星媄数据': html.includes('星媄数据'),
    '凡间AI': html.includes('凡间AI'),
    'deepseek': html.toLowerCase().includes('deepseek'),
    'English_fields': /data-testid|data-[a-z]+=/.test(html),
  };

  console.log('\n=== CONTENT CHECKS ===');
  Object.entries(checks).forEach(([k, v]) => console.log(`${k}: ${v ? 'FOUND' : 'MISSING'}`));

  await browser.close();
  console.log('\n=== DONE ===');
  console.log('HOME height:', h1.height, 'overflow:', h1.overflow);
  console.log('REPORT full height:', r2.height, 'overflow:', r2.overflow);
}

main().catch(e => { console.error(e); process.exit(1); });
