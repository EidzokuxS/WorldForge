/**
 * Turn processor: orchestrates the full Oracle -> Storyteller pipeline.
 *
 * Yields typed TurnEvents as an async generator, allowing the caller
 * (route handler) to stream events to the client as they happen.
 */

import { generateText, streamText, stepCountIs } from "ai";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { callOracle, type OracleResult } from "./oracle.js";
import {
  assembleFinalNarrationPrompt,
  assemblePrompt,
} from "./prompt-assembler.js";
import { createStorytellerTools } from "./tool-schemas.js";
import {
  getChatHistory,
  appendChatMessages,
  advanceCampaignTick,
  incrementTick,
  readCampaignConfig,
} from "../campaign/index.js";
import { getDb } from "../db/index.js";
import { players, locations } from "../db/schema.js";
import type { ResolveResult } from "../ai/index.js";
import { createLogger } from "../lib/index.js";
import {
  hydrateStoredPlayerRecord,
  projectPlayerRecord,
} from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { resolveActionTargetContext } from "./target-context.js";
import { applyStartConditionEffects } from "./start-condition-runtime.js";
import {
  listConnectedPaths,
  loadLocationGraph,
  resolveLocationTarget,
  resolveTravelPath,
} from "./location-graph.js";
import {
  assembleAuthoritativeScene,
  collapseRepeatedNarrationBlocks,
  type SceneAssembly,
} from "./scene-assembly.js";

const log = createLogger("turn-processor");

// -- Types --------------------------------------------------------------------

export interface TurnEvent {
  type:
    | "oracle_result"
    | "scene-settling"
    | "narrative"
    | "state_update"
    | "quick_actions"
    | "auto_checkpoint"
    | "finalizing_turn"
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
  openingScene?: boolean;
  onBeforeVisibleNarration?: (summary: HiddenTurnSummary) => void | Promise<void>;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
}

export interface OpeningSceneOptions {
  campaignId: string;
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ResolveResult;
  fallbackProvider?: ProviderConfig | null;
  contextWindow?: number;
}

export interface HiddenTurnSummary {
  currentTick: number;
  predictedTick: number;
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  oracleResult: OracleResult;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  openingScene: boolean;
  sceneAssembly?: SceneAssembly;
}

export interface TurnSummary {
  tick: number;
  oracleResult: OracleResult;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  narrativeText: string;
  sceneAssembly?: SceneAssembly;
}

// Finalization is authoritative turn work. Give it a long ceiling instead of
// rolling back a turn mid-reflection or mid-simulation.
const TURN_FINALIZATION_TIMEOUT_MS = 20 * 60_000;

function persistPlayerRuntimeRecord(
  db: ReturnType<typeof getDb>,
  playerId: string,
  campaignId: string,
  record: ReturnType<typeof hydrateStoredPlayerRecord>,
) {
  const projection = projectPlayerRecord(record);
  db.update(players)
    .set({
      ...projection,
      campaignId,
    })
    .where(eq(players.id, playerId))
    .run();
}

function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type SuccessfulTravel = {
  locationId: string;
  locationName: string;
  travelCost: number;
  tickAdvance: number;
  path: string[];
};

function resolveSceneScopeId(
  currentLocationId: string | null | undefined,
  currentSceneLocationId: string | null | undefined,
): string | null {
  return currentSceneLocationId ?? currentLocationId ?? null;
}

function syncPlayerRecordLocation(
  record: ReturnType<typeof hydrateStoredPlayerRecord>,
  locationId: string,
  locationName: string,
) {
  return {
    ...record,
    socialContext: {
      ...record.socialContext,
      currentLocationId: locationId,
      currentLocationName: locationName,
    },
  };
}

