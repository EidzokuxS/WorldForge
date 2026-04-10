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
import {
  readPendingCommittedEvents,
  searchEpisodicEvents,
} from "../vectors/episodic-events.js";
import { embedTexts } from "../vectors/embeddings.js";
import { createLogger } from "../lib/index.js";
import { hydrateStoredNpcRecord } from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { DERIVED_RUNTIME_TAGS_RULE } from "../character/prompt-contract.js";

const log = createLogger("reflection-agent");

/** NPCs must accumulate this much importance before reflection triggers. */
export const REFLECTION_THRESHOLD = 10;

// -- Types --------------------------------------------------------------------

export interface ReflectionResult {
  npcId: string;
  npcName: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  error?: string;
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
    .select()
    .from(npcs)
    .where(eq(npcs.id, npcId))
    .get();

  if (!npc) {
    return { npcId, npcName: "Unknown", toolCalls: [], error: "NPC not found" };
  }

  const npcRecord = hydrateStoredNpcRecord(npc);
  const runtimeTags = deriveRuntimeCharacterTags(npcRecord);

  // 2. Merge same-turn committed evidence with semantic retrieval.
  const npcName = npcRecord.identity.displayName.toLowerCase();
  const recentEvents: string[] = [];
  const recentEventKeys = new Set<string>();
  const pushRecentEvidence = (event: { tick: number; text: string }) => {
    const key = `${event.tick}:${event.text}`;
    if (recentEventKeys.has(key)) {
      return;
    }
    recentEventKeys.add(key);
    recentEvents.push(`[Tick ${event.tick}] ${event.text}`);
  };

  for (const event of readPendingCommittedEvents(campaignId, tick)) {
    if (event.participants.some((participant) => participant.toLowerCase() === npcName)) {
      pushRecentEvidence(event);
    }
  }

  if (embedderProvider) {
    try {
      const queryVector = await embedTexts([npcRecord.identity.displayName], embedderProvider);
      if (queryVector[0] && queryVector[0].length > 0) {
        const events = await searchEpisodicEvents(queryVector[0], tick, 10);
        for (const event of events) {
          pushRecentEvidence(event);
        }
      }
    } catch (err) {
      log.warn(`Failed to search episodic events for ${npcRecord.identity.displayName}`, err);
    }
  }

  // 3. Build system prompt
  const goalsText = [
    ...npcRecord.motivations.shortTermGoals.map((g) => `  - [short] ${g}`),
    ...npcRecord.motivations.longTermGoals.map((g) => `  - [long] ${g}`),
  ].join("\n") || "  (none)";

  const systemPrompt = [
    `You are reflecting on recent experiences as ${npcRecord.identity.displayName}.`,
    `Canonical NPC record authority: profile, socialContext, motivations, capabilities, and state define the current baseline before any compatibility aliases.`,
    `Derived runtime tags are compact compatibility evidence, not the source-of-truth worldview.`,
    DERIVED_RUNTIME_TAGS_RULE,
    `Based on these events, update your beliefs, goals, and relationships.`,
    `Only make changes that are clearly supported by the evidence.`,
    `Beliefs, goals, and relationships are the first-class outcomes for ordinary reflection.`,
    `Prefer durable structured-state updates over flavor-only narration or debug counters.`,
    ``,
    `Current profile: ${npcRecord.profile.personaSummary}`,
    `Current social context: location=${npcRecord.socialContext.currentLocationName ?? npc.currentLocationId ?? "unknown"}; status=[${npcRecord.socialContext.socialStatus.join(", ") || "none"}]`,
    `Current capabilities/state shorthand: tags=[${runtimeTags.join(", ")}]`,
    `Current beliefs: [${npcRecord.motivations.beliefs.join(", ")}]`,
    `Current goals:\n${goalsText}`,
    recentEvents.length > 0
      ? `\nRecent evidence:\n${recentEvents.join("\n")}`
      : "\nRecent evidence:\nNo recent events recorded.",
    ``,
    `Ordinary interaction arcs should usually resolve through belief, goal, or relationship drift using the structured-state tools.`,
    `Wealth and skill upgrades require materially stronger evidence than ordinary belief, goal, or relationship drift.`,
    `You may upgrade wealth tiers (Destitute -> Poor -> Comfortable -> Wealthy -> Obscenely Rich) or skill tiers (Novice -> Skilled -> Master) when evidence clearly supports it. Wealth changes require significant trade/loot events. Skill upgrades require 3+ successful uses of that skill.`,
    `Use the tools to update your beliefs, goals, relationships, wealth, and skills as needed, but prefer set_belief, set_goal, drop_goal, and set_relationship unless the evidence strongly justifies progression.`,
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
    `${npcRecord.identity.displayName} reflection complete: ${toolCalls.length} tool call(s), importance reset to 0`,
  );

  return { npcId, npcName: npcRecord.identity.displayName, toolCalls };
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
