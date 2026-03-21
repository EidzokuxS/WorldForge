/**
 * Storyteller tool definitions for AI SDK.
 *
 * Factory function creates campaign-scoped tools with Zod input schemas.
 * Each tool's execute callback delegates to the tool-executor for DB validation.
 */

import { z } from "zod";
import { tool } from "ai";
import { executeToolCall } from "./tool-executor.js";

const entityTypeEnum = z.enum(["player", "npc", "location", "item", "faction"]);

/**
 * Create Storyteller tools bound to a specific campaign and tick.
 * Returns a tools object suitable for passing to streamText().
 */
export function createStorytellerTools(campaignId: string, tick: number) {
  return {
    add_tag: tool({
      description:
        "Add a tag to an entity (player, NPC, location, item, or faction). Tags represent traits, states, skills, relationships.",
      inputSchema: z.object({
        entityName: z.string().describe("Name of the entity to tag"),
        entityType: entityTypeEnum,
        tag: z.string().describe("The tag to add (lowercase, hyphenated)"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "add_tag", args, tick),
    }),

    remove_tag: tool({
      description:
        "Remove a tag from an entity. Use when a state, trait, or condition no longer applies.",
      inputSchema: z.object({
        entityName: z.string().describe("Name of the entity"),
        entityType: entityTypeEnum,
        tag: z.string().describe("The tag to remove"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "remove_tag", args, tick),
    }),

    set_relationship: tool({
      description:
        "Set or update a relationship between two entities. Upserts -- creating or updating the relationship.",
      inputSchema: z.object({
        entityA: z.string().describe("Name of the first entity"),
        entityB: z.string().describe("Name of the second entity"),
        tag: z
          .string()
          .describe("Relationship tag (e.g. ally, enemy, mentor, rival)"),
        reason: z
          .string()
          .describe("Brief reason for this relationship"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "set_relationship", args, tick),
    }),

    add_chronicle_entry: tool({
      description:
        "Record a significant event in the campaign chronicle. Use for major story beats, discoveries, or turning points.",
      inputSchema: z.object({
        text: z
          .string()
          .describe("Description of the event for the chronicle"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "add_chronicle_entry", args, tick),
    }),

    log_event: tool({
      description:
        "Log an episodic event for memory retrieval. Use for any noteworthy occurrence that should be searchable later.",
      inputSchema: z.object({
        text: z.string().describe("Event description for memory"),
        importance: z
          .number()
          .min(1)
          .max(10)
          .describe("Importance 1-10 (10 = world-changing, 1 = trivial)"),
        participants: z
          .array(z.string())
          .describe("Names of entities involved"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "log_event", args, tick),
    }),

    offer_quick_actions: tool({
      description:
        "Suggest 3-5 quick action options for the player to choose from. Offer these after narration to guide gameplay.",
      inputSchema: z.object({
        actions: z
          .array(
            z.object({
              label: z.string().describe("Short button label"),
              action: z.string().describe("Full action text if selected"),
            })
          )
          .min(3)
          .max(5),
      }),
      execute: async (args) => ({
        success: true as const,
        result: { actions: args.actions },
      }),
    }),

    spawn_npc: tool({
      description:
        "Spawn a new NPC into the scene at a specified location. The NPC is created as temporary tier.",
      inputSchema: z.object({
        name: z.string().describe("NPC name"),
        tags: z.array(z.string()).describe("Tags describing the NPC (traits, roles, states)"),
        locationName: z.string().describe("Name of the location where the NPC appears"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "spawn_npc", args, tick),
    }),

    spawn_item: tool({
      description:
        "Spawn a new item, giving it to a character or placing it at a location.",
      inputSchema: z.object({
        name: z.string().describe("Item name"),
        tags: z.array(z.string()).describe("Tags describing the item"),
        ownerName: z.string().describe("Name of the character or location to receive the item"),
        ownerType: z.enum(["character", "location"]).describe("Whether the owner is a character or location"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "spawn_item", args, tick),
    }),

    reveal_location: tool({
      description:
        "Reveal a new location and connect it to an existing location in the world graph.",
      inputSchema: z.object({
        name: z.string().describe("Name of the new location"),
        description: z.string().describe("Description of the new location"),
        tags: z.array(z.string()).describe("Tags for the new location"),
        connectedToName: z.string().describe("Name of an existing location to connect to"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "reveal_location", args, tick),
    }),

    set_condition: tool({
      description:
        "Modify a player character's HP. Use delta for relative changes (+1 heal, -2 damage) or value for absolute setting. Only works on player characters, not NPCs.",
      inputSchema: z.object({
        targetName: z.string().describe("Name of the player character"),
        delta: z.number().optional().describe("HP change: positive to heal, negative to damage"),
        value: z.number().min(0).max(5).optional().describe("Set HP to this absolute value (0-5)"),
      }).refine(
        (data) => data.delta !== undefined || data.value !== undefined,
        { message: "Either delta or value must be provided" }
      ),
      execute: async (args) =>
        executeToolCall(campaignId, "set_condition", args, tick),
    }),

    transfer_item: tool({
      description:
        "Transfer an existing item to a different character or location. Clears previous ownership.",
      inputSchema: z.object({
        itemName: z.string().describe("Name of the item to transfer"),
        targetName: z.string().describe("Name of the character or location to receive the item"),
        targetType: z.enum(["character", "location"]).describe("Whether the target is a character or location"),
      }),
      execute: async (args) =>
        executeToolCall(campaignId, "transfer_item", args, tick),
    }),
  };
}
