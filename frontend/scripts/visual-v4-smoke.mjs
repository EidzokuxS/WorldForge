import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outDir = path.join(repoRoot, "output", "playwright", "v4-visual-smoke");
const baseUrl = process.env.WF_VISUAL_BASE_URL ?? "http://localhost:3000";
const apiBaseUrl = process.env.WF_VISUAL_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
const flowSessionKey = "worldforge.campaign-new-flow";
const onlyPages = new Set((process.env.WF_VISUAL_ONLY ?? "").split(",").map((name) => name.trim()).filter(Boolean));
const reviewPath = process.env.WF_VISUAL_REVIEW_PATH;
const viewports = [
  { name: "2048", width: 2048, height: 1152 },
  { name: "2560", width: 2560, height: 1440 },
];

const pages = [
  { name: "home", path: "/", assert: assertHome },
  { name: "campaign-new", path: "/campaign/new", assert: assertForge },
  { name: "campaign-dna-suggesting", path: "/campaign/new", prepare: seedSuggestingFlow, assert: assertDnaSuggestion },
  { name: "campaign-dna-ready", path: "/campaign/new/dna", prepare: seedDnaReadyFlow, assert: assertDnaReady },
  { name: "campaign-generating", path: "/campaign/new/dna", prepare: seedGeneratingFlow, assert: assertGeneration },
  { name: "game", path: "/game", prepare: prepareGameRoute, assert: assertGame },
  { name: "library", path: "/library", assert: assertPageShell },
  { name: "settings", path: "/settings", assert: assertPageShell },
];

if (reviewPath) {
  pages.push({ name: "review", path: reviewPath, assert: assertReview });
}

const selectedPages = onlyPages.size > 0 ? pages.filter((page) => onlyPages.has(page.name)) : pages;
if (selectedPages.length === 0) {
  throw new Error(`No V4 visual smoke pages matched WF_VISUAL_ONLY=${Array.from(onlyPages).join(",")}`);
}

const failures = [];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });
const page = await context.newPage();

for (const viewport of viewports) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  for (const route of selectedPages) {
    const url = new URL(route.path, baseUrl).toString();
    await prepareRoute(page, route.prepare);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(outDir, `${route.name}-${viewport.name}.png`),
      fullPage: true,
    });

    await collect(route.assert(page, viewport, route.name), `${route.name}@${viewport.name}`);
  }
}

await browser.close();

if (failures.length > 0) {
  console.error("V4 visual smoke failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(`Screenshots: ${outDir}`);
  process.exit(1);
}

console.log(`V4 visual smoke passed. Screenshots: ${outDir}`);

async function collect(check, label) {
  try {
    await check;
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function prepareRoute(page, prepare) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate((key) => window.sessionStorage.removeItem(key), flowSessionKey);
  if (prepare) {
    await prepare(page);
  }
}

async function seedGeneratingFlow(page) {
  await page.evaluate((key) => {
    window.sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      campaignName: "V4 Visual Forge",
      campaignPremise: "A city that rearranges its bridges when old debts are spoken aloud.",
      campaignFranchise: "",
      researchEnabled: true,
      selectedWorldbooks: [{ id: "visual", displayName: "Visual source", entryCount: 12 }],
      dnaState: {
        geography: { enabled: true, value: "A river city of stacked canal markets, bell towers, and movable bridges.", isCustom: false },
        politicalStructure: { enabled: true, value: "Signal houses license safe routes and sell silence to anyone who can pay.", isCustom: false },
        centralConflict: { enabled: true, value: "A lost message names people who should not exist anymore.", isCustom: false },
        culturalFlavor: { enabled: true, value: ["Lantern codes", "Debt ledgers", "Quiet ferrymen"], isCustom: false },
        environment: { enabled: true, value: "Fog, lacquer rain, and water-stained shrines under iron walkways.", isCustom: false },
        wildcard: { enabled: true, value: "Some bridges remember future crossings.", isCustom: false },
      },
      researchArtifact: null,
      step: 2,
      phase: { kind: "generating" },
      generationProgress: {
        step: 3,
        totalSteps: 10,
        label: "Forging factions",
        subStep: 3,
        subTotal: 5,
        subLabel: "Faction: Shibuya Incident Alliance",
      },
    }));
  }, flowSessionKey);
}

async function seedSuggestingFlow(page) {
  await page.evaluate((key) => {
    window.sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      campaignName: "V4 Visual Forge",
      campaignPremise: "A city that rearranges its bridges when old debts are spoken aloud.",
      campaignFranchise: "signal-house fantasy",
      researchEnabled: true,
      selectedWorldbooks: [{ id: "visual", displayName: "Visual source", entryCount: 12 }],
      dnaState: null,
      researchArtifact: null,
      step: 2,
      phase: { kind: "suggesting-all" },
      generationProgress: null,
    }));
  }, flowSessionKey);
}

async function seedDnaReadyFlow(page) {
  await page.evaluate((key) => {
    window.sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      campaignName: "V4 Visual Forge",
      campaignPremise: "A city that rearranges its bridges when old debts are spoken aloud.",
      campaignFranchise: "signal-house fantasy",
      researchEnabled: true,
      selectedWorldbooks: [{ id: "visual", displayName: "Visual source", entryCount: 12 }],
      dnaState: {
        geography: { enabled: true, value: "A river city of stacked canal markets, bell towers, and movable bridges.", isCustom: false },
        politicalStructure: { enabled: true, value: "Signal houses license safe routes and sell silence to anyone who can pay.", isCustom: false },
        centralConflict: { enabled: true, value: "A lost message names people who should not exist anymore.", isCustom: false },
        culturalFlavor: { enabled: true, value: ["Lantern codes", "Debt ledgers", "Quiet ferrymen"], isCustom: false },
        environment: { enabled: true, value: "Fog, lacquer rain, and water-stained shrines under iron walkways.", isCustom: false },
        wildcard: { enabled: true, value: "Some bridges remember future crossings.", isCustom: false },
      },
      researchArtifact: null,
      step: 2,
      phase: { kind: "idle" },
      generationProgress: null,
    }));
  }, flowSessionKey);
}

