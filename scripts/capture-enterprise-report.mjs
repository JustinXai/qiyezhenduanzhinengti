// Screenshot capture for enterprise report
import { chromium } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3701';
const TOKEN = process.env.REPORT_TOKEN || 'tok_eece7b9e61004a899f4013d5bf0f7dee';
const OUT_DIR = process.env.SCREENSHOT_OUT || 'E:/企业诊断智能体_private';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: null });

  const reportUrl = `${BASE_URL}/report/${TOKEN}`;

  // Desktop (1440px)
  const desktopPage = await context.newPage();
  await desktopPage.setViewportSize({ width: 1440, height: 900 });
  await desktopPage.goto(reportUrl, { waitUntil: 'networkidle' });
  await desktopPage.screenshot({ path: `${OUT_DIR}/enterprise-report-desktop.png`, fullPage: true });
  console.log('Desktop screenshot saved');
  await desktopPage.close();

  // Mobile (390px)
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto(reportUrl, { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: `${OUT_DIR}/enterprise-report-mobile.png`, fullPage: true });
  console.log('Mobile screenshot saved');
  await mobilePage.close();

  await browser.close();
  console.log('Done');
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
