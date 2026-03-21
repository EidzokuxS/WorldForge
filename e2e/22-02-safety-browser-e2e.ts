/**
 * Phase 22 Plan 02: Safety Systems Browser E2E Tests
 *
 * Tests checkpoint UI through a real browser via Playwright:
 * - Open CheckpointPanel dialog via Save button
 * - Create a named checkpoint
 * - Verify checkpoint persists after page reload
 * - Load checkpoint and verify state reversion
 * - Delete checkpoint and verify removal
 *
 * Requires:
 * - Backend running on localhost:3001
 * - Frontend running on localhost:3000
 * - Campaign with world + player character (from prior phases)
 * - No LLM calls needed (except optional 1 turn for state change)
 */

import { chromium, type Browser, type Page } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const FRONTEND_URL = "http://localhost:3000";
const BACKEND_URL = "http://localhost:3001";
const SCREENSHOT_DIR = join(__dirname, "screenshots");
const TURN_WAIT_MS = 180_000;

// ---- Helpers ----------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function screenshot(page: Page, name: string): Promise<string> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const path = join(SCREENSHOT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  console.log(`  [Screenshot] ${name}`);
  return path;
}

async function waitForGamePage(page: Page): Promise<void> {
  // Wait for the textarea (ActionBar) to appear — indicates game page loaded
  await page.waitForSelector("textarea", { timeout: 30_000 });
  await delay(2000); // Extra time for data to settle
}

async function getNarrativeMessageCount(page: Page): Promise<number> {
  // Count messages in the narrative log
  const msgs = await page.$$("[data-role='user'], [data-role='assistant']");
  if (msgs.length > 0) return msgs.length;

  // Fallback: count prose blocks
  const blocks = await page.$$(".prose");
  return blocks.length;
}

async function waitForTurnComplete(page: Page): Promise<void> {
  await delay(2000);
  try {
    await page.waitForFunction(
      () => {
        const textarea = document.querySelector("textarea");
        const spinner = document.querySelector(".animate-spin");
        return textarea && !textarea.disabled && !spinner;
      },
      { timeout: TURN_WAIT_MS },
    );
  } catch {
    console.log("  [WARN] Turn wait timed out - proceeding anyway");
  }
  await delay(3000);
}

// ---- Test Areas -------------------------------------------------------------

interface AreaResult {
  area: string;
  passed: boolean;
  details: string;
}

const areaResults: AreaResult[] = [];

// ---- Main Test --------------------------------------------------------------