async function prepareGameRoute() {
  const campaignId = await findVisualGameCampaignId();
  assert(campaignId, "game visual smoke needs an active or loadable campaign");

  const response = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert(response.ok, `failed to load visual game campaign ${campaignId}: ${response.status}`);
}

async function findVisualGameCampaignId() {
  if (process.env.WF_VISUAL_GAME_CAMPAIGN_ID) {
    return process.env.WF_VISUAL_GAME_CAMPAIGN_ID;
  }

  try {
    const activeResponse = await fetch(`${apiBaseUrl}/api/campaigns/active`);
    if (activeResponse.ok) {
      const active = await activeResponse.json();
      if (active?.campaign?.id) {
        return active.campaign.id;
      }
    }
  } catch {
    // Fall through to library lookup so the smoke can still pick a local campaign.
  }

  const listResponse = await fetch(`${apiBaseUrl}/api/campaigns`);
  if (!listResponse.ok) {
    return null;
  }

  const campaigns = await listResponse.json();
  if (!Array.isArray(campaigns)) {
    return null;
  }

  return campaigns.find((campaign) => campaign?.generationComplete && campaign?.id)?.id
    ?? campaigns.find((campaign) => campaign?.id)?.id
    ?? null;
}

async function assertHome(page, viewport) {
  await assertPageShell(page, viewport);

  const title = page.locator(".wf-home-title").first();
  await expectVisible(title, "home title");
  const titleStyle = await styles(title, ["fontSize", "lineHeight", "fontFamily", "letterSpacing"]);
  assertNumberAtLeast(px(titleStyle.fontSize), viewport.width >= 2560 ? 90 : 82, "home title is too small for 2K");
  assert(titleStyle.fontFamily.toLowerCase().includes("serif"), "home title must use the V4 serif display face");
  assert(px(titleStyle.letterSpacing) < 0, "home title needs the tightened V4 tracking");

  const kicker = await page.locator(".wf-home-kicker").first().innerText();
  assert(/current scene|current campaign|forge a new world/i.test(kicker), "home kicker lost its real-state label");

  const glow = await page.locator(".wf-home-hero").evaluate((element) => {
    const computed = getComputedStyle(element);
    const after = getComputedStyle(element, "::after");
    return {
      backgroundImage: computed.backgroundImage,
      afterDisplay: after.display,
      afterBackgroundImage: after.backgroundImage,
    };
  });
  assert(glow.backgroundImage.includes("radial-gradient"), "home background glow is missing");
  assert(!glow.backgroundImage.includes("linear-gradient"), "home glow is too strong; reference home uses radial glow only");
  assert(glow.afterDisplay === "none" || glow.afterBackgroundImage === "none", "home vertical texture grid leaked back into the hero");

  const pins = page.locator(".wf-home-pin");
  await expectCountAtLeast(pins, 3, "home scene pins");
  const bodyText = await page.locator("body").innerText();
  assert(!/48 turns|14\+9 cast|11h time inside|token|latency|cost/i.test(bodyText), "mock-only prototype stats leaked back into home");

  const action = page.locator(".wf-home-actions .wf-v4-btn").first();
  await expectVisible(action, "home action button");
  const actionHeight = await action.evaluate((element) => element.getBoundingClientRect().height);
  assertNumberAtLeast(actionHeight, 40, "home action button is too compressed");

  const primary = page.locator(".wf-home-actions .wf-v4-btn-primary").first();
  if (await primary.count() > 0) {
    const buttonStyle = await styles(primary, ["boxShadow", "borderTopColor"]);
    assert(buttonStyle.boxShadow !== "none", "home primary button lost ember glow");
    assert(/224|72|28|rgb|oklch/.test(buttonStyle.borderTopColor), "home primary button border is not ember-tinted");
  }

  const rows = page.locator(".wf-home-campaign-row");
  if (await rows.count() > 0) {
    const rowStyle = await styles(rows.first(), ["minHeight", "borderTopColor", "backgroundColor", "backgroundImage"]);
    assertNumberAtLeast(px(rowStyle.minHeight), 72, "campaign rows are visually collapsed");
    assert(
      rowStyle.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        rowStyle.backgroundImage !== "none" ||
        rowStyle.borderTopColor !== "rgba(0, 0, 0, 0)",
      "campaign rows lost their card backplate",
    );
  } else {
    await expectVisible(page.locator(".wf-home-library .wf-v4-card").first(), "empty campaign library card");
  }
}

