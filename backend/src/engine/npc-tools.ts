/**
 * NPC Agent tool definitions for AI SDK.
 *
 * Factory creates campaign-scoped tools for NPC background beats.
 * Standalone NPC tools are proposal-only until routed through the canonical
 * actor/runtime owner registry.
 */

import { z } from "zod";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, locations } from "../db/schema.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import {
  listConnectedPaths,
  loadLocationGraph,
  resolveLocationTarget,
  resolveTravelPath,
} from "./location-graph.js";

function npcProposalOnly(
  toolName: string,
  proposal: Record<string, unknown>,
) {
  return {
    accepted: false,
    proposalOnly: true,
    toolName,
    reason:
      "Standalone NPC background tools cannot directly mutate gameplay truth; route through actor/player turn grounding or a typed backend proposal executor.",
    proposal,
  };
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
        "Propose an action for the NPC. Proposal-only; does not evaluate or commit gameplay state.",
      inputSchema: z.object({
        action: z.string().describe("What you want to do"),
      }),
      execute: async ({ action }) => {
        return npcProposalOnly("act", {
          npcId,
          action,
        });
      },
    }),

    speak: tool({
      description:
        "Propose something to say to someone present. Proposal-only; does not commit dialogue state.",
      inputSchema: z.object({
        dialogue: z.string().describe("What you say"),
        target: z.string().optional().describe("Who you're addressing"),
      }),
      execute: async ({ dialogue, target }) => {
        return npcProposalOnly("speak", {
          npcId,
          dialogue,
          target: target ?? null,
        });
      },
    }),

    move_to: tool({
      description:
        "Propose travel to a connected location. Proposal-only; does not move the NPC.",
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

        return npcProposalOnly("move_to", {
          npcId,
          targetLocation: targetLoc.locationName,
          from: currentLoc.name,
          travelCost: travelPath.totalTravelCost,
          path,
        });
      },
    }),

    update_own_goal: tool({
      description:
        "Propose a goal revision based on recent events. Proposal-only; does not commit NPC goal state.",
      inputSchema: z.object({
        oldGoal: z.string().describe("The goal to replace (or empty to add new)"),
        newGoal: z.string().describe("The new goal"),
        type: z.enum(["short_term", "long_term"]).describe("Goal category"),
      }),
      execute: async ({ oldGoal, newGoal, type }) => {
        return npcProposalOnly("update_own_goal", {
          npcId,
          oldGoal,
          newGoal,
          type,
        });
      },
    }),
  };
}
