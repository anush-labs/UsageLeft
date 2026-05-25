const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 }
  });
  
  const filePath = `file://${path.resolve(__dirname, 'web/index.html')}`;
  await page.goto(filePath);
  
  // Wait a moment for fonts/styles to render
  await page.waitForTimeout(500);
  
  const screenshotPath = '/home/anushkrishna/.gemini/antigravity-cli/brain/650d59bc-0ccc-4d46-a360-48d3ec00f5e7/landing-page-screenshot.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  
  await browser.close();
  console.log(`Screenshot saved to ${screenshotPath}`);
})();
