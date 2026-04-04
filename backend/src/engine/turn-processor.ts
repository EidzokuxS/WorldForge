/**
 * Turn processor: orchestrates the full Oracle -> Storyteller pipeline.
 *
 * Yields typed TurnEvents as an async generator, allowing the caller
 * (route handler) to stream events to the client as they happen.
 */

import { streamText, stepCountIs } from "ai";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { callOracle, type OracleResult } from "./oracle.js";
import { assemblePrompt } from "./prompt-assembler.js";
import { createStorytellerTools } from "./tool-schemas.js";
import {
  getChatHistory,
  appendChatMessages,
  incrementTick,
  readCampaignConfig,
} from "../campaign/index.js";
import { getDb } from "../db/index.js";
import { players, locations } from "../db/schema.js";
import type { ResolveResult } from "../ai/index.js";
import { createLogger } from "../lib/index.js";
import { hydrateStoredPlayerRecord } from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";

const log = createLogger("turn-processor");

// -- Types --------------------------------------------------------------------

export interface TurnEvent {
  type:
    | "oracle_result"
    | "narrative"
    | "state_update"
    | "quick_actions"
    | "auto_checkpoint"
    | "done"
    | "error";
  data: unknown;
}

export interface TurnOptions {
  campaignId: string;
  playerAction: string;
  intent: string;
  method: string;
  judgeProvider: ProviderConfig;
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ResolveResult;
  fallbackProvider?: ProviderConfig | null;
  contextWindow?: number;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
}

export interface TurnSummary {
  tick: number;
  oracleResult: OracleResult;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  narrativeText: string;
}

// -- Movement detection -------------------------------------------------------

const movementDetectionSchema = z.object({
  isMovement: z.boolean().describe("Whether the action is a movement/travel command"),
  destination: z.string().nullable().describe("The destination name if movement detected, null otherwise"),
});

/**
 * Detect if a player action is a movement command using LLM analysis.
 * Returns the destination name if matched, null otherwise.
 */
export async function detectMovement(
  action: string,
  judgeProvider: ProviderConfig,
): Promise<string | null> {
  try {
    const { object } = await generateObject({
      model: createModel(judgeProvider),
      schema: movementDetectionSchema,
      prompt: `Is this player action a movement/travel command? If yes, extract the destination name.

Actions like "go to X", "head towards X", "visit X", "walk to X", "check out X", "travel to X", "let's go to X", "I want to visit X" are movement.
Actions like "attack", "talk to", "look around", "pick up", "search", "examine" are NOT movement.
Movement in any language counts (e.g. Russian "Пойдём на рынок" = movement to "рынок").

Player action: "${action.trim()}"`,
      temperature: 0.1,
    });

    if (object.isMovement && object.destination) {
      return object.destination.trim();
    }
    return null;
  } catch (error) {
    log.warn("LLM movement detection failed, assuming no movement", error);
    return null;
  }
}

// -- Narrative sanitizer --------------------------------------------------------

/**
 * Remove metadata leaks from Storyteller narrative output.
 * Some LLMs (notably Gemini Flash) echo bracketed section headers and their
 * content into the narrative despite explicit instructions not to.
 * This function strips everything from the FIRST leaked header onward.
 */
const LEAKED_HEADERS = [
  "[NPC STATES]",
  "[ACTION RESULT]",
  "[NARRATION DIRECTIVE]",
  "[RECENT CONVERSATION]",
  "[SYSTEM RULES]",
  "[WORLD PREMISE]",
  "[SCENE]",
  "[PLAYER STATE]",
  "[WORLD STATE]",
  "[LORE CONTEXT]",
  "[EPISODIC MEMORY]",
  "[RELATIONSHIPS]",
];

/**
 * Patterns that match tool-call syntax leaked into prose by models like Gemini Flash.
 * Examples:
 *   print(default_api.offer_quick_actions(actions=[...]))
 *   default_api.set_condition(entity="player", delta=-1)
 */
