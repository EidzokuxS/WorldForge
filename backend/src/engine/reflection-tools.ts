/**
 * Reflection Agent tool definitions for AI SDK.
 *
 * Factory creates campaign-scoped tools that let the Reflection Agent
 * update an NPC's beliefs, goals, and relationships based on accumulated
 * episodic events.
 */

import { z } from "zod";
import { tool } from "ai";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, players } from "../db/schema.js";
import { executeToolCall } from "./tool-executor.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("reflection-tools");

const MAX_BELIEFS = 10;
const MAX_GOALS_PER_CATEGORY = 5;

// -- Tier constants -----------------------------------------------------------

export const WEALTH_TIERS = ["Destitute", "Poor", "Comfortable", "Wealthy", "Obscenely Rich"] as const;
export const SKILL_TIERS = ["Novice", "Skilled", "Master"] as const;
export const RELATIONSHIP_TAGS = ["Trusted Ally", "Friendly", "Neutral", "Suspicious", "Hostile", "Sworn Enemy"] as const;

// -- Tag helpers --------------------------------------------------------------

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

type EntityType = "player" | "npc";

function resolveEntityForUpgrade(
  campaignId: string,
  entityName: string,
  entityType: EntityType,
): { id: string; name: string; tags: string } | null {
  const db = getDb();
  const table = entityType === "player" ? players : npcs;

  const row = db
    .select({ id: table.id, name: table.name, tags: table.tags })
    .from(table)
    .where(
      sql`${table.campaignId} = ${campaignId} AND LOWER(${table.name}) = LOWER(${entityName})`,
    )
    .get();

  return row ?? null;
}

function updateEntityTags(
  entityId: string,
  entityType: EntityType,
  tags: string[],
): void {
  const db = getDb();
  const table = entityType === "player" ? players : npcs;
  db.update(table)
    .set({ tags: JSON.stringify(tags) })
    .where(eq(table.id, entityId))
    .run();
}

// -- Helpers ------------------------------------------------------------------

function parseBeliefs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((b): b is string => typeof b === "string")
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

// -- Tool factory -------------------------------------------------------------

/**
 * Create Reflection Agent tools bound to a specific NPC and campaign.
 */