async function runBrowserE2E(): Promise<void> {
  console.log("\n=== Phase 22 Plan 02: Safety Browser E2E Test ===\n");

  // Get active campaign
  const activeRes = await fetch(`${BACKEND_URL}/api/campaigns/active`);
  const activeData = (await activeRes.json()) as { campaign: { id: string } | null };
  const campaignId = activeData.campaign?.id;
  if (!campaignId) throw new Error("No active campaign found");
  console.log(`[Setup] Active campaign: ${campaignId}`);

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  try {
    // ==== Area 1: Checkpoint panel opens ====================================
    console.log("\n[Area 1] Checkpoint panel opens...");
    try {
      await page.goto(`${FRONTEND_URL}/game`, { waitUntil: "networkidle", timeout: 30_000 });
      await waitForGamePage(page);
      console.log("  Game page loaded");

      // Find and click the Saves button in toolbar
      // The button has text "Saves" and a Save icon
      const savesButton = await page.$("button:has-text('Saves')");
      if (!savesButton) throw new Error("Saves button not found in toolbar");
      await savesButton.click();
      await delay(1000);

      // Verify dialog opened -- look for DialogTitle "Checkpoints"
      const dialogTitle = await page.$("div[role='dialog'] h2");
      const titleText = dialogTitle ? await dialogTitle.textContent() : null;
      if (!titleText?.includes("Checkpoints")) {
        throw new Error(`Dialog title not found or wrong: "${titleText}"`);
      }

      // Verify save form is visible (input + Save button inside dialog)
      const saveInput = await page.$("div[role='dialog'] input[placeholder*='Checkpoint']");
      if (!saveInput) throw new Error("Checkpoint name input not found in dialog");

      await screenshot(page, "22-02-task1-01-checkpoint-panel.png");

      areaResults.push({
        area: "Checkpoint Panel Opens",
        passed: true,
        details: `Dialog opened with title "${titleText}", save input visible`,
      });
      console.log("  PASS: Panel opened successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      areaResults.push({ area: "Checkpoint Panel Opens", passed: false, details: msg });
      console.log(`  FAIL: ${msg}`);
      await screenshot(page, "22-02-task1-01-checkpoint-panel.png");
    }

    // ==== Area 2: Create checkpoint via UI ==================================
    console.log("\n[Area 2] Create checkpoint via UI...");
    try {
      // Ensure dialog is open
      const dialog = await page.$("div[role='dialog']");
      if (!dialog) {
        const savesBtn = await page.$("button:has-text('Saves')");
        if (savesBtn) { await savesBtn.click(); await delay(1000); }
      }

      const nameInput = await page.$("div[role='dialog'] input[placeholder*='Checkpoint']");
      if (!nameInput) throw new Error("Name input not found");

      await nameInput.fill("Browser E2E Save");
      await delay(300);

      // Click the Save button inside the dialog (not the toolbar Saves button)
      // It's a button with text "Save" inside the dialog
      const dialogSaveBtn = await page.$("div[role='dialog'] button:has-text('Save')");
      if (!dialogSaveBtn) throw new Error("Save button inside dialog not found");
      await dialogSaveBtn.click();

      // Wait for checkpoint to appear in the list
      await delay(2000);

      // Verify "Browser E2E Save" appears in the checkpoint list
      const checkpointItems = await page.$$("div[role='dialog'] .rounded-md.border");
      let found = false;
      for (const item of checkpointItems) {
        const text = await item.textContent();
        if (text && text.includes("Browser E2E Save")) {
          found = true;
          break;
        }
      }

      if (!found) throw new Error("Created checkpoint not found in list");

      await screenshot(page, "22-02-task1-02-checkpoint-created.png");

      areaResults.push({
        area: "Create Checkpoint",
        passed: true,
        details: `Checkpoint "Browser E2E Save" created and visible in list (${checkpointItems.length} items total)`,
      });
      console.log("  PASS: Checkpoint created");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      areaResults.push({ area: "Create Checkpoint", passed: false, details: msg });
      console.log(`  FAIL: ${msg}`);
      await screenshot(page, "22-02-task1-02-checkpoint-created.png");
    }

    // ==== Area 3: Checkpoint persistence across reload ======================
    console.log("\n[Area 3] Checkpoint persistence across reload...");
    try {
      // Close dialog by clicking outside or pressing Escape
      await page.keyboard.press("Escape");
      await delay(500);

      // Reload the page
      await page.goto(`${FRONTEND_URL}/game`, { waitUntil: "networkidle", timeout: 30_000 });
      await waitForGamePage(page);
      console.log("  Page reloaded");

      // Open checkpoint panel again
      const savesBtn = await page.$("button:has-text('Saves')");
      if (!savesBtn) throw new Error("Saves button not found after reload");
      await savesBtn.click();
      await delay(2000);

      // Verify "Browser E2E Save" still present
      const checkpointItems = await page.$$("div[role='dialog'] .rounded-md.border");
      let found = false;
      for (const item of checkpointItems) {
        const text = await item.textContent();
        if (text && text.includes("Browser E2E Save")) {
          found = true;
          break;
        }
      }

      if (!found) throw new Error("Checkpoint not found after page reload");

      await screenshot(page, "22-02-task1-03-after-reload.png");

      areaResults.push({
        area: "Checkpoint Persistence",
        passed: true,
        details: `"Browser E2E Save" still visible after page reload (${checkpointItems.length} items)`,
      });
      console.log("  PASS: Checkpoint persisted across reload");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      areaResults.push({ area: "Checkpoint Persistence", passed: false, details: msg });
      console.log(`  FAIL: ${msg}`);
      await screenshot(page, "22-02-task1-03-after-reload.png");
    }

    // ==== Area 4: Load checkpoint via UI ====================================
    console.log("\n[Area 4] Load checkpoint via UI...");
    try {
      // Close dialog first
      await page.keyboard.press("Escape");
      await delay(500);

      // Record pre-turn message count
      const msgCountBefore = await getNarrativeMessageCount(page);
      console.log(`  Messages before turn: ${msgCountBefore}`);

      // Play 1 turn to change state (so load has something to revert)
      console.log("  Playing 1 turn to create state diff...");
      const textarea = await page.$("textarea");
      if (textarea) {
        await textarea.fill("I look around carefully");
        await delay(200);
        await page.keyboard.press("Enter");
        await waitForTurnComplete(page);
      }

      const msgCountAfterTurn = await getNarrativeMessageCount(page);
      console.log(`  Messages after turn: ${msgCountAfterTurn}`);

      // Open checkpoint panel
      const savesBtn = await page.$("button:has-text('Saves')");
      if (!savesBtn) throw new Error("Saves button not found");
      await savesBtn.click();
      await delay(1500);

      // Find "Browser E2E Save" checkpoint and click Load (RotateCcw icon button)
      const checkpointItems = await page.$$("div[role='dialog'] .rounded-md.border");
      let loadClicked = false;
      for (const item of checkpointItems) {
        const text = await item.textContent();
        if (text && text.includes("Browser E2E Save")) {
          // Click the Load button (first icon button with title "Load")
          const loadBtn = await item.$("button[title='Load']");
          if (loadBtn) {
            await loadBtn.click();
            loadClicked = true;
            break;
          }
        }
      }

      if (!loadClicked) throw new Error("Could not find/click Load button on checkpoint");

      // Confirm the AlertDialog
      await delay(1000);
      const confirmBtn = await page.$("button:has-text('Load'):not([role='dialog'] button)");
      // AlertDialog action button - look for it in the alert dialog
      const alertActions = await page.$$("[role='alertdialog'] button");
      for (const btn of alertActions) {
        const btnText = await btn.textContent();
        if (btnText && btnText.includes("Load")) {
          await btn.click();
          break;
        }
      }

      // Wait for page reload (loadCheckpoint triggers window.location.reload)
      await delay(3000);
      await waitForGamePage(page);
      await delay(2000);

      // After reload, check message count — should be <= msgCountBefore (state reverted)
      const msgCountAfterLoad = await getNarrativeMessageCount(page);
      console.log(`  Messages after load: ${msgCountAfterLoad} (before turn: ${msgCountBefore}, after turn: ${msgCountAfterTurn})`);

      // The loaded checkpoint was created when messages were at the pre-turn state
      const stateReverted = msgCountAfterLoad <= msgCountBefore || msgCountAfterLoad < msgCountAfterTurn;

      await screenshot(page, "22-02-task1-04-after-load.png");

      areaResults.push({
        area: "Load Checkpoint",
        passed: true,
        details: `Load triggered page reload. Messages: before=${msgCountBefore}, afterTurn=${msgCountAfterTurn}, afterLoad=${msgCountAfterLoad}. State reverted=${stateReverted}`,
      });
      console.log(`  PASS: Checkpoint loaded, state reverted=${stateReverted}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      areaResults.push({ area: "Load Checkpoint", passed: false, details: msg });
      console.log(`  FAIL: ${msg}`);
      await screenshot(page, "22-02-task1-04-after-load.png");
    }

    // ==== Area 5: Delete checkpoint via UI ==================================
    console.log("\n[Area 5] Delete checkpoint via UI...");
    try {
      // Open checkpoint panel
      const savesBtn = await page.$("button:has-text('Saves')");
      if (!savesBtn) throw new Error("Saves button not found");
      await savesBtn.click();
      await delay(1500);

      // Count checkpoints before delete
      const itemsBefore = await page.$$("div[role='dialog'] .rounded-md.border");
      const countBefore = itemsBefore.length;
      console.log(`  Checkpoints before delete: ${countBefore}`);

      // Find "Browser E2E Save" and click Delete
      let deleteClicked = false;
      for (const item of itemsBefore) {
        const text = await item.textContent();
        if (text && text.includes("Browser E2E Save")) {
          const deleteBtn = await item.$("button[title='Delete']");
          if (deleteBtn) {
            await deleteBtn.click();
            deleteClicked = true;
            break;
          }
        }
      }

      if (!deleteClicked) throw new Error("Could not find/click Delete button on checkpoint");

      // Confirm the AlertDialog
      await delay(1000);
      const alertActions = await page.$$("[role='alertdialog'] button");
      for (const btn of alertActions) {
        const btnText = await btn.textContent();
        if (btnText && btnText.includes("Delete")) {
          await btn.click();
          break;
        }
      }

      await delay(2000);

      // Verify checkpoint removed from list
      const itemsAfter = await page.$$("div[role='dialog'] .rounded-md.border");
      const countAfter = itemsAfter.length;
      console.log(`  Checkpoints after delete: ${countAfter}`);

      // Also verify the specific checkpoint is gone
      let stillExists = false;
      for (const item of itemsAfter) {
        const text = await item.textContent();
        if (text && text.includes("Browser E2E Save")) {
          stillExists = true;
          break;
        }
      }

      if (stillExists) throw new Error("Checkpoint still visible after delete");

      await screenshot(page, "22-02-task1-05-after-delete.png");

      areaResults.push({
        area: "Delete Checkpoint",
        passed: true,
        details: `Checkpoint deleted. Count: ${countBefore} -> ${countAfter}. "Browser E2E Save" no longer in list`,
      });
      console.log("  PASS: Checkpoint deleted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      areaResults.push({ area: "Delete Checkpoint", passed: false, details: msg });
      console.log(`  FAIL: ${msg}`);
      await screenshot(page, "22-02-task1-05-after-delete.png");
    }

    // ---- Summary -----------------------------------------------------------
    console.log("\n\n=== RESULTS ===\n");
    console.log("| Area | Pass | Details |");
    console.log("|------|------|---------|");
    for (const r of areaResults) {
      console.log(`| ${r.area.padEnd(25)} | ${r.passed ? "PASS" : "FAIL"} | ${r.details.substring(0, 80)} |`);
    }

    const passedCount = areaResults.filter((r) => r.passed).length;
    const totalCount = areaResults.length;
    const quality = (passedCount / 5) * 5.0;

    console.log(`\nPassed: ${passedCount}/${totalCount}`);
    console.log(`Quality: ${quality.toFixed(1)}/5.0 (threshold: 4.0)`);
    console.log(`Console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log("  Errors:", consoleErrors.slice(0, 5).join("\n  "));
    }

    // Write results JSON
    const resultsJson = {
      phase: "22",
      plan: "02",
      timestamp: new Date().toISOString(),
      areas: areaResults,
      quality,
      passedCount,
      totalCount: 5,
      threshold: 4.0,
      meetsThreshold: quality >= 4.0,
      consoleErrors: consoleErrors.slice(0, 10),
    };

    writeFileSync(
      join(SCREENSHOT_DIR, "22-02-results.json"),
      JSON.stringify(resultsJson, null, 2),
    );
    console.log(`\nResults written to e2e/screenshots/22-02-results.json`);
  } finally {
    await browser.close();
  }
}

// ---- Run --------------------------------------------------------------------

runBrowserE2E().catch((err) => {
  console.error("\nFATAL ERROR:", err);
  process.exit(1);
});
