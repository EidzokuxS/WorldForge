/**
 * NPC Agent tool definitions for AI SDK.
 *
 * Factory creates campaign-scoped tools that let an NPC agent
 * act (through Oracle), speak, move between locations, and update goals.
 */

import { z } from "zod";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, locations } from "../db/schema.js";
import { callOracle, type OraclePayload } from "./oracle.js";
import {
  buildCombatEnvelope,
  isHostileCombatAction,
} from "./combat-envelope.js";
import { executeToolCall } from "./tool-executor.js";
import {
  createBackgroundToolExecutionContext,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import { createLogger } from "../lib/index.js";
import { parseTags } from "./parse-helpers.js";
import {
  hydrateStoredNpcRecord,
  projectNpcRecord,
} from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import {
  listConnectedPaths,
  loadLocationGraph,
  type ResolvedTravelPath,
  resolveLocationTarget,
  resolveTravelPath,
} from "./location-graph.js";
import { resolveActionTargetContext } from "./target-context.js";
import {
  commitAuthorityTrace,
  validateBaseWorldVersion,
} from "./living-world-authority.js";

const log = createLogger("npc-tools");

function createNpcAuthorityContext(input: {
  campaignId: string;
  npcId: string;
  elapsedWorldTimeMinutes?: number;
  allowedWriteScopes?: readonly string[];
}): ToolExecutionContext {
  return createBackgroundToolExecutionContext({
    campaignId: input.campaignId,
    sourceEntity: { type: "npc", id: input.npcId },
    elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes ?? 0,
    allowedWriteScopes: input.allowedWriteScopes,
  });
}

function createNpcMoveAuthorityContext(input: {
  campaignId: string;
  npcId: string;
  targetLocationId: string;
  targetLocationName: string;
  travelPath: ResolvedTravelPath;
}): ToolExecutionContext {
  const context = createNpcAuthorityContext({
    campaignId: input.campaignId,
    npcId: input.npcId,
    elapsedWorldTimeMinutes: input.travelPath.totalTravelCost,
    allowedWriteScopes: [
      `npc:${input.npcId}`,
      `location:${input.targetLocationId}`,
    ],
  });

  return {
    ...context,
    scope: "actor_turn",
    subjectActorId: input.npcId,
    legalMovementRefs: new Set([
      input.targetLocationId,
      `location:${input.targetLocationId}`,
      input.targetLocationName,
      ...input.travelPath.locationIds,
      ...input.travelPath.locationIds.map((locationId) => `location:${locationId}`),
    ]),
  };
}

function authorityError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// -- Tool factory -------------------------------------------------------------

/**
 * Create NPC agent tools bound to a specific NPC, campaign, and tick.
 */
export function createNpcAgentTools(
  campaignId: string,
  npcId: string,
  tick: number,
  judgeProvider: ProviderConfig,
) {
  return {
    act: tool({
      description:
        "Attempt an action (evaluated for success via Oracle dice roll). Use for physical, social, or mental actions.",
      inputSchema: z.object({
        action: z.string().describe("What you want to do"),
      }),
      execute: async ({ action }) => {
        const db = getDb();

        const npc = db
          .select()
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const npcRecord = hydrateStoredNpcRecord(npc);
        const actorTags = deriveRuntimeCharacterTags(npcRecord);
        const hostileAction = isHostileCombatAction({
          actionText: action,
          intent: action,
        });

        let environmentTags: string[] = [];
        let sceneContext = "";
        if (npc.currentLocationId) {
          const loc = db
            .select({ name: locations.name, tags: locations.tags, description: locations.description })
            .from(locations)
            .where(eq(locations.id, npc.currentLocationId))
            .get();

          if (loc) {
            environmentTags = parseTags(loc.tags);
            sceneContext = `${loc.name}: ${loc.description}`;
          }
        }

        const targetContext = hostileAction
          ? await resolveActionTargetContext({
              campaignId,
              playerAction: action,
              intent: action,
              method: "",
              judgeProvider,
            })
          : null;

        let combatEnvelope = null;
        let combatEnvelopeReason: string | null = null;

        if (!hostileAction) {
          combatEnvelopeReason = "non_hostile_action";
        } else if (targetContext?.targetType !== "character") {
          combatEnvelopeReason = "non_character_target";
        } else if (!npcRecord.powerStats) {
          combatEnvelopeReason = "missing_actor_power";
        } else if (!targetContext.combatSnapshot?.powerStats) {
          combatEnvelopeReason = "missing_target_power";
        } else {
          combatEnvelope = buildCombatEnvelope({
            actor: {
              label: npcRecord.identity.displayName,
              powerStats: npcRecord.powerStats,
            },
            target: targetContext.combatSnapshot,
            hostileAction,
            actionText: action,
          });
          if (!combatEnvelope) {
            combatEnvelopeReason = "builder_returned_null";
          }
        }

        log.event("combat.envelope", {
          source: "npc",
          hostileAction,
          built: Boolean(combatEnvelope),
          reason: combatEnvelopeReason,
          targetLabel: targetContext?.targetLabel ?? null,
          matchup: combatEnvelope?.matchup ?? null,
          durabilityTierGap: combatEnvelope?.durabilityTierGap ?? null,
          actorBypassesTarget: combatEnvelope?.actorBypassesTarget ?? null,
          targetBypassesActor: combatEnvelope?.targetBypassesActor ?? null,
        });

        const oraclePayload: OraclePayload = {
          intent: action,
          method: "",
          actorTags,
          targetTags:
            targetContext?.targetType === "character"
              ? targetContext.targetTags
              : [],
          environmentTags,
          sceneContext,
          ...(combatEnvelope ? { combatEnvelope } : {}),
        };

        const oracleResult = await callOracle(oraclePayload, judgeProvider);

        const eventText = `${npc.name} attempted: ${action} (${oracleResult.outcome}, roll ${oracleResult.roll}/${oracleResult.chance})`;
        await executeToolCall(campaignId, "log_event", {
          text: eventText,
          importance: oracleResult.outcome === "strong_hit" ? 5 : oracleResult.outcome === "weak_hit" ? 3 : 2,
          participants: [npc.name],
        }, tick, undefined, createBackgroundToolExecutionContext({
          campaignId,
          sourceEntity: { type: "npc", id: npcId },
          elapsedWorldTimeMinutes: 0,
          allowedWriteScopes: ["world:event"],
        }));

        return { oracleResult, outcome: oracleResult.outcome };
      },
    }),

    speak: tool({
      description:
        "Say something to someone present. No dice roll needed.",
      inputSchema: z.object({
        dialogue: z.string().describe("What you say"),
        target: z.string().optional().describe("Who you're addressing"),
      }),
      execute: async ({ dialogue, target }) => {
        const db = getDb();
        const npc = db
          .select({ name: npcs.name, currentLocationId: npcs.currentLocationId })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        const npcName = npc?.name ?? "Unknown NPC";
        const currentLocation = npc?.currentLocationId
          ? db
              .select({ name: locations.name })
              .from(locations)
              .where(eq(locations.id, npc.currentLocationId))
              .get()
          : null;
        const result = await executeToolCall(campaignId, "record_dialogue_outcome", {
          speakerRef: npcName,
          addresseeRefs: target ? [target] : [],
          outcomeKind: "answered",
          topicKind: "social",
          authorityKind: "witness",
          truthStatus: "speaker_asserted",
          quote: dialogue,
          summary: `${npcName} said to ${target ?? "everyone"}: "${dialogue}"`,
          sourceRefs: [npcName, currentLocation?.name].filter((value): value is string => Boolean(value)),
          durability: "durable",
          futureUseKind: "npc_memory",
          futureRelevance: "NPC-authored dialogue may inform future NPC memory and player-facing recall.",
        }, tick, undefined, createNpcAuthorityContext({
          campaignId,
          npcId,
          allowedWriteScopes: ["world:dialogue"],
        }));

        if (!result.success) {
          return { error: result.error ?? "NPC dialogue was rejected by authority" };
        }

        return { spoke: true, dialogue };
      },
    }),

    move_to: tool({
      description:
        "Travel to an adjacent location. Fails if destination is not connected to your current location.",
      inputSchema: z.object({
        targetLocation: z.string().describe("Name of the adjacent location to move to"),
      }),
      execute: async ({ targetLocation }) => {
        const db = getDb();

        const npc = db
          .select()
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc || !npc.currentLocationId) {
          return { error: "NPC has no current location" };
        }

        const locationGraph = loadLocationGraph({ campaignId });
        const currentLoc = db
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(eq(locations.id, npc.currentLocationId))
          .get();

        if (!currentLoc) return { error: "Current location not found" };

        const targetLoc = resolveLocationTarget({
          targetName: targetLocation,
          locations: locationGraph.locations,
          currentTick: tick,
        });

        if (!targetLoc) {
          return { error: `Location not found: ${targetLocation}` };
        }

        const travelPath = resolveTravelPath({
          campaignId,
          fromLocationId: npc.currentLocationId,
          toLocationId: targetLoc.locationId,
          edges: locationGraph.edges,
          locations: locationGraph.locations,
          currentTick: tick,
        });

        if (!travelPath) {
          const reachable = listConnectedPaths({
            campaignId,
            fromLocationId: npc.currentLocationId,
            edges: locationGraph.edges,
            locations: locationGraph.locations,
            currentTick: tick,
          }).map((path) => path.locationName);

          return {
            error: `Not adjacent: ${currentLoc.name} is not connected to ${targetLoc.locationName}${
              reachable.length > 0 ? `. Available paths: ${reachable.join(", ")}` : ""
            }`,
          };
        }

        const locationNameById = new Map(
          locationGraph.locations.map((location) => [location.id, location.name]),
        );
        const path = travelPath.locationIds
          .map((locationId) => locationNameById.get(locationId))
          .filter((locationName): locationName is string => Boolean(locationName));

        const moveResult = await executeToolCall(campaignId, "move_to", {
          targetLocationName: targetLoc.locationName,
        }, tick, undefined, createNpcMoveAuthorityContext({
          campaignId,
          npcId,
          targetLocationId: targetLoc.locationId,
          targetLocationName: targetLoc.locationName,
          travelPath,
        }));

        if (!moveResult.success) {
          return { error: moveResult.error ?? "NPC movement was rejected by authority" };
        }

        log.info(`${npc.name} moved from ${currentLoc.name} to ${targetLoc.locationName}`);

        return {
          moved: true,
          from: currentLoc.name,
          to: targetLoc.locationName,
          travelCost: travelPath.totalTravelCost,
          path,
        };
      },
    }),

    update_own_goal: tool({
      description:
        "Revise one of your goals based on recent events. Replace an old goal with a new one, or add a new goal.",
      inputSchema: z.object({
        oldGoal: z.string().describe("The goal to replace (or empty to add new)"),
        newGoal: z.string().describe("The new goal"),
        type: z.enum(["short_term", "long_term"]).describe("Goal category"),
      }),
      execute: async ({ oldGoal, newGoal, type }) => {
        const db = getDb();

        const npc = db
          .select()
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const npcRecord = hydrateStoredNpcRecord(npc);
        const goals = {
          short_term: [...npcRecord.motivations.shortTermGoals],
          long_term: [...npcRecord.motivations.longTermGoals],
        };
        const goalList = goals[type];

        const idx = goalList.indexOf(oldGoal);
        if (idx >= 0) {
          goalList[idx] = newGoal;
        } else {
          goalList.push(newGoal);
        }

        const authorityContext = createNpcAuthorityContext({
          campaignId,
          npcId,
          allowedWriteScopes: [`npc:${npcId}`],
        });
        const authority = authorityContext.authority;
        if (!authority) {
          return { error: "NPC goal update requires execution authority" };
        }

        try {
          db.transaction(() => {
            validateBaseWorldVersion({
              campaignId,
              baseWorldVersion: authority.baseWorldVersion,
              currentTick: tick,
            });

            db.update(npcs)
              .set(projectNpcRecord({
                ...npcRecord,
                motivations: {
                  ...npcRecord.motivations,
                  shortTermGoals: goals.short_term,
                  longTermGoals: goals.long_term,
                },
              }))
              .where(eq(npcs.id, npcId))
              .run();
            log.event("db.write", {
              table: "npcs",
              op: "update",
              rowId: npcId,
              rowName: npc.name,
            });

            commitAuthorityTrace({
              campaignId,
              operation: "npc:update_own_goal",
              baseWorldVersion: authority.baseWorldVersion,
              sourceEntity: authority.sourceEntity,
              elapsedWorldTimeMinutes: authority.elapsedWorldTimeMinutes,
              currentTick: tick,
              toolResultId: authority.toolResultId,
              stateDeltaRefs: [`npc:${npcId}`, `npc_goal:${type}`],
              metadata: {
                toolName: "update_own_goal",
                oldGoal,
                newGoal,
                type,
              },
            });
          });
        } catch (error) {
          return { error: `NPC goal update rejected by authority: ${authorityError(error)}` };
        }

        return { updated: true, goals };
      },
    }),
  };
}
