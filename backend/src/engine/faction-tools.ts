/**
 * Faction AI SDK proposal tools for the World Engine.
 *
 * These tools intentionally do not mutate canonical campaign state. They let
 * the model produce structured macro-action proposals; a separate authority
 * pipeline must commit any durable world change.
 */

import { z } from "zod";
import { tool } from "ai";
import { createLogger } from "../lib/index.js";

const log = createLogger("faction-tools");

const PROPOSAL_ONLY_MESSAGE =
  "Faction macro tool calls are proposal-only. Commit through the authority pipeline before mutating world state.";

function proposalResult<T extends Record<string, unknown>>(
  kind: string,
  campaignId: string,
  tick: number,
  payload: T,
): T & {
  status: "proposal_only";
  kind: string;
  campaignId: string;
  tick: number;
  committed: false;
  message: string;
} {
  const result = {
    ...payload,
    status: "proposal_only" as const,
    kind,
    campaignId,
    tick,
    committed: false as const,
    message: PROPOSAL_ONLY_MESSAGE,
  };
  log.event("faction.proposal", result);
  return result;
}

// -- Tool factory -------------------------------------------------------------

/**
 * Create World Engine proposal tools bound to a specific campaign and tick.
 */
export function createFactionTools(campaignId: string, tick: number) {
  return {
    faction_action: tool({
      description:
        "Propose a faction-level action such as territory expansion, trade agreement, or military operation. This tool does not mutate state; it returns a structured proposal for an authority pipeline.",
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
        return proposalResult("faction_action", campaignId, tick, {
          action,
          outcome,
          targetLocation: targetLocation ?? null,
          tagChanges: tagChanges ?? [],
        });
      },
    }),

    update_faction_goal: tool({
      description:
        "Propose replacing an existing faction goal with a new one, or adding a new goal. This tool does not mutate faction rows.",
      inputSchema: z.object({
        factionName: z.string().describe("Name of the faction"),
        oldGoal: z.string().describe("The goal to replace (case-insensitive match)"),
        newGoal: z.string().describe("The replacement goal text"),
      }),
      execute: async ({ factionName, oldGoal, newGoal }) => {
        return proposalResult("update_faction_goal", campaignId, tick, {
          factionName,
          oldGoal,
          newGoal,
        });
      },
    }),

    add_chronicle_entry: tool({
      description:
        "Propose an entry for the World Chronicle. This tool does not insert chronicle rows.",
      inputSchema: z.object({
        text: z.string().describe("The chronicle entry text"),
      }),
      execute: async ({ text }) => {
        return proposalResult("add_chronicle_entry", campaignId, tick, {
          text,
        });
      },
    }),

    declare_world_event: tool({
      description:
        "Propose an unexpected world event such as a plague, disaster, anomaly, or discovery. This tool does not create chronicle rows or location tags.",
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
        return proposalResult("declare_world_event", campaignId, tick, {
          event,
          eventType,
          affectedLocations: affectedLocations ?? [],
          chronicleText: `[WORLD EVENT] ${event}`,
        });
      },
    }),
  };
}
