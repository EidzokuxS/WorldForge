/**
 * World Engine: Faction macro-tick system.
 *
 * Every N ticks, each faction gets an LLM evaluation producing territory
 * changes, faction tag/goal updates, and World Chronicle entries.
 * Factions become active world actors that pursue goals, contest territory,
 * and create world-level narrative events.
 */

import { generateText, stepCountIs } from "ai";
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { factions, locations, chronicle } from "../db/schema.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createFactionTools } from "./faction-tools.js";
import { createLogger } from "../lib/index.js";
import { parseTags } from "./parse-helpers.js";

const log = createLogger("world-engine");

// -- Types --------------------------------------------------------------------

export interface FactionTickResult {
  factionId: string;
  factionName: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  error?: string;
}

// -- Core: tick a single faction ----------------------------------------------

async function tickSingleFaction(
  campaignId: string,
  faction: {
    id: string;
    name: string;
    tags: string;
    goals: string;
    assets: string;
  },
  tick: number,
  judgeProvider: ProviderConfig,
): Promise<FactionTickResult> {
  const db = getDb();

  const factionTags = parseTags(faction.tags);
  const factionGoals = parseTags(faction.goals);
  const factionAssets = parseTags(faction.assets);

  // Load faction's owned locations (locations where tags contain "Controlled by {factionName}")
  const allLocations = db
    .select({ id: locations.id, name: locations.name, tags: locations.tags })
    .from(locations)
    .where(eq(locations.campaignId, campaignId))
    .all();

  const controlPattern = `controlled by ${faction.name.toLowerCase()}`;
  const ownedLocations = allLocations.filter((loc) => {
    const locTags = parseTags(loc.tags);
    return locTags.some((t) => t.toLowerCase().includes(controlPattern));
  });

  // Load neighboring factions (factions owning locations connected to this faction's locations)
  // For simplicity, load all other factions as "neighbors" (world is small enough)
  const allFactions = db
    .select({ id: factions.id, name: factions.name, tags: factions.tags, goals: factions.goals })
    .from(factions)
    .where(
      sql`${factions.campaignId} = ${campaignId} AND ${factions.id} != ${faction.id}`
    )
    .all();

  // Load recent chronicle entries
  const recentChronicle = db
    .select({ tick: chronicle.tick, text: chronicle.text })
    .from(chronicle)
    .where(eq(chronicle.campaignId, campaignId))
    .orderBy(desc(chronicle.tick))
    .limit(10)
    .all();

  // Build system prompt
  const territoryText = ownedLocations.length > 0
    ? ownedLocations.map((l) => `  - ${l.name} [${parseTags(l.tags).join(", ")}]`).join("\n")
    : "  (no controlled territory)";

  const neighborsText = allFactions.length > 0
    ? allFactions.map((f) => `  - ${f.name} [${parseTags(f.tags).join(", ")}] goals: ${parseTags(f.goals).join("; ")}`).join("\n")
    : "  (no other factions)";

  const chronicleText = recentChronicle.length > 0
    ? recentChronicle.map((e) => `  [Tick ${e.tick}] ${e.text}`).join("\n")
    : "  (no recent events)";

  const systemPrompt = [
    `You are the world simulation engine evaluating faction "${faction.name}".`,
    `Consider their goals, resources, territory, and neighbors. Decide their macro-level action for this period.`,
    ``,
    `Faction: ${faction.name}`,
    `Traits: [${factionTags.join(", ")}]`,
    `Goals: [${factionGoals.join("; ")}]`,
    `Assets: [${factionAssets.join(", ")}]`,
    ``,
    `Territory:`,
    territoryText,
    ``,
    `Other Factions:`,
    neighborsText,
    ``,
    `Recent World Events:`,
    chronicleText,
    ``,
    `Choose ONE macro-level action for this faction. You may:`,
    `- faction_action: Execute a concrete action (expand territory, trade, declare war, build, recruit)`,
    `- update_faction_goal: Update the faction's goals based on current situation`,
    `- add_chronicle_entry: Record a significant world event`,
    `- declare_world_event: Introduce an unexpected world event (plague, disaster, anomaly, discovery)`,
    ``,
    `You may also introduce an unexpected world event (plague, disaster, anomaly, discovery) if narratively appropriate for the current world state. Use declare_world_event for this. Do NOT force events every tick -- only when the situation calls for it.`,
    ``,
    `Use tools to execute your decision. Your faction_action MUST include a SPECIFIC, OBSERVABLE change — territory gained/lost, resource acquired/depleted, alliance formed/broken, attack launched, fortification built. Vague actions like "continued to plan" or "monitored the situation" are NOT acceptable. Name specific locations, NPCs, or resources affected.`,
  ].join("\n");

  // Call Judge LLM with faction tools
  const model = createModel(judgeProvider);
  const tools = createFactionTools(campaignId, tick);

  const result = await generateText({
    model,
    tools,
    temperature: 0,
    stopWhen: stepCountIs(3),
    system: systemPrompt,
    prompt: `What does "${faction.name}" do this period?`,
  });

  // Collect tool call results
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

  log.info(`Faction "${faction.name}" tick complete: ${toolCalls.length} tool call(s)`);

  return {
    factionId: faction.id,
    factionName: faction.name,
    toolCalls,
  };
}

// -- Orchestrator -------------------------------------------------------------

/**
 * Tick all factions in a campaign.
 *
 * Runs every `interval` ticks (default 10). Each faction gets an individual
 * LLM evaluation with tools for actions, goal updates, and chronicle entries.
 *
 * Never throws -- individual faction errors are captured in results.
 */
export async function tickFactions(
  campaignId: string,
  tick: number,
  judgeProvider: ProviderConfig,
  interval = 5,
): Promise<FactionTickResult[]> {
  // Skip if not on interval
  if (tick % interval !== 0) {
    return [];
  }

  const db = getDb();

  // Query all factions for this campaign
  const allFactions = db
    .select({
      id: factions.id,
      name: factions.name,
      tags: factions.tags,
      goals: factions.goals,
      assets: factions.assets,
    })
    .from(factions)
    .where(eq(factions.campaignId, campaignId))
    .all();

  if (allFactions.length === 0) {
    return [];
  }

  log.info(`Ticking ${allFactions.length} faction(s) at tick ${tick}`);

  const results: FactionTickResult[] = [];

  for (const faction of allFactions) {
    try {
      const result = await tickSingleFaction(
        campaignId,
        faction,
        tick,
        judgeProvider,
      );
      results.push(result);
    } catch (err) {
      log.error(`Faction tick failed for ${faction.name} (${faction.id})`, err);
      results.push({
        factionId: faction.id,
        factionName: faction.name,
        toolCalls: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info(`World engine tick complete: ${results.length} faction(s) processed`);
  return results;
}
