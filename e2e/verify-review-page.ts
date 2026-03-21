/**
 * Quick verification: navigate to review page and capture screenshots + verify sections
 */
import { chromium } from 'playwright';

const CAMPAIGN_ID = process.argv[2];
if (!CAMPAIGN_ID) { console.error('Usage: verify-review-page.ts <campaignId>'); process.exit(1); }

const BASE_URL = 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1280, height: 900 } }).then(c => c.newPage());

  await page.goto(`${BASE_URL}/campaign/${CAMPAIGN_ID}/review`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check what's on the page
  const bodyText = await page.textContent('body') ?? '';
  const bodyLower = bodyText.toLowerCase();

  // Check for key sections
  const sections = ['premise', 'location', 'faction', 'npc', 'lore'];
  for (const s of sections) {
    const found = bodyLower.includes(s);
    console.log(`[${found ? 'PASS' : 'FAIL'}] Section "${s}" in DOM: ${found}`);
  }

  // Check for specific location/faction/NPC names
  const names = ['Ironreach', 'Blackrock', 'Serrated Guild', 'Silas', 'Isolde'];
  for (const n of names) {
    const found = bodyText.includes(n);
    console.log(`[${found ? 'PASS' : 'FAIL'}] Content "${n}" found: ${found}`);
  }

  const ssDir = 'R:/Projects/WorldForge/e2e/screenshots';
  await page.screenshot({ path: `${ssDir}/w-review-top.png`, fullPage: false });

  // Scroll down to see more sections
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${ssDir}/w-review-mid.png`, fullPage: false });

  await page.evaluate(() => window.scrollBy(0, 2000));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${ssDir}/w-review-bottom.png`, fullPage: false });

  // Full page screenshot
  await page.screenshot({ path: `${ssDir}/w-review-full.png`, fullPage: true });

  console.log('\nScreenshots saved to e2e/screenshots/');

  await browser.close();
}

run().catch(err => { console.error(err); process.exit(1); });