async function assertForge(page, viewport) {
  await assertPageShell(page, viewport);

  const head = page.locator(".wf-forge-head").first();
  await expectVisible(head, "forge head");
  const title = head.locator("h1").first();
  const titleStyle = await styles(title, ["fontSize", "fontFamily"]);
  assert(Math.abs(px(titleStyle.fontSize) - 52) <= 1, `forge title drifted from V4 52px (${titleStyle.fontSize})`);
  assert(titleStyle.fontFamily.toLowerCase().includes("serif"), "forge title must use the V4 serif display face");

  await expectCountAtLeast(page.locator(".wf-form-step"), 4, "forge form steps");
  const sourcesStep = page.locator(".wf-form-step").filter({ hasText: "Sources" }).first();
  await expectVisible(sourcesStep, "forge sources step");
  await expectVisible(sourcesStep.locator(".wf-forge-source").first(), "forge source card");

  const stepNumStyle = await styles(page.locator(".wf-form-step-num").first(), ["fontStyle"]);
  assert(stepNumStyle.fontStyle === "normal", `forge roman numerals should be upright, got ${stepNumStyle.fontStyle}`);

  const researchRow = page.locator(".wf-research-row").first();
  await expectVisible(researchRow, "forge research row");
  const researchMetrics = await researchRow.evaluate((element) => {
    const row = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const toggle = element.querySelector(".wf-set-toggle")?.getBoundingClientRect();
    return {
      height: row.height,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      borderTopWidth: style.borderTopWidth,
      borderBottomWidth: style.borderBottomWidth,
      backgroundImage: style.backgroundImage,
      toggleCenterDrift: toggle ? Math.abs((toggle.top + toggle.height / 2) - (row.top + row.height / 2)) : null,
    };
  });
  assert(Math.abs(researchMetrics.height - 78) <= 2, `forge research row height drifted (${researchMetrics.height}px)`);
  assert(px(researchMetrics.paddingTop) === 14 && px(researchMetrics.paddingBottom) === 14, "forge research row vertical padding was overridden");
  assert(px(researchMetrics.paddingLeft) === 16 && px(researchMetrics.paddingRight) === 16, "forge research row horizontal padding was overridden");
  assert(px(researchMetrics.borderTopWidth) >= 1, "forge research row border disappeared");
  assert(px(researchMetrics.borderBottomWidth) >= 1, "forge research row bottom border was eaten by shared row styles");
  assert(researchMetrics.backgroundImage === "none", "forge research row picked up an unintended backplate");
  assert(researchMetrics.toggleCenterDrift !== null && researchMetrics.toggleCenterDrift <= 1.5, "forge research toggle is not vertically centered");
  const toggleMetrics = await page.locator(".wf-set-toggle").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const after = getComputedStyle(element, "::after");
    return {
      width: rect.width,
      height: rect.height,
      afterWidth: after.width,
      afterHeight: after.height,
      background: getComputedStyle(element).backgroundColor,
    };
  });
  assert(Math.abs(toggleMetrics.width - 44) <= 1, `forge toggle width drifted (${toggleMetrics.width}px)`);
  assert(Math.abs(toggleMetrics.height - 24) <= 1, `forge toggle height drifted (${toggleMetrics.height}px)`);
  assert(Math.abs(px(toggleMetrics.afterWidth) - 18) <= 1, `forge toggle knob width drifted (${toggleMetrics.afterWidth})`);

  const cta = page.locator(".wf-forge-cta").first();
  await expectVisible(cta, "forge CTA");
  const ctaParentClass = await cta.evaluate((element) => element.parentElement?.className ?? "");
  assert(ctaParentClass.includes("wf-forge-main"), "forge CTA escaped the main work column");
  const ctaStyle = await styles(cta, ["position", "bottom", "backgroundImage", "backdropFilter", "justifyContent", "borderTopWidth"]);
  assert(ctaStyle.position === "sticky", "forge CTA should match the V4 sticky form footer");
  assert(ctaStyle.justifyContent === "flex-start", "forge CTA buttons should start from the form column, not split to both edges");
  assert(ctaStyle.backgroundImage === "none", "forge CTA should not render the old dark bottom backplate");
  assert(ctaStyle.backdropFilter === "none", "forge CTA should not blur into a dock strip");
  assertNumberAtLeast(px(ctaStyle.borderTopWidth), 1, "forge CTA divider is missing");
  await expectVisible(cta.locator("svg").first(), "create-world CTA icon");

  const rail = page.locator(".wf-forge-side").first();
  await expectVisible(rail, "forge side rail");
  const railStyle = await styles(rail, ["position", "width", "overflowY", "height"]);
  assert(["sticky", "fixed"].includes(railStyle.position), "forge sequence rail must remain anchored");
  assertNumberAtLeast(px(railStyle.width), 280, "forge sequence rail is too narrow");
  assert(railStyle.overflowY !== "hidden", "forge sequence rail clips its own panel");
  const shellBackground = await page.locator(".wf-forge-shell").first().evaluate((element) => getComputedStyle(element).backgroundImage);
  assert(shellBackground.includes("linear-gradient"), "forge shell no longer paints the right rail column to page bottom");
  const railText = await rail.innerText();
  assert(/Forge sequence/i.test(railText), "forge side rail lost the sequence");
  assert(!/Open Library|Import JSON|entries|Alpha Codex/i.test(railText), "forge source cards leaked back into the side rail");

  const activeRow = page.locator(".wf-stage-row[data-state='active']").first();
  await expectVisible(activeRow, "active forge stage row");
  const activeMarkAnimation = await activeRow.evaluate((element) => getComputedStyle(element, "::before").animationName);
  assert(activeMarkAnimation.includes("pulse-ember"), "active forge stage lost its pulse effect");

  const glow = await page.locator(".wf-forge-shell").first().evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
  assert(glow === "none", "forge page should not render a page-wide glow under the form");
  const stageGlow = await page.locator(".wf-v4-stage").first().evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
  assert(stageGlow === "none", "forge page should not inherit the global stage glow under every element");
}

