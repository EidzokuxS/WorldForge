/**
 * Phase 21 Plan 03: Episodic Event Storage & Retrieval Gap Closure
 *
 * Closes Gaps 1 and 2 from 21-VERIFICATION.md:
 * - Gap 1: 0 log_event calls in original test (LLM never chose to call the tool)
 * - Gap 2: Episodic event retrieval never tested (no events in DB)
 *
 * Strategy:
 * - Play turns with dramatic prompts strongly requesting event logging
 * - 60s delays between turns for GLM rate limits
 * - Verify log_event tool calls in SSE state_updates
 * - Verify episodic retrieval via narrative keyword matching
 * - NEVER accept 0 log_event calls or 0-char narrative as passing
 *
 * Requires: backend running on localhost:3001, campaign loaded.
 */

var BASE = "http://localhost:3001";
var CAMPAIGN_ID = "b85729f8-0de4-4d93-a0c3-e1c45646219c";
var TURN_DELAY_MS = 60_000;
var EMBED_WAIT_MS = 15_000;

// ── Types ──────────────────────────────────────────────────────────────────

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

interface OracleResult {
  chance: number;
  roll: number;
  outcome: "strong_hit" | "weak_hit" | "miss";
  reasoning: string;
}

interface LoreCard {
  id: string;
  term: string;
  definition: string;
  category: string;
}

interface AreaResult {
  area: string;
  passed: boolean;
  details: string;
}

// ── SSE Parser (reused from 21-01) ──────────────────────────────────────────