function ensurePlayerSceneScopeAlignment(
  db: ReturnType<typeof getDb>,
  player: typeof players.$inferSelect | undefined,
): string | null {
  if (!player) {
    return null;
  }

  const resolvedSceneScopeId = resolveSceneScopeId(
    player.currentLocationId,
    player.currentSceneLocationId,
  );

  if (
    player.currentLocationId
    && resolvedSceneScopeId
    && player.currentSceneLocationId !== resolvedSceneScopeId
    && typeof (db as { update?: unknown }).update === "function"
  ) {
    db.update(players)
      .set({ currentSceneLocationId: resolvedSceneScopeId })
      .where(eq(players.id, player.id))
      .run();
    player.currentSceneLocationId = resolvedSceneScopeId;
  }

  return resolvedSceneScopeId;
}

function persistPlayerLocation(
  db: ReturnType<typeof getDb>,
  player: typeof players.$inferSelect,
  locationId: string,
  locationName: string,
) {
  const updatedPlayer = hydrateStoredPlayerRecord(player, {
    currentLocationName: locationName,
  });

  db.update(players)
    .set(
      {
        ...projectPlayerRecord(syncPlayerRecordLocation(updatedPlayer, locationId, locationName)),
        currentSceneLocationId: locationId,
      },
    )
    .where(eq(players.id, player.id))
    .run();

  player.currentSceneLocationId = locationId;
}

function getPathNames(locationIds: string[], allLocations: readonly typeof locations.$inferSelect[]) {
  const nameById = new Map(allLocations.map((location) => [location.id, location.name]));
  return locationIds
    .map((locationId) => nameById.get(locationId))
    .filter((locationName): locationName is string => Boolean(locationName));
}

function getSuccessfulMoveToolResult(result: unknown): SuccessfulTravel | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const toolResult = result as {
    success?: boolean;
    result?: {
      locationId?: unknown;
      locationName?: unknown;
      travelCost?: unknown;
      path?: unknown;
    };
  };

  if (!toolResult.success || !toolResult.result || typeof toolResult.result !== "object") {
    return null;
  }

  const travelCost = toolResult.result.travelCost;
  const path = toolResult.result.path;
  if (
    typeof toolResult.result.locationId !== "string" ||
    typeof toolResult.result.locationName !== "string" ||
    typeof travelCost !== "number" ||
    !Array.isArray(path)
  ) {
    return null;
  }

  return {
    locationId: toolResult.result.locationId,
    locationName: toolResult.result.locationName,
    travelCost,
    tickAdvance: travelCost,
    path: path.filter((step): step is string => typeof step === "string"),
  };
}