async function assertGeneration(page, viewport) {
  await assertPageShell(page, viewport);

  const shell = page.locator(".wf-gen-shell").first();
  await expectVisible(shell, "worldgen surface");
  await expectVisible(page.locator(".wf-gen-rail").first(), "worldgen stage rail");
  await expectVisible(page.locator(".wf-gen-head").first(), "worldgen header");
  await expectVisible(page.locator(".wf-gen-think").first(), "worldgen active engine panel");
  await expectVisible(page.locator(".wf-gen-progress").first(), "worldgen progress");
  await expectCountAtLeast(page.locator(".wf-gen-stage"), 10, "worldgen stages");
  await expectCountAtLeast(page.locator(".wf-gen-dna-card"), 6, "worldgen DNA cards");

  const railStyle = await styles(page.locator(".wf-gen-rail").first(), ["position", "backgroundImage", "borderBottomWidth"]);
  assert(railStyle.position === "sticky", "worldgen stage rail must stay sticky like the V4 reference");
  assert(railStyle.backgroundImage.includes("linear-gradient"), "worldgen rail lost the V4 translucent header backplate");
  assertNumberAtLeast(px(railStyle.borderBottomWidth), 1, "worldgen rail divider is missing");

  const activeStage = page.locator(".wf-gen-stage[data-state='active']").first();
  await expectVisible(activeStage, "active worldgen stage");
  const activeMarkAnimation = await activeStage.evaluate((element) => getComputedStyle(element.querySelector(".wf-gen-stage-mark")).animationName);
  assert(activeMarkAnimation.includes("pulse-ember"), "active worldgen stage lost pulse feedback");
  const stageMetrics = await page.locator(".wf-gen-stage").evaluateAll((elements) => {
    const heights = elements.map((element) => element.getBoundingClientRect().height);
    const active = elements.find((element) => element.getAttribute("data-state") === "active");
    const sub = active?.querySelector(".wf-gen-stage-sub") ?? null;
    return {
      minHeight: Math.min(...heights),
      maxHeight: Math.max(...heights),
      activeHeight: active?.getBoundingClientRect().height ?? 0,
      activeText: active?.textContent ?? "",
      subHeight: sub ? sub.getBoundingClientRect().height : 0,
    };
  });
  assert(stageMetrics.minHeight >= 58 && stageMetrics.maxHeight <= 66, `worldgen stage rail cards drifted outside the stable height band (${stageMetrics.minHeight}-${stageMetrics.maxHeight}px)`);
  assert(stageMetrics.maxHeight - stageMetrics.minHeight <= 1, `worldgen stage rail cards have uneven heights (${stageMetrics.minHeight}-${stageMetrics.maxHeight}px)`);
  assert(stageMetrics.subHeight <= 24, `worldgen stage subline can still grow and jump the rail (${stageMetrics.subHeight}px)`);
  assert(/Factions/i.test(stageMetrics.activeText), "worldgen active rail stage no longer tracks the backend faction stage");
  const activeTitleWhiteSpace = await activeStage.locator(".wf-gen-stage-h").first().evaluate((element) => getComputedStyle(element).whiteSpace);
  assert(activeTitleWhiteSpace === "nowrap", `worldgen stage title can wrap again (${activeTitleWhiteSpace})`);
  const traceSummary = await page.locator(".wf-gen-trace-h").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const counter = element.querySelector("span:last-child")?.getBoundingClientRect();
    return {
      rightGap: counter ? rect.right - counter.right : Number.POSITIVE_INFINITY,
    };
  });
  assert(traceSummary.rightGap < 24, `engine trace event counter is not aligned to the right edge (${traceSummary.rightGap}px)`);

  const progressWidth = await page.locator(".wf-gen-progress-bar > div").first().evaluate((element) => element.getBoundingClientRect().width);
  assertNumberAtLeast(progressWidth, 20, "worldgen progress bar is visually empty");
  const progressBoxWidth = await page.locator(".wf-gen-progress").first().evaluate((element) => element.getBoundingClientRect().width);
  assert(Math.abs(progressBoxWidth - 280) <= 2, `worldgen progress module width drifted from reference (${progressBoxWidth}px)`);

  const bodyText = await page.locator("body").innerText();
  assert(/Forging factions|Faction: Shibuya Incident Alliance/i.test(bodyText), "worldgen surface lost live backend progress text");
  assert(!/Generation stages/i.test(bodyText), "duplicated generation stage section leaked back into worldgen surface");
  assert(await page.locator(".wf-gen-loc").count() === 0, "duplicated generation stage cards leaked back into worldgen surface");
  const railText = await page.locator(".wf-gen-rail").first().innerText();
  assert(!/Faction:|Location:|NPCs drafted|of 5|of 14/i.test(railText), "dynamic backend substep text leaked into the stable stage rail");
  const traceOpen = await page.locator(".wf-gen-trace").first().evaluate((element) => element.hasAttribute("open"));
  assert(!traceOpen, "engine trace should stay collapsed by default");
  assert(!/Generating World\.\.\.|Continue to DNA|Preparing DNA/i.test(bodyText), "old forge footer loader leaked into worldgen surface");
  assert(await page.locator(".wf-forge-cta").count() === 0, "old concept CTA is still mounted during world generation");
  assert(await page.locator(".wf-dna-shell").count() === 0, "DNA edit shell is still mounted during world generation");

  const glow = await shell.evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
  assert(glow === "none", "worldgen should not inherit page-wide forge glow");
}

async function assertDnaSuggestion(page, viewport) {
  await assertPageShell(page, viewport);

  const shell = page.locator("[data-testid='dna-suggestion-surface']").first();
  await expectVisible(shell, "DNA suggestion surface");
  await expectVisible(page.locator(".wf-gen-rail-dna").first(), "DNA suggestion stage rail");
  await expectVisible(page.locator(".wf-gen-head").first(), "DNA suggestion header");
  await expectVisible(page.locator(".wf-gen-think").first(), "DNA suggestion active panel");
  await expectVisible(page.locator(".wf-gen-progress").first(), "DNA suggestion progress");
  await expectCountAtLeast(page.locator(".wf-gen-stage"), 5, "DNA suggestion stages");
  await expectCountAtLeast(page.locator(".wf-gen-loc"), 6, "DNA seed placeholders");

  const bodyText = await page.locator("body").innerText();
  assert(/Preparing World DNA|World DNA - preparing suggestions/i.test(bodyText), "DNA suggestion surface lost its headline");
  assert(/Visual source|Source context/i.test(bodyText), "DNA suggestion surface lost source context");
  assert(!/Continue to DNA|Preparing DNA|Create World Now/i.test(bodyText), "old concept footer loader leaked into DNA suggestion surface");
  assert(await page.locator(".wf-forge-cta").count() === 0, "concept CTA is still mounted during DNA suggestions");
  assert(await page.locator(".wf-forge-shell").count() === 0, "concept form is still mounted during DNA suggestions");

  const activeStage = page.locator(".wf-gen-stage[data-state='active']").first();
  await expectVisible(activeStage, "active DNA suggestion stage");
  const activeMarkAnimation = await activeStage.evaluate((element) => getComputedStyle(element.querySelector(".wf-gen-stage-mark")).animationName);
  assert(activeMarkAnimation.includes("pulse-ember"), "active DNA suggestion stage lost pulse feedback");

  const progressWidth = await page.locator(".wf-gen-progress-bar > div").first().evaluate((element) => element.getBoundingClientRect().width);
  assertNumberAtLeast(progressWidth, 20, "DNA suggestion progress bar is visually empty");

  const glow = await shell.evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
  assert(glow === "none", "DNA suggestion should not inherit page-wide forge glow");
}

