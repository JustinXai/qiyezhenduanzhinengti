const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3701';
const OUTPUT_DIR = 'E:/企业诊断智能体_private/enterprise-report-final-review';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const screenshots = [];
    const errors = [];

    try {
        const reportUrl = `${BASE_URL}/report/tok_eece7b9e61004a899f4013d5bf0f7dee`;
        
        // Desktop screenshot: 1440x1000
        console.log('\n--- Desktop screenshot (1440x1000) ---');
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(reportUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1000);
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'enterprise-report-desktop-final.png'),
            fullPage: true
        });
        console.log('Saved: enterprise-report-desktop-final.png');
        screenshots.push('enterprise-report-desktop-final.png');

        // Mobile screenshots: 390x844 with deviceScaleFactor 2
        console.log('\n--- Mobile screenshots (390x844, scale 2) ---');
        await page.setViewportSize({ width: 390, height: 844, deviceScaleFactor: 2 });
        
        // Reload for mobile
        await page.goto(reportUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1000);

        // Scroll to top - Summary
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'mobile-01-summary.png'),
            fullPage: false
        });
        console.log('Saved: mobile-01-summary.png');
        screenshots.push('mobile-01-summary.png');

        // Scroll to middle - Demand and Competitor
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 4));
        await page.waitForTimeout(500);
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'mobile-02-demand-and-competitor.png'),
            fullPage: false
        });
        console.log('Saved: mobile-02-demand-and-competitor.png');
        screenshots.push('mobile-02-demand-and-competitor.png');

        // Scroll to content assets
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await page.waitForTimeout(500);
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'mobile-03-content-assets.png'),
            fullPage: false
        });
        console.log('Saved: mobile-03-content-assets.png');
        screenshots.push('mobile-03-content-assets.png');

        // Scroll to bottom - Roadmap and Evidence
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'mobile-04-roadmap-services-evidence.png'),
            fullPage: false
        });
        console.log('Saved: mobile-04-roadmap-services-evidence.png');
        screenshots.push('mobile-04-roadmap-services-evidence.png');

        // Full mobile page
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'enterprise-report-mobile-full.png'),
            fullPage: true
        });
        console.log('Saved: enterprise-report-mobile-full.png');
        screenshots.push('enterprise-report-mobile-full.png');

        // Verify dimensions
        console.log('\n--- Verifying screenshot dimensions ---');
        for (const name of screenshots) {
            const filePath = path.join(OUTPUT_DIR, name);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                // For PNG, we can't directly get dimensions, but we can verify file exists
                console.log(`${name}: ${(stats.size / 1024).toFixed(1)} KB`);
            }
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
