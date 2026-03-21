/**
 * Off-screen NPC batch simulation.
 *
 * Every N ticks (default 5), Key NPCs not at the player's location
 * get batch-simulated via a single Judge LLM call. The LLM produces
 * structured updates (location changes, action summaries, goal progress)
 * that are silently written to DB without narrating to the player.
 */

import { z } from "zod";
import { generateObject } from "ai";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, locations } from "../db/schema.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { storeEpisodicEvent } from "../vectors/episodic-events.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("npc-offscreen");

// -- Types --------------------------------------------------------------------

export interface OffscreenUpdate {
  npcName: string;
  newLocation: string | null;
  actionSummary: string;
  goalProgress: string | null;
}

export interface AppliedOffscreenUpdate extends OffscreenUpdate {
  npcId: string;
  locationChanged: boolean;
  goalsUpdated: boolean;
}

export interface NpcContext {
  npcId: string;
  npcName: string;
  currentGoals: string;
}

// -- Zod schema for LLM output -----------------------------------------------

const offscreenUpdateSchema = z.object({
  updates: z.array(
    z.object({
      npcName: z.string(),
      newLocation: z.string().nullable(),
      actionSummary: z.string(),
      goalProgress: z.string().nullable(),
    })
  ),
});

// -- Pure helpers (exported for testability) -----------------------------------

/**
 * Parse raw LLM output into typed OffscreenUpdate array.
 */
export function parseOffscreenUpdates(
  raw: Array<{ npcName: string; newLocation: string | null; actionSummary: string; goalProgress: string | null }>
): OffscreenUpdate[] {
  return raw.map((r) => ({
    npcName: r.npcName,
    newLocation: r.newLocation ?? null,
    actionSummary: r.actionSummary,
    goalProgress: r.goalProgress ?? null,
  }));
}

/**
 * Apply a single off-screen update to the database.
 * - If newLocation is set, resolve location by name and update npcs.currentLocationId.
 * - If goalProgress is set, append to goals short_term.
 * - Store action summary as episodic event.
 */
export async function applyOffscreenUpdate(
  campaignId: string,
  npcCtx: NpcContext,
  update: OffscreenUpdate,
  tick: number,
): Promise<AppliedOffscreenUpdate> {
  const db = getDb();
  let locationChanged = false;
  let goalsUpdated = false;

  // -- Resolve and apply location change --
  if (update.newLocation) {
    const loc = db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(
        and(
          eq(locations.campaignId, campaignId),
          sql`LOWER(${locations.name}) = LOWER(${update.newLocation})`
        )
      )
      .get();

    if (loc) {
      db.update(npcs)
        .set({ currentLocationId: loc.id })
        .where(eq(npcs.id, npcCtx.npcId))
        .run();
      locationChanged = true;
      log.info(`${npcCtx.npcName} moved to ${loc.name}`);
    } else {
      log.warn(`Location "${update.newLocation}" not found for ${npcCtx.npcName}, skipping move`);
    }
  }

  // -- Apply goal progress --
  if (update.goalProgress) {
    try {
      const goals = JSON.parse(npcCtx.currentGoals) as {
        short_term: string[];
        long_term: string[];
      };
      goals.short_term.push(update.goalProgress);
      db.update(npcs)
        .set({ goals: JSON.stringify(goals) })
        .where(eq(npcs.id, npcCtx.npcId))
        .run();
      goalsUpdated = true;
    } catch {
      log.warn(`Failed to parse goals for ${npcCtx.npcName}`);
    }
  }

  // -- Reset inactive ticks (NPC acted) --
  db.update(npcs)
    .set({ inactiveTicks: 0 })
    .where(eq(npcs.id, npcCtx.npcId))
    .run();

  // -- Store episodic event (best-effort) --
  try {
    await storeEpisodicEvent(campaignId, {
      text: `[Off-screen] ${npcCtx.npcName}: ${update.actionSummary}`,
      tick,
      location: update.newLocation ?? "unknown",
      participants: [npcCtx.npcName],
      importance: 3,
      type: "npc_offscreen",
    });
  } catch (err) {
    log.warn(`Failed to store episodic event for ${npcCtx.npcName}`, err);
  }

  return {
    ...update,
    npcId: npcCtx.npcId,
    locationChanged,
    goalsUpdated,
  };
}

// -- Main simulation function -------------------------------------------------