async function assertDnaReady(page, viewport) {
  await assertPageShell(page, viewport);

  const shell = page.locator("[data-testid='dna-edit-surface']").first();
  await expectVisible(shell, "DNA ready surface");
  await expectVisible(page.locator(".wf-gen-rail-dna").first(), "DNA ready stage rail");
  await expectVisible(page.locator(".wf-gen-head").first(), "DNA ready header");
  await expectVisible(page.locator(".wf-dna-context-panel").first(), "DNA ready context panel");
  await expectCountAtLeast(page.locator(".wf-gen-stage"), 5, "DNA ready stages");
  await expectCountAtLeast(page.locator(".wf-dna-seed-card"), 6, "DNA ready seed cards");
  await expectCountAtLeast(page.locator(".wf-dna-seed-text"), 6, "DNA ready editable seed bodies");
  await expectCountAtLeast(page.locator(".wf-dna-use-toggle"), 6, "DNA ready seed usage controls");

  const bodyText = await page.locator("body").innerText();
  assert(/World DNA - review|Six laws before the world wakes/i.test(bodyText), "DNA ready surface lost its V4 header");
  assert(/Visual source|V4 Visual Forge/i.test(bodyText), "DNA ready surface lost campaign/source context");
  assert(/Re-roll All|Create World/i.test(bodyText), "DNA ready action bar lost world creation controls");
  assert(!/Ready to generate|Needs at least one seed/i.test(bodyText), "old DNA reskin status text leaked into the ready page");
  assert(await page.locator(".wf-dna-shell").count() === 0, "old side-rail DNA shell is still mounted");
  assert(await page.locator(".wf-set-toggle").count() === 0, "settings-style toggle leaked into DNA seed cards");

  const activeStage = page.locator(".wf-gen-stage[data-state='active']").first();
  await expectVisible(activeStage, "active DNA ready stage");
  const activeMarkAnimation = await activeStage.evaluate((element) => getComputedStyle(element.querySelector(".wf-gen-stage-mark")).animationName);
  assert(activeMarkAnimation.includes("pulse-ember"), "active DNA ready stage lost pulse feedback");

  const cardMetrics = await page.locator(".wf-dna-seed-card").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const text = element.querySelector(".wf-dna-seed-text");
    const textStyle = text ? getComputedStyle(text) : null;
    return {
      height: rect.height,
      backgroundImage: getComputedStyle(element).backgroundImage,
      textBorderTop: textStyle?.borderTopWidth ?? null,
      textBackground: textStyle?.backgroundColor ?? null,
    };
  });
  assert(cardMetrics.height < 360, `DNA seed card still reads like oversized old textarea card (${cardMetrics.height}px)`);
  assert(cardMetrics.backgroundImage.includes("linear-gradient"), "DNA seed cards lost their V4 artifact backplate");
  assert(cardMetrics.textBorderTop === "0px", "DNA seed editor still has an inner field border");
  assert(cardMetrics.textBackground === "rgba(0, 0, 0, 0)", "DNA seed editor should be transparent inside the artifact card");

  const actionbarStyle = await styles(page.locator(".wf-dna-actionbar").first(), ["backgroundImage", "borderTopWidth", "justifyContent"]);
  assert(actionbarStyle.backgroundImage === "none", "DNA action bar brought back the old dark dock backplate");
  assertNumberAtLeast(px(actionbarStyle.borderTopWidth), 1, "DNA action bar divider is missing");
  assert(actionbarStyle.justifyContent === "space-between", "DNA action bar controls are not aligned to the V4 lane");

  const glow = await shell.evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
  assert(glow === "none", "DNA ready should not inherit page-wide forge glow");
}

