import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const campaignId = process.env.WF_CAMPAIGN_PLAY_ID;
if (!campaignId) {
  throw new Error("WF_CAMPAIGN_PLAY_ID must name a persisted campaign.");
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const outputDirectory = path.resolve(
  process.env.WF_CAMPAIGN_PLAY_CAPTURE_DIR
    ?? path.join(repositoryRoot, "output", "playwright", "campaign-play"),
);
const baseUrl = process.env.WF_CAMPAIGN_PLAY_BASE_URL ?? "http://localhost:3000";
const campaignPath = `/campaign/${encodeURIComponent(campaignId)}/play`;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "narrow", width: 390, height: 844 },
];

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: viewport.width, height: viewport.height },
    });
    const failures = [];
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      failures.push(`request: ${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) failures.push(`response: ${response.status()} ${response.url()}`);
    });

    await page.goto(new URL(campaignPath, baseUrl), { waitUntil: "networkidle" });
    await page.locator(".campaign-play-page").waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(outputDirectory, `${campaignId}-${viewport.name}.png`),
      fullPage: true,
    });
    await page.close();

    if (failures.length > 0) {
      throw new Error(`${viewport.name} capture reported:\n${failures.join("\n")}`);
    }
  }
} finally {
  await browser.close();
}

console.log(`Campaign Play captures written to ${outputDirectory}`);