const TOOL_CALL_LEAK_PATTERNS: RegExp[] = [
  // print(default_api.xxx(...)) — may span multiple lines
  /print\s*\(\s*default_api\.\w+\s*\([^)]*\)\s*\)/gs,
  // bare default_api.xxx(...) calls
  /default_api\.\w+\s*\([^)]*\)/gs,
  // generic tool-call-like syntax: known tool names with arguments
  /\b(?:offer_quick_actions|set_condition|log_event|spawn_npc|spawn_item|reveal_location|set_relationship|add_chronicle_entry|add_tag|remove_tag|transfer_item|move_to)\s*\([^)]*\)/g,
  // Catch-all: any word_word(param=value, ...) pattern that looks like a function call
  /\b[a-z_]+\s*\(\s*(?:[a-z_]+=|["'\[])[^)]*\)/gi,
  // Bare print(...) wrapping anything
  /print\s*\([^)]*\)/gs,
];

export function sanitizeNarrative(raw: string): string {
  let text = raw;

  // 1. Strip tool-call syntax that leaked into prose
  for (const pattern of TOOL_CALL_LEAK_PATTERNS) {
    text = text.replace(pattern, "");
  }

  // 2. Find the earliest occurrence of any leaked header and truncate
  let earliestIdx = text.length;
  for (const header of LEAKED_HEADERS) {
    const idx = text.indexOf(header);
    if (idx !== -1 && idx < earliestIdx) {
      earliestIdx = idx;
    }
  }
  if (earliestIdx < text.length) {
    text = text.slice(0, earliestIdx);
  }

  // 3. Collapse excessive whitespace left by removals
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

// -- Outcome instructions -----------------------------------------------------

const OUTCOME_INSTRUCTIONS: Record<string, string> = {
  strong_hit:
    "The player SUCCEEDED DECISIVELY. Narrate full success with sensory detail of mastery — the action is executed flawlessly. Include an unexpected bonus or advantage (discovered something, impressed an NPC, gained a tactical edge). In combat: if the player dealt damage to an NPC, narrate it. If the player avoided all harm, emphasize their dominance.",
  weak_hit:
    "The player SUCCEEDED WITH A COMPLICATION. The action works, but name the SPECIFIC complication — damaged equipment, unwanted attention, partial result, physical cost, time lost. The success must feel earned, not free. In combat: the complication often involves injury, exposure, lost position, or another immediate setback. If HP reaches 0 during the consequence, narrate the death/defeat/KO outcome immediately and do not continue the fight.",
  miss: "The player FAILED. Narrate the failure clearly and unambiguously. In combat: the attack misses or is blocked and the opposition seizes the initiative. Persuasion miss means refusal, dismissal, or hostility. Search miss means nothing useful is found or new danger is stirred up. Information miss means the answer is blocked, false, or dangerously incomplete. NEVER narrate the NPC being 'intrigued', 'persuaded', 'considering', or 'impressed' on a miss. The failure must be OBVIOUS to the reader. Include concrete consequences. If HP reaches 0 during the consequence, narrate the death/defeat/KO outcome immediately and do not continue the fight.",
};

// -- Fallback quick actions ---------------------------------------------------

interface SceneInfo {
  locationName: string;
  npcNames: string[];
}

/**
 * Build 3 contextual quick action suggestions as a server-side fallback
 * when the Storyteller fails to call offer_quick_actions.
 */
function buildFallbackQuickActions(
  playerAction: string,
  outcomeTier: string,
  context: SceneInfo,
): Array<{ label: string; action: string }> {
  const actions: Array<{ label: string; action: string }> = [];

  // 1. NPC interaction (if NPCs present) or exploration
  if (context.npcNames.length > 0) {
    const npc = context.npcNames[0]!;
    actions.push({ label: `Talk to ${npc}`, action: `Talk to ${npc}` });
  } else {
    actions.push({ label: "Call out", action: "Call out to see if anyone is nearby" });
  }

  // 2. Always: observation/exploration
  actions.push({
    label: "Look around",
    action: `Look around ${context.locationName || "the area"} for anything noteworthy`,
  });

  // 3. Outcome-based suggestion
  if (outcomeTier === "miss") {
    actions.push({ label: "Try again carefully", action: "Try again, this time more carefully" });
  } else if (outcomeTier === "strong_hit") {
    actions.push({ label: "Press the advantage", action: "Press the advantage and continue forward" });
  } else {
    actions.push({ label: "Proceed cautiously", action: "Proceed cautiously, staying alert" });
  }

  return actions;
}

// -- Main processor -----------------------------------------------------------

export async function* processTurn(
  options: TurnOptions
): AsyncGenerator<TurnEvent> {
  const {
    campaignId,
    playerAction,
    intent,
    method,
    judgeProvider,
    storytellerProvider,
    storytellerTemperature,
    storytellerMaxTokens,
    embedderResult,
    fallbackProvider,
    contextWindow = 8192,
    onPostTurn,
  } = options;

  // 1. Query game state
  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  let actorTags: string[] = [];
  let environmentTags: string[] = [];
  let sceneContext = "";

  if (player) {
    const playerRecord = hydrateStoredPlayerRecord(player);
    actorTags = deriveRuntimeCharacterTags(playerRecord);

    // Include HP status in scene context for Oracle to factor in
    if (playerRecord.state.hp < 5) {
      sceneContext += ` Actor HP: ${playerRecord.state.hp}/5.`;
    }

    if (player.currentLocationId) {
      const location = db
        .select()
        .from(locations)
        .where(eq(locations.id, player.currentLocationId))
        .get();

      if (location) {
        try {
          environmentTags = JSON.parse(location.tags) as string[];
        } catch {
          environmentTags = [];
        }
        sceneContext = `${location.name}: ${location.description}`;
      }
    }
  }

  // 1b. Detect movement and handle location change
  const movementDestination = await detectMovement(playerAction, judgeProvider);
  if (movementDestination && player) {
    const destName = movementDestination.toLowerCase();

    // Find destination by name (case-insensitive)
    const allLocations = db
      .select()
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();

    const destination = allLocations.find(
      (loc) => loc.name.toLowerCase() === destName
    );

    if (destination && player.currentLocationId) {
      // Get current location to check connections
      const currentLocation = db
        .select()
        .from(locations)
        .where(eq(locations.id, player.currentLocationId))
        .get();

      if (currentLocation) {
        let connectedIds: string[] = [];
        try {
          connectedIds = JSON.parse(currentLocation.connectedTo) as string[];
        } catch {
          connectedIds = [];
        }

        if (connectedIds.includes(destination.id)) {
          // Connected -- update player location
          db.update(players)
            .set({ currentLocationId: destination.id })
            .where(eq(players.id, player.id))
            .run();

          // Update in-memory reference for rest of turn
          player.currentLocationId = destination.id;

          yield {
            type: "state_update",
            data: {
              type: "location_change",
              locationId: destination.id,
              locationName: destination.name,
            },
          };

          // Update scene context for Oracle
          sceneContext = `${destination.name}: ${destination.description}`;
          try {
            environmentTags = JSON.parse(destination.tags) as string[];
          } catch {
            environmentTags = [];
          }
        } else {
          // Not connected -- add available paths to scene context for Oracle
          const reachableNames = allLocations
            .filter((loc) => connectedIds.includes(loc.id))
            .map((loc) => loc.name);
          sceneContext += `\nAvailable paths from here: ${reachableNames.join(", ")}`;
        }
      }
    }
    // If destination not found at all -- pass through to Oracle/Storyteller (might reveal_location)
  }

  // 2. Call Oracle
  const oracleResult = await callOracle(
    {
      intent,
      method,
      actorTags,
      targetTags: [],
      environmentTags,
      sceneContext,
    },
    judgeProvider,
    fallbackProvider ?? null
  );

  yield { type: "oracle_result", data: oracleResult };

  // 3. Assemble prompt
  const assembled = await assemblePrompt({
    campaignId,
    contextWindow,
    actionResult: oracleResult,
    embedderResult,
    playerAction,
    judgeRole: { provider: judgeProvider, temperature: 0.1, maxTokens: 1024 },
  });

  // 4. Build system prompt with outcome instructions
  const outcomeInstruction =
    OUTCOME_INSTRUCTIONS[oracleResult.outcome] ?? "";
  const systemPrompt = `${assembled.formatted}\n\n[NARRATION DIRECTIVE]\n${outcomeInstruction}`;

  // 5. Get chat history
  const chatHistory = getChatHistory(campaignId);

  // 6. Persist user message
  appendChatMessages(campaignId, [{ role: "user", content: playerAction }]);

  // 7. Get current tick
  const config = readCampaignConfig(campaignId);
  const currentTick = config.currentTick ?? 0;

  // 8. Create tools (pass outcomeTier so set_condition can enforce HP guard)
  const tools = createStorytellerTools(campaignId, currentTick, oracleResult.outcome);

  // 9. Call Storyteller with streaming
  const storyMessages = [
    ...chatHistory.slice(-20),
    { role: "user" as const, content: playerAction },
  ];

  const model = createModel(storytellerProvider);
  const result = streamText({
    model,
    system: systemPrompt,
    messages: storyMessages,
    tools,
    stopWhen: stepCountIs(3),
    temperature: storytellerTemperature,
    maxOutputTokens: storytellerMaxTokens,
  });

  // 10. Iterate fullStream, yield events
  // Stream narrative deltas but detect metadata leaks in real-time.
  // Once a leaked header is detected, stop streaming narrative text.
  let rawNarrative = "";
  let leakDetected = false;
  let quickActionsEmitted = false;
  let narrativeStarted = false;
  const toolCallResults: Array<{
    tool: string;
    args: unknown;
    result: unknown;
  }> = [];

  /**
   * Process a single stream part: yield events, track state.
   * Returns yielded TurnEvents for the caller to yield.
   */
  function processStreamPart(
    part: { type: string; [key: string]: unknown },
  ): TurnEvent[] {
    const events: TurnEvent[] = [];
    if (part.type === "text-delta") {
      const text = part.text as string;
      narrativeStarted = true;
      rawNarrative += text;
      if (!leakDetected) {
        const hasLeak = LEAKED_HEADERS.some((h) => rawNarrative.includes(h));
        if (hasLeak) {
          leakDetected = true;
          sanitizeNarrative(rawNarrative);
          log.warn("Metadata leak detected in Storyteller output, truncating narrative");
        } else {
          events.push({ type: "narrative", data: { text } });
        }
      }
    } else if (part.type === "tool-result") {
      const toolName = (part as Record<string, unknown>).toolName as string;
      const args = (part as Record<string, unknown>).input;
      const toolOutput = (part as Record<string, unknown>).output;

      const toolResult = { tool: toolName, args, result: toolOutput };
      toolCallResults.push(toolResult);

      if (toolName === "offer_quick_actions") {
        quickActionsEmitted = true;
        events.push({ type: "quick_actions", data: toolOutput });
      } else {
        events.push({ type: "state_update", data: toolResult });
      }
    }
    return events;
  }

  try {
    for await (const part of result.fullStream) {
      const events = processStreamPart(part as { type: string });
      for (const event of events) {
        yield event;
      }
    }
  } catch (streamError) {
    if (!narrativeStarted && fallbackProvider) {
      log.warn("Storyteller stream failed before narrative, retrying with fallback", streamError);
      // Reset state for retry
      rawNarrative = "";
      leakDetected = false;
      quickActionsEmitted = false;
      narrativeStarted = false;
      toolCallResults.length = 0;

      const fallbackModel = createModel(fallbackProvider);
      const fallbackResult = streamText({
        model: fallbackModel,
        system: systemPrompt,
        messages: storyMessages,
        tools,
        stopWhen: stepCountIs(3),
        temperature: storytellerTemperature,
        maxOutputTokens: storytellerMaxTokens,
      });

      for await (const part of fallbackResult.fullStream) {
        const events = processStreamPart(part as { type: string });
        for (const event of events) {
          yield event;
        }
      }
    } else {
      throw streamError;
    }
  }

  // 10b. Fallback quick actions if Storyteller didn't call offer_quick_actions
  if (!quickActionsEmitted) {
    // Gather NPC names at player's current location for contextual suggestions
    let locationName = "";
    const npcNames: string[] = [];
    try {
      if (player?.currentLocationId) {
        const loc = db
          .select()
          .from(locations)
          .where(eq(locations.id, player.currentLocationId))
          .get();
        if (loc) locationName = loc.name;

        const { npcs } = await import("../db/schema.js");
        const presentNpcs = db
          .select({ name: npcs.name })
          .from(npcs)
          .where(eq(npcs.currentLocationId, player.currentLocationId))
          .all();
        for (const npc of presentNpcs) {
          npcNames.push(npc.name);
        }
      }
    } catch {
      // Best-effort — fallback works even without NPC data
    }

    const fallbackActions = buildFallbackQuickActions(
      playerAction,
      oracleResult.outcome,
      { locationName, npcNames },
    );
    log.info("Storyteller omitted offer_quick_actions — using server-side fallback");
    yield { type: "quick_actions", data: { success: true, result: { actions: fallbackActions } } };
  }

  // 10c. Reactive auto-checkpoint if HP dropped to danger zone (2 or below) during turn
  const hpDropped = toolCallResults.some((tc) => {
    if (tc.tool !== "set_condition") return false;
    const output = tc.result as Record<string, unknown> | undefined;
    const inner = output?.result as Record<string, unknown> | undefined;
    const newHp = inner?.newHp as number | undefined;
    return newHp !== undefined && newHp <= 2 && newHp > 0; // >0 because HP=0 is game over, not checkpoint
  });

  if (hpDropped) {
    yield { type: "auto_checkpoint", data: { reason: "HP dropped to danger zone" } };
  }

  // 11. Sanitize narrative and persist
  const narrativeText = sanitizeNarrative(rawNarrative);
  log.info(`Stream complete: raw=${rawNarrative.length} chars, sanitized=${narrativeText.length} chars, leakDetected=${leakDetected}`);
  if (narrativeText) {
    appendChatMessages(campaignId, [
      { role: "assistant", content: narrativeText },
    ]);
  }
  const newTick = incrementTick(campaignId);

  // 12. Yield done
  yield { type: "done", data: { tick: newTick } };

  // 13. Post-turn callback (fire-and-forget — do NOT await so the SSE stream
  //     closes immediately after yielding 'done', keeping isStreaming accurate)
  if (onPostTurn) {
    const summary: TurnSummary = {
      tick: newTick,
      oracleResult,
      toolCalls: toolCallResults,
      narrativeText,
    };

    void (async () => {
      try {
        await onPostTurn(summary);
      } catch (error) {
        log.warn("Post-turn callback failed", error);
      }
    })();
  }
}
