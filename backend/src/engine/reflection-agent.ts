/**
 * Reflection Agent: synthesizes NPC beliefs, goals, and relationship updates
 * from accumulated episodic events when importance threshold is reached.
 *
 * After each turn, checkAndTriggerReflections scans for NPCs whose
 * unprocessedImportance >= REFLECTION_THRESHOLD and runs reflection for each.
 * Failures are logged but never block gameplay.
 */

import { generateText, stepCountIs } from "ai";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs } from "../db/schema.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createReflectionTools } from "./reflection-tools.js";
import { searchEpisodicEvents } from "../vectors/episodic-events.js";
import { embedTexts } from "../vectors/embeddings.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("reflection-agent");

/** NPCs must accumulate this much importance before reflection triggers. */
export const REFLECTION_THRESHOLD = 15;

// -- Types --------------------------------------------------------------------

export interface ReflectionResult {
  npcId: string;
  npcName: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  error?: string;
}

// -- Helpers ------------------------------------------------------------------

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

// -- Core reflection ----------------------------------------------------------

/**
 * Run reflection for a single NPC.
 * Loads NPC context, searches episodic events, calls Judge LLM with reflection tools,
 * then resets unprocessedImportance to 0.
 */
export async function runReflection(
  campaignId: string,
  npcId: string,
  tick: number,
  judgeProvider: ProviderConfig,
  embedderProvider?: ProviderConfig,
): Promise<ReflectionResult> {
  const db = getDb();

  // 1. Load NPC
  const npc = db
    .select({
      name: npcs.name,
      tags: npcs.tags,
      beliefs: npcs.beliefs,
      goals: npcs.goals,
      unprocessedImportance: npcs.unprocessedImportance,
    })
    .from(npcs)
    .where(eq(npcs.id, npcId))
    .get();

  if (!npc) {
    return { npcId, npcName: "Unknown", toolCalls: [], error: "NPC not found" };
  }

  const beliefs = parseBeliefs(npc.beliefs);
  const goals = parseGoals(npc.goals);

  // 2. Search episodic events involving this NPC (fetch more for reflection: 10)
  let recentEvents: string[] = [];
  if (embedderProvider) {
    try {
      const queryVector = await embedTexts([npc.name], embedderProvider);
      if (queryVector[0] && queryVector[0].length > 0) {
        const events = await searchEpisodicEvents(queryVector[0], tick, 10);
        recentEvents = events.map((e) => `[Tick ${e.tick}] ${e.text}`);
      }
    } catch (err) {
      log.warn(`Failed to search episodic events for ${npc.name}`, err);
    }
  }

  // 3. Build system prompt
  const goalsText = [
    ...goals.short_term.map((g) => `  - [short] ${g}`),
    ...goals.long_term.map((g) => `  - [long] ${g}`),
  ].join("\n") || "  (none)";

  const systemPrompt = [
    `You are reflecting on recent experiences as ${npc.name}.`,
    `Based on these events, update your beliefs, goals, and relationships.`,
    `Only make changes that are clearly supported by the evidence.`,
    ``,
    `Current beliefs: [${beliefs.join(", ")}]`,
    `Current goals:\n${goalsText}`,
    recentEvents.length > 0
      ? `\nRecent events:\n${recentEvents.join("\n")}`
      : "\nNo recent events recorded.",
    ``,
    `You may upgrade wealth tiers (Destitute -> Poor -> Comfortable -> Wealthy -> Obscenely Rich) or skill tiers (Novice -> Skilled -> Master) when evidence clearly supports it. Wealth changes require significant trade/loot events. Skill upgrades require 3+ successful uses of that skill.`,
    `Use the tools to update your beliefs, goals, relationships, wealth, and skills as needed.`,
    `If nothing significant has changed, you may choose not to call any tools.`,
  ]
    .filter(Boolean)
    .join("\n");

  // 4. Call Judge LLM with reflection tools
  const model = createModel(judgeProvider);
  const tools = createReflectionTools(campaignId, npcId);

  const result = await generateText({
    model,
    tools,
    temperature: 0,
    stopWhen: stepCountIs(3),
    system: systemPrompt,
    prompt: "Reflect on recent events and update your beliefs, goals, and relationships as appropriate.",
  });

  // 5. Collect tool call results
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

  // 6. Reset unprocessedImportance to 0
  db.update(npcs)
    .set({ unprocessedImportance: 0 })
    .where(eq(npcs.id, npcId))
    .run();

  log.info(
    `${npc.name} reflection complete: ${toolCalls.length} tool call(s), importance reset to 0`,
  );

  return { npcId, npcName: npc.name, toolCalls };
}

// -- Orchestrator -------------------------------------------------------------

/**
 * Check all NPCs in campaign and trigger reflection for those above threshold.
 * Runs sequentially. Never throws -- failures are logged and skipped.
 */
export async function checkAndTriggerReflections(
  campaignId: string,
  tick: number,
  judgeProvider: ProviderConfig,
  embedderProvider?: ProviderConfig,
): Promise<ReflectionResult[]> {
  const db = getDb();

  // Query NPCs with unprocessedImportance >= threshold
  const qualifyingNpcs = db
    .select({ id: npcs.id, name: npcs.name })
    .from(npcs)
    .where(
      and(
        eq(npcs.campaignId, campaignId),
        sql`${npcs.unprocessedImportance} >= ${REFLECTION_THRESHOLD}`,
      ),
    )
    .all();

  if (qualifyingNpcs.length === 0) return [];

  log.info(
    `Reflection check: ${qualifyingNpcs.length} NPC(s) above threshold (${REFLECTION_THRESHOLD})`,
  );

  const results: ReflectionResult[] = [];

  for (const npc of qualifyingNpcs) {
    try {
      const result = await runReflection(
        campaignId,
        npc.id,
        tick,
        judgeProvider,
        embedderProvider,
      );
      results.push(result);
    } catch (err) {
      log.error(`Reflection failed for ${npc.name} (${npc.id})`, err);
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
