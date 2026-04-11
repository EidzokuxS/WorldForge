/**
 * NPC Agent tool definitions for AI SDK.
 *
 * Factory creates campaign-scoped tools that let an NPC agent
 * act (through Oracle), speak, move between locations, and update goals.
 */

import { z } from "zod";
import { tool } from "ai";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, locations } from "../db/schema.js";
import { callOracle, type OraclePayload } from "./oracle.js";
import { executeToolCall } from "./tool-executor.js";
import { storeEpisodicEvent } from "../vectors/episodic-events.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import { createLogger } from "../lib/index.js";
import { parseTags } from "./parse-helpers.js";
import { accumulateReflectionBudget } from "./reflection-budget.js";
import {
  hydrateStoredNpcRecord,
  projectNpcRecord,
} from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import {
  listConnectedPaths,
  loadLocationGraph,
  resolveLocationTarget,
  resolveTravelPath,
} from "./location-graph.js";

const log = createLogger("npc-tools");

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

        // Load NPC for actor tags
        const npc = db
          .select()
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const npcRecord = hydrateStoredNpcRecord(npc);
        const actorTags = deriveRuntimeCharacterTags(npcRecord);

        // Load location for environment tags
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

        const oraclePayload: OraclePayload = {
          intent: action,
          method: "",
          actorTags,
          targetTags: [],
          environmentTags,
          sceneContext,
        };

        const oracleResult = await callOracle(oraclePayload, judgeProvider);

        // On success, log the event
        const eventText = `${npc.name} attempted: ${action} (${oracleResult.outcome}, roll ${oracleResult.roll}/${oracleResult.chance})`;
        await executeToolCall(campaignId, "log_event", {
          text: eventText,
          importance: oracleResult.outcome === "strong_hit" ? 5 : oracleResult.outcome === "weak_hit" ? 3 : 2,
          participants: [npc.name],
        }, tick);

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
        const participants = [npcName];
        if (target) participants.push(target);

        // Store as episodic event
        try {
          await storeEpisodicEvent(campaignId, {
            text: `${npcName} said to ${target ?? "everyone"}: "${dialogue}"`,
            tick,
            location: currentLocation?.name ?? "",
            participants,
            importance: 3,
            type: "dialogue",
          });
          await accumulateReflectionBudget(campaignId, participants, 3);
        } catch (err) {
          log.warn("Failed to store NPC dialogue event", err);
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

        // Load NPC's current location
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

        // Update NPC location
        const npcRecord = hydrateStoredNpcRecord(npc, {
          currentLocationName: targetLoc.locationName,
        });
        db.update(npcs)
          .set(projectNpcRecord({
            ...npcRecord,
            socialContext: {
              ...npcRecord.socialContext,
              currentLocationId: targetLoc.locationId,
              currentLocationName: targetLoc.locationName,
            },
          }))
          .where(eq(npcs.id, npcId))
          .run();

        const locationNameById = new Map(
          locationGraph.locations.map((location) => [location.id, location.name]),
        );
        const path = travelPath.locationIds
          .map((locationId) => locationNameById.get(locationId))
          .filter((locationName): locationName is string => Boolean(locationName));

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

        // Find and replace, or append
        const idx = goalList.indexOf(oldGoal);
        if (idx >= 0) {
          goalList[idx] = newGoal;
        } else {
          goalList.push(newGoal);
        }

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

        return { updated: true, goals };
      },
    }),
  };
}
