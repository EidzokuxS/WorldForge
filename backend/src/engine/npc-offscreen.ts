/**
 * Off-screen NPC batch simulation.
 *
 * Every N ticks (default 5), Key NPCs not at the player's location
 * get batch-simulated via a single Judge LLM call. The LLM produces
 * structured updates (location changes, action summaries, goal progress).
 *
 * Legacy offscreen updates are proposal-only. Canonical offscreen work must go
 * through the simulation proposal queue/executor so backend authority receipts,
 * owner registry checks, rollback, and replay stay on one mutation plane.
 */

import { z } from "zod";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, locations } from "../db/schema.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  hydrateStoredNpcRecord,
} from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { resolveStoredSceneScopeId } from "./scene-presence.js";
import { buildNpcOffscreenPromptContract } from "./prompt-contracts.js";
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
  accepted: false;
  proposalOnly: true;
  reason: "legacy_offscreen_authority_quarantine";
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

export function buildOffscreenIdentitySummary(record: CharacterRecord): string[] {
  const baseFacts = record.identity.baseFacts;
  const behavioralCore = record.identity.behavioralCore;
  const liveDynamics = record.identity.liveDynamics;
  const personality = record.identity.personality;
  return [
    [
      baseFacts?.biography ? `Base facts: ${baseFacts.biography}` : null,
      formatBoundedIdentityList("Roles", baseFacts?.socialRole ?? []),
      formatBoundedIdentityList("Constraints", baseFacts?.hardConstraints ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | "),
    [
      formatBoundedIdentityList(
        "Personality summary",
        personality?.summary ? [personality.summary] : [],
      ),
      formatBoundedIdentityList("Voice", personality?.voice ? [personality.voice] : []),
      formatBoundedIdentityList(
        "Internal contradictions",
        personality?.internalContradictions ?? [],
      ),
      formatBoundedIdentityList("Attachments", liveDynamics?.attachments ?? []),
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
  ].filter((value): value is string => Boolean(value));
}

// -- Zod schema for LLM output -----------------------------------------------

const OFFSCREEN_NPC_NAME_MAX = 120;
const OFFSCREEN_LOCATION_MAX = 120;
const OFFSCREEN_ACTION_SUMMARY_MAX = 260;
const OFFSCREEN_GOAL_PROGRESS_MAX = 180;

const offscreenUpdateItemSchema = z.object({
  npcName: z.string().max(OFFSCREEN_NPC_NAME_MAX),
  newLocation: z.string().max(OFFSCREEN_LOCATION_MAX).nullable(),
  actionSummary: z.string().max(OFFSCREEN_ACTION_SUMMARY_MAX),
  goalProgress: z.string().max(OFFSCREEN_GOAL_PROGRESS_MAX).nullable(),
});

const offscreenUpdatesArraySchema = z.array(offscreenUpdateItemSchema);

const offscreenUpdateSchema = z.object({
  updates: offscreenUpdatesArraySchema,
});

// -- Pure helpers (exported for testability) -----------------------------------

/**
 * Parse raw LLM output into typed OffscreenUpdate array.
 */
export function parseOffscreenUpdates(
  raw: Array<{ npcName: string; newLocation: string | null; actionSummary: string; goalProgress: string | null }>,
  maxUpdates?: number,
): OffscreenUpdate[] {
  const schema =
    typeof maxUpdates === "number"
      ? offscreenUpdatesArraySchema.max(maxUpdates)
      : offscreenUpdatesArraySchema;
  const parsed = schema.parse(raw);

  return parsed.map((r) => ({
    npcName: r.npcName,
    newLocation: r.newLocation ?? null,
    actionSummary: r.actionSummary,
    goalProgress: r.goalProgress ?? null,
  }));
}

/**
 * Quarantine a legacy off-screen update.
 *
 * This function intentionally performs no writes. Off-screen NPC movement,
 * goals, beliefs, identity, wealth, skill, and memory must be committed through
 * the simulation proposal authority path, not this legacy LLM batch helper.
 */
export async function applyOffscreenUpdate(
  campaignId: string,
  npcCtx: NpcContext,
  update: OffscreenUpdate,
  tick: number,
): Promise<AppliedOffscreenUpdate> {
  log.event("npcOffscreen.proposalOnly", {
    campaignId,
    npcId: npcCtx.npcId,
    npcName: npcCtx.npcName,
    tick,
    requestedLocation: update.newLocation,
    hasGoalProgress: Boolean(update.goalProgress),
    reason: "legacy_offscreen_authority_quarantine",
  });

  return {
    ...update,
    npcId: npcCtx.npcId,
    locationChanged: false,
    goalsUpdated: false,
    accepted: false,
    proposalOnly: true,
    reason: "legacy_offscreen_authority_quarantine",
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

  return withRole("npcAgent", () =>
    simulateOffscreenNpcsInternal(
      campaignId,
      tick,
      judgeProvider,
      playerLocationId,
      playerSceneScopeId,
    ),
  );
}

async function simulateOffscreenNpcsInternal(
  campaignId: string,
  tick: number,
  judgeProvider: ProviderConfig,
  playerLocationId: string,
  playerSceneScopeId?: string,
): Promise<AppliedOffscreenUpdate[]> {
  const batchStart = Date.now();

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
  const playerBroadLocationName = playerLocationId
    ? db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, playerLocationId))
      .get()?.name ?? "Unknown"
    : "Unknown";
  const playerSceneScopeName = resolvedPlayerSceneScopeId
    ? db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, resolvedPlayerSceneScopeId))
      .get()?.name ?? playerBroadLocationName
    : playerBroadLocationName;

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
    "Keep each NPC to a bounded identity slice: base facts, personality summary/voice/contradictions, self-image, and live goals/strains only.",
    "Use the richer identity slice plus compatibility shorthand when deciding actions.",
    "Each NPC update MUST describe something SPECIFIC they did — name locations, actions, and consequences. Do NOT use vague summaries like 'continued pursuing goals' or 'maintained their position'. Example good update: 'Traveled to the Sporeworks to negotiate a spore trade deal with the fungal workers.' Example bad update: 'Continued working toward their goals.'",
    "Return a structured update for each NPC.",
    "",
    buildNpcOffscreenPromptContract(),
    "",
    `Player broad location: ${playerBroadLocationName}`,
    `Player scene scope: ${playerSceneScopeName}`,
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
  const parsed = parseOffscreenUpdates(object.updates, offscreenKeyNpcs.length);

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

  log.event("npcOffscreen.batch", {
    npcCount: offscreenKeyNpcs.length,
    proposedCount: results.length,
    appliedCount: 0,
    durationMs: Date.now() - batchStart,
  });
  log.info(`Off-screen simulation complete: ${results.length} update(s) quarantined as proposal-only`);
  return results;
}