export function createReflectionTools(campaignId: string, npcId: string) {
  return {
    set_belief: tool({
      description:
        "Record a new belief formed from reflecting on recent events. Include evidence from specific events.",
      inputSchema: z.object({
        belief: z.string().describe("The belief statement"),
        evidence: z.array(z.string()).describe("Event references supporting this belief"),
      }),
      execute: async ({ belief }) => {
        const db = getDb();

        const npc = db
          .select({ beliefs: npcs.beliefs })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const beliefs = parseBeliefs(npc.beliefs);

        // Append new belief (avoid duplicates)
        if (!beliefs.includes(belief)) {
          beliefs.push(belief);
        }

        // Keep max N beliefs (drop oldest if exceeded)
        while (beliefs.length > MAX_BELIEFS) {
          beliefs.shift();
        }

        db.update(npcs)
          .set({ beliefs: JSON.stringify(beliefs) })
          .where(eq(npcs.id, npcId))
          .run();

        log.info(`NPC ${npcId}: set belief "${belief}"`);
        return { updated: true, beliefs };
      },
    }),

    set_goal: tool({
      description:
        "Add a new goal based on reflection. Choose short_term for immediate objectives, long_term for lasting ambitions.",
      inputSchema: z.object({
        goal: z.string().describe("The goal text"),
        priority: z.enum(["short_term", "long_term"]).describe("Goal category"),
      }),
      execute: async ({ goal, priority }) => {
        const db = getDb();

        const npc = db
          .select({ goals: npcs.goals })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const goals = parseGoals(npc.goals);
        const goalList = goals[priority];

        // Append if not duplicate
        if (!goalList.includes(goal)) {
          goalList.push(goal);
        }

        // Cap at max per category
        while (goalList.length > MAX_GOALS_PER_CATEGORY) {
          goalList.shift();
        }

        db.update(npcs)
          .set({ goals: JSON.stringify(goals) })
          .where(eq(npcs.id, npcId))
          .run();

        log.info(`NPC ${npcId}: set ${priority} goal "${goal}"`);
        return { updated: true, goals };
      },
    }),

    drop_goal: tool({
      description:
        "Remove a goal that is no longer relevant based on recent events.",
      inputSchema: z.object({
        goal: z.string().describe("The goal text to remove"),
      }),
      execute: async ({ goal }) => {
        const db = getDb();

        const npc = db
          .select({ goals: npcs.goals })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const goals = parseGoals(npc.goals);
        const lowerGoal = goal.toLowerCase();

        // Remove from both arrays (case-insensitive)
        goals.short_term = goals.short_term.filter(
          (g) => g.toLowerCase() !== lowerGoal,
        );
        goals.long_term = goals.long_term.filter(
          (g) => g.toLowerCase() !== lowerGoal,
        );

        db.update(npcs)
          .set({ goals: JSON.stringify(goals) })
          .where(eq(npcs.id, npcId))
          .run();

        log.info(`NPC ${npcId}: dropped goal "${goal}"`);
        return { updated: true, goals };
      },
    }),

    set_relationship: tool({
      description:
        "Update your relationship with another entity based on reflection on recent events.",
      inputSchema: z.object({
        target: z.string().describe("Name of the entity to set relationship with"),
        tag: z.string().describe("Relationship tag (e.g. ally, enemy, rival, mentor)"),
        reason: z.string().describe("Why this relationship exists or changed"),
      }),
      execute: async ({ target, tag, reason }) => {
        const db = getDb();

        // Load NPC name for entityA
        const npc = db
          .select({ name: npcs.name })
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        // Reuse existing set_relationship tool executor logic
        const result = await executeToolCall(
          campaignId,
          "set_relationship",
          {
            entityA: npc.name,
            entityB: target,
            tag,
            reason,
          },
          0,
        );

        log.info(`NPC ${npcId}: set relationship with "${target}" -> [${tag}]`);
        return result;
      },
    }),

    upgrade_wealth: tool({
      description:
        "Upgrade an entity's wealth tier by one step. Tiers: Destitute -> Poor -> Comfortable -> Wealthy -> Obscenely Rich.",
      inputSchema: z.object({
        entityName: z.string().describe("Name of the entity"),
        entityType: z.enum(["player", "npc"]).describe("Type of entity"),
        newTier: z.enum(WEALTH_TIERS).describe("The new wealth tier (must be exactly one step up)"),
      }),
      execute: async ({ entityName, entityType, newTier }) => {
        const entity = resolveEntityForUpgrade(campaignId, entityName, entityType);
        if (!entity) return { error: `Entity not found: ${entityName} (${entityType})` };

        const currentTags = parseTags(entity.tags);
        const currentWealthTag = currentTags.find((t) =>
          (WEALTH_TIERS as readonly string[]).includes(t),
        );

        const newIndex = WEALTH_TIERS.indexOf(newTier);

        if (!currentWealthTag) {
          // No existing wealth tag -- only allow Destitute or Poor as starting tier
          if (newIndex > 1) {
            return { error: `No current wealth tier. Can only set Destitute or Poor as starting tier, not ${newTier}.` };
          }
          currentTags.push(newTier);
          updateEntityTags(entity.id, entityType, currentTags);
          log.info(`${entityName}: set initial wealth tier "${newTier}"`);
          return { updated: true, tags: currentTags };
        }

        const currentIndex = WEALTH_TIERS.indexOf(currentWealthTag as typeof WEALTH_TIERS[number]);

        if (newIndex < currentIndex) {
          return { error: `Cannot downgrade wealth from ${currentWealthTag} to ${newTier}. Only one step up is allowed.` };
        }

        if (newIndex !== currentIndex + 1) {
          return { error: `Wealth must progress one step at a time. Current: ${currentWealthTag}, requested: ${newTier}, expected next: ${WEALTH_TIERS[currentIndex + 1] ?? "max reached"}.` };
        }

        // Replace old tier with new tier
        const tagIndex = currentTags.indexOf(currentWealthTag);
        currentTags[tagIndex] = newTier;
        updateEntityTags(entity.id, entityType, currentTags);
        log.info(`${entityName}: wealth ${currentWealthTag} -> ${newTier}`);
        return { updated: true, tags: currentTags };
      },
    }),

    upgrade_skill: tool({
      description:
        'Upgrade an entity\'s skill tier by one step. Skills are tags like "Novice Swordsman" -> "Skilled Swordsman" -> "Master Swordsman".',
      inputSchema: z.object({
        entityName: z.string().describe("Name of the entity"),
        entityType: z.enum(["player", "npc"]).describe("Type of entity"),
        skillName: z.string().describe("The skill name (e.g. Swordsman, Alchemy)"),
        newTier: z.enum(SKILL_TIERS).describe("The new skill tier (must be exactly one step up)"),
      }),
      execute: async ({ entityName, entityType, skillName, newTier }) => {
        const entity = resolveEntityForUpgrade(campaignId, entityName, entityType);
        if (!entity) return { error: `Entity not found: ${entityName} (${entityType})` };

        const currentTags = parseTags(entity.tags);

        // Find existing skill tag matching pattern "{Tier} {skillName}"
        const existingSkillTag = currentTags.find((t) =>
          SKILL_TIERS.some((tier) => t === `${tier} ${skillName}`),
        );

        const newIndex = SKILL_TIERS.indexOf(newTier);

        if (!existingSkillTag) {
          // No existing skill tag -- only allow Novice as starting tier
          if (newIndex !== 0) {
            return { error: `No existing ${skillName} skill. Can only set Novice as starting tier, not ${newTier}.` };
          }
          currentTags.push(`${newTier} ${skillName}`);
          updateEntityTags(entity.id, entityType, currentTags);
          log.info(`${entityName}: set initial skill "${newTier} ${skillName}"`);
          return { updated: true, tags: currentTags };
        }

        // Extract current tier from existing tag
        const currentTier = SKILL_TIERS.find((tier) => existingSkillTag === `${tier} ${skillName}`);
        if (!currentTier) {
          return { error: `Could not parse current skill tier from tag: ${existingSkillTag}` };
        }

        const currentIndex = SKILL_TIERS.indexOf(currentTier);

        if (newIndex < currentIndex) {
          return { error: `Cannot downgrade skill from ${currentTier} to ${newTier} ${skillName}. Only one step up is allowed.` };
        }

        if (newIndex !== currentIndex + 1) {
          return { error: `Skill must progress one step at a time. Current: ${currentTier} ${skillName}, expected next: ${SKILL_TIERS[currentIndex + 1] ?? "max reached"} ${skillName}.` };
        }

        // Replace old skill tag with new one
        const tagIndex = currentTags.indexOf(existingSkillTag);
        currentTags[tagIndex] = `${newTier} ${skillName}`;
        updateEntityTags(entity.id, entityType, currentTags);
        log.info(`${entityName}: skill ${existingSkillTag} -> ${newTier} ${skillName}`);
        return { updated: true, tags: currentTags };
      },
    }),
  };
}
