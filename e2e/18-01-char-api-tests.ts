/**
 * Phase 18 Plan 01: Character Creation API E2E Tests
 *
 * Tests all 6 character creation and game start API endpoints with real GLM calls.
 * Requires: backend running on localhost:3001, campaign with generated world scaffold.
 */

const BASE = "http://localhost:3001";

// Use a campaign with generationComplete=true
const CAMPAIGN_ID = "b85729f8-0de4-4d93-a0c3-e1c45646219c"; // E2E Dark Fantasy

interface ParsedCharacter {
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  tags: string[];
  hp: number;
  equippedItems: string[];
  locationName: string;
}

interface TestResult {
  endpoint: string;
  passed: boolean;
  quality: number;
  details: string;
  character?: ParsedCharacter;
}

async function loadCampaign(): Promise<void> {
  const res = await fetch(`${BASE}/api/campaigns/${CAMPAIGN_ID}/load`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to load campaign: ${res.status}`);
  console.log("[SETUP] Campaign loaded:", CAMPAIGN_ID);
}

function validateCharacter(
  char: ParsedCharacter,
  context: string
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!char.name || char.name.trim() === "")
    issues.push("name is empty");
  if (!char.race || char.race.trim() === "")
    issues.push("race is empty");
  if (!char.appearance || char.appearance.trim() === "")
    issues.push("appearance is empty");
  if (!Array.isArray(char.tags) || char.tags.length < 3)
    issues.push(`tags count ${char.tags?.length ?? 0} < 3`);
  if (typeof char.hp !== "number" || char.hp < 1 || char.hp > 5)
    issues.push(`hp ${char.hp} out of range 1-5`);
  if (!char.locationName || char.locationName.trim() === "")
    issues.push("locationName is empty");
  if (!Array.isArray(char.equippedItems))
    issues.push("equippedItems is not an array");

  if (issues.length > 0) {
    console.log(`  [WARN] ${context} validation issues:`, issues);
  }

  return { valid: issues.length === 0, issues };
}

// ─── Task 1: parse-character, generate-character, research-character ───

async function testParseCharacter(): Promise<TestResult> {
  const description =
    "A grizzled dwarven blacksmith named Thorgrim who lost his family to a dragon attack. " +
    "He carries a war hammer and wears burn-scarred leather armor. " +
    "Strong but slow, with a talent for metalworking and a deep hatred of anything scaled.";

  const res = await fetch(`${BASE}/api/worldgen/parse-character`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId: CAMPAIGN_ID,
      role: "player",
      concept: description,
    }),
  });

  const data = await res.json();
  if (data.error) {
    return {
      endpoint: "parse-character",
      passed: false,
      quality: 0,
      details: `Error: ${data.error}`,
    };
  }

  const char = data.character as ParsedCharacter;
  const validation = validateCharacter(char, "parse-character");

  const quality =
    validation.valid && char.name.toLowerCase().includes("thorgrim") ? 5 : validation.valid ? 4.5 : 3;

  return {
    endpoint: "parse-character",
    passed: validation.valid,
    quality,
    details: `name=${char.name}, race=${char.race}, tags=${char.tags.length}, hp=${char.hp}`,
    character: char,
  };
}

async function testGenerateCharacter(): Promise<TestResult> {
  const res = await fetch(`${BASE}/api/worldgen/generate-character`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId: CAMPAIGN_ID,
      role: "player",
    }),
  });

  const data = await res.json();
  if (data.error) {
    return {
      endpoint: "generate-character",
      passed: false,
      quality: 0,
      details: `Error: ${data.error}`,
    };
  }

  const char = data.character as ParsedCharacter;
  const validation = validateCharacter(char, "generate-character");

  const quality = validation.valid ? 5 : 3;

  return {
    endpoint: "generate-character",
    passed: validation.valid,
    quality,
    details: `name=${char.name}, race=${char.race}, tags=${char.tags.length}, hp=${char.hp}`,
    character: char,
  };
}

async function testResearchCharacter(): Promise<TestResult> {
  const res = await fetch(`${BASE}/api/worldgen/research-character`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId: CAMPAIGN_ID,
      role: "player",
      archetype: "Witcher monster hunter",
    }),
  });

  const data = await res.json();
  if (data.error) {
    return {
      endpoint: "research-character",
      passed: false,
      quality: 0,
      details: `Error: ${data.error}`,
    };
  }

  const char = data.character as ParsedCharacter;
  const validation = validateCharacter(char, "research-character");

  const quality = validation.valid ? 5 : 3;

  return {
    endpoint: "research-character",
    passed: validation.valid,
    quality,
    details: `name=${char.name}, race=${char.race}, tags=${char.tags.length}, hp=${char.hp}`,
    character: char,
  };
}

async function testImportV2Card(): Promise<TestResult> {
  const res = await fetch(`${BASE}/api/worldgen/import-v2-card`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId: CAMPAIGN_ID,
      role: "player",
      name: "Geralt of Rivia",
      description:
        "A witcher, a professional monster hunter with supernatural abilities.",
      personality:
        "Stoic, dry wit, morally gray, loyal to those he cares about.",
      scenario: "Wandering the lands hunting monsters for coin.",
      tags: ["witcher", "monster_hunter", "mutant"],
    }),
  });

  const data = await res.json();
  if (data.error) {
    return {
      endpoint: "import-v2-card",
      passed: false,
      quality: 0,
      details: `Error: ${data.error}`,
    };
  }

  const char = data.character as ParsedCharacter;
  const validation = validateCharacter(char, "import-v2-card");

  const quality =
    validation.valid && char.name.includes("Geralt") ? 5 : validation.valid ? 4.5 : 3;

  return {
    endpoint: "import-v2-card",
    passed: validation.valid,
    quality,
    details: `name=${char.name}, race=${char.race}, tags=${char.tags.length}, hp=${char.hp}`,
    character: char,
  };
}

// ─── Task 2: save-character, resolve-starting-location, game readiness ───

async function testSaveCharacter(
  character: ParsedCharacter
): Promise<TestResult> {
  const res = await fetch(`${BASE}/api/worldgen/save-character`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId: CAMPAIGN_ID,
      character,
    }),
  });

  const data = await res.json();
  if (data.error) {
    return {
      endpoint: "save-character",
      passed: false,
      quality: 0,
      details: `Error: ${data.error}`,
    };
  }

  const passed = data.ok === true && typeof data.playerId === "string";

  return {
    endpoint: "save-character",
    passed,
    quality: passed ? 5 : 0,
    details: `ok=${data.ok}, playerId=${data.playerId}`,
  };
}

async function testResolveStartingLocation(): Promise<TestResult> {
  const res = await fetch(
    `${BASE}/api/worldgen/resolve-starting-location`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
      }),
    }
  );

  const data = await res.json();
  if (data.error) {
    return {
      endpoint: "resolve-starting-location",
      passed: false,
      quality: 0,
      details: `Error: ${data.error}`,
    };
  }

  const passed =
    typeof data.locationId === "string" &&
    typeof data.locationName === "string";

  return {
    endpoint: "resolve-starting-location",
    passed,
    quality: passed ? 5 : 0,
    details: `locationId=${data.locationId}, locationName=${data.locationName}`,
  };
}

async function testGameReadiness(): Promise<TestResult> {
  // Check active campaign has player
  const activeRes = await fetch(`${BASE}/api/campaigns/active`);
  const active = await activeRes.json();

  // Check chat history is accessible
  const chatRes = await fetch(`${BASE}/api/chat/history`);
  const chat = await chatRes.json();

  const hasPlayer =
    active?.player?.name || active?.data?.player?.name;
  const hasChatAccess = chatRes.ok;

  return {
    endpoint: "game-readiness",
    passed: Boolean(hasPlayer) && hasChatAccess,
    quality: hasPlayer && hasChatAccess ? 5 : 0,
    details: `player=${hasPlayer || "none"}, chatOk=${hasChatAccess}`,
  };
}

// ─── Main Runner ───

async function main() {
  console.log("=== Phase 18 Plan 01: Character API E2E Tests ===\n");

  await loadCampaign();

  const results: TestResult[] = [];

  // Task 1: Character creation endpoints
  console.log("\n--- Task 1: Character Creation Endpoints ---\n");

  console.log("[1/4] Testing parse-character...");
  const parseResult = await testParseCharacter();
  results.push(parseResult);
  console.log(
    `  ${parseResult.passed ? "PASS" : "FAIL"} (${parseResult.quality}/5): ${parseResult.details}`
  );

  console.log("[2/4] Testing generate-character...");
  const genResult = await testGenerateCharacter();
  results.push(genResult);
  console.log(
    `  ${genResult.passed ? "PASS" : "FAIL"} (${genResult.quality}/5): ${genResult.details}`
  );

  console.log("[3/4] Testing research-character...");
  const researchResult = await testResearchCharacter();
  results.push(researchResult);
  console.log(
    `  ${researchResult.passed ? "PASS" : "FAIL"} (${researchResult.quality}/5): ${researchResult.details}`
  );

  console.log("[4/4] Testing import-v2-card...");
  const importResult = await testImportV2Card();
  results.push(importResult);
  console.log(
    `  ${importResult.passed ? "PASS" : "FAIL"} (${importResult.quality}/5): ${importResult.details}`
  );

  // Task 2: Save + location + game readiness
  console.log("\n--- Task 2: Save & Game Readiness ---\n");

  // Use parse result character for save test
  const charToSave = parseResult.character || genResult.character;
  if (!charToSave) {
    console.log("  SKIP: No valid character to save");
  } else {
    console.log("[5/7] Testing save-character...");
    const saveResult = await testSaveCharacter(charToSave);
    results.push(saveResult);
    console.log(
      `  ${saveResult.passed ? "PASS" : "FAIL"} (${saveResult.quality}/5): ${saveResult.details}`
    );
  }

  console.log("[6/7] Testing resolve-starting-location...");
  const locResult = await testResolveStartingLocation();
  results.push(locResult);
  console.log(
    `  ${locResult.passed ? "PASS" : "FAIL"} (${locResult.quality}/5): ${locResult.details}`
  );

  console.log("[7/7] Testing game readiness...");
  const readyResult = await testGameReadiness();
  results.push(readyResult);
  console.log(
    `  ${readyResult.passed ? "PASS" : "FAIL"} (${readyResult.quality}/5): ${readyResult.details}`
  );

  // Summary
  console.log("\n=== SUMMARY ===\n");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const avgQuality =
    results.reduce((sum, r) => sum + r.quality, 0) / total;

  console.log(`Tests: ${passed}/${total} passed`);
  console.log(`Average Quality: ${avgQuality.toFixed(1)}/5`);
  console.log(
    `Overall: ${passed === total && avgQuality >= 4.5 ? "PASS" : "FAIL"}`
  );

  if (passed < total) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.endpoint}: ${r.details}`);
    }
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
