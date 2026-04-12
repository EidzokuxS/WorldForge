/**
 * Off-screen NPC batch simulation.
 *
 * Every N ticks (default 5), Key NPCs not at the player's location
 * get batch-simulated via a single Judge LLM call. The LLM produces
 * structured updates (location changes, action summaries, goal progress)
 * that are silently written to DB without narrating to the player.
 */

import { z } from "zod";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, locations } from "../db/schema.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { storeEpisodicEvent } from "../vectors/episodic-events.js";
import { createLogger } from "../lib/index.js";
import { accumulateReflectionBudget } from "./reflection-budget.js";
import {
  hydrateStoredNpcRecord,
  toLegacyNpcDraft,
} from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { resolveStoredSceneScopeId } from "./scene-presence.js";
import type { CharacterRecord } from "@worldforge/shared";

const log = createLogger("npc-offscreen");
const OFFSCREEN_IDENTITY_LIST_LIMIT = 2;

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
  currentCharacterRecord?: string | null;
  storedRecord?: {
    campaignId: string;
    persona: string;
    tags: string;
    tier: "temporary" | "persistent" | "key";
    currentLocationId: string | null;
    currentSceneLocationId?: string | null;
    goals: string;
    beliefs: string;
    unprocessedImportance: number;
    inactiveTicks?: number;
    createdAt?: number;
    characterRecord?: string | null;
    derivedTags?: string | null;
  };
}

function takeBoundedIdentitySlice(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean).slice(0, OFFSCREEN_IDENTITY_LIST_LIMIT);
}

function formatBoundedIdentityList(label: string, values: string[]): string | null {
  const bounded = takeBoundedIdentitySlice(values);
  if (bounded.length === 0) return null;
  return `${label}: ${bounded.join("; ")}`;
}

