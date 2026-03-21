/**
 * Turn processor: orchestrates the full Oracle -> Storyteller pipeline.
 *
 * Yields typed TurnEvents as an async generator, allowing the caller
 * (route handler) to stream events to the client as they happen.
 */

import { streamText, stepCountIs } from "ai";
import { eq, sql } from "drizzle-orm";
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

const log = createLogger("turn-processor");

// -- Types --------------------------------------------------------------------

export interface TurnEvent {
  type:
    | "oracle_result"
    | "narrative"
    | "state_update"
    | "quick_actions"
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

const MOVEMENT_REGEX =
  /^(?:go\s+to|travel\s+to|move\s+to|head\s+to|walk\s+to|run\s+to|go)\s+(.+)$/i;

/**
 * Detect if a player action is a movement command.
 * Returns the destination name if matched, null otherwise.
 */
export function detectMovement(action: string): string | null {
  const match = action.trim().match(MOVEMENT_REGEX);
  return match ? match[1]!.trim() : null;
}

// -- Outcome instructions -----------------------------------------------------

const OUTCOME_INSTRUCTIONS: Record<string, string> = {
  strong_hit:
    "The player SUCCEEDED DECISIVELY. Narrate full success with an unexpected bonus or advantage.",
  weak_hit:
    "The player SUCCEEDED WITH A COMPLICATION. Narrate success but introduce a cost, complication, or partial setback.",
  miss: "The player FAILED. Narrate the failure with meaningful consequences -- not just 'nothing happens.'",
};

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
    try {
      actorTags = JSON.parse(player.tags) as string[];
    } catch {
      actorTags = [];
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
  const movementDestination = detectMovement(playerAction);
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
    judgeProvider
  );

  yield { type: "oracle_result", data: oracleResult };

  // 3. Assemble prompt
  const assembled = await assemblePrompt({
    campaignId,
    contextWindow,
    actionResult: oracleResult,
    embedderResult,
    playerAction,
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

  // 8. Create tools
  const tools = createStorytellerTools(campaignId, currentTick);

  // 9. Call Storyteller with streaming
  const model = createModel(storytellerProvider);
  const result = streamText({
    model,
    system: systemPrompt,
    messages: [
      ...chatHistory.slice(-20),
      { role: "user" as const, content: playerAction },
    ],
    tools,
    stopWhen: stepCountIs(2),
    temperature: storytellerTemperature,
    maxOutputTokens: storytellerMaxTokens,
  });

  // 10. Iterate fullStream, yield events
  let narrativeText = "";
  const toolCallResults: Array<{
    tool: string;
    args: unknown;
    result: unknown;
  }> = [];

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      narrativeText += part.text;
      yield { type: "narrative", data: { text: part.text } };
    } else if (part.type === "tool-result") {
      const toolName = part.toolName;
      const args = part.input;
      const toolOutput = part.output;

      const toolResult = { tool: toolName, args, result: toolOutput };
      toolCallResults.push(toolResult);

      if (toolName === "offer_quick_actions") {
        yield { type: "quick_actions", data: toolOutput };
      } else {
        yield { type: "state_update", data: toolResult };
      }
    }
  }

  // 11. Persist assistant message, increment tick
  if (narrativeText.trim()) {
    appendChatMessages(campaignId, [
      { role: "assistant", content: narrativeText.trim() },
    ]);
  }
  const newTick = incrementTick(campaignId);

  // 12. Yield done
  yield { type: "done", data: { tick: newTick } };

  // 13. Post-turn callback (fire-and-forget)
  if (onPostTurn) {
    const summary: TurnSummary = {
      tick: newTick,
      oracleResult,
      toolCalls: toolCallResults,
      narrativeText,
    };

    try {
      await onPostTurn(summary);
    } catch (error) {
      log.warn("Post-turn callback failed", error);
    }
  }
}
