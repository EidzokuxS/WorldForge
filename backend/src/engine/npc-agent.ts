/**
 * NPC Agent system: autonomous NPC behavior via Judge LLM tool calling.
 *
 * After each player turn, Key NPCs at the player's location get individual
 * LLM ticks. Each NPC can act (through Oracle), speak, move, or update goals.
 * Ticks run sequentially to avoid conflicting state changes.
 * Failures are logged but never block gameplay.
 */

import { generateText, stepCountIs } from "ai";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, locations, players } from "../db/schema.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { extractReasoningText } from "../ai/extract-reasoning-text.js";
import { createNpcAgentTools } from "./npc-tools.js";
import { getRelationshipGraph } from "./graph-queries.js";
import { searchEpisodicEvents } from "../vectors/episodic-events.js";
import { embedTexts } from "../vectors/embeddings.js";
import { createLogger, withRole } from "../lib/index.js";
import { parseTags, collectToolCalls } from "./parse-helpers.js";
import { hydrateStoredNpcRecord } from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { DERIVED_RUNTIME_TAGS_RULE } from "../character/prompt-contract.js";
import {
  buildCombatEnvelope,
  deriveCombatPosture,
  type CombatantCombatSnapshot,
  type NpcCombatPosture,
} from "./combat-envelope.js";
import {
  getObserverAwareness,
  getObserverKnowledgeBasis,
  inferPresenceVisibility,
  resolveScenePresence,
  resolveStoredSceneScopeId,
  type PresenceSnapshot,
} from "./scene-presence.js";
import type { CharacterRecord } from "@worldforge/shared";

const log = createLogger("npc-agent");

// -- Types --------------------------------------------------------------------

export interface NpcTickResult {
  npcId: string;
  npcName: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  error?: string;
}

interface PrimaryCombatTargetCandidate {
  actorId: string;
  actorType: "player" | "npc";
  snapshot: CombatantCombatSnapshot;
}

function scorePrimaryCombatTarget(candidate: PrimaryCombatTargetCandidate): number {
  const powerStats = candidate.snapshot.powerStats;
  if (!powerStats) {
    return Number.NEGATIVE_INFINITY;
  }

  const kindBias = candidate.actorType === "player" ? 10_000 : 0;
  return (
    kindBias
    + powerStats.attackPotency.rank * 100
    + powerStats.speed.rank * 10
    + powerStats.hax.length
  );
}

function selectPrimaryCombatTarget(
  npcId: string,
  presenceSnapshot: PresenceSnapshot | null,
  candidates: readonly PrimaryCombatTargetCandidate[],
): PrimaryCombatTargetCandidate | null {
  if (!presenceSnapshot) {
    return null;
  }

  return candidates
    .filter((candidate) => Boolean(candidate.snapshot.powerStats))
    .filter(
      (candidate) => getObserverAwareness(presenceSnapshot, npcId, candidate.actorId) === "clear",
    )
    .sort((left, right) => scorePrimaryCombatTarget(right) - scorePrimaryCombatTarget(left))[0] ?? null;
}

function formatCombatPostureBlock(posture: NpcCombatPosture): string {
  return [
    "[COMBAT POSTURE]",
    `Primary target: ${posture.vsLabel}`,
    `Posture: ${posture.posture}`,
    `Matchup: ${posture.matchup}`,
    `Can win direct exchange: ${posture.canWin ? "yes" : "no"}`,
    ...(posture.mustAvoid.length > 0
      ? [`Hazards: ${posture.mustAvoid.join("; ")}`]
      : []),
    ...(posture.exposedTargetVulnerabilities.length > 0
      ? [
          `Live vulnerabilities: ${posture.exposedTargetVulnerabilities.join("; ")}`,
        ]
      : []),
    ...posture.guidanceLines.map((line) => `- ${line}`),
  ].join("\n");
}

