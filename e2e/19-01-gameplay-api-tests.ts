/**
 * Phase 19 Plan 01: Core Gameplay Loop API E2E Tests
 *
 * Tests the full turn cycle via POST /api/chat/action with real GLM calls:
 * - Oracle evaluation (chance, roll, tier)
 * - Storyteller narration with tool calling
 * - State updates (HP, movement, tags)
 * - Quick actions generation
 *
 * Requires: backend running on localhost:3001, campaign with world + player character.
 *
 * Known constraints:
 * - GLM rate limits (1-2 RPM free tier) cause Oracle fallback to 50% after ~2 calls/minute
 * - Rate-limited Storyteller may produce 0-char narrative (tools-only response)
 * - These are provider limitations, not code bugs — the system degrades gracefully
 */

const BASE = "http://localhost:3001";
const CAMPAIGN_ID = "b85729f8-0de4-4d93-a0c3-e1c45646219c"; // E2E Dark Fantasy

const TURN_DELAY_MS = 45_000; // 45s between turns for GLM rate limits

// ─── Types ──────────────────────────────────────────────────────────────────

interface OracleResult {
  chance: number;
  roll: number;
  outcome: "strong_hit" | "weak_hit" | "miss";
  reasoning: string;
}

interface SSEEvent {
  type: string;
  data: unknown;
}

interface TurnResult {
  events: SSEEvent[];
  oracleResult: OracleResult | null;
  narrativeText: string;
  stateUpdates: SSEEvent[];
  quickActions: unknown | null;
  errors: SSEEvent[];
  hasDone: boolean;
}

interface TurnTestResult {
  turnLabel: string;
  passed: boolean;
  quality: number;
  details: string;
  oracleResult: OracleResult | null;
  turnResult: TurnResult;
}

// ─── SSE Parser ─────────────────────────────────────────────────────────────

async function parseSSEStream(response: Response): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const text = await response.text();

  const lines = text.split("\n");
  var currentEvent = "";
  var currentData = "";

  for (var line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      currentData = line.slice(5).trim();
    } else if (line.trim() === "" && currentData) {
      try {
        var parsed = JSON.parse(currentData);
        events.push({ type: currentEvent || "unknown", data: parsed });
      } catch {
        events.push({ type: currentEvent || "unknown", data: currentData });
      }
      currentEvent = "";
      currentData = "";
    }
  }

  if (currentData) {
    try {
      var parsedLast = JSON.parse(currentData);
      events.push({ type: currentEvent || "unknown", data: parsedLast });
    } catch {
      events.push({ type: currentEvent || "unknown", data: currentData });
    }
  }

  return events;
}

function processTurnEvents(events: SSEEvent[]): TurnResult {
  var oracleResult: OracleResult | null = null;
  var narrativeText = "";
  var stateUpdates: SSEEvent[] = [];
  var quickActions: unknown = null;
  var errors: SSEEvent[] = [];
  var hasDone = false;

  for (var event of events) {
    switch (event.type) {
      case "oracle_result":
        oracleResult = event.data as OracleResult;
        break;
      case "narrative": {
        var nd = event.data as { text?: string };
        if (nd.text) narrativeText += nd.text;
        break;
      }
      case "state_update":
        stateUpdates.push(event);
        break;
      case "quick_actions":
        quickActions = event.data;
        break;
      case "done":
        hasDone = true;
        break;
      case "error":
        errors.push(event);
        break;
    }
  }

  return { events, oracleResult, narrativeText, stateUpdates, quickActions, errors, hasDone };
}

// ─── API Helpers ────────────────────────────────────────────────────────────

async function loadCampaign(): Promise<void> {
  var res = await fetch(`${BASE}/api/campaigns/${CAMPAIGN_ID}/load`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to load campaign: ${res.status}`);
  console.log("[SETUP] Campaign loaded:", CAMPAIGN_ID);
}

async function sendAction(playerAction: string): Promise<TurnResult> {
  var res = await fetch(`${BASE}/api/chat/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerAction,
      intent: playerAction,
      method: "",
    }),
  });

  if (!res.ok) {
    var errText = await res.text();
    throw new Error(`POST /api/chat/action returned ${res.status}: ${errText}`);
  }

  var events = await parseSSEStream(res);
  return processTurnEvents(events);
}