function predictNextTick(
  currentTick: number,
  successfulTravel: SuccessfulTravel | null,
): number {
  return successfulTravel && successfulTravel.tickAdvance > 0
    ? currentTick + successfulTravel.tickAdvance
    : currentTick + 1;
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
  const config = readCampaignConfig(campaignId);
  const currentTick = config.currentTick ?? 0;
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  const initialSceneScopeId = ensurePlayerSceneScopeAlignment(db, player ?? undefined);

  let actorTags: string[] = [];
  let environmentTags: string[] = [];
  let sceneContext = "";
  let runtimePlayerRecord: ReturnType<typeof hydrateStoredPlayerRecord> | null = null;
  let oracleLocationId: string | null = player?.currentLocationId ?? null;
  let currentSceneScopeId: string | null = initialSceneScopeId;
  let successfulTravel: SuccessfulTravel | null = null;

  if (player) {
    const openingState = applyStartConditionEffects(
      hydrateStoredPlayerRecord(player),
      {
        currentTick,
        currentLocationId: player.currentLocationId,
      },
    );
    runtimePlayerRecord = openingState.record;
    actorTags = deriveRuntimeCharacterTags(runtimePlayerRecord);
    oracleLocationId = runtimePlayerRecord.socialContext.currentLocationId;

    if (openingState.changed) {
      persistPlayerRuntimeRecord(db, player.id, campaignId, runtimePlayerRecord);
    }

    // Include HP status in scene context for Oracle to factor in
    if (runtimePlayerRecord.state.hp < 5) {
      sceneContext += ` Actor HP: ${runtimePlayerRecord.state.hp}/5.`;
    }

    if (oracleLocationId) {
      const location = db
        .select()
        .from(locations)
        .where(eq(locations.id, oracleLocationId))
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

    for (const line of openingState.effects.sceneContextLines) {
      sceneContext += `${sceneContext ? "\n" : ""}${line}`;
    }
  }

  // 1b. Detect movement and handle location change
  const movementDestination = await detectMovement(playerAction, judgeProvider);
  if (movementDestination && player) {
    const allLocations = db
      .select()
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();
    const locationGraph = loadLocationGraph({ campaignId });
    const destination = resolveLocationTarget({
      targetName: movementDestination,
      locations: allLocations,
      currentTick,
    });

    if (destination && player.currentLocationId) {
      if (destination.locationId === player.currentLocationId) {
        const noOpNarrative = `You remain at ${destination.locationName}.`;
        appendChatMessages(campaignId, [{ role: "user", content: playerAction }]);
        appendChatMessages(campaignId, [{ role: "assistant", content: noOpNarrative }]);
        yield { type: "narrative", data: { text: noOpNarrative } };
        yield { type: "done", data: { tick: currentTick } };
        return;
      }

      const travelPath = resolveTravelPath({
        campaignId,
        fromLocationId: player.currentLocationId,
        toLocationId: destination.locationId,
        edges: locationGraph.edges,
        locations: allLocations,
        currentTick,
      });

      const destinationLocation = allLocations.find((location) => location.id === destination.locationId);
      if (travelPath && destinationLocation) {
        persistPlayerLocation(db, player, destinationLocation.id, destinationLocation.name);
        player.currentLocationId = destinationLocation.id;
        player.currentSceneLocationId = destinationLocation.id;
        oracleLocationId = destinationLocation.id;
        currentSceneScopeId = destinationLocation.id;
        if (runtimePlayerRecord) {
          runtimePlayerRecord = syncPlayerRecordLocation(
            runtimePlayerRecord,
            destinationLocation.id,
            destinationLocation.name,
          );
        }

        successfulTravel = {
          locationId: destinationLocation.id,
          locationName: destinationLocation.name,
          travelCost: travelPath.totalTravelCost,
          tickAdvance: travelPath.totalTravelCost,
          path: getPathNames(travelPath.locationIds, allLocations),
        };

        yield {
          type: "state_update",
          data: {
            type: "location_change",
            locationId: successfulTravel.locationId,
            locationName: successfulTravel.locationName,
            travelCost: successfulTravel.travelCost,
            tickAdvance: successfulTravel.tickAdvance,
            path: successfulTravel.path,
          },
        };

        sceneContext = `${destinationLocation.name}: ${destinationLocation.description}`;
        try {
          environmentTags = JSON.parse(destinationLocation.tags) as string[];
        } catch {
          environmentTags = [];
        }
      } else {
        const reachableNames = listConnectedPaths({
          campaignId,
          fromLocationId: player.currentLocationId,
          edges: locationGraph.edges,
          locations: allLocations,
          currentTick,
        }).map((path) => `${path.locationName} (${path.travelCost})`);

        if (reachableNames.length > 0) {
          sceneContext += `\nAvailable paths from here: ${reachableNames.join(", ")}`;
        }
      }
    }
    // If destination not found at all -- pass through to Oracle/Storyteller (might reveal_location)
  }

  const targetContext = await resolveActionTargetContext({
    campaignId,
    playerAction,
    intent,
    method,
    judgeProvider,
    movementDestination,
  });

  // 2. Call Oracle
  const oracleResult = await callOracle(
    {
      intent,
      method,
      actorTags,
      targetTags: targetContext.targetTags,
      environmentTags,
      sceneContext,
    },
    judgeProvider,
    fallbackProvider ?? null
  );

  yield { type: "oracle_result", data: oracleResult };

  // 3. Assemble hidden tool-driving prompt
  const assembled = await assemblePrompt({
    campaignId,
    contextWindow,
    storytellerPass: "hidden-tool-driving",
    includeRecentConversation: false,
    actionResult: oracleResult,
    embedderResult,
    playerAction,
    judgeRole: { provider: judgeProvider, temperature: 0.1, maxTokens: 1024 },
  });

  // 4. Build hidden tool-driving prompt with outcome instructions
  const outcomeInstruction =
    OUTCOME_INSTRUCTIONS[oracleResult.outcome] ?? "";
  const hiddenSystemPrompt =
    `${assembled.formatted}\n\n[HIDDEN TOOL-DRIVING PASS]\nResolve tools and authoritative state before any visible narration exists.\n\n[NARRATION DIRECTIVE]\n${outcomeInstruction}`;

  // 5. Get chat history
  const chatHistory = getChatHistory(campaignId);

  // 6. Persist user message
  appendChatMessages(campaignId, [{ role: "user", content: playerAction }]);

  // 7. Create tools (pass outcomeTier so set_condition can enforce HP guard)
  const tools = createStorytellerTools(campaignId, currentTick, oracleResult.outcome);

  // 8. Call hidden storyteller pass. This may stream internally for tool execution,
  // but visible narration is deferred until scene settlement completes.
  const storyMessages = [
    ...chatHistory.slice(-20),
    { role: "user" as const, content: playerAction },
  ];

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: options.openingScene ? "opening-hidden-pass" : "hidden-tool-driving",
    },
  };

  let hiddenNarrative = "";
  let quickActionsEmitted = false;
  const toolCallResults: Array<{
    tool: string;
    args: unknown;
    result: unknown;
  }> = [];

  function processHiddenStreamPart(
    part: { type: string; [key: string]: unknown },
  ): TurnEvent[] {
    const events: TurnEvent[] = [];
    if (part.type === "text-delta") {
      hiddenNarrative += String(part.text ?? "");
    } else if (part.type === "tool-result") {
      const toolName = (part as Record<string, unknown>).toolName as string;
      const args = (part as Record<string, unknown>).input;
      const toolOutput = (part as Record<string, unknown>).output;

      const toolResult = { tool: toolName, args, result: toolOutput };
      toolCallResults.push(toolResult);

      if (toolName === "offer_quick_actions") {
        quickActionsEmitted = true;
        events.push({ type: "quick_actions", data: toolOutput });
      } else if (toolName === "move_to") {
        const moveResult = getSuccessfulMoveToolResult(toolOutput);
        if (moveResult) {
          successfulTravel = moveResult;
          events.push({
            type: "state_update",
            data: {
              type: "location_change",
              locationId: moveResult.locationId,
              locationName: moveResult.locationName,
              travelCost: moveResult.travelCost,
              tickAdvance: moveResult.tickAdvance,
              path: moveResult.path,
            },
          });
        } else {
          events.push({ type: "state_update", data: toolResult });
        }
      } else {
        events.push({ type: "state_update", data: toolResult });
      }
    }
    return events;
  }

  async function runHiddenPassWithModel(provider: ProviderConfig): Promise<TurnEvent[]> {
    const hiddenResult = streamText({
      model: createModel(provider),
      system: hiddenSystemPrompt,
      messages: storyMessages,
      tools,
      stopWhen: stepCountIs(3),
      temperature: storytellerTemperature,
      maxOutputTokens: storytellerMaxTokens,
    });

    const emittedEvents: TurnEvent[] = [];
    for await (const part of hiddenResult.fullStream) {
      const events = processHiddenStreamPart(part as { type: string });
      emittedEvents.push(...events);
    }
    return emittedEvents;
  }

  try {
    for (const event of await runHiddenPassWithModel(storytellerProvider)) {
      yield event;
    }
  } catch (hiddenPassError) {
    if (!fallbackProvider) {
      throw new Error("Hidden tool-driving pass failed before visible narration could be generated.");
    }

    log.warn("Hidden storyteller pass failed, retrying with fallback provider", hiddenPassError);
    hiddenNarrative = "";
    quickActionsEmitted = false;
    toolCallResults.length = 0;
    for (const event of await runHiddenPassWithModel(fallbackProvider)) {
      yield event;
    }
  }

  // 9. Fallback quick actions if Storyteller didn't call offer_quick_actions.
  if (!quickActionsEmitted) {
    // Gather NPC names at player's current location for contextual suggestions
    let locationName = "";
    const npcNames: string[] = [];
    try {
      const fallbackLocationId = successfulTravel?.locationId ?? player?.currentLocationId ?? null;
      if (fallbackLocationId) {
        const loc = db
          .select()
          .from(locations)
          .where(eq(locations.id, fallbackLocationId))
          .get();
        if (loc) locationName = loc.name;

        const { npcs } = await import("../db/schema.js");
        const presentNpcs = db
          .select({ name: npcs.name })
          .from(npcs)
          .where(eq(npcs.currentLocationId, fallbackLocationId))
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

  const predictedTick = predictNextTick(currentTick, successfulTravel);
  const currentLocationId =
    successfulTravel?.locationId
    ?? db
      .select({ currentLocationId: players.currentLocationId })
      .from(players)
      .where(eq(players.campaignId, campaignId))
      .get()?.currentLocationId
    ?? null;
  currentSceneScopeId =
    successfulTravel?.locationId
    ?? db
      .select({ currentSceneLocationId: players.currentSceneLocationId })
      .from(players)
      .where(eq(players.campaignId, campaignId))
      .get()?.currentSceneLocationId
    ?? currentLocationId;

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: options.openingScene ? "opening-local-scene" : "local-present-scene",
      tick: predictedTick,
    },
  };

  const hiddenSummary: HiddenTurnSummary = {
    currentTick,
    predictedTick,
    currentLocationId,
    currentSceneScopeId,
    oracleResult,
    toolCalls: toolCallResults,
    openingScene: options.openingScene ?? false,
  };

  if (options.onBeforeVisibleNarration) {
    // The chat route injects tickPresentNpcs() here so present-scene settlement
    // happens before the final narration pass instead of during post-turn finalization.
    await withTimeout(
      Promise.resolve(options.onBeforeVisibleNarration(hiddenSummary)),
      TURN_FINALIZATION_TIMEOUT_MS,
      "Local scene settlement timed out before final narration.",
    );
  }

  const sceneAssembly = assembleAuthoritativeScene({
    campaignId,
    currentLocationId,
    currentSceneScopeId,
    pendingEventTicks: [currentTick, predictedTick],
    toolCalls: toolCallResults,
    openingScene: options.openingScene ?? false,
  });
  hiddenSummary.sceneAssembly = sceneAssembly;

  const finalNarrationPrompt = await assembleFinalNarrationPrompt({
    campaignId,
    contextWindow,
    sceneAssembly,
    actionResult: oracleResult,
    embedderResult,
    playerAction,
    judgeRole: { provider: judgeProvider, temperature: 0.1, maxTokens: 1024 },
  });

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: options.openingScene ? "opening-final-narration" : "final-narration",
      opening: options.openingScene ?? false,
    },
  };

  async function runFinalNarrationWithModel(provider: ProviderConfig) {
    return generateText({
      model: createModel(provider),
      system: finalNarrationPrompt.system,
      prompt: finalNarrationPrompt.prompt,
      temperature: storytellerTemperature,
      maxOutputTokens: storytellerMaxTokens,
    });
  }

  let finalNarrationResult;
  try {
    finalNarrationResult = await runFinalNarrationWithModel(storytellerProvider);
  } catch (finalNarrationError) {
    if (!fallbackProvider) {
      throw new Error("Final visible narration failed after authoritative scene settlement.");
    }

    log.warn("Final narration pass failed, retrying with fallback provider", finalNarrationError);
    finalNarrationResult = await runFinalNarrationWithModel(fallbackProvider);
  }

  const narrativeText = collapseRepeatedNarrationBlocks(
    sanitizeNarrative(finalNarrationResult.text),
  );
  log.info(
    `Visible narration complete: hiddenDraft=${hiddenNarrative.length} chars, final=${narrativeText.length} chars`,
  );

  if (narrativeText) {
    yield { type: "narrative", data: { text: narrativeText } };
    appendChatMessages(campaignId, [
      { role: "assistant", content: narrativeText },
    ]);
  }

  const newTick =
    successfulTravel && successfulTravel.tickAdvance > 0
      ? advanceCampaignTick(campaignId, successfulTravel.tickAdvance)
      : incrementTick(campaignId);

  if (player) {
    const storedPlayer = db
      .select()
      .from(players)
      .where(eq(players.id, player.id))
      .get();

    if (storedPlayer) {
      const nextOpeningState = applyStartConditionEffects(
        hydrateStoredPlayerRecord(storedPlayer),
        {
          currentTick: newTick,
          currentLocationId: storedPlayer.currentLocationId,
          playerAction,
        },
      );

      if (nextOpeningState.changed) {
        persistPlayerRuntimeRecord(
          db,
          storedPlayer.id,
          storedPlayer.campaignId,
          nextOpeningState.record,
        );
      }
    }
  }

  const summary: TurnSummary = {
    tick: newTick,
    oracleResult,
    toolCalls: toolCallResults,
    narrativeText,
    sceneAssembly,
  };

  if (onPostTurn) {
    yield {
      type: "finalizing_turn",
      data: { tick: newTick, stage: "rollback_critical" },
    };

    await withTimeout(
      Promise.resolve(onPostTurn(summary)),
      TURN_FINALIZATION_TIMEOUT_MS,
      "Rollback-critical finalization timed out.",
    );
  }

  yield { type: "done", data: { tick: newTick } };
}

