const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3701';
const OUTPUT_DIR = 'E:/企业诊断智能体_private/enterprise-report-final-v2';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const viewports = {
    desktop: { width: 1280, height: 900, name: 'desktop' },
    mobile: { width: 390, height: 844, name: 'mobile' }
};

async function takeScreenshots(page, url, suffix, fullPage = true) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    for (const [key, viewport] of Object.entries(viewports)) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(500); // Wait for render
        await page.screenshot({
            path: path.join(OUTPUT_DIR, `${suffix}-${viewport.name}.png`),
            fullPage: fullPage
        });
        console.log(`Saved: ${suffix}-${viewport.name}.png`);
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const screenshots = [];
    const errors = [];

    try {
        // Use the existing report token from previous work
        const reportUrl = `${BASE_URL}/report/tok_eece7b9e61004a899f4013d5bf0f7dee`;
        
        console.log('\n--- Taking full page screenshots ---');
        await takeScreenshots(page, reportUrl, 'enterprise-report', true);
        screenshots.push('enterprise-report-desktop-v2.png', 'enterprise-report-mobile-v2.png');

        // Wait for page load
        await page.goto(reportUrl, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Section 1: Summary (scroll to top)
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        for (const [key, viewport] of Object.entries(viewports)) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.waitForTimeout(300);
            await page.screenshot({
                path: path.join(OUTPUT_DIR, `report-summary-v2-${viewport.name}.png`),
                fullPage: false
            });
            console.log(`Saved: report-summary-v2-${viewport.name}.png`);
            screenshots.push(`report-summary-v2-${viewport.name}.png`);
        }

        // Section 3: Opportunities (scroll to middle)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
        await page.waitForTimeout(500);
        for (const [key, viewport] of Object.entries(viewports)) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.waitForTimeout(300);
            await page.screenshot({
                path: path.join(OUTPUT_DIR, `report-opportunities-v2-${viewport.name}.png`),
                fullPage: false
            });
            console.log(`Saved: report-opportunities-v2-${viewport.name}.png`);
            screenshots.push(`report-opportunities-v2-${viewport.name}.png`);
        }

        // Section 6: Services (scroll to bottom third)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 2 / 3));
        await page.waitForTimeout(500);
        for (const [key, viewport] of Object.entries(viewports)) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.waitForTimeout(300);
            await page.screenshot({
                path: path.join(OUTPUT_DIR, `report-services-v2-${viewport.name}.png`),
                fullPage: false
            });
            console.log(`Saved: report-services-v2-${viewport.name}.png`);
            screenshots.push(`report-services-v2-${viewport.name}.png`);
        }

        // Section 7: Evidence (scroll to bottom)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
        // Click to expand evidence
        const evidenceBtn = page.locator('button:has-text("查看")');
        if (await evidenceBtn.count() > 0) {
            await evidenceBtn.click();
            await page.waitForTimeout(500);
        }
        for (const [key, viewport] of Object.entries(viewports)) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.waitForTimeout(300);
            await page.screenshot({
                path: path.join(OUTPUT_DIR, `report-evidence-v2-${viewport.name}.png`),
                fullPage: false
            });
            console.log(`Saved: report-evidence-v2-${viewport.name}.png`);
            screenshots.push(`report-evidence-v2-${viewport.name}.png`);
        }

    } catch (e) {
        errors.push(e.message);
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log(`\nScreenshots created (${screenshots.length}):`);
    screenshots.forEach(s => console.log(`  - ${s}`));
    
    if (errors.length > 0) {
        console.log(`\nErrors (${errors.length}):`);
        errors.forEach(e => console.log(`  - ${e}`));
    } else {
        console.log('\nNo errors encountered.');
    }
}

main().catch((err) => {
    console.error('[Screenshot] FAILED', err);
    process.exit(1);
});