async function assertReview(page, viewport) {
  await assertPageShell(page, viewport);

  await expectVisible(page.locator(".wf-review-screen").first(), "review screen");
  await expectVisible(page.locator(".wf-review-frame").first(), "review frame");
  await expectVisible(page.locator(".wf-review-head").first(), "review header");
  await expectVisible(page.locator(".wf-review-tablist").first(), "review tab list");
  await expectVisible(page.locator(".wf-review-body").first(), "review body");
  await expectVisible(page.locator(".wf-review-title").first(), "review title");
  await expectVisible(page.locator(".wf-review-health").first(), "review overview health row");

  const metrics = await page.evaluate(() => {
    const topbar = document.querySelector(".wf-v4-topbar")?.getBoundingClientRect();
    const screen = document.querySelector(".wf-review-screen")?.getBoundingClientRect();
    const frame = document.querySelector(".wf-review-frame")?.getBoundingClientRect();
    const head = document.querySelector(".wf-review-head")?.getBoundingClientRect();
    const title = document.querySelector(".wf-review-title")?.getBoundingClientRect();
    const tablist = document.querySelector(".wf-review-tablist")?.getBoundingClientRect();
    const firstTab = document.querySelector(".wf-review-tabs [role='tab']")?.getBoundingClientRect();
    const health = document.querySelector(".wf-review-health")?.getBoundingClientRect();
    const stageScroll = document.querySelector(".wf-v4-scroll");
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      topbar: topbar ? rect(topbar) : null,
      screen: screen ? rect(screen) : null,
      frame: frame ? rect(frame) : null,
      head: head ? rect(head) : null,
      title: title ? rect(title) : null,
      tablist: tablist ? rect(tablist) : null,
      firstTab: firstTab ? rect(firstTab) : null,
      health: health ? rect(health) : null,
      stageScrollOverflowY: stageScroll ? getComputedStyle(stageScroll).overflowY : null,
      stageScrollH: stageScroll?.scrollHeight ?? null,
      stageClientH: stageScroll?.clientHeight ?? null,
      tablistScrollH: document.querySelector(".wf-review-tablist")?.scrollHeight ?? null,
      tablistClientH: document.querySelector(".wf-review-tablist")?.clientHeight ?? null,
    };

    function rect(value) {
      return {
        x: value.x,
        y: value.y,
        right: value.right,
        width: value.width,
        height: value.height,
      };
    }
  });

  assert(metrics.topbar && metrics.screen && metrics.frame && metrics.head && metrics.title && metrics.tablist && metrics.firstTab && metrics.health, "review layout boxes are missing");
  assert(metrics.scrollWidth <= metrics.innerWidth + 2, `review page has horizontal overflow (${metrics.scrollWidth}px > ${metrics.innerWidth}px)`);
  assert(metrics.scrollHeight <= metrics.innerHeight + 2, `review page has stray first-screen vertical overflow (${metrics.scrollHeight}px > ${metrics.innerHeight}px)`);
  assert(metrics.stageScrollOverflowY === "hidden", `review route should not show an outer stage scrollbar (${metrics.stageScrollOverflowY})`);
  assert(metrics.stageScrollH <= metrics.stageClientH + 2, `review route has an outer stage scrollbar (${metrics.stageScrollH}px > ${metrics.stageClientH}px)`);
  assert(Math.abs(metrics.topbar.height - 61) <= 1, `review topbar should be 61px like the reference, got ${metrics.topbar.height}px`);

  const contentGutter = Math.max(56, (metrics.screen.width - 1800) / 2 + 56);
  assert(Math.abs(metrics.frame.x - metrics.screen.x) <= 2, "review frame no longer starts at the stage edge");
  assert(Math.abs(metrics.frame.width - metrics.screen.width) <= 2, "review frame no longer spans the full stage");
  assert(Math.abs(metrics.tablist.width - metrics.frame.width) <= 2, "review tab rail no longer spans the full stage");
  assert(Math.abs(metrics.tablist.x - metrics.frame.x) <= 2, "review tab separator is inset instead of spanning the V4 lane");
  assert(Math.abs(metrics.firstTab.x - (metrics.frame.x + contentGutter)) <= 2, `review first tab no longer starts on the centered content lane (${metrics.firstTab.x - metrics.frame.x}px)`);
  assert(metrics.tablistScrollH <= metrics.tablistClientH + 1, `review tab rail shows a vertical scrollbar (${metrics.tablistScrollH}px > ${metrics.tablistClientH}px)`);
  assert(Math.abs(metrics.title.x - (metrics.frame.x + contentGutter)) <= 2, `review header no longer uses the centered content gutter (${metrics.title.x - metrics.frame.x}px)`);
  assert(Math.abs(metrics.health.x - metrics.title.x) <= 2, "review overview content is not aligned to the reference header lane");
  assert(Math.abs(metrics.health.width - 720) <= 2, `review overview health row should be 720px, got ${metrics.health.width}px`);

  const headStyle = await styles(page.locator(".wf-review-head").first(), ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]);
  assert(Math.abs(px(headStyle.paddingTop) - 32) <= 1, "review header top padding drifted from reference");
  assert(Math.abs(px(headStyle.paddingRight) - contentGutter) <= 1, "review header right padding drifted from centered lane");
  assert(Math.abs(px(headStyle.paddingBottom) - 18) <= 1, "review header bottom padding drifted from reference");
  assert(Math.abs(px(headStyle.paddingLeft) - contentGutter) <= 1, "review header left padding drifted from centered lane");

  const titleStyle = await styles(page.locator(".wf-review-title").first(), ["fontSize", "lineHeight", "fontFamily", "letterSpacing"]);
  assert(Math.abs(px(titleStyle.fontSize) - 44) <= 1, `review title should be 44px, got ${titleStyle.fontSize}`);
  assert(titleStyle.fontFamily.toLowerCase().includes("serif"), "review title must use the V4 serif display face");
  const headerText = await page.locator(".wf-review-head").first().innerText();
  assert(!/^world review/i.test(headerText.trim()), "review header has a stray World Review kicker");
  const bodyText = await page.locator(".wf-review-screen").first().innerText();
  assert(!/\bissues\b/i.test(bodyText), "review page is showing mock-only issues data without a backend source");

  const firstTabStyle = await styles(page.locator(".wf-review-tabs [role='tab']").first(), ["backgroundColor", "borderTopWidth", "borderBottomWidth", "borderLeftWidth", "borderRightWidth", "borderRadius", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "gap", "alignItems"]);
  assert(firstTabStyle.backgroundColor === "rgba(0, 0, 0, 0)", "review active tab should not render as a filled old tab");
  assert(px(firstTabStyle.borderTopWidth) === 0 && px(firstTabStyle.borderLeftWidth) === 0, "review tabs kept old boxed borders");
  assert(Math.abs(px(firstTabStyle.paddingTop) - 14) <= 1, "review tab top padding drifted from reference");
  assert(Math.abs(px(firstTabStyle.paddingRight) - 22) <= 1, "review tab right padding drifted from reference");
  assert(px(firstTabStyle.gap) === 0, `review tab label/count gap should come only from count margin, got ${firstTabStyle.gap}`);
  assert(firstTabStyle.alignItems === "baseline", `review tab text should align on baseline, got ${firstTabStyle.alignItems}`);

  await page.getByRole("tab", { name: /Cast/i }).click();
  const castTabMetrics = await page.locator(".wf-review-tabs [role='tab'][data-state='active']").first().evaluate((element) => {
    const after = getComputedStyle(element, "::after");
    const count = element.querySelector(".wf-review-tab-count");
    const countStyle = count ? getComputedStyle(count) : null;
    return {
      afterHeight: after.height,
      afterOpacity: after.opacity,
      afterRight: after.right,
      afterBackground: after.backgroundColor,
      countMarginLeft: countStyle?.marginLeft ?? "",
      countLineHeight: countStyle?.lineHeight ?? "",
    };
  });
  assert(Math.abs(px(castTabMetrics.afterHeight) - 1) <= 0.5, `review active underline is too thick (${castTabMetrics.afterHeight})`);
  assert(Number(castTabMetrics.afterOpacity) >= 0.99, `review active underline did not settle immediately (${castTabMetrics.afterOpacity})`);
  assert(Math.abs(px(castTabMetrics.afterRight) - 22) <= 1, `review active underline is too long (${castTabMetrics.afterRight} right inset)`);
  assert(castTabMetrics.afterBackground.includes("rgba(224, 72, 28, 0.78)"), `review active underline is too bright (${castTabMetrics.afterBackground})`);
  assert(Math.abs(px(castTabMetrics.countMarginLeft) - 6) <= 1, `review tab count spacing drifted (${castTabMetrics.countMarginLeft})`);

  await expectVisible(page.locator(".wf-review-create-card").first(), "review create NPC card");
  const castLayout = await page.evaluate(() => {
    const card = document.querySelector(".wf-review-npc");
    const tarot = card?.querySelector(".wf-review-tarot-lg")?.getBoundingClientRect();
    const copy = card?.children[1]?.getBoundingClientRect();
    const profileFields = document.querySelectorAll(".wf-review-profile-field").length;
    const createCard = document.querySelector(".wf-review-create-card")?.getBoundingClientRect();
    return {
      tarot: tarot ? rect(tarot) : null,
      copy: copy ? rect(copy) : null,
      profileFields,
      createCard: createCard ? rect(createCard) : null,
    };

    function rect(value) {
      return {
        x: value.x,
        right: value.right,
        width: value.width,
        height: value.height,
      };
    }
  });
  assert(castLayout.tarot && castLayout.copy && castLayout.createCard, "review cast card geometry is missing");
  assert(castLayout.profileFields >= 5, `review cast profile exposes too little character detail (${castLayout.profileFields} fields)`);
  assert(castLayout.tarot.right <= castLayout.copy.x - 8, "review cast tarot overlaps character copy");
  assertNumberAtLeast(castLayout.createCard.height, 72, "review create NPC card collapsed");

  await page.getByRole("tab", { name: /Overview/i }).click();
  const overviewButtons = await page.locator(".wf-review-over-row .wf-v4-btn").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      text: element.textContent?.trim() ?? "",
      height: rect.height,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
    };
  }));
  assert(overviewButtons.length >= 2, "review overview lost its inspect buttons");
  for (const button of overviewButtons) {
    assert(Math.abs(button.height - 39) <= 1.5, `review button height drifted from mock (${button.height}px for ${button.text})`);
    assert(Math.abs(px(button.fontSize) - 11) <= 0.5, `review button font should be 11px, got ${button.fontSize}`);
    assert(Math.abs(px(button.paddingTop) - 10) <= 0.5 && Math.abs(px(button.paddingRight) - 18) <= 0.5, `review button padding drifted (${button.paddingTop} ${button.paddingRight})`);
    assert(Math.abs(px(button.letterSpacing) - 1.54) <= 0.2, `review button letter spacing drifted (${button.letterSpacing})`);
  }

  const glow = await page.locator(".wf-v4-stage").first().evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
  assert(glow.includes("rgba(224, 72, 28, 0.024)") || glow.includes("rgba(224, 72, 28, 0.02)"), "review glow lost the muted V4 override");
  assert(!glow.includes("0.055"), "review page is using the old bright global glow");

  for (const tab of [
    ["Cast", ".wf-review-cast"],
    ["Locations", ".wf-review-locs"],
    ["Factions", ".wf-review-factions"],
    ["Lore cards", ".wf-review-lore"],
    ["World DNA", ".wf-review-dna"],
  ]) {
    await page.getByRole("tab", { name: new RegExp(tab[0], "i") }).click();
    await expectVisible(page.locator(tab[1]).first(), `review ${tab[0]} panel`);
  }

  await page.getByRole("tab", { name: /Locations/i }).click();
  const locMetrics = await page.evaluate(() => {
    const row = document.querySelector(".wf-review-locrow")?.getBoundingClientRect();
    const title = document.querySelector(".wf-review-locrow > div:nth-child(2)")?.getBoundingClientRect();
    const desc = document.querySelector(".wf-review-locrow-desc")?.getBoundingClientRect();
    const tags = document.querySelector(".wf-review-locrow-tags")?.getBoundingClientRect();
    return {
      row: row ? rect(row) : null,
      title: title ? rect(title) : null,
      desc: desc ? rect(desc) : null,
      tags: tags ? rect(tags) : null,
    };

    function rect(value) {
      return {
        x: value.x,
        right: value.right,
        width: value.width,
        height: value.height,
      };
    }
  });
  assert(locMetrics.row && locMetrics.title && locMetrics.desc && locMetrics.tags, "review location row geometry is missing");
  assert(locMetrics.title.right <= locMetrics.desc.x - 10, "review location title overlaps location prose");
  assert(locMetrics.desc.right <= locMetrics.tags.x - 10, "review location prose overlaps location chips");
  assert(locMetrics.tags.right <= locMetrics.row.right - 18, "review location chips escape the row padding");
}