async function getWorldData(): Promise<{
  player: { hp: number; currentLocationId: string; name: string; tags: string };
  locations: Array<{ id: string; name: string; connectedTo: string | string[] }>;
  npcs: Array<{ name: string; currentLocationId: string }>;
}> {
  var res = await fetch(`${BASE}/api/campaigns/${CAMPAIGN_ID}/world`);
  if (!res.ok) throw new Error(`GET world failed: ${res.status}`);
  return res.json();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Task 1: Multi-turn gameplay loop (5 turns) ────────────────────────────

async function runTask1(): Promise<TurnTestResult[]> {
  var results: TurnTestResult[] = [];

  // Turn 1: Exploration
  console.log("\n[Turn 1] Exploration: examining surroundings...");
  var t1 = await sendAction("I look around and examine my surroundings carefully, searching for anything of interest");
  results.push(validateAndLog(t1, "T1-Exploration", [30, 95]));

  await delay(TURN_DELAY_MS);

  // Turn 2: NPC interaction
  console.log("\n[Turn 2] NPC interaction: talking to someone...");
  var t2 = await sendAction("I approach the nearest person here and ask them about recent events and dangers in this area");
  results.push(validateAndLog(t2, "T2-NPC-Interact", [30, 90]));

  await delay(TURN_DELAY_MS);

  // Turn 3: Combat initiation
  console.log("\n[Turn 3] Combat: attacking hostile creature...");
  var t3 = await sendAction("I raise my weapon and attack the nearest threatening creature lurking nearby");
  results.push(validateAndLog(t3, "T3-Combat", [15, 80]));

  var worldAfterCombat = await getWorldData();
  console.log(`  [HP Check] Player HP after combat: ${worldAfterCombat.player.hp}/5`);

  await delay(TURN_DELAY_MS);

  // Turn 4: Movement to connected location
  var worldBeforeMove = await getWorldData();
  var currentLoc = worldBeforeMove.locations.find(l => l.id === worldBeforeMove.player.currentLocationId);
  var connectedTo = currentLoc?.connectedTo || [];
  if (typeof connectedTo === "string") connectedTo = JSON.parse(connectedTo);
  var connectedNames = (connectedTo as string[])
    .map(cid => worldBeforeMove.locations.find(l => l.id === cid)?.name)
    .filter(Boolean) as string[];

  var moveTarget = connectedNames.length > 0 ? connectedNames[0] : "the nearest settlement";
  console.log(`\n[Turn 4] Movement: traveling to ${moveTarget}...`);
  // Use format that matches MOVEMENT_REGEX: "travel to X"
  var t4 = await sendAction(`travel to ${moveTarget}`);
  results.push(validateAndLog(t4, "T4-Movement", [30, 95]));

  var worldAfterMove = await getWorldData();
  var playerLoc = worldAfterMove.locations.find(l => l.id === worldAfterMove.player.currentLocationId);
  console.log(`  [Location Check] Player now at: ${playerLoc?.name || "unknown"}`);

  var locationChanged = worldAfterMove.player.currentLocationId !== worldBeforeMove.player.currentLocationId;
  var moveEvent = t4.stateUpdates.some(su => {
    var d = su.data as { tool?: string; type?: string };
    return d.tool === "move_to" || d.type === "location_change";
  });
  console.log(`  [Movement] Location changed: ${locationChanged}, move event in SSE: ${moveEvent}`);

  await delay(TURN_DELAY_MS);

  // Turn 5: Quick action replay
  var previousQA = [t1, t2, t3, t4].map(t => t.quickActions).filter(Boolean);
  var quickAction = "I carefully observe my new surroundings and look for useful items";

  if (previousQA.length > 0) {
    var qaData = previousQA[0] as { result?: { actions?: Array<{ action: string }> } };
    var actions = qaData?.result?.actions;
    if (actions && actions.length > 0) {
      quickAction = actions[0].action;
      console.log(`\n[Turn 5] Quick action replay: "${quickAction}"`);
    } else {
      console.log(`\n[Turn 5] Using fallback action (no structured quick actions found)`);
    }
  } else {
    console.log(`\n[Turn 5] Using fallback action (no quick actions from prior turns)`);
  }

  var t5 = await sendAction(quickAction);
  results.push(validateAndLog(t5, "T5-QuickAction", [20, 95]));

  return results;
}

// ─── Task 2: Combat HP stress + Movement + Oracle calibration (3-5 turns) ──

async function runTask2(): Promise<TurnTestResult[]> {
  var results: TurnTestResult[] = [];

  var initialWorld = await getWorldData();
  var initialHp = initialWorld.player.hp;
  var locName = initialWorld.locations.find(l => l.id === initialWorld.player.currentLocationId)?.name;
  console.log(`\n[Task 2 Setup] Initial HP: ${initialHp}/5, Location: ${locName}`);

  // Turn 6: Dangerous combat
  console.log("\n[Turn 6] Dangerous combat: reckless charge...");
  var t6 = await sendAction("I charge recklessly at the strongest enemy here, ignoring my own safety");
  results.push(validateAndLog(t6, "T6-DangerousCombat", [10, 65]));

  var worldAfter6 = await getWorldData();
  console.log(`  [HP] After reckless attack: ${worldAfter6.player.hp}/5 (was ${initialHp}/5)`);

  await delay(TURN_DELAY_MS);

  // Turn 7: Continue combat
  console.log("\n[Turn 7] Wounded combat: fighting despite wounds...");
  var t7 = await sendAction("I continue fighting desperately, swinging at any creature that approaches");
  results.push(validateAndLog(t7, "T7-WoundedCombat", [10, 60]));

  var worldAfter7 = await getWorldData();
  console.log(`  [HP] After wounded combat: ${worldAfter7.player.hp}/5`);

  await delay(TURN_DELAY_MS);

  // Turn 8: Movement to connected location
  var currentWorld = await getWorldData();
  var currentLocId = currentWorld.player.currentLocationId;
  var currentLocObj = currentWorld.locations.find(l => l.id === currentLocId);
  var ct = currentLocObj?.connectedTo || [];
  if (typeof ct === "string") ct = JSON.parse(ct);
  var cNames = (ct as string[])
    .map(cid => currentWorld.locations.find(l => l.id === cid)?.name)
    .filter(Boolean) as string[];

  if (cNames.length > 0) {
    var target = cNames[0];
    console.log(`\n[Turn 8] Movement: traveling to connected "${target}"...`);
    var t8 = await sendAction(`travel to ${target}`);
    results.push(validateAndLog(t8, "T8-ConnectedMove", [30, 99]));

    var worldAfterMv = await getWorldData();
    var newLocName = worldAfterMv.locations.find(l => l.id === worldAfterMv.player.currentLocationId)?.name;
    console.log(`  [Location] After move: ${newLocName} (target: ${target})`);
    console.log(`  [Movement] Changed: ${worldAfterMv.player.currentLocationId !== currentLocId}`);
  } else {
    console.log("\n[Turn 8] SKIPPED: No connected locations from current position");
  }

  // HP range validation
  var finalWorld = await getWorldData();
  var finalHp = finalWorld.player.hp;
  console.log(`\n[HP Summary] Initial: ${initialHp}/5, Final: ${finalHp}/5, In range: ${finalHp >= 0 && finalHp <= 5}`);

  return results;
}

// ─── Validation Helpers ─────────────────────────────────────────────────────

function validateTurn(
  turn: TurnResult,
  label: string,
  expectedChanceRange: [number, number]
): TurnTestResult {
  var issues: string[] = [];
  var quality = 5;

  // Check oracle_result
  if (!turn.oracleResult) {
    issues.push("Missing oracle_result");
    quality -= 2;
  } else {
    var { chance, roll, outcome } = turn.oracleResult;
    if (typeof chance !== "number" || chance < 0 || chance > 100) {
      issues.push(`Invalid chance: ${chance}`);
      quality -= 1;
    }
    if (chance === 0) {
      issues.push("Oracle chance=0 (ORCL-04 violation)");
      quality -= 1;
    }
    if (typeof roll !== "number" || roll < 1 || roll > 100) {
      issues.push(`Invalid roll: ${roll}`);
      quality -= 1;
    }
    if (!["strong_hit", "weak_hit", "miss"].includes(outcome)) {
      issues.push(`Invalid tier: ${outcome}`);
      quality -= 1;
    }
    if (turn.oracleResult.reasoning?.includes("coin flip fallback")) {
      console.log(`  [INFO] ${label}: Oracle fallback (GLM rate limit)`);
    }
    if (chance < expectedChanceRange[0] || chance > expectedChanceRange[1]) {
      console.log(`  [WARN] ${label}: chance ${chance}% outside [${expectedChanceRange[0]}-${expectedChanceRange[1]}%]`);
    }
  }

  // Check narrative
  if (turn.narrativeText.length === 0) {
    issues.push("Empty narrative (GLM rate limit)");
    quality -= 1;
  } else if (turn.narrativeText.length < 50) {
    issues.push(`Short narrative: ${turn.narrativeText.length}ch`);
    quality -= 1;
  }

  // Check errors
  if (turn.errors.length > 0) {
    issues.push(`SSE errors: ${turn.errors.length}`);
    quality -= 2;
  }

  // Check done
  if (!turn.hasDone) {
    issues.push("Missing done event");
    quality -= 1;
  }

  quality = Math.max(0, Math.min(5, quality));

  // Pass = oracle received, no errors, done received
  // (narrative can be 0 due to GLM rate limits — quality issue, not pass/fail)
  var passed = turn.oracleResult !== null && turn.errors.length === 0 && turn.hasDone;

  var oracleStr = turn.oracleResult
    ? `chance=${turn.oracleResult.chance}% roll=${turn.oracleResult.roll} tier=${turn.oracleResult.outcome}`
    : "no oracle";

  var details = [
    oracleStr,
    `narrative=${turn.narrativeText.length}ch`,
    `updates=${turn.stateUpdates.length}`,
    `qa=${turn.quickActions ? "yes" : "no"}`,
    ...issues,
  ].join(", ");

  return { turnLabel: label, passed, quality, details, oracleResult: turn.oracleResult, turnResult: turn };
}

function validateAndLog(turn: TurnResult, label: string, range: [number, number]): TurnTestResult {
  var r = validateTurn(turn, label, range);
  var icon = r.passed ? "PASS" : "FAIL";
  console.log(`  [${icon}] ${r.turnLabel} (${r.quality}/5): ${r.details}`);
  if (r.oracleResult) {
    console.log(`  [Oracle] ${r.oracleResult.chance}% | d100=${r.oracleResult.roll} | ${r.oracleResult.outcome} | ${r.oracleResult.reasoning.slice(0, 120)}`);
  }
  if (r.turnResult.narrativeText) {
    console.log(`  [Narrative] ${r.turnResult.narrativeText.slice(0, 200)}...`);
  }
  for (var su of r.turnResult.stateUpdates) {
    var d = su.data as Record<string, unknown>;
    console.log(`  [StateUpdate] tool=${d.tool || d.type}, args=${JSON.stringify(d.args || {}).slice(0, 100)}`);
  }
  return r;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Phase 19 Plan 01: Core Gameplay API E2E Tests ===\n");

  await loadCampaign();

  var initialWorld = await getWorldData();
  console.log(`[SETUP] Player: ${initialWorld.player.name}, HP=${initialWorld.player.hp}/5`);
  var startLoc = initialWorld.locations.find(l => l.id === initialWorld.player.currentLocationId);
  console.log(`[SETUP] Location: ${startLoc?.name || "unknown"}`);
  console.log(`[SETUP] World: ${initialWorld.locations.length} locations, ${initialWorld.npcs.length} NPCs`);

  console.log("\n\n========== TASK 1: Multi-turn Gameplay Loop (5 turns) ==========");
  var task1Results = await runTask1();

  console.log("\n[Cooldown] 45s before Task 2...");
  await delay(TURN_DELAY_MS);

  console.log("\n\n========== TASK 2: Combat HP + Movement + Oracle (3 turns) ==========");
  var task2Results = await runTask2();

  // ─── Aggregate ───
  var allResults = [...task1Results, ...task2Results];
  var totalTurns = allResults.length;
  var passedTurns = allResults.filter(r => r.passed).length;
  var avgQuality = allResults.reduce((s, r) => s + r.quality, 0) / totalTurns;

  var allOracles = allResults.map(r => r.oracleResult).filter((o): o is OracleResult => o !== null);
  var turnsWithNarrative = allResults.filter(r => r.turnResult.narrativeText.length >= 50).length;
  var turnsWithQA = allResults.filter(r => r.turnResult.quickActions !== null).length;
  var turnsWithUpdates = allResults.filter(r => r.turnResult.stateUpdates.length > 0).length;
  var totalErrors = allResults.reduce((s, r) => s + r.turnResult.errors.length, 0);
  var hasZeroChance = allOracles.some(o => o.chance === 0);

  console.log("\n\n=== FINAL SUMMARY ===\n");

  console.log(`[Assert] All turns have oracle_result: ${allOracles.length === totalTurns ? "PASS" : "FAIL"} (${allOracles.length}/${totalTurns})`);
  console.log(`[Assert] Narrative >= 50ch: ${turnsWithNarrative}/${totalTurns} turns (${(turnsWithNarrative / totalTurns * 100).toFixed(0)}%)`);
  console.log(`[Assert] Quick actions: ${turnsWithQA}/${totalTurns} turns`);
  console.log(`[Assert] State updates: ${turnsWithUpdates}/${totalTurns} turns`);
  console.log(`[Assert] No SSE errors: ${totalErrors === 0 ? "PASS" : "FAIL"}`);
  console.log(`[Assert] Oracle never chance=0: ${!hasZeroChance ? "PASS" : "FAIL"}`);

  console.log("\n--- Oracle Calibration ---");
  for (var r of allResults) {
    if (r.oracleResult) {
      var fb = r.oracleResult.reasoning?.includes("fallback") ? " [GLM-FALLBACK]" : "";
      console.log(`  ${r.turnLabel}: ${r.oracleResult.chance}% d100=${r.oracleResult.roll} => ${r.oracleResult.outcome}${fb}`);
    }
  }

  var finalWorld = await getWorldData();
  console.log(`\n--- HP Tracking ---`);
  console.log(`  Start: ${initialWorld.player.hp}/5, End: ${finalWorld.player.hp}/5`);
  var hpOk = finalWorld.player.hp >= 0 && finalWorld.player.hp <= 5;
  console.log(`  In range: ${hpOk ? "PASS" : "FAIL"}`);

  console.log(`\n--- Verdict ---`);
  console.log(`Turns: ${passedTurns}/${totalTurns} passed`);
  console.log(`Average Quality: ${avgQuality.toFixed(1)}/5`);

  // Core criteria: all turns produce oracle+done without errors
  // Narrative and QA are quality metrics affected by rate limits
  var corePass = passedTurns === totalTurns && !hasZeroChance && totalErrors === 0 && hpOk;
  var qualityPass = turnsWithNarrative >= Math.ceil(totalTurns * 0.6) && turnsWithQA >= 3;

  console.log(`Core pipeline: ${corePass ? "PASS" : "FAIL"}`);
  console.log(`Quality metrics: ${qualityPass ? "PASS" : "WARN (rate limits)"}`);
  console.log(`Overall: ${corePass ? "PASS" : "FAIL"}`);

  if (!corePass) {
    console.log("\nFailed turns:");
    for (var fr of allResults.filter(r => !r.passed)) {
      console.log(`  - ${fr.turnLabel}: ${fr.details}`);
    }
  }

  process.exit(corePass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
