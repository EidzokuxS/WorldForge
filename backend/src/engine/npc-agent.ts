/**
 * NPC Agent system: autonomous NPC behavior via Judge LLM tool calling.
 *
 * After each player turn, Key NPCs at the player's location get individual
 * LLM ticks. Each NPC can act (through Oracle), speak, move, or update goals.
 * Ticks run sequentially to avoid conflicting state changes.
 * Failures are logged but never block gameplay.
 */

import { generateText, stepCountIs } from "ai";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, locations, players, items } from "../db/schema.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createNpcAgentTools } from "./npc-tools.js";
import { getRelationshipGraph } from "./graph-queries.js";
import { searchEpisodicEvents } from "../vectors/episodic-events.js";
import { embedTexts } from "../vectors/embeddings.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("npc-agent");

// -- Types --------------------------------------------------------------------

export interface NpcTickResult {
  npcId: string;
  npcName: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  error?: string;
}

// -- Helpers ------------------------------------------------------------------

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

function parseGoals(raw: string): { short_term: string[]; long_term: string[] } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        short_term: Array.isArray(obj.short_term) ? obj.short_term.filter((g): g is string => typeof g === "string") : [],
        long_term: Array.isArray(obj.long_term) ? obj.long_term.filter((g): g is string => typeof g === "string") : [],
      };
    }
  } catch { /* ignore */ }
  return { short_term: [], long_term: [] };
}

function parseBeliefs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((b): b is string => typeof b === "string")
      : [];
  } catch {
    return [];
  }
}

// -- Core NPC tick ------------------------------------------------------------

/**
 * Execute a single NPC agent tick.
 * Loads NPC context, assembles a prompt, calls Judge LLM with NPC tools.
 */