/**
 * Batch-simulate off-screen Key NPCs.
 *
 * Only runs when `tick % interval === 0`. Queries all Key NPCs NOT at
 * the player's location, builds a single batch prompt, calls Judge LLM
 * with generateObject, and applies structured updates to DB.
 *
 * @param campaignId - Campaign ID
 * @param tick - Current game tick
 * @param judgeProvider - Judge LLM provider config
 * @param playerLocationId - Player's current location (NPCs here are "on-screen")
 * @param interval - How often to simulate (default 5)
 * @returns Array of applied updates
 */
export async function simulateOffscreenNpcs(
  campaignId: string,
  tick: number,
  judgeProvider: ProviderConfig,
  playerLocationId: string,
  interval = 5,
): Promise<AppliedOffscreenUpdate[]> {
  // -- Check tick interval --
  if (tick % interval !== 0) {
    return [];
  }

  const db = getDb();

  // -- Query off-screen Key NPCs --
  const offscreenKeyNpcs = db
    .select({
      id: npcs.id,
      name: npcs.name,
      persona: npcs.persona,
      tags: npcs.tags,
      currentLocationId: npcs.currentLocationId,
      goals: npcs.goals,
    })
    .from(npcs)
    .where(
      and(
        eq(npcs.campaignId, campaignId),
        eq(npcs.tier, "key"),
        sql`${npcs.currentLocationId} != ${playerLocationId}`
      )
    )
    .all();

  if (offscreenKeyNpcs.length === 0) {
    return [];
  }

  log.info(`Simulating ${offscreenKeyNpcs.length} off-screen Key NPC(s) at tick ${tick}`);

  // -- Build NPC summaries for batch prompt --
  const npcSummaries = offscreenKeyNpcs.map((npc) => {
    let tags: string[] = [];
    try {
      tags = JSON.parse(npc.tags) as string[];
    } catch { /* ignore */ }

    let goals = { short_term: [] as string[], long_term: [] as string[] };
    try {
      goals = JSON.parse(npc.goals) as typeof goals;
    } catch { /* ignore */ }

    // Resolve location name
    let locationName = "Unknown";
    if (npc.currentLocationId) {
      const loc = db
        .select({ name: locations.name })
        .from(locations)
        .where(eq(locations.id, npc.currentLocationId))
        .get();
      if (loc) locationName = loc.name;
    }

    return [
      `- Name: ${npc.name}`,
      `  Persona: ${npc.persona}`,
      `  Traits: [${tags.join(", ")}]`,
      `  Location: ${locationName}`,
      `  Goals: short=[${goals.short_term.join("; ")}], long=[${goals.long_term.join("; ")}]`,
    ].join("\n");
  });

  // -- Build batch prompt --
  const systemPrompt = [
    "You are the world simulation engine for a text RPG.",
    "For each NPC listed below, determine what they have been doing off-screen since the last simulation.",
    "Consider their persona, traits, location, and goals when deciding their actions.",
    "Return a structured update for each NPC.",
    "",
    "NPCs:",
    ...npcSummaries,
  ].join("\n");

  // -- Call Judge LLM --
  const model = createModel(judgeProvider);

  const { object } = await generateObject({
    model,
    schema: offscreenUpdateSchema,
    temperature: 0,
    system: systemPrompt,
    prompt: "What has each NPC been doing off-screen? Provide updates.",
  });

  // -- Parse and apply updates --
  const parsed = parseOffscreenUpdates(object.updates);

  // Map NPC names to their DB context
  const npcContextMap = new Map<string, NpcContext>();
  for (const npc of offscreenKeyNpcs) {
    npcContextMap.set(npc.name.toLowerCase(), {
      npcId: npc.id,
      npcName: npc.name,
      currentGoals: npc.goals,
    });
  }

  const results: AppliedOffscreenUpdate[] = [];

  for (const update of parsed) {
    const ctx = npcContextMap.get(update.npcName.toLowerCase());
    if (!ctx) {
      log.warn(`LLM returned update for unknown NPC: ${update.npcName}`);
      continue;
    }

    try {
      const applied = await applyOffscreenUpdate(campaignId, ctx, update, tick);
      results.push(applied);
    } catch (err) {
      log.error(`Failed to apply off-screen update for ${update.npcName}`, err);
    }
  }

  log.info(`Off-screen simulation complete: ${results.length} updates applied`);
  return results;
}
