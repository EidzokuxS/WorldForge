import { chromium } from 'playwright';

const SCREENSHOTS_DIR = 'R:/Projects/WorldForge/.planning/phases/12-e2e-qa-bug-fixing/screenshots';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Task 1: Health check via browser
  console.log('=== Task 1: Infrastructure health + Title screen ===');

  await page.goto('http://localhost:3001/api/health');
  const healthText = await page.textContent('body');
  console.log('Health response:', healthText);
  const healthJson = JSON.parse(healthText);
  console.log('Health check:', healthJson.status === 'ok' ? 'PASS' : 'FAIL');

  // Title screen
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-title-screen.png`, fullPage: true });
  console.log('Screenshot: 01-title-screen.png');

  // Check elements
  const title = await page.textContent('body');
  const hasWorldForge = title.toLowerCase().includes('worldforge') || title.toLowerCase().includes('world forge');
  console.log('WorldForge title visible:', hasWorldForge ? 'PASS' : 'FAIL');

  const newCampaignBtn = await page.$('text=New Campaign');
  console.log('New Campaign button:', newCampaignBtn ? 'PASS' : 'FAIL');

  const loadCampaignBtn = await page.$('text=Load Campaign');
  console.log('Load Campaign button:', loadCampaignBtn ? 'PASS' : 'FAIL');

  // Check dark theme
  const bgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  console.log('Body background color:', bgColor);
  // Dark theme = rgb values should be low
  const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    const [, r, g, b] = match.map(Number);
    console.log('Dark theme:', (r < 50 && g < 50 && b < 50) ? 'PASS' : 'FAIL (light background)');
  }

  console.log('Console errors:', consoleErrors.length === 0 ? 'NONE (PASS)' : consoleErrors);

  // Task 2: Settings page
  console.log('\n=== Task 2: Settings page full test cycle ===');

  await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-settings-page.png`, fullPage: true });
  console.log('Screenshot: 02-settings-page.png');

  // Check tabs
  const tabs = await page.$$eval('[role="tab"], button', buttons =>
    buttons.map(b => b.textContent.trim()).filter(t =>
      ['Providers', 'Roles', 'Images', 'Research'].some(tab => t.includes(tab))
    )
  );
  console.log('Found tabs:', tabs);
  console.log('All 4 tabs present:', tabs.length >= 4 ? 'PASS' : `FAIL (found ${tabs.length})`);

  // Check current settings state
  const settingsResponse = await page.evaluate(async () => {
    const res = await fetch('http://localhost:3001/api/settings');
    return res.json();
  });
  console.log('Current providers:', JSON.stringify(settingsResponse.providers?.map(p => p.name) || []));
  console.log('Current roles:', JSON.stringify(Object.fromEntries(
    Object.entries(settingsResponse.roles || {}).map(([k, v]) => [k, v?.providerId ? `${v.providerId}/${v.model}` : 'unset'])
  )));

  // Providers tab - check if GLM already exists
  const hasGLM = settingsResponse.providers?.some(p => p.name === 'GLM');
  console.log('GLM provider exists:', hasGLM);

  if (!hasGLM) {
    console.log('Adding GLM provider...');
    // Click Add Provider
    const addBtn = await page.$('text=Add Provider');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-add-provider-dialog.png`, fullPage: true });
      console.log('Screenshot: 03-add-provider-dialog.png');

      // Fill form - try various selectors
      const nameInput = await page.$('input[placeholder*="name" i], input[name="name"], #name');
      if (nameInput) {
        await nameInput.fill('GLM');
      }

      const baseUrlInput = await page.$('input[placeholder*="url" i], input[placeholder*="base" i], input[name="baseUrl"], input[name="baseURL"]');
      if (baseUrlInput) {
        await baseUrlInput.fill('https://api.z.ai/api/coding/paas/v4');
      }

      const apiKeyInput = await page.$('input[placeholder*="key" i], input[type="password"], input[name="apiKey"]');
      if (apiKeyInput) {
        await apiKeyInput.fill('757144ef2e494563b34af85524f6671a.59do31Ymom1vh3Ch');
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-provider-form-filled.png`, fullPage: true });
      console.log('Screenshot: 04-provider-form-filled.png');

      // Save
      const saveBtn = await page.$('button:has-text("Save"), button:has-text("Add"), button[type="submit"]');
      if (saveBtn) {
        await saveBtn.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-after-provider-save.png`, fullPage: true });
      console.log('Screenshot: 05-after-provider-save.png');
    } else {
      console.log('WARNING: Add Provider button not found');
    }
  }

  // Navigate to Roles tab
  console.log('Navigating to Roles tab...');
  const rolesTab = await page.$('text=Roles');
  if (rolesTab) {
    await rolesTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-roles-tab.png`, fullPage: true });
    console.log('Screenshot: 06-roles-tab.png');
  }

  // Navigate to Images tab
  console.log('Navigating to Images tab...');
  const imagesTab = await page.$('text=Images');
  if (imagesTab) {
    await imagesTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-images-tab.png`, fullPage: true });
    console.log('Screenshot: 07-images-tab.png');
  }

  // Navigate to Research tab
  console.log('Navigating to Research tab...');
  const researchTab = await page.$('text=Research');
  if (researchTab) {
    await researchTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-research-tab.png`, fullPage: true });
    console.log('Screenshot: 08-research-tab.png');
  }

  // Persistence check - reload
  console.log('\n=== Persistence check ===');
  await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-settings-reload.png`, fullPage: true });
  console.log('Screenshot: 09-settings-reload.png');

  const settingsAfterReload = await page.evaluate(async () => {
    const res = await fetch('http://localhost:3001/api/settings');
    return res.json();
  });
  console.log('Providers after reload:', JSON.stringify(settingsAfterReload.providers?.map(p => p.name) || []));
  console.log('Roles after reload:', JSON.stringify(Object.fromEntries(
    Object.entries(settingsAfterReload.roles || {}).map(([k, v]) => [k, v?.providerId ? `${v.providerId}/${v.model}` : 'unset'])
  )));

  // Test connection for each provider
  console.log('\n=== Provider connectivity ===');
  for (const provider of (settingsAfterReload.providers || [])) {
    try {
      const testRes = await page.evaluate(async (p) => {
        const res = await fetch('http://localhost:3001/api/providers/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: p.id, settings: await fetch('http://localhost:3001/api/settings').then(r => r.json()) })
        });
        return { status: res.status, body: await res.json() };
      }, provider);
      console.log(`Test ${provider.name}: status=${testRes.status}`, JSON.stringify(testRes.body).slice(0, 100));
    } catch (e) {
      console.log(`Test ${provider.name}: ERROR`, e.message);
    }
  }

  // Final console error check
  console.log('\nFinal console errors:', consoleErrors.length === 0 ? 'NONE' : JSON.stringify(consoleErrors));

  await browser.close();
  console.log('\n=== DONE ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