async function assertGame(page, viewport) {
  await expectVisible(page.locator("[data-testid='game-scene-shell']").first(), "game scene shell");
  await expectVisible(page.locator("[data-testid='scene-backdrop']").first(), "game scene backdrop");
  await expectVisible(page.locator("[data-testid='scene-hud']").first(), "game scene HUD");
  await expectVisible(page.locator("[data-testid='narration-dock']").first(), "game narration dock");
  await expectVisible(page.locator("[data-testid='action-dock']").first(), "game action dock");

  const metrics = await page.evaluate(() => {
    const backdrop = document.querySelector("[data-testid='scene-backdrop']");
    const floor = document.querySelector("[data-testid='scene-floor-plane']");
    const candidates = Array.from(document.querySelectorAll("body *"))
      .flatMap((node) => {
        const element = node;
        if (!(element instanceof HTMLElement)) {
          return [];
        }

        const tag = element.tagName.toLowerCase();
        if (["html", "body", "textarea"].includes(tag)) {
          return [];
        }

        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return [];
        }

        const rect = element.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) {
          return [];
        }

        const horizontalOverflow = element.scrollWidth > element.clientWidth + 3;
        const verticalOverflow = element.scrollHeight > element.clientHeight + 3;
        if (!horizontalOverflow && !verticalOverflow) {
          return [];
        }

        const intendedScrollOwner = element.closest("[data-overflow-owner]");
        const isTruncate = element.classList.contains("truncate") || style.textOverflow === "ellipsis";
        if (!horizontalOverflow && intendedScrollOwner) {
          return [];
        }
        if (horizontalOverflow && isTruncate) {
          return [];
        }

        return [{
          tag,
          testid: element.getAttribute("data-testid"),
          overflowOwner: intendedScrollOwner?.getAttribute("data-overflow-owner") ?? null,
          className: String(element.className).slice(0, 140),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
        }];
      });

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      bodyScrollWidth: document.body.scrollWidth,
      bodyScrollHeight: document.body.scrollHeight,
      backdropScrollHeight: backdrop instanceof HTMLElement ? backdrop.scrollHeight : null,
      backdropClientHeight: backdrop instanceof HTMLElement ? backdrop.clientHeight : null,
      floorClassName: floor instanceof HTMLElement ? String(floor.className) : "",
      candidates,
    };
  });

  assert(metrics.documentScrollWidth <= metrics.innerWidth + 2, `game page has horizontal document overflow (${metrics.documentScrollWidth}px > ${metrics.innerWidth}px)`);
  assert(metrics.documentScrollHeight <= metrics.innerHeight + 2, `game page has vertical document overflow (${metrics.documentScrollHeight}px > ${metrics.innerHeight}px)`);
  assert(metrics.bodyScrollWidth <= metrics.innerWidth + 2, `game page has horizontal body overflow (${metrics.bodyScrollWidth}px > ${metrics.innerWidth}px)`);
  assert(metrics.bodyScrollHeight <= metrics.innerHeight + 2, `game page has vertical body overflow (${metrics.bodyScrollHeight}px > ${metrics.innerHeight}px)`);
  assert(
    metrics.backdropScrollHeight !== null && metrics.backdropClientHeight !== null && metrics.backdropScrollHeight <= metrics.backdropClientHeight + 2,
    `game backdrop contributes scroll overflow (${metrics.backdropScrollHeight}px > ${metrics.backdropClientHeight}px)`,
  );
  assert(!metrics.floorClassName.includes("bottom-[-14%]"), "game floor plane uses negative bottom geometry again");
  assert(!metrics.floorClassName.includes("translate-y"), "game floor plane uses transform overflow geometry again");
  assert(metrics.candidates.length === 0, `game page has visible overflow candidates: ${JSON.stringify(metrics.candidates, null, 2)}`);

  if (viewport.width >= 2048) {
    const dockWidth = await page.locator("[data-shell-region='action-dock']").first().evaluate((element) => element.getBoundingClientRect().width);
    assertNumberAtLeast(dockWidth, 760, `game action dock is too narrow for 2K play (${dockWidth}px)`);
  }
}

