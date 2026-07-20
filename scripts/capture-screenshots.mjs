// Capture 4 production-preview screenshots via Playwright.
// Output dir is OUTSIDE the repo per Round-8 FINAL MVP rule.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.env.SCREENSHOT_BASE ?? 'http://localhost:3701';
const OUT = process.env.SCREENSHOT_DIR ?? 'E:/企业诊断智能体_private/lejinji-real-canonical-v1';
const TOKEN = process.env.SCREENSHOT_TOKEN ?? 'tok_1e28531d23774261af449977b88d9319';

const targets = [
  { name: 'home-desktop.png', url: '/', viewport: { width: 1440, height: 900 } },
  { name: 'home-mobile.png',  url: '/', viewport: { width: 390,  height: 844 } },
  { name: 'quick-desktop.png', url: `/report/${TOKEN}`, viewport: { width: 1440, height: 900 } },
  { name: 'quick-mobile.png',  url: `/report/${TOKEN}`, viewport: { width: 390,  height: 844 } },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  for (const t of targets) {
    const ctx = await browser.newContext({ viewport: t.viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const url = `${BASE}${t.url}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    const out = `${OUT}/${t.name}`;
    await page.screenshot({ path: out, fullPage: true });
    console.log(`[ok] ${t.name}  ->  ${out}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('done');