export async function tickNpcAgent(
  campaignId: string,
  npcId: string,
  tick: number,
  judgeProvider: ProviderConfig,
  embedderProvider?: ProviderConfig,
): Promise<NpcTickResult> {
  const db = getDb();

  // 1. Load NPC
  const npc = db
    .select()
    .from(npcs)
    .where(eq(npcs.id, npcId))
    .get();

  if (!npc) {
    return { npcId, npcName: "Unknown", toolCalls: [], error: "NPC not found" };
  }

  const npcTags = parseTags(npc.tags);
  const goals = parseGoals(npc.goals);
  const beliefs = parseBeliefs(npc.beliefs);

  // 2. Load NPC's current location
  let locationName = "Unknown location";
  let locationDesc = "";
  let locationTags: string[] = [];

  if (npc.currentLocationId) {
    const loc = db
      .select()
      .from(locations)
      .where(eq(locations.id, npc.currentLocationId))
      .get();

    if (loc) {
      locationName = loc.name;
      locationDesc = loc.description;
      locationTags = parseTags(loc.tags);
    }
  }

  // 3. Load nearby entities
  const nearbyNpcs = npc.currentLocationId
    ? db
        .select({ name: npcs.name, tags: npcs.tags })
        .from(npcs)
        .where(
          and(
            eq(npcs.campaignId, campaignId),
            eq(npcs.currentLocationId, npc.currentLocationId),
            sql`${npcs.id} != ${npcId}`
          )
        )
        .all()
    : [];

  const nearbyPlayers = npc.currentLocationId
    ? db
        .select({ name: players.name })
        .from(players)
        .where(
          and(
            eq(players.campaignId, campaignId),
            eq(players.currentLocationId, npc.currentLocationId)
          )
        )
        .all()
    : [];

  const nearbyEntities = [
    ...nearbyPlayers.map((p) => p.name),
    ...nearbyNpcs.map((n) => `${n.name} [${parseTags(n.tags).join(", ")}]`),
  ];

  // 4. Search episodic events involving this NPC (best-effort)
  let recentMemories: string[] = [];
  if (embedderProvider) {
    try {
      const queryVector = await embedTexts([npc.name], embedderProvider);
      if (queryVector[0] && queryVector[0].length > 0) {
        const events = await searchEpisodicEvents(queryVector[0], tick, 3);
        recentMemories = events.map((e) => `[Tick ${e.tick}] ${e.text}`);
      }
    } catch (err) {
      log.warn(`Failed to search episodic events for ${npc.name}`, err);
    }
  }

  // 5. Load relationship graph
  const graph = getRelationshipGraph(campaignId, [npcId], 1);
  const relationshipLines = graph.flatMap((node) =>
    node.relationships.map(
      (r) => `${node.entityName} --[${r.tags.join(", ")}]--> ${r.targetName}${r.reason ? ` (${r.reason})` : ""}`
    )
  );

  // 6. Build system prompt
  const goalsText = [
    ...goals.short_term.map((g) => `  - [short] ${g}`),
    ...goals.long_term.map((g) => `  - [long] ${g}`),
  ].join("\n") || "  (none)";

  const systemPrompt = [
    `You are ${npc.name}, a character in a text RPG world.`,
    `Your persona: ${npc.persona}`,
    `Your traits: [${npcTags.join(", ")}]`,
    `Your goals:\n${goalsText}`,
    `Your beliefs: [${beliefs.join(", ")}]`,
    ``,
    `You are at: ${locationName} — ${locationDesc}`,
    nearbyEntities.length > 0
      ? `Also here: ${nearbyEntities.join(", ")}`
      : `You are alone.`,
    recentMemories.length > 0
      ? `Recent events involving you:\n${recentMemories.join("\n")}`
      : "",
    relationshipLines.length > 0
      ? `Your relationships:\n${relationshipLines.join("\n")}`
      : "",
    ``,
    `Decide your next action. You SHOULD take at least one action when other characters are present — passing (no tools) should only happen if truly nothing warrants action.`,
    ``,
    `You may:`,
    `- act(action) — attempt an action (will be evaluated for success via dice roll)`,
    `- speak(dialogue) — say something to someone present`,
    `- move_to(location) — travel to an adjacent location`,
    `- update_own_goal(old, new) — revise your goals based on events`,
    ``,
    `Choose ONE action that best serves your current goals. Prioritize interaction with present characters over doing nothing.`,
  ]
    .filter(Boolean)
    .join("\n");

  // 7. Call Judge LLM with NPC tools
  const model = createModel(judgeProvider);
  const tools = createNpcAgentTools(campaignId, npcId, tick, judgeProvider);

  const result = await generateText({
    model,
    tools,
    temperature: 0.3,
    stopWhen: stepCountIs(2),
    system: systemPrompt,
    prompt: `What do you do this turn?`,
  });

  // 8. Collect tool call results
  const toolCalls: Array<{ tool: string; args: unknown; result: unknown }> = [];
  for (const step of result.steps ?? []) {
    const calls = step.toolCalls ?? [];
    const results = step.toolResults ?? [];
    for (let i = 0; i < calls.length; i++) {
      const tc = calls[i]!;
      toolCalls.push({
        tool: tc.toolName,
        args: (tc as unknown as Record<string, unknown>).input ?? (tc as unknown as Record<string, unknown>).args ?? {},
        result: (results[i] as unknown as Record<string, unknown>)?.output ?? (results[i] as unknown as Record<string, unknown>)?.result ?? null,
      });
    }
  }

  log.info(
    `${npc.name} tick complete: ${toolCalls.length} tool call(s)`,
  );

  return { npcId, npcName: npc.name, toolCalls };
}

// -- Orchestrator -------------------------------------------------------------

/**
 * Tick all Key NPCs at the player's current location.
 * Runs sequentially to avoid conflicting state changes.
 * Never throws — individual failures are logged and skipped.
 */
export async function tickPresentNpcs(
  campaignId: string,
  tick: number,
  judgeProvider: ProviderConfig,
  playerLocationId: string,
  embedderProvider?: ProviderConfig,
): Promise<NpcTickResult[]> {
  const db = getDb();

  // Query key NPCs at player's location
  const keyNpcs = db
    .select({ id: npcs.id, name: npcs.name })
    .from(npcs)
    .where(
      and(
        eq(npcs.campaignId, campaignId),
        eq(npcs.tier, "key"),
        eq(npcs.currentLocationId, playerLocationId)
      )
    )
    .all();

  if (keyNpcs.length === 0) return [];

  log.info(`Ticking ${keyNpcs.length} key NPC(s) at location ${playerLocationId}`);

  const results: NpcTickResult[] = [];

  for (const npc of keyNpcs) {
    try {
      const result = await tickNpcAgent(
        campaignId,
        npc.id,
        tick,
        judgeProvider,
        embedderProvider,
      );
      results.push(result);
    } catch (err) {
      log.error(`NPC tick failed for ${npc.name} (${npc.id})`, err);
      results.push({
        npcId: npc.id,
        npcName: npc.name,
        toolCalls: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