async function assertPageShell(page) {
  const rail = page.locator(".wf-v4-rail").first();
  await expectVisible(rail, "sidebar rail");
  const sidebar = page.locator(".wf-sidebar").first();
  await expectVisible(sidebar, "sidebar");
  const brandAccentColor = await sidebar.locator(".wf-sidebar-mark span").first().evaluate((element) => getComputedStyle(element).color);
  assertColorNear(brandAccentColor, [224, 72, 28], 4, "sidebar brand Forge color must match reference ember");

  const sidebarStyle = await styles(rail, ["width", "borderRightColor", "borderRightWidth", "backgroundColor"]);
  assertNumberAtLeast(px(sidebarStyle.width), 220, "sidebar is narrower than the V4 rail");
  assertNumberAtLeast(px(sidebarStyle.borderRightWidth), 1, "sidebar rail divider is missing");
  assert(sidebarStyle.borderRightColor !== "rgba(0, 0, 0, 0)", "sidebar rail divider is transparent");
  assert(sidebarStyle.backgroundColor !== "rgba(0, 0, 0, 0)", "sidebar rail backplate is transparent");

  const navLabel = page.locator(".wf-sidebar-label").first();
  await expectVisible(navLabel, "sidebar nav label");
  const navStyle = await styles(navLabel, ["fontSize", "lineHeight"]);
  assertNumberAtLeast(px(navStyle.fontSize), 13, "sidebar nav label is too small");
  assertNumberAtLeast(px(navStyle.lineHeight), 18, "sidebar nav rhythm is too tight");

  const footerDisplay = await page.locator(".wf-sidebar-foot").first().evaluate((element) => getComputedStyle(element).display);
  assert(footerDisplay === "none", "prototype status footer leaked back into the app shell");

  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyText: document.body.innerText,
  }));
  assert(dimensions.scrollWidth <= dimensions.width + 2, `page has horizontal overflow (${dimensions.scrollWidth}px > ${dimensions.width}px)`);
  assert(!/Codex\s+·|4o\s+·\s+oracle|oracle\s+·\s+Kimi|PAUSED 3D|BLEEDING|PLAYING/i.test(dimensions.bodyText), "mock-only prototype status text leaked into the shell");

  const stageBackground = await page.locator(".wf-v4-stage").first().evaluate((element) => getComputedStyle(element).backgroundImage);
  assert(stageBackground === "none", "global V4 stage vertical texture grid leaked back in");
}

async function expectVisible(locator, label) {
  assert(await locator.count() > 0, `${label} is missing`);
  assert(await locator.isVisible(), `${label} is not visible`);
}

async function expectCountAtLeast(locator, min, label) {
  const count = await locator.count();
  assert(count >= min, `${label} count ${count} is below ${min}`);
}

async function styles(locator, keys) {
  return locator.evaluate((element, styleKeys) => {
    const computed = getComputedStyle(element);
    return Object.fromEntries(styleKeys.map((key) => [key, computed[key]]));
  }, keys);
}

function assertNumberAtLeast(value, min, message) {
  assert(Number.isFinite(value), `${message}: got non-numeric value`);
  assert(value >= min, `${message}: got ${value}, expected at least ${min}`);
}

function px(value) {
  return Number.parseFloat(String(value));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertColorNear(value, expectedRgb, tolerance, message) {
  const actual = parseRgb(value);
  assert(actual, `${message}: could not parse ${value}`);
  const delta = actual.reduce((sum, channel, index) => sum + Math.abs(channel - expectedRgb[index]), 0);
  assert(delta <= tolerance, `${message}: got ${value}, expected rgb(${expectedRgb.join(", ")})`);
}

function parseRgb(value) {
  const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
