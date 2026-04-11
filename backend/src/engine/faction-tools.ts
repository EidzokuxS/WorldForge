/**
 * Faction AI SDK tool definitions for the World Engine.
 *
 * Factory creates campaign-scoped tools that let the World Engine
 * evaluate and execute faction-level actions: territory expansion,
 * goal updates, and chronicle entries.
 */

import crypto from "node:crypto";
import { z } from "zod";
import { tool } from "ai";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { factions, locations, chronicle } from "../db/schema.js";
import { createLogger } from "../lib/index.js";
import { parseTags } from "./parse-helpers.js";
import { recordLocationRecentEvent } from "./location-events.js";

const log = createLogger("faction-tools");

const MAX_GOALS = 10;

// -- Tool factory -------------------------------------------------------------

/**
 * Create World Engine tools bound to a specific campaign and tick.
 */
export function createFactionTools(campaignId: string, tick: number) {
  return {
    faction_action: tool({
      description:
        "Execute a faction-level action such as territory expansion, trade agreement, or military operation. Produces tag changes on factions and locations, plus a chronicle entry.",
      inputSchema: z.object({
        action: z.string().describe("The action the faction is taking"),
        outcome: z.string().describe("The outcome/result of the action"),
        targetLocation: z.string().optional().describe("Name of the target location, if applicable"),
        tagChanges: z
          .array(
            z.object({
              entity: z.enum(["faction", "location"]),
              entityName: z.string(),
              addTags: z.array(z.string()),
              removeTags: z.array(z.string()),
            })
          )
          .optional()
          .describe("Tag mutations to apply to factions and locations"),
      }),
      execute: async ({ action, outcome, targetLocation, tagChanges }) => {
        const db = getDb();
        const changes: string[] = [];

        // Apply tag changes
        if (tagChanges && tagChanges.length > 0) {
          for (const change of tagChanges) {
            const table = change.entity === "faction" ? factions : locations;
            const row = db
              .select({ id: table.id, name: table.name, tags: table.tags })
              .from(table)
              .where(
                sql`${table.campaignId} = ${campaignId} AND LOWER(${table.name}) = LOWER(${change.entityName})`
              )
              .get();

            if (!row) {
              log.warn(`Entity not found: ${change.entityName} (${change.entity})`);
              continue;
            }

            const currentTags = parseTags(row.tags);

            // Add tags (no duplicates)
            for (const addTag of change.addTags) {
              if (!currentTags.includes(addTag)) {
                currentTags.push(addTag);
              }
            }

            // Remove tags
            for (const removeTag of change.removeTags) {
              const idx = currentTags.indexOf(removeTag);
              if (idx !== -1) {
                currentTags.splice(idx, 1);
              }
            }

            db.update(table)
              .set({ tags: JSON.stringify(currentTags) })
              .where(eq(table.id, row.id))
              .run();

            changes.push(`${change.entity} "${row.name}": +[${change.addTags.join(",")}] -[${change.removeTags.join(",")}]`);
          }
        }

        // Log as chronicle entry
        const chronicleText = `${action}: ${outcome}${targetLocation ? ` (target: ${targetLocation})` : ""}`;
        const entryId = crypto.randomUUID();
        db.insert(chronicle)
          .values({
            id: entryId,
            campaignId,
            tick,
            text: chronicleText,
            createdAt: Date.now(),
          })
          .run();

        if (targetLocation) {
          recordLocationRecentEvent({
            campaignId,
            locationRef: targetLocation,
            tick,
            eventType: "faction_action",
            summary: chronicleText,
            importance: 4,
          });
        }

        log.info(`Faction action: ${action} -> ${changes.length} tag change(s)`);
        return { success: true, changes, chronicleEntryId: entryId };
      },
    }),

    update_faction_goal: tool({
      description:
        "Replace an existing faction goal with a new one, or add a new goal if the old one is not found.",
      inputSchema: z.object({
        factionName: z.string().describe("Name of the faction"),
        oldGoal: z.string().describe("The goal to replace (case-insensitive match)"),
        newGoal: z.string().describe("The replacement goal text"),
      }),
      execute: async ({ factionName, oldGoal, newGoal }) => {
        const db = getDb();

        const faction = db
          .select({ id: factions.id, name: factions.name, goals: factions.goals })
          .from(factions)
          .where(
            sql`${factions.campaignId} = ${campaignId} AND LOWER(${factions.name}) = LOWER(${factionName})`
          )
          .get();

        if (!faction) {
          return { error: `Faction not found: ${factionName}` };
        }

        const goals = parseTags(faction.goals);
        const oldGoalLower = oldGoal.toLowerCase();

        // Find and replace (case-insensitive)
        const idx = goals.findIndex((g) => g.toLowerCase() === oldGoalLower);
        if (idx !== -1) {
          goals[idx] = newGoal;
        } else {
          // Not found -- append
          goals.push(newGoal);
        }

        // Cap at max goals
        while (goals.length > MAX_GOALS) {
          goals.shift();
        }

        db.update(factions)
          .set({ goals: JSON.stringify(goals) })
          .where(eq(factions.id, faction.id))
          .run();

        log.info(`Faction "${factionName}": goal updated "${oldGoal}" -> "${newGoal}"`);
        return { updated: true, goals };
      },
    }),

    add_chronicle_entry: tool({
      description:
        "Add an entry to the World Chronicle recording a significant world event.",
      inputSchema: z.object({
        text: z.string().describe("The chronicle entry text"),
      }),
      execute: async ({ text }) => {
        const db = getDb();
        const entryId = crypto.randomUUID();

        db.insert(chronicle)
          .values({
            id: entryId,
            campaignId,
            tick,
            text,
            createdAt: Date.now(),
          })
          .run();

        log.info(`Chronicle entry added: "${text.substring(0, 50)}..."`);
        return { entryId };
      },
    }),

    declare_world_event: tool({
      description:
        "Introduce an unexpected world event such as a plague, disaster, anomaly, or discovery. Creates a chronicle entry and optionally applies event tags to affected locations.",
      inputSchema: z.object({
        event: z.string().describe("Description of the world event"),
        eventType: z
          .enum(["plague", "disaster", "anomaly", "discovery", "political", "economic", "other"])
          .describe("Category of event"),
        affectedLocations: z
          .array(z.string())
          .optional()
          .describe("Location names affected by this event"),
      }),
      execute: async ({ event, eventType, affectedLocations }) => {
        const db = getDb();

        // 1. Insert chronicle entry with [WORLD EVENT] prefix
        const entryId = crypto.randomUUID();
        const chronicleText = `[WORLD EVENT] ${event}`;
        db.insert(chronicle)
          .values({
            id: entryId,
            campaignId,
            tick,
            text: chronicleText,
            createdAt: Date.now(),
          })
          .run();

        // 2. Apply event tag to affected locations
        let locationsAffected = 0;
        if (affectedLocations && affectedLocations.length > 0) {
          const eventTag = `${eventType.charAt(0).toUpperCase() + eventType.slice(1)}-affected`;

          for (const locName of affectedLocations) {
            const loc = db
              .select({ id: locations.id, name: locations.name, tags: locations.tags })
              .from(locations)
              .where(
                sql`${locations.campaignId} = ${campaignId} AND LOWER(${locations.name}) = LOWER(${locName})`
              )
              .get();

            if (!loc) {
              log.warn(`World event: location not found: ${locName}`);
              continue;
            }

            const currentTags = parseTags(loc.tags);
            if (!currentTags.includes(eventTag)) {
              currentTags.push(eventTag);
            }

            db.update(locations)
              .set({ tags: JSON.stringify(currentTags) })
              .where(eq(locations.id, loc.id))
              .run();

            locationsAffected++;

            recordLocationRecentEvent({
              campaignId,
              locationRef: locName,
              tick,
              eventType: `world_${eventType}`,
              summary: chronicleText,
              importance: 4,
            });
          }
        }

        log.info(`World event declared: "${event}" (${eventType}), ${locationsAffected} location(s) affected`);
        return { entryId, locationsAffected };
      },
    }),
  };
}