function extractCombatSnapshotFromRecord(
  fallbackLabel: string,
  rawCharacterRecord: string | null | undefined,
): CombatantCombatSnapshot {
  if (!rawCharacterRecord) {
    return { label: fallbackLabel, powerStats: null };
  }

  try {
    const parsed = JSON.parse(rawCharacterRecord) as Partial<CharacterRecord>;
    return {
      label: parsed.identity?.displayName?.trim() || fallbackLabel,
      powerStats: parsed.powerStats ?? null,
    };
  } catch {
    return { label: fallbackLabel, powerStats: null };
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
  return withRole("npcAgent", () =>
    tickNpcAgentInternal(campaignId, npcId, tick, judgeProvider, embedderProvider),
  );
}

async function tickNpcAgentInternal(
  campaignId: string,
  npcId: string,
  tick: number,
  judgeProvider: ProviderConfig,
  embedderProvider?: ProviderConfig,
): Promise<NpcTickResult> {
  const tickStart = Date.now();
  const db = getDb();

  const npc = db
    .select()
    .from(npcs)
    .where(eq(npcs.id, npcId))
    .get();

  if (!npc) {
    return { npcId, npcName: "Unknown", toolCalls: [], error: "NPC not found" };
  }

  const npcRecord = hydrateStoredNpcRecord(npc);
  const npcTags = deriveRuntimeCharacterTags(npcRecord);
  const beliefs = npcRecord.motivations.beliefs;
  const npcSceneScopeId = resolveStoredSceneScopeId(
    npc.currentLocationId,
    npc.currentSceneLocationId ?? null,
  );
  const identityPrompt = buildNpcIdentityPrompt(npcRecord);

  let locationName = "Unknown location";
  let locationDesc = "";

  if (npcSceneScopeId) {
    const loc = db
      .select()
      .from(locations)
      .where(eq(locations.id, npcSceneScopeId))
      .get();

    if (loc) {
      locationName = loc.name;
      locationDesc = loc.description;
    }
  }

  const nearbyNpcs = npc.currentLocationId
    ? db
        .select({
          id: npcs.id,
          name: npcs.name,
          tags: npcs.tags,
          characterRecord: npcs.characterRecord,
          currentLocationId: npcs.currentLocationId,
          currentSceneLocationId: npcs.currentSceneLocationId,
        })
        .from(npcs)
        .where(
          and(
            eq(npcs.campaignId, campaignId),
            eq(npcs.currentLocationId, npc.currentLocationId),
          )
        )
        .all()
    : [];
  const nearbyOtherNpcs = nearbyNpcs.filter((nearbyNpc) => nearbyNpc.id !== npcId);

  const nearbyPlayers = npc.currentLocationId
    ? db
        .select({
          id: players.id,
          name: players.name,
          characterRecord: players.characterRecord,
          currentLocationId: players.currentLocationId,
          currentSceneLocationId: players.currentSceneLocationId,
        })
        .from(players)
        .where(
          and(
            eq(players.campaignId, campaignId),
            eq(players.currentLocationId, npc.currentLocationId)
          )
        )
        .all()
    : [];
  const nearbyPlayersWithPresenceIds = nearbyPlayers.filter(
    (
      player,
    ): player is typeof player & {
      id: string;
      currentLocationId: string;
      currentSceneLocationId?: string | null;
    } => typeof player.id === "string" && typeof player.currentLocationId === "string",
  );

  const selfPresence = inferPresenceVisibility(npc.tags);
  const presenceSnapshot =
    npc.currentLocationId && npcSceneScopeId
      ? resolveScenePresence({
          playerActorId: nearbyPlayersWithPresenceIds[0]?.id ?? npc.id,
          broadLocationId: npc.currentLocationId,
          sceneScopeId: npcSceneScopeId,
          actors: [
            ...nearbyPlayersWithPresenceIds.map((player) => ({
              actorId: player.id,
              actorType: "player" as const,
              broadLocationId: player.currentLocationId,
              sceneScopeId: player.currentSceneLocationId,
              visibility: "clear" as const,
            })),
            {
              actorId: npc.id,
              actorType: "npc" as const,
              broadLocationId: npc.currentLocationId,
              sceneScopeId: npc.currentSceneLocationId,
              visibility: selfPresence.visibility,
              awarenessHint: selfPresence.awarenessHint,
            },
            ...nearbyOtherNpcs.map((nearbyNpc) => {
              const visibility = inferPresenceVisibility(nearbyNpc.tags);
              return {
                actorId: nearbyNpc.id,
                actorType: "npc" as const,
                broadLocationId: nearbyNpc.currentLocationId,
                sceneScopeId: nearbyNpc.currentSceneLocationId,
                visibility: visibility.visibility,
                awarenessHint: visibility.awarenessHint,
              };
            }),
          ],
        })
      : null;

  const nearbyEntities: string[] = [];
  if (presenceSnapshot) {
    for (const player of nearbyPlayersWithPresenceIds) {
      const awareness = getObserverAwareness(presenceSnapshot, npc.id, player.id);
      if (awareness === "clear") {
        const knowledge = getObserverKnowledgeBasis(presenceSnapshot, npc.id, player.id);
        nearbyEntities.push(
          `${player.name} [awareness=${awareness}; knowledge=${knowledge}]`,
        );
      }
    }

    for (const nearbyNpc of nearbyOtherNpcs) {
      const awareness = getObserverAwareness(
        presenceSnapshot,
        npc.id,
        nearbyNpc.id,
      );
      const knowledge = getObserverKnowledgeBasis(
        presenceSnapshot,
        npc.id,
        nearbyNpc.id,
      );

      if (awareness === "clear") {
        nearbyEntities.push(
          `${nearbyNpc.name} [${parseTags(nearbyNpc.tags).join(", ")}; awareness=${awareness}; knowledge=${knowledge}]`,
        );
        continue;
      }

      if (awareness === "hint") {
        const visibility = inferPresenceVisibility(nearbyNpc.tags);
        nearbyEntities.push(
          `Unidentified nearby presence [awareness=hint; knowledge=${knowledge}; signal=${visibility.awarenessHint ?? "Something is nearby."}]`,
        );
      }
    }
  }

  const primaryCombatTarget = selectPrimaryCombatTarget(
    npc.id,
    presenceSnapshot,
    [
      ...nearbyPlayersWithPresenceIds.map((player) => ({
        actorId: player.id,
        actorType: "player" as const,
        snapshot: extractCombatSnapshotFromRecord(player.name, player.characterRecord),
      })),
      ...nearbyOtherNpcs.map((nearbyNpc) => ({
        actorId: nearbyNpc.id,
        actorType: "npc" as const,
        snapshot: extractCombatSnapshotFromRecord(
          nearbyNpc.name,
          nearbyNpc.characterRecord,
        ),
      })),
    ],
  );

  const combatEnvelope =
    npcRecord.powerStats && primaryCombatTarget?.snapshot.powerStats
      ? buildCombatEnvelope({
          actor: {
            label: npcRecord.identity.displayName,
            powerStats: npcRecord.powerStats,
          },
          target: primaryCombatTarget.snapshot,
          hostileAction: true,
          actionText: `Hostile engagement against ${primaryCombatTarget.snapshot.label}`,
        })
      : null;

  const combatPosture = combatEnvelope
    ? deriveCombatPosture(combatEnvelope, { vsLabel: primaryCombatTarget!.snapshot.label })
    : null;

  if (combatPosture) {
    log.event("combat.posture.derived", {
      source: "npc",
      npcId,
      npcName: npcRecord.identity.displayName,
      vsLabel: combatPosture.vsLabel,
      posture: combatPosture.posture,
      matchup: combatPosture.matchup,
      canWin: combatPosture.canWin,
      guidanceCount: combatPosture.guidanceLines.length,
      mustAvoidCount: combatPosture.mustAvoid.length,
      vulnerabilityCount: combatPosture.exposedTargetVulnerabilities.length,
    });
  }

  let recentMemories: string[] = [];
  if (embedderProvider) {
    try {
      const queryVector = await embedTexts([npcRecord.identity.displayName], embedderProvider);
      if (queryVector[0] && queryVector[0].length > 0) {
        const events = await searchEpisodicEvents(queryVector[0], tick, 3);
        recentMemories = events.map((e) => `[Tick ${e.tick}] ${e.text}`);
      }
    } catch (err) {
      log.warn(`Failed to search episodic events for ${npcRecord.identity.displayName}`, err);
    }
  }

  const graph = getRelationshipGraph(campaignId, [npcId], 1);
  const relationshipLines = graph.flatMap((node) =>
    node.relationships.map(
      (r) => `${node.entityName} --[${r.tags.join(", ")}]--> ${r.targetName}${r.reason ? ` (${r.reason})` : ""}`
    )
  );

  const goalsText = [
    ...npcRecord.motivations.shortTermGoals.map((g) => `  - [short] ${g}`),
    ...npcRecord.motivations.longTermGoals.map((g) => `  - [long] ${g}`),
  ].join("\n") || "  (none)";

  const systemPrompt = [
    `You are ${npcRecord.identity.displayName}, a character in a text RPG world.`,
    `Canonical NPC record authority: profile, socialContext, motivations, capabilities, and state define who you are right now.`,
    `Derived runtime tags are compact compatibility evidence, not the source-of-truth.`,
    DERIVED_RUNTIME_TAGS_RULE,
    `Your profile: ${npcRecord.profile.personaSummary}`,
    `Your traits: [${npcTags.join(", ")}]`,
    ...identityPrompt,
    `Current social context: location=${locationName}; status=[${npcRecord.socialContext.socialStatus.join(", ") || "none"}]; drives=[${npcRecord.motivations.drives.join(", ") || "none"}]; frictions=[${npcRecord.motivations.frictions.join(", ") || "none"}]`,
    `Your goals:\n${goalsText}`,
    `Your beliefs: [${beliefs.join(", ")}]`,
    ``,
    `Current scene: ${locationName} — ${locationDesc}`,
    `Nearby entities follow encounter scope plus justified knowledge only: clear=full context, hint=indirect cue, none=omit.`,
    nearbyEntities.length > 0
      ? `Nearby entities:\n- ${nearbyEntities.join("\n- ")}`
      : `You are alone.`,
    recentMemories.length > 0
      ? `Recent memories involving you:\n${recentMemories.join("\n")}`
      : "Recent memories involving you:\n(none recorded)",
    relationshipLines.length > 0
      ? `Your relationships:\n${relationshipLines.join("\n")}`
      : "",
    combatPosture ? formatCombatPostureBlock(combatPosture) : null,
    ``,
    `Decide whether you have a meaningful next action. Act only when your goals, relationships, pressure, or the current scene justify it; passing is valid when restraint, watching, waiting, or silence is the honest character choice.`,
    ``,
    `You may:`,
    `- act(action) — attempt an action (will be evaluated for success via dice roll)`,
    `- speak(dialogue) — say something to someone present`,
    `- move_to(location) — travel to an adjacent location`,
    `- update_own_goal(old, new) — revise your goals based on events`,
    ``,
    `Choose at most ONE action that best serves your current goals. Prefer a small believable beat over forced activity.`,
  ]
    .filter(Boolean)
    .join("\n");

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

  const toolCalls = collectToolCalls(result.steps ?? []);

  const reasoningText = extractReasoningText(result);

  log.event("npcAgent.decision", {
    npcId,
    npcName: npcRecord.identity.displayName,
    finishReason: result.finishReason,
    responseModel: result.response?.modelId ?? null,
    usage: result.usage ?? null,
    textLen: result.text.length,
    textPreview: result.text ? result.text.slice(0, 500) : null,
    reasoningLen: reasoningText?.length ?? 0,
    toolCallNames: toolCalls.map((call) => call.tool),
  });

  if (reasoningText) {
    log.event("npcAgent.reasoning", {
      npcId,
      npcName: npcRecord.identity.displayName,
      reasoningText,
      responseModel: result.response?.modelId ?? null,
      usage: result.usage ?? null,
    });
  }

  log.event("npcAgent.tick", {
    npcId,
    npcName: npcRecord.identity.displayName,
    toolCallCount: toolCalls.length,
    toolCallNames: toolCalls.map((call) => call.tool),
    durationMs: Date.now() - tickStart,
  });
  log.info(
    `${npcRecord.identity.displayName} tick complete: ${toolCalls.length} tool call(s)`,
  );

  return { npcId, npcName: npcRecord.identity.displayName, toolCalls };
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
  playerSceneScopeId?: string,
  embedderProvider?: ProviderConfig,
): Promise<NpcTickResult[]> {
  const db = getDb();
  let resolvedSceneScopeId = playerSceneScopeId ?? null;
  if (resolvedSceneScopeId && resolvedSceneScopeId === playerLocationId) {
    const scopeLocation = db
      .select({ kind: locations.kind })
      .from(locations)
      .where(eq(locations.id, resolvedSceneScopeId))
      .get();
    if (scopeLocation?.kind === "macro") {
      resolvedSceneScopeId = null;
    }
  }

  if (!resolvedSceneScopeId) {
    return [];
  }

  // Query key NPCs in the player's broad location, then keep only encounter-scope matches.
  const keyNpcs = db
    .select({
      id: npcs.id,
      name: npcs.name,
      currentLocationId: npcs.currentLocationId,
      currentSceneLocationId: npcs.currentSceneLocationId,
    })
    .from(npcs)
    .where(
      and(
        eq(npcs.campaignId, campaignId),
        eq(npcs.tier, "key"),
        eq(npcs.currentLocationId, playerLocationId)
      )
    )
    .all()
    .filter((npc) => {
      return npc.currentSceneLocationId === resolvedSceneScopeId;
    });

  if (keyNpcs.length === 0) return [];

  log.info(
    `Ticking ${keyNpcs.length} key NPC(s) in scene scope ${resolvedSceneScopeId ?? playerLocationId}`,
  );

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

function formatNpcIdentityList(label: string, values: string[]): string | null {
  if (values.length === 0) return null;
  return `${label}: ${values.join("; ")}`;
}

export function buildNpcIdentityPrompt(record: CharacterRecord): string[] {
  const baseFacts = record.identity.baseFacts;
  const behavioralCore = record.identity.behavioralCore;
  const liveDynamics = record.identity.liveDynamics;
  const personality = record.identity.personality;
  const lines = [
    "Base facts:",
    [
      baseFacts?.biography ? `- Biography: ${baseFacts.biography}` : null,
      formatNpcIdentityList("Social roles", baseFacts?.socialRole ?? []),
      formatNpcIdentityList("Hard constraints", baseFacts?.hardConstraints ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.startsWith("- ") ? value : `- ${value}`),
    "Personality:",
    [
      formatNpcIdentityList(
        "Personality summary",
        personality?.summary ? [personality.summary] : [],
      ),
      formatNpcIdentityList("Voice", personality?.voice ? [personality.voice] : []),
      formatNpcIdentityList(
        "Decision style",
        personality?.decisionStyle ? [personality.decisionStyle] : [],
      ),
      formatNpcIdentityList(
        "Worldview",
        personality?.worldview ? [personality.worldview] : [],
      ),
      formatNpcIdentityList(
        "Internal contradictions",
        personality?.internalContradictions ?? [],
      ),
      formatNpcIdentityList("Sample lines", personality?.sampleLines ?? []),
      formatNpcIdentityList("Attachments", liveDynamics?.attachments ?? []),
      behavioralCore?.selfImage ? `Self-image: ${behavioralCore.selfImage}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => `- ${value}`),
    "Live dynamics:",
    [
      formatNpcIdentityList("Active goals", liveDynamics?.activeGoals ?? []),
      formatNpcIdentityList("Belief drift", liveDynamics?.beliefDrift ?? []),
      formatNpcIdentityList("Current strains", liveDynamics?.currentStrains ?? []),
      formatNpcIdentityList("Earned changes", liveDynamics?.earnedChanges ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => `- ${value}`),
  ].flat();

  return lines;
}
