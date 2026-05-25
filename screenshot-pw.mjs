import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "light-mode.png");

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 400, height: 560 },
  colorScheme: "light",
});
const page = await ctx.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") console.error("PAGE:", msg.text().slice(0, 120));
});
page.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 120)));

// Serve the static preview file via vite devserver
await page.goto("http://localhost:5173/preview-light.html", { waitUntil: "networkidle" });

await page.waitForTimeout(600);

await page.screenshot({ path: OUT, fullPage: false, omitBackground: false });
await browser.close();
console.log("Screenshot saved:", OUT);