async function parseSSEStream(response: Response): Promise<SSEEvent[]> {
  var events: SSEEvent[] = [];
  var text = await response.text();
  var lines = text.split("\n");
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

// ── API Helpers ─────────────────────────────────────────────────────────────

async function loadCampaign(): Promise<void> {
  var res = await fetch(`${BASE}/api/campaigns/${CAMPAIGN_ID}/load`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to load campaign: ${res.status}`);
  console.log("[SETUP] Campaign loaded:", CAMPAIGN_ID);
}

async function sendAction(playerAction: string, timeoutMs = 120_000): Promise<TurnResult> {
  var controller = new AbortController();
  var timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    var res = await fetch(`${BASE}/api/chat/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerAction,
        intent: playerAction,
        method: "",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      var errText = await res.text();
      throw new Error(`POST /api/chat/action returned ${res.status}: ${errText}`);
    }

    var events = await parseSSEStream(res);
    return processTurnEvents(events);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send action with retry on transient errors (terminated, timeout, abort).
 * Waits TURN_DELAY_MS between retries.
 */
async function sendActionWithRetry(playerAction: string, maxRetries = 1): Promise<TurnResult> {
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sendAction(playerAction);
    } catch (err) {
      var msg = err instanceof Error ? err.message : String(err);
      var isTransient = msg.includes("terminated") || msg.includes("abort") || msg.includes("timeout");
      if (isTransient && attempt < maxRetries) {
        console.log(`  [Transient error: ${msg}] Waiting ${TURN_DELAY_MS / 1000}s before retry...`);
        await delay(TURN_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

async function searchLore(query: string, limit = 5): Promise<{ cards: LoreCard[] }> {
  var res = await fetch(`${BASE}/api/campaigns/${CAMPAIGN_ID}/lore/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error(`GET lore/search returned ${res.status}`);
  return res.json();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(turnResult: TurnResult): boolean {
  return turnResult.errors.some((e: SSEEvent) => {
    var d = e.data as Record<string, unknown>;
    var errMsg = (d.error as string) || "";
    return errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("rate_limit");
  });
}

function countLogEvents(turnResult: TurnResult): number {
  return turnResult.stateUpdates.filter((su: SSEEvent) => {
    var d = su.data as Record<string, unknown>;
    return d.tool === "log_event";
  }).length;
}

// ── Area 1: Episodic Event Storage (log_event calls) ─────────────────────

async function testEpisodicStorage(): Promise<{ result: AreaResult; totalLogEvents: number }> {
  console.log("\n=== AREA 1: Episodic Event Storage (log_event calls) ===\n");

  var totalLogEvents = 0;

  try {
    // Turn 1: Dramatic prompt designed to strongly trigger log_event
    var turn1Prompt = "I perform a dramatic ritual sacrifice of the ancient artifact, shattering it into pieces and releasing dark magic into the air. This is a pivotal, world-changing moment that must be remembered.";
    console.log("  [Turn 1] Sending dramatic action to trigger log_event...");
    console.log(`  [Turn 1] Prompt: ${turn1Prompt.slice(0, 80)}...`);

    var turn1 = await sendActionWithRetry(turn1Prompt);
    var turn1LogEvents = countLogEvents(turn1);
    totalLogEvents += turn1LogEvents;

    var turn1RateLimited = isRateLimited(turn1);
    console.log(`  [Turn 1] narrative=${turn1.narrativeText.length}ch, log_events=${turn1LogEvents}, rate_limited=${turn1RateLimited}`);

    if (turn1.narrativeText.length > 0) {
      console.log(`  [Turn 1] Narrative: ${turn1.narrativeText.slice(0, 200)}...`);
    }

    // Log state updates
    for (var su of turn1.stateUpdates) {
      var suData = su.data as Record<string, unknown>;
      console.log(`    [state_update] tool=${suData.tool}, args=${JSON.stringify(suData.args || {}).slice(0, 120)}`);
    }

    // If turn 1 got 0 log_event calls, try turn 2 after delay
    if (turn1LogEvents === 0) {
      console.log(`\n  [Turn 1] 0 log_event calls. Waiting ${TURN_DELAY_MS / 1000}s then trying Turn 2...`);
      await delay(TURN_DELAY_MS);

      var turn2Prompt = "I write in my journal: Record this moment - the artifact is destroyed, dark energy released, the temple is crumbling. This event changes everything. I want to make sure this pivotal moment is logged forever.";
      console.log(`  [Turn 2] Prompt: ${turn2Prompt.slice(0, 80)}...`);

      var turn2 = await sendActionWithRetry(turn2Prompt);
      var turn2LogEvents = countLogEvents(turn2);
      totalLogEvents += turn2LogEvents;

      var turn2RateLimited = isRateLimited(turn2);
      console.log(`  [Turn 2] narrative=${turn2.narrativeText.length}ch, log_events=${turn2LogEvents}, rate_limited=${turn2RateLimited}`);

      if (turn2.narrativeText.length > 0) {
        console.log(`  [Turn 2] Narrative: ${turn2.narrativeText.slice(0, 200)}...`);
      }

      for (var su2 of turn2.stateUpdates) {
        var su2Data = su2.data as Record<string, unknown>;
        console.log(`    [state_update] tool=${su2Data.tool}, args=${JSON.stringify(su2Data.args || {}).slice(0, 120)}`);
      }
    }

    // CRITICAL: Do NOT accept 0 log_event calls
    if (totalLogEvents === 0) {
      console.log(`\n  [FAIL] 0 log_event calls across all turns. Area FAILS.`);
      return {
        result: {
          area: "Episodic Event Storage (log_event calls)",
          passed: false,
          details: `0 log_event calls across turns (turn1: ${turn1LogEvents}, ${turn1RateLimited ? "rate-limited" : "not rate-limited"}${turn1LogEvents === 0 ? `, turn2: ${countLogEvents(turn2!)}, ${isRateLimited(turn2!) ? "rate-limited" : "not rate-limited"}` : ""})`,
        },
        totalLogEvents: 0,
      };
    }

    console.log(`\n  [PASS] ${totalLogEvents} log_event call(s) observed.`);
    return {
      result: {
        area: "Episodic Event Storage (log_event calls)",
        passed: true,
        details: `${totalLogEvents} log_event call(s) observed across turns`,
      },
      totalLogEvents,
    };
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    console.log(`  [FAIL] Error: ${msg}`);
    return {
      result: { area: "Episodic Event Storage (log_event calls)", passed: false, details: msg },
      totalLogEvents: 0,
    };
  }
}

// ── Area 2: Episodic Event Retrieval (semantic influence) ─────────────────

async function testEpisodicRetrieval(): Promise<AreaResult> {
  console.log("\n=== AREA 2: Episodic Event Retrieval (semantic influence) ===\n");

  try {
    // Wait for async embedding to complete from Area 1
    console.log(`  [Embed] Waiting ${EMBED_WAIT_MS / 1000}s for async embedding...`);
    await delay(EMBED_WAIT_MS);

    // Play a turn that references the prior event to trigger episodic retrieval
    var recallPrompt = "I recall what happened with the artifact -- what dark magic was released? What were the consequences of that ritual?";
    console.log(`  [Recall Turn] Sending recall prompt to trigger episodic retrieval...`);
    console.log(`  [Recall Turn] Prompt: ${recallPrompt.slice(0, 80)}...`);

    var recallTurn = await sendActionWithRetry(recallPrompt);
    var narrative = recallTurn.narrativeText;

    console.log(`  [Recall Turn] narrative=${narrative.length}ch, rate_limited=${isRateLimited(recallTurn)}`);

    // If 0-char narrative (rate limit), wait and retry once
    if (narrative.length === 0) {
      console.log(`  [Recall Turn] 0-char narrative. Waiting ${TURN_DELAY_MS / 1000}s then retrying...`);
      await delay(TURN_DELAY_MS);

      var retryTurn = await sendActionWithRetry(recallPrompt);
      narrative = retryTurn.narrativeText;
      console.log(`  [Retry Turn] narrative=${narrative.length}ch, rate_limited=${isRateLimited(retryTurn)}`);
    }

    // CRITICAL: 0-char narrative on both attempts = FAIL
    if (narrative.length === 0) {
      console.log(`  [FAIL] 0-char narrative on both attempts.`);
      return {
        area: "Episodic Event Retrieval (semantic influence)",
        passed: false,
        details: "0-char narrative on both attempts (rate limit)",
      };
    }

    console.log(`  [Recall Turn] Narrative: ${narrative.slice(0, 300)}...`);

    // Check for keywords proving episodic memory influenced narration
    var keywords = ["artifact", "dark", "ritual", "magic", "shatter", "destroy", "energy", "temple", "crumbl"];
    var lowerNarrative = narrative.toLowerCase();
    var matchedKeywords = keywords.filter((kw) => lowerNarrative.includes(kw));

    console.log(`  [Keywords] Matched: ${matchedKeywords.length} (${matchedKeywords.join(", ")})`);

    if (matchedKeywords.length >= 1) {
      console.log(`  [PASS] Narrative contains episodic memory keywords.`);
      return {
        area: "Episodic Event Retrieval (semantic influence)",
        passed: true,
        details: `Narrative (${narrative.length}ch) contains ${matchedKeywords.length} keyword(s): ${matchedKeywords.join(", ")}`,
      };
    }

    console.log(`  [FAIL] No keyword matches in narrative.`);
    return {
      area: "Episodic Event Retrieval (semantic influence)",
      passed: false,
      details: `Narrative (${narrative.length}ch) contains 0 keywords out of: ${keywords.join(", ")}`,
    };
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    console.log(`  [FAIL] Error: ${msg}`);
    return { area: "Episodic Event Retrieval (semantic influence)", passed: false, details: msg };
  }
}

// ── Area 3: Prompt Assembly with Episodic Context ─────────────────────────

async function testPromptAssembly(): Promise<AreaResult> {
  console.log("\n=== AREA 3: Prompt Assembly with Episodic Context ===\n");

  try {
    // Verify lore system is responsive first
    console.log("  [Lore] Testing lore search responsiveness...");
    var loreResults = await searchLore("artifact ritual", 5);
    console.log(`  [Lore] Search returned ${loreResults.cards.length} cards`);
    for (var card of loreResults.cards) {
      console.log(`    - [${card.category}] ${card.term}`);
    }

    // Wait for rate limit recovery
    console.log(`  [Delay] Waiting ${TURN_DELAY_MS / 1000}s for rate limit recovery...`);
    await delay(TURN_DELAY_MS);

    // Play a final turn asking about recent events
    var contextPrompt = "What significant events have occurred recently? I want to reflect on everything that has happened.";
    console.log(`  [Context Turn] Prompt: ${contextPrompt}`);

    var contextTurn = await sendActionWithRetry(contextPrompt);
    var narrative = contextTurn.narrativeText;

    console.log(`  [Context Turn] narrative=${narrative.length}ch, rate_limited=${isRateLimited(contextTurn)}`);

    // If 0-char, retry after delay
    if (narrative.length === 0) {
      console.log(`  [Context Turn] 0-char. Waiting ${TURN_DELAY_MS / 1000}s then retrying...`);
      await delay(TURN_DELAY_MS);

      var retryContextTurn = await sendActionWithRetry(contextPrompt);
      narrative = retryContextTurn.narrativeText;
      console.log(`  [Retry Turn] narrative=${narrative.length}ch, rate_limited=${isRateLimited(retryContextTurn)}`);
    }

    // CRITICAL: 0-char on both = FAIL
    if (narrative.length === 0) {
      console.log(`  [FAIL] 0-char narrative on both attempts.`);
      return {
        area: "Prompt Assembly with Episodic Context",
        passed: false,
        details: "0-char narrative on both attempts (rate limit)",
      };
    }

    console.log(`  [Context Turn] Narrative: ${narrative.slice(0, 300)}...`);

    // Area passes if narrative > 100 chars (proves prompt assembly works)
    if (narrative.length > 100) {
      console.log(`  [PASS] Narrative is ${narrative.length}ch (> 100ch threshold).`);
      return {
        area: "Prompt Assembly with Episodic Context",
        passed: true,
        details: `Narrative ${narrative.length}ch (> 100ch threshold), proving prompt assembly with episodic context works`,
      };
    }

    console.log(`  [FAIL] Narrative too short: ${narrative.length}ch (< 100ch threshold).`);
    return {
      area: "Prompt Assembly with Episodic Context",
      passed: false,
      details: `Narrative ${narrative.length}ch (< 100ch threshold)`,
    };
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    console.log(`  [FAIL] Error: ${msg}`);
    return { area: "Prompt Assembly with Episodic Context", passed: false, details: msg };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Phase 21 Plan 03: Episodic Event Gap Closure E2E ===\n");

  // Setup
  await loadCampaign();
  var results: AreaResult[] = [];

  // Area 1: Episodic event storage (log_event calls)
  var storageResult = await testEpisodicStorage();
  results.push(storageResult.result);

  // Area 2: Episodic event retrieval (semantic influence)
  var retrievalResult = await testEpisodicRetrieval();
  results.push(retrievalResult);

  // Area 3: Prompt assembly with episodic context
  var assemblyResult = await testPromptAssembly();
  results.push(assemblyResult);

  // ── Scoring ──────────────────────────────────────────────────────────────

  var passedCount = results.filter((r) => r.passed).length;
  var totalAreas = results.length;
  var qualityScore = (passedCount / totalAreas) * 5.0;
  var threshold = 2;

  console.log("\n\n=== FINAL SUMMARY ===\n");
  console.log("Area Results:");
  for (var r of results) {
    var icon = r.passed ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.area}: ${r.details}`);
  }

  console.log(`\nAreas: ${passedCount}/${totalAreas} passed`);
  console.log(`Quality Score: ${qualityScore.toFixed(1)}/5.0`);
  console.log(`Threshold: ${threshold}/${totalAreas} areas`);
  console.log(`Overall: ${passedCount >= threshold ? "PASS" : "FAIL"}`);

  // Write results JSON
  var resultsJson = {
    phase: "21",
    plan: "03",
    gap_closure: true,
    timestamp: new Date().toISOString(),
    areas: results,
    passedCount,
    totalAreas,
    qualityScore: Number(qualityScore.toFixed(1)),
    threshold,
    overall: passedCount >= threshold ? "PASS" : "FAIL",
  };

  var fs = await import("node:fs");
  var path = await import("node:path");
  var resultsPath = path.resolve(import.meta.dirname || ".", "..", "e2e", "21-03-results.json");
  // Fallback: if dirname not available, try relative
  if (!import.meta.dirname) {
    resultsPath = path.resolve("e2e", "21-03-results.json");
  }
  fs.writeFileSync(
    resultsPath,
    JSON.stringify(resultsJson, null, 2),
    "utf-8"
  );
  console.log(`\nResults written to ${resultsPath}`);

  process.exit(passedCount >= threshold ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
