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
import { executeToolCall, type ToolResult } from "./tool-executor.js";
import { storeEpisodicEvent } from "../vectors/episodic-events.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("npc-tools");

// -- Helpers ------------------------------------------------------------------

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

interface NpcGoals {
  short_term: string[];
  long_term: string[];
}

function parseGoals(raw: string): NpcGoals {
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

function parseConnectedTo(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((c): c is string => typeof c === "string")
      : [];
  } catch {
    return [];
  }
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

        // Load NPC for actor tags
        const npc = db
          .select({ name: npcs.name, tags: npcs.tags, currentLocationId: npcs.currentLocationId })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const actorTags = parseTags(npc.tags);

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
          .select({ name: npcs.name })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        const npcName = npc?.name ?? "Unknown NPC";
        const participants = [npcName];
        if (target) participants.push(target);

        // Store as episodic event
        try {
          await storeEpisodicEvent(campaignId, {
            text: `${npcName} said to ${target ?? "everyone"}: "${dialogue}"`,
            tick,
            location: "",
            participants,
            importance: 3,
            type: "dialogue",
          });
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
          .select({ name: npcs.name, currentLocationId: npcs.currentLocationId })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc || !npc.currentLocationId) {
          return { error: "NPC has no current location" };
        }

        // Load current location for adjacency check
        const currentLoc = db
          .select({ id: locations.id, name: locations.name, connectedTo: locations.connectedTo })
          .from(locations)
          .where(eq(locations.id, npc.currentLocationId))
          .get();

        if (!currentLoc) return { error: "Current location not found" };

        const connectedIds = parseConnectedTo(currentLoc.connectedTo);

        // Resolve target location by name (case-insensitive)
        const targetLoc = db
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(
            sql`${locations.campaignId} = ${campaignId} AND LOWER(${locations.name}) = LOWER(${targetLocation})`
          )
          .get();

        if (!targetLoc) {
          return { error: `Location not found: ${targetLocation}` };
        }

        // Check adjacency
        if (!connectedIds.includes(targetLoc.id)) {
          return { error: `Not adjacent: ${currentLoc.name} is not connected to ${targetLoc.name}` };
        }

        // Update NPC location
        db.update(npcs)
          .set({ currentLocationId: targetLoc.id })
          .where(eq(npcs.id, npcId))
          .run();

        log.info(`${npc.name} moved from ${currentLoc.name} to ${targetLoc.name}`);

        return { moved: true, from: currentLoc.name, to: targetLoc.name };
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
          .select({ goals: npcs.goals })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const goals = parseGoals(npc.goals);
        const goalList = goals[type];

        // Find and replace, or append
        const idx = goalList.indexOf(oldGoal);
        if (idx >= 0) {
          goalList[idx] = newGoal;
        } else {
          goalList.push(newGoal);
        }

        db.update(npcs)
          .set({ goals: JSON.stringify(goals) })
          .where(eq(npcs.id, npcId))
          .run();

        return { updated: true, goals };
      },
    }),
  };
}
