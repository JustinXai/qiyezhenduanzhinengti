// Screenshot capture script for MVP demo
import { chromium } from "@playwright/test";

const BASE_URL = "http://localhost:36120";
const OUTPUT_DIR = "E:\\企业诊断智能体_private\\quick-first-mvp-v1.2-final";
const REPORT_TOKEN = "tok_1e28531d23774261af449977b88d9319";

async function captureScreenshots() {
  console.log("Starting screenshot capture...");

  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Homepage Desktop
    console.log("Capturing homepage (desktop)...");
    const homeDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await homeDesktop.goto(BASE_URL, { waitUntil: "networkidle" });
    await homeDesktop.screenshot({ path: `${OUTPUT_DIR}\\home-desktop.png`, fullPage: true });
    await homeDesktop.close();

    // 2. Homepage Mobile
    console.log("Capturing homepage (mobile)...");
    const homeMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await homeMobile.goto(BASE_URL, { waitUntil: "networkidle" });
    await homeMobile.screenshot({ path: `${OUTPUT_DIR}\\home-mobile.png`, fullPage: true });
    await homeMobile.close();

    // 3. Form Desktop
    console.log("Capturing form (desktop)...");
    const formDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await formDesktop.goto(BASE_URL, { waitUntil: "networkidle" });
    await formDesktop.screenshot({ path: `${OUTPUT_DIR}\\form-desktop.png`, fullPage: true });
    await formDesktop.close();

    // 4. Report (Quick) Desktop
    console.log("Capturing Quick report (desktop)...");
    const reportUrl = `${BASE_URL}/report/${REPORT_TOKEN}`;
    const quickDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await quickDesktop.goto(reportUrl, { waitUntil: "networkidle" });
    await quickDesktop.screenshot({ path: `${OUTPUT_DIR}\\quick-desktop.png`, fullPage: true });
    await quickDesktop.close();

    // 5. Report (Quick) Mobile
    console.log("Capturing Quick report (mobile)...");
    const quickMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await quickMobile.goto(reportUrl, { waitUntil: "networkidle" });
    await quickMobile.screenshot({ path: `${OUTPUT_DIR}\\quick-mobile.png`, fullPage: true });
    await quickMobile.close();

    // 6. Evidence Desktop (with Evidence tab expanded)
    console.log("Capturing Evidence view (desktop)...");
    const evidenceDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await evidenceDesktop.goto(reportUrl, { waitUntil: "networkidle" });
    // Click Evidence tab
    try {
      await evidenceDesktop.getByRole("button", { name: /证据/ }).click({ timeout: 5000 });
      await evidenceDesktop.waitForTimeout(1000);
    } catch {
      console.log("Evidence button not found");
    }
    await evidenceDesktop.screenshot({ path: `${OUTPUT_DIR}\\evidence-desktop.png`, fullPage: true });
    await evidenceDesktop.close();

    // 7. Deep Desktop (with Deep tab expanded)
    console.log("Capturing Deep report (desktop)...");
    const deepDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await deepDesktop.goto(reportUrl, { waitUntil: "networkidle" });
    // Click Deep tab
    try {
      await deepDesktop.getByRole("button", { name: /完整诊断/ }).click({ timeout: 5000 });
      await deepDesktop.waitForTimeout(1000);
    } catch {
      console.log("Deep tab button not found");
    }
    await deepDesktop.screenshot({ path: `${OUTPUT_DIR}\\deep-desktop.png`, fullPage: true });
    await deepDesktop.close();

    // 8. Print Preview
    console.log("Capturing print preview...");
    const printPage = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
    await printPage.goto(reportUrl, { waitUntil: "networkidle" });
    await printPage.emulateMedia({ media: "print" });
    await printPage.screenshot({ path: `${OUTPUT_DIR}\\print-preview.png`, fullPage: true });
    await printPage.close();

    console.log("Screenshot capture completed!");
    console.log(`Screenshots saved to: ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