export async function* processOpeningScene(
  options: OpeningSceneOptions,
): AsyncGenerator<TurnEvent> {
  const {
    campaignId,
    storytellerProvider,
    storytellerTemperature,
    storytellerMaxTokens,
    embedderResult,
    fallbackProvider,
    contextWindow = 8192,
  } = options;

  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  ensurePlayerSceneScopeAlignment(db, player ?? undefined);
  const currentTick = readCampaignConfig(campaignId).currentTick ?? 0;

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: "opening",
    },
  };

  const sceneAssembly = assembleAuthoritativeScene({
    campaignId,
    currentSceneScopeId: player?.currentSceneLocationId ?? player?.currentLocationId ?? null,
    pendingEventTicks: [currentTick],
    toolCalls: [],
    openingScene: true,
  });

  const finalNarrationPrompt = await assembleFinalNarrationPrompt({
    campaignId,
    contextWindow,
    sceneAssembly,
    embedderResult,
  });

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: "opening-final-narration",
      opening: true,
    },
  };

  async function runOpeningNarration(provider: ProviderConfig) {
    return generateText({
      model: createModel(provider),
      system: finalNarrationPrompt.system,
      prompt: finalNarrationPrompt.prompt,
      temperature: storytellerTemperature,
      maxOutputTokens: storytellerMaxTokens,
    });
  }

  let openingResult;
  try {
    openingResult = await runOpeningNarration(storytellerProvider);
  } catch (openingError) {
    if (!fallbackProvider) {
      throw new Error("Opening scene generation failed before visible narration could be produced.");
    }

    log.warn("Opening scene generation failed, retrying with fallback provider", openingError);
    openingResult = await runOpeningNarration(fallbackProvider);
  }

  const narrativeText = collapseRepeatedNarrationBlocks(
    sanitizeNarrative(openingResult.text),
  );

  if (narrativeText) {
    appendChatMessages(campaignId, [{ role: "assistant", content: narrativeText }]);
    yield { type: "narrative", data: { text: narrativeText } };
  }

  yield { type: "done", data: { tick: currentTick, opening: true } };
}
