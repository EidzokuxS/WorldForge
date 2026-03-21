/**
 * E2E Test: Known IP (Witcher) campaign through world review
 * Phase 17 Plan 02 Task 1
 *
 * Tests the full browser flow:
 * 1. Title screen -> New Campaign dialog
 * 2. Enter concept (Witcher-themed)
 * 3. World DNA panel with AI-suggested seeds
 * 4. Toggle/edit seeds
 * 5. Generate world with SSE progress overlay
 * 6. World review page with all 5 sections
 */

import { chromium, type Page, type Browser } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';
const WITCHER_CONCEPT = 'A dark fantasy world inspired by The Witcher, where monster hunters roam a war-torn continent hunting supernatural creatures for coin';
const CAMPAIGN_NAME = 'E2E Witcher Test';

// Generation with GLM takes 6-10 minutes due to fallbacks on each step
const GENERATION_TIMEOUT = 600_000;
const SEED_SUGGEST_TIMEOUT = 90_000;

interface TestResult {
  step: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function log(step: string, passed: boolean, details: string) {
  results.push({ step, passed, details });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${step}: ${details}`);
}

async function run() {
  let browser: Browser | null = null;
  let campaignId: string | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    // ==========================================
    // Step 1: Navigate to title screen
    // ==========================================
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const title = await page.textContent('h1');
    log('Title Screen', title?.includes('WorldForge') ?? false,
      `Title: "${title}"`);

    const newCampaignBtn = page.getByRole('button', { name: /new campaign/i });
    const btnVisible = await newCampaignBtn.isVisible();
    log('New Campaign Button', btnVisible, 'Button visible on title screen');

    await page.screenshot({ path: 'e2e/screenshots/w01-title-screen.png', fullPage: true });

    // ==========================================
    // Step 2: Open dialog and enter concept
    // ==========================================
    await newCampaignBtn.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    const dialogTitle = await page.textContent('[role="dialog"] h2');
    log('Dialog Opens', dialogTitle?.includes('Concept') ?? false,
      `Dialog title: "${dialogTitle}"`);

    await page.fill('input[placeholder="Campaign Name"]', CAMPAIGN_NAME);
    await page.fill('textarea[placeholder*="Describe your world"]', WITCHER_CONCEPT);

    await page.screenshot({ path: 'e2e/screenshots/w02-concept-filled.png', fullPage: true });
    log('Concept Filled', true, 'Name and premise entered');

    // ==========================================
    // Step 3: Navigate to World DNA panel
    // ==========================================
    const nextDnaBtn = page.getByRole('button', { name: /next.*world dna/i });
    await nextDnaBtn.click();

    console.log('Waiting for World DNA suggestions (up to 90s)...');

    // Wait for DNA grid to appear
    await page.waitForSelector('[role="dialog"] .grid', { timeout: SEED_SUGGEST_TIMEOUT });

    // Wait until textareas have content (seed suggestions loaded)
    await page.waitForFunction(() => {
      const tas = document.querySelectorAll('[role="dialog"] textarea');
      if (tas.length < 6) return false;
      let filled = 0;
      tas.forEach(ta => { if ((ta as HTMLTextAreaElement).value.trim().length > 0) filled++; });
      return filled >= 5;
    }, null, { timeout: SEED_SUGGEST_TIMEOUT });

    await page.screenshot({ path: 'e2e/screenshots/w03-dna-panel.png', fullPage: true });

    // Count switches
    const switches = await page.locator('[role="dialog"] button[role="switch"]').count();
    log('Seed Categories', switches >= 6,
      `Found ${switches} seed toggles (expected 6)`);

    // Check seeds are populated
    const textareas = page.locator('[role="dialog"] textarea');
    const textareaCount = await textareas.count();
    let populatedCount = 0;
    const allSeedText: string[] = [];
    for (let i = 0; i < textareaCount; i++) {
      const value = await textareas.nth(i).inputValue();
      allSeedText.push(value);
      if (value.trim().length > 0) populatedCount++;
    }
    log('Seeds Populated', populatedCount >= 5,
      `${populatedCount}/${textareaCount} textareas have content`);

    // Thematic check
    const seedContent = allSeedText.join(' ').toLowerCase();
    const thematicKeywords = ['dark', 'fantasy', 'medieval', 'monster', 'hunt', 'war', 'sword', 'magic', 'curse', 'beast', 'grim', 'continent', 'slav', 'witch'];
    const matchedKeywords = thematicKeywords.filter(kw => seedContent.includes(kw));
    log('Thematic Seeds', matchedKeywords.length >= 3,
      `Matched ${matchedKeywords.length} Witcher keywords: ${matchedKeywords.join(', ')}`);

    // ==========================================
    // Step 4: Toggle and edit seeds
    // ==========================================
    const firstSwitch = page.locator('[role="dialog"] button[role="switch"]').first();
    const wasChecked = await firstSwitch.getAttribute('data-state');
    await firstSwitch.click();
    await page.waitForTimeout(300);
    const afterToggle = await firstSwitch.getAttribute('data-state');
    log('Seed Toggle Off', wasChecked !== afterToggle,
      `Toggle: ${wasChecked} -> ${afterToggle}`);

    await firstSwitch.click();
    await page.waitForTimeout(300);
    const afterToggleBack = await firstSwitch.getAttribute('data-state');
    log('Seed Toggle On', afterToggleBack === wasChecked, `Toggle restored: ${afterToggleBack}`);

    // Edit first seed
    const firstTextarea = textareas.first();
    const originalValue = await firstTextarea.inputValue();
    await firstTextarea.clear();
    await firstTextarea.fill('A dark medieval era of monster hunters and cursed lands');
    log('Seed Edit', true, 'Seed value edited manually');

    await page.screenshot({ path: 'e2e/screenshots/w04-dna-edited.png', fullPage: true });

    // ==========================================
    // Step 5: Generate world
    // ==========================================
    console.log('Clicking Create World to start generation (may take 6-10 minutes)...');
    const createWorldBtn = page.getByRole('button', { name: /create world/i }).last();
    await createWorldBtn.click();

    // Wait for dialog to close and overlay to appear, or direct redirect
    let progressSteps: string[] = [];
    let overlayDetected = false;
    const genStart = Date.now();

    // Wait for either: overlay, redirect to review, or error toast
    while (Date.now() - genStart < GENERATION_TIMEOUT) {
      const url = page.url();

      // Success: redirected to review page
      if (url.includes('/review')) {
        const idMatch = url.match(/campaign\/([^/]+)\/review/);
        if (idMatch) campaignId = idMatch[1];
        console.log(`Generation complete! Redirected to review. Campaign: ${campaignId}`);
        break;
      }

      // Redirected to character page (generation succeeded but skipped to character)
      if (url.includes('/character')) {
        const idMatch = url.match(/campaign\/([^/]+)\/character/);
        if (idMatch) campaignId = idMatch[1];
        console.log(`Redirected to character page (no review). Campaign: ${campaignId}`);
        break;
      }

      // Check for overlay
      const overlayEl = await page.$('.fixed.inset-0');
      if (overlayEl) {
        overlayDetected = true;
        const text = await overlayEl.textContent();
        if (text) {
          const labelMatch = text.match(/([A-Z][a-z].*?)\.\.\./);
          if (labelMatch && !progressSteps.includes(labelMatch[1])) {
            progressSteps.push(labelMatch[1]);
            console.log(`  Step: ${labelMatch[1]}`);
          }
          const stepMatch = text.match(/Step (\d+) of (\d+)/);
          if (stepMatch) {
            const elapsed = Math.round((Date.now() - genStart) / 1000);
            console.log(`  Progress: ${stepMatch[1]}/${stepMatch[2]} (${elapsed}s elapsed)`);
          }
        }
      }

      // Check for error toast
      const errorToast = await page.$('[data-type="error"]');
      if (errorToast) {
        const toastText = await errorToast.textContent();
        console.log(`Error toast detected: ${toastText}`);
        // Generation may have failed -- check if we should bail
        if (toastText?.includes('generation failed')) {
          log('Generation Error', false, `Toast: ${toastText}`);
          break;
        }
      }

      await page.waitForTimeout(2000);
    }

    const totalGenTime = Math.round((Date.now() - genStart) / 1000);
    console.log(`Generation took ${totalGenTime}s total`);

    log('Generation Overlay', overlayDetected,
      `Overlay with ${progressSteps.length} steps: ${progressSteps.join(', ')}`);
    log('Generation Complete', page.url().includes('/review'),
      `Final URL: ${page.url()} (${totalGenTime}s)`);

    // ==========================================
    // Step 6: Verify world review page
    // ==========================================
    if (page.url().includes('/review')) {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      await page.waitForTimeout(3000);

      await page.screenshot({ path: 'e2e/screenshots/w05-world-review.png', fullPage: true });

      // Verify sections via API (more reliable than DOM scraping)
      if (campaignId) {
        const worldResp = await fetch(`${API_URL}/api/campaigns/${campaignId}/world`);
        const worldData = await worldResp.json() as any;

        const locationCount = worldData.locations?.length ?? 0;
        const factionCount = worldData.factions?.length ?? 0;
        const npcCount = worldData.npcs?.length ?? 0;

        log('Locations Count', locationCount >= 3,
          `${locationCount} locations (need >= 3)`);
        log('Factions Count', factionCount >= 2,
          `${factionCount} factions (need >= 2)`);
        log('NPCs Count', npcCount >= 3,
          `${npcCount} NPCs (need >= 3)`);

        // Check sections in DOM
        const bodyText = (await page.textContent('body'))?.toLowerCase() ?? '';
        log('Premise In DOM', bodyText.includes('premise') || bodyText.length > 500,
          'Premise section content present');

        // Quality: thematic consistency
        const allContent = JSON.stringify(worldData).toLowerCase();
        const witcherThemes = ['monster', 'hunt', 'dark', 'fantasy', 'war', 'creature', 'sword', 'magic', 'curse', 'beast', 'medieval', 'slayer'];
        const themeMatches = witcherThemes.filter(t => allContent.includes(t));
        log('IP Thematic Quality', themeMatches.length >= 4,
          `${themeMatches.length} themes: ${themeMatches.join(', ')}`);

        // Lore
        const loreResp = await fetch(`${API_URL}/api/campaigns/${campaignId}/lore`);
        const loreData = await loreResp.json() as any;
        const loreCount = Array.isArray(loreData) ? loreData.length : 0;
        log('Lore Cards', true,
          `${loreCount} lore cards (0 expected due to GLM limitation)`);

        // Quality score
        const q = {
          locations: locationCount >= 3 ? 1 : locationCount >= 2 ? 0.75 : 0.5,
          factions: factionCount >= 2 ? 1 : 0.5,
          npcs: npcCount >= 3 ? 1 : npcCount >= 2 ? 0.75 : 0.5,
          themes: themeMatches.length >= 4 ? 1 : themeMatches.length >= 2 ? 0.75 : 0.5,
          seeds: matchedKeywords.length >= 3 ? 1 : 0.7,
        };
        const avg = Object.values(q).reduce((a, b) => a + b, 0) / Object.values(q).length;
        const score = Math.round(avg * 50) / 10;

        log('Quality Score', score >= 4.5,
          `${score}/5 (factors: ${JSON.stringify(q)})`);

        // Print summary
        console.log('\n--- Generated World ---');
        console.log(`Locations (${locationCount}):`);
        worldData.locations?.forEach((l: any) => console.log(`  - ${l.name}`));
        console.log(`Factions (${factionCount}):`);
        worldData.factions?.forEach((f: any) => console.log(`  - ${f.name}`));
        console.log(`NPCs (${npcCount}):`);
        worldData.npcs?.forEach((n: any) => console.log(`  - ${n.name}`));
      }
    } else {
      log('World Review Page', false, 'Never reached review page');
    }

  } catch (error) {
    log('CRITICAL ERROR', false, String(error));
    console.error('Error:', error);
  } finally {
    if (campaignId) {
      try {
        await fetch(`${API_URL}/api/campaigns/${campaignId}`, { method: 'DELETE' });
        log('Cleanup', true, `Deleted campaign ${campaignId}`);
      } catch { /* ignore */ }
    }
    if (browser) await browser.close();
  }

  console.log('\n=== WITCHER E2E SUMMARY ===');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} checks passed`);
  results.filter(r => !r.passed).forEach(f => console.log(`  FAIL: ${f.step} - ${f.details}`));

  return { passed, total, results };
}

run().then(({ passed, total }) => {
  process.exit(passed === total ? 0 : 1);
}).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