function buildOffscreenIdentitySummary(record: CharacterRecord): string[] {
  const baseFacts = record.identity.baseFacts;
  const behavioralCore = record.identity.behavioralCore;
  const liveDynamics = record.identity.liveDynamics;
  const continuity = record.continuity;

  return [
    [
      baseFacts?.biography ? `Base facts: ${baseFacts.biography}` : null,
      formatBoundedIdentityList("Roles", baseFacts?.socialRole ?? []),
      formatBoundedIdentityList("Constraints", baseFacts?.hardConstraints ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | "),
    [
      formatBoundedIdentityList("Enduring motives", behavioralCore?.motives ?? []),
      formatBoundedIdentityList("Pressure responses", behavioralCore?.pressureResponses ?? []),
      formatBoundedIdentityList("Attachments", behavioralCore?.attachments ?? []),
      behavioralCore?.selfImage ? `Self-image: ${behavioralCore.selfImage}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | "),
    [
      formatBoundedIdentityList("Active goals", liveDynamics?.activeGoals ?? []),
      formatBoundedIdentityList("Current strains", liveDynamics?.currentStrains ?? []),
      formatBoundedIdentityList("Belief drift", liveDynamics?.beliefDrift ?? []),
      formatBoundedIdentityList("Earned changes", liveDynamics?.earnedChanges ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | "),
    continuity
      ? [
          `Continuity: identity inertia=${continuity.identityInertia}`,
          formatBoundedIdentityList("protected core", continuity.protectedCore),
          formatBoundedIdentityList("mutable surface", continuity.mutableSurface),
          formatBoundedIdentityList("change pressure", continuity.changePressureNotes),
        ]
          .filter((value): value is string => Boolean(value))
          .join(" | ")
      : null,
  ].filter((value): value is string => Boolean(value));
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
  let resolvedLocationId = npcCtx.storedRecord?.currentLocationId ?? null;
  let resolvedSceneLocationId = npcCtx.storedRecord?.currentSceneLocationId ?? resolvedLocationId;
  let resolvedLocationName: string | null = null;

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
      locationChanged = true;
      resolvedLocationId = loc.id;
      resolvedSceneLocationId = loc.id;
      resolvedLocationName = loc.name;
      log.info(`${npcCtx.npcName} moved to ${loc.name}`);
    } else {
      log.warn(`Location "${update.newLocation}" not found for ${npcCtx.npcName}, skipping move`);
    }
  }

  if (npcCtx.storedRecord) {
    const currentRecord = hydrateStoredNpcRecord({
      id: npcCtx.npcId,
      campaignId,
      name: npcCtx.npcName,
      persona: npcCtx.storedRecord.persona,
      tags: npcCtx.storedRecord.tags,
      tier: npcCtx.storedRecord.tier,
      currentLocationId: npcCtx.storedRecord.currentLocationId,
      goals: npcCtx.storedRecord.goals,
      beliefs: npcCtx.storedRecord.beliefs,
      unprocessedImportance: npcCtx.storedRecord.unprocessedImportance ?? 0,
      inactiveTicks: npcCtx.storedRecord.inactiveTicks ?? 0,
      createdAt: npcCtx.storedRecord.createdAt ?? 0,
      characterRecord:
        npcCtx.currentCharacterRecord ?? npcCtx.storedRecord.characterRecord ?? null,
      derivedTags: npcCtx.storedRecord.derivedTags ?? null,
    });

    const updatedRecord = {
      ...currentRecord,
      socialContext: {
        ...currentRecord.socialContext,
        currentLocationId: resolvedLocationId,
        currentLocationName:
          resolvedLocationName ?? currentRecord.socialContext.currentLocationName,
      },
      motivations: {
        ...currentRecord.motivations,
        shortTermGoals: update.goalProgress
          ? [...currentRecord.motivations.shortTermGoals, update.goalProgress]
          : currentRecord.motivations.shortTermGoals,
      },
      state: {
        ...currentRecord.state,
        activityState: "active" as const,
      },
    };

    const legacyNpc = toLegacyNpcDraft(updatedRecord);
    const derivedTags = deriveRuntimeCharacterTags(updatedRecord);

    db.update(npcs)
      .set({
        currentLocationId: resolvedLocationId,
        currentSceneLocationId: resolvedSceneLocationId,
        persona: legacyNpc.persona,
        tags: JSON.stringify(legacyNpc.tags),
        goals: JSON.stringify({
          short_term: legacyNpc.goals.shortTerm,
          long_term: legacyNpc.goals.longTerm,
        }),
        beliefs: JSON.stringify(updatedRecord.motivations.beliefs),
        characterRecord: JSON.stringify(updatedRecord),
        derivedTags: JSON.stringify(derivedTags),
        inactiveTicks: 0,
      })
      .where(eq(npcs.id, npcCtx.npcId))
      .run();

    goalsUpdated = Boolean(update.goalProgress);
  } else {
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

    db.update(npcs)
      .set({
        currentLocationId: resolvedLocationId,
        currentSceneLocationId: resolvedSceneLocationId,
        inactiveTicks: 0,
      })
      .where(eq(npcs.id, npcCtx.npcId))
      .run();
  }

  // -- Store episodic event (best-effort) --
  const eventLocationName =
    resolvedLocationName ??
    update.newLocation ??
    (npcCtx.currentCharacterRecord
      ? hydrateStoredNpcRecord({
          id: npcCtx.npcId,
          campaignId,
          name: npcCtx.npcName,
          persona: npcCtx.storedRecord?.persona ?? "",
          tags: npcCtx.storedRecord?.tags ?? "[]",
          tier: npcCtx.storedRecord?.tier ?? "key",
          currentLocationId: npcCtx.storedRecord?.currentLocationId ?? null,
          goals:
            npcCtx.storedRecord?.goals ??
            '{"short_term":[],"long_term":[]}',
          beliefs: npcCtx.storedRecord?.beliefs ?? "[]",
          unprocessedImportance: npcCtx.storedRecord?.unprocessedImportance ?? 0,
          inactiveTicks: npcCtx.storedRecord?.inactiveTicks ?? 0,
          createdAt: npcCtx.storedRecord?.createdAt ?? 0,
          characterRecord: npcCtx.currentCharacterRecord,
          derivedTags: npcCtx.storedRecord?.derivedTags ?? null,
        }).socialContext.currentLocationName
      : null) ??
    "";

  try {
    await storeEpisodicEvent(campaignId, {
      text: `[Off-screen] ${npcCtx.npcName}: ${update.actionSummary}`,
      tick,
      location: eventLocationName,
      participants: [npcCtx.npcName],
      importance: 3,
      type: "npc_offscreen",
    });
    await accumulateReflectionBudget(campaignId, [npcCtx.npcName], 3);
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
  playerSceneScopeId?: string,
  interval = 5,
): Promise<AppliedOffscreenUpdate[]> {
  // -- Check tick interval --
  if (tick % interval !== 0) {
    return [];
  }

  const db = getDb();

  const resolvedPlayerSceneScopeId = resolveStoredSceneScopeId(
    playerLocationId,
    playerSceneScopeId,
  );

  // -- Query key NPCs, then drop the current encounter scope instead of the full broad location --
  const offscreenKeyNpcs = db
    .select({
      id: npcs.id,
      campaignId: npcs.campaignId,
      name: npcs.name,
      persona: npcs.persona,
      tags: npcs.tags,
      tier: npcs.tier,
      currentLocationId: npcs.currentLocationId,
      currentSceneLocationId: npcs.currentSceneLocationId,
      goals: npcs.goals,
      beliefs: npcs.beliefs,
      unprocessedImportance: npcs.unprocessedImportance,
      characterRecord: npcs.characterRecord,
      derivedTags: npcs.derivedTags,
      inactiveTicks: npcs.inactiveTicks,
      createdAt: npcs.createdAt,
    })
    .from(npcs)
    .where(
      and(
        eq(npcs.campaignId, campaignId),
        eq(npcs.tier, "key"),
      )
    )
    .all()
    .filter((npc) => {
      if (npc.currentLocationId !== playerLocationId) {
        return true;
      }

      const npcSceneScopeId = resolveStoredSceneScopeId(
        npc.currentLocationId,
        npc.currentSceneLocationId ?? null,
      );

      return npcSceneScopeId !== resolvedPlayerSceneScopeId;
    });

  if (offscreenKeyNpcs.length === 0) {
    return [];
  }

  log.info(
    `Simulating ${offscreenKeyNpcs.length} off-screen Key NPC(s) outside scene scope ${resolvedPlayerSceneScopeId ?? playerLocationId} at tick ${tick}`,
  );

  // -- Build NPC summaries for batch prompt --
  const npcSummaries = offscreenKeyNpcs.map((npc) => {
    const npcRecord = hydrateStoredNpcRecord(npc);
    const tags = deriveRuntimeCharacterTags(npcRecord);
    const identitySummary = buildOffscreenIdentitySummary(npcRecord);

    // Resolve location name
    let locationName = npcRecord.socialContext.currentLocationName ?? "Unknown";
    if (npc.currentLocationId) {
      const loc = db
        .select({ name: locations.name })
        .from(locations)
        .where(eq(locations.id, npc.currentLocationId))
        .get();
      if (loc) locationName = loc.name;
    }

    return [
      `- Name: ${npcRecord.identity.displayName}`,
      ...identitySummary.map((line) => `  ${line}`),
      `  Persona: ${npcRecord.profile.personaSummary}`,
      `  Traits: [${tags.join(", ")}]`,
      `  Location: ${locationName}`,
      `  Goals: short=[${npcRecord.motivations.shortTermGoals.join("; ")}], long=[${npcRecord.motivations.longTermGoals.join("; ")}]`,
    ].join("\n");
  });

  // -- Build batch prompt --
  const systemPrompt = [
    "You are the world simulation engine for a text RPG.",
    "For each NPC listed below, determine what they have been doing off-screen since the last simulation.",
    "Keep each NPC to a bounded identity slice: base facts, enduring motives, pressure responses, live goals/strains, and continuity cues only.",
    "Use the richer identity slice plus compatibility shorthand when deciding actions. Do not dump the full record or source bundle.",
    "Each NPC update MUST describe something SPECIFIC they did — name locations, actions, and consequences. Do NOT use vague summaries like 'continued pursuing goals' or 'maintained their position'. Example good update: 'Traveled to the Sporeworks to negotiate a spore trade deal with the fungal workers.' Example bad update: 'Continued working toward their goals.'",
    "Return a structured update for each NPC.",
    "",
    `Player broad location: ${playerLocationId}`,
    `Player scene scope: ${resolvedPlayerSceneScopeId ?? playerLocationId}`,
    "Same broad-location actors outside the player's immediate scene still count as off-screen here.",
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
      currentCharacterRecord: npc.characterRecord,
      storedRecord: {
        campaignId: npc.campaignId,
        persona: npc.persona,
        tags: npc.tags,
        tier: npc.tier,
        currentLocationId: npc.currentLocationId,
        currentSceneLocationId: npc.currentSceneLocationId,
        goals: npc.goals,
        beliefs: npc.beliefs,
        unprocessedImportance: npc.unprocessedImportance,
        inactiveTicks: npc.inactiveTicks,
        createdAt: npc.createdAt,
        characterRecord: npc.characterRecord,
        derivedTags: npc.derivedTags,
      },
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
