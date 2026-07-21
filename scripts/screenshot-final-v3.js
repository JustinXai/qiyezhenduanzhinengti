const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3701';
const OUTPUT_DIR = 'E:/企业诊断智能体_private/enterprise-report-final-v3';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    
    // Desktop context
    const desktopContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1
    });
    const desktopPage = await desktopContext.newPage();
    
    // Mobile HD context with deviceScaleFactor 2
    const mobileContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true
    });
    const mobilePage = await mobileContext.newPage();
    
    const screenshots = [];
    const errors = [];

    try {
        const reportUrl = `${BASE_URL}/report/tok_eece7b9e61004a899f4013d5bf0f7dee`;
        
        // Desktop screenshot
        console.log('\n--- Desktop screenshot (1440px) ---');
        await desktopPage.goto(reportUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await desktopPage.waitForTimeout(1000);
        await desktopPage.screenshot({
            path: path.join(OUTPUT_DIR, 'desktop-final-v3.png'),
            fullPage: true
        });
        console.log('Saved: desktop-final-v3.png');
        screenshots.push('desktop-final-v3.png');

        // Mobile HD screenshots
        console.log('\n--- Mobile HD screenshots (780px with scale 2) ---');
        await mobilePage.goto(reportUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await mobilePage.waitForTimeout(1000);

        // Scroll to top - Summary
        await mobilePage.evaluate(() => window.scrollTo(0, 0));
        await mobilePage.waitForTimeout(500);
        await mobilePage.screenshot({
            path: path.join(OUTPUT_DIR, 'mobile-hd-01-summary.png'),
            fullPage: false
        });
        console.log('Saved: mobile-hd-01-summary.png');
        screenshots.push('mobile-hd-01-summary.png');

        // Scroll to middle-upper - Needs
        await mobilePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 4));
        await mobilePage.waitForTimeout(500);
        await mobilePage.screenshot({
            path: path.join(OUTPUT_DIR, 'mobile-hd-02-needs.png'),
            fullPage: false
        });
        console.log('Saved: mobile-hd-02-needs.png');
        screenshots.push('mobile-hd-02-needs.png');

        // Scroll to middle - Content assets
        await mobilePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await mobilePage.waitForTimeout(500);
        await mobilePage.screenshot({
            path: path.join(OUTPUT_DIR, 'mobile-hd-03-assets.png'),
            fullPage: false
        });
        console.log('Saved: mobile-hd-03-assets.png');
        screenshots.push('mobile-hd-03-assets.png');

        // Scroll to bottom - Roadmap and Evidence
        await mobilePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.8));
        await mobilePage.waitForTimeout(500);
        await mobilePage.screenshot({
            path: path.join(OUTPUT_DIR, 'mobile-hd-04-roadmap-evidence.png'),
            fullPage: false
        });
        console.log('Saved: mobile-hd-04-roadmap-evidence.png');
        screenshots.push('mobile-hd-04-roadmap-evidence.png');

    } catch (e) {
        errors.push(e.message);
        console.error('Error:', e.message);
    } finally {
        await desktopContext.close();
        await mobileContext.close();
        await browser.close();
    }

    // Verify dimensions
    console.log('\n--- Verifying screenshot dimensions ---');
    for (const name of screenshots) {
        const filePath = path.join(OUTPUT_DIR, name);
        if (fs.existsSync(filePath)) {
            const buffer = fs.readFileSync(filePath);
            // PNG width at bytes 16-19, height at 20-23
            const width = buffer.readUInt32BE(16);
            const height = buffer.readUInt32BE(20);
            console.log(`${name}: ${width} x ${height} px`);
        }
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
