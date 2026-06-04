/**
 * Reflection Agent tool definitions for AI SDK.
 *
 * Factory creates campaign-scoped proposal tools for the Reflection Agent.
 * These tools do not directly mutate gameplay state; accepted reflection
 * changes must route through a typed backend proposal executor.
 */

import { z } from "zod";
import { tool } from "ai";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs, players } from "../db/schema.js";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
} from "../character/record-adapters.js";

// -- Tier constants -----------------------------------------------------------

export const WEALTH_TIERS = ["Destitute", "Poor", "Comfortable", "Wealthy", "Obscenely Rich"] as const;
export const SKILL_TIERS = ["Novice", "Skilled", "Master"] as const;
export const RELATIONSHIP_TAGS = ["Trusted Ally", "Friendly", "Neutral", "Suspicious", "Hostile", "Sworn Enemy"] as const;

type EntityType = "player" | "npc";

function reflectionProposalOnly(
  toolName: string,
  proposal: Record<string, unknown>,
) {
  return {
    accepted: false,
    proposalOnly: true,
    toolName,
    reason:
      "Reflection tools cannot directly mutate gameplay state; route through a typed backend proposal executor with explicit state owners, receipts, rollback, projection, and recovery.",
    proposal,
  };
}

function resolveEntityForUpgrade(
  campaignId: string,
  entityName: string,
  entityType: EntityType,
):
  | { id: string; name: string; type: "player"; record: ReturnType<typeof hydrateStoredPlayerRecord> }
  | { id: string; name: string; type: "npc"; record: ReturnType<typeof hydrateStoredNpcRecord> }
  | null {
  const db = getDb();

  if (entityType === "player") {
    const row = db
      .select()
      .from(players)
      .where(
        sql`${players.campaignId} = ${campaignId} AND LOWER(${players.name}) = LOWER(${entityName})`,
      )
      .get();

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      type: "player",
      record: hydrateStoredPlayerRecord(row),
    };
  }

  const row = db
    .select()
    .from(npcs)
    .where(
      sql`${npcs.campaignId} = ${campaignId} AND LOWER(${npcs.name}) = LOWER(${entityName})`,
    )
    .get();

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: "npc",
    record: hydrateStoredNpcRecord(row),
  };
}

const REQUIRED_EVIDENCE = 1;

// -- Tool factory -------------------------------------------------------------

/**
 * Create Reflection Agent tools bound to a specific NPC and campaign.
 */
export function createReflectionTools(campaignId: string, npcId: string) {
  const personalityPatchSchema = z.object({
    summary: z.string().optional(),
    voice: z.string().optional(),
    decisionStyle: z.string().optional(),
    worldview: z.string().optional(),
    internalContradictions: z.array(z.string()).optional(),
    personalMythology: z.string().optional(),
    sampleLines: z.array(z.string()).optional(),
  }).strict();

  return {
    set_belief: tool({
      description:
        "Record a new belief formed from reflecting on recent events. Include evidence from specific events.",
      inputSchema: z.object({
        belief: z.string().describe("The belief statement"),
        evidence: z.array(z.string()).describe("Event references supporting this belief"),
      }),
      execute: async ({ belief, evidence }) => {
        return reflectionProposalOnly("set_belief", {
          npcId,
          belief,
          evidence,
        });
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
        return reflectionProposalOnly("set_goal", {
          npcId,
          goal,
          priority,
        });
      },
    }),

    drop_goal: tool({
      description:
        "Remove a goal that is no longer relevant based on recent events.",
      inputSchema: z.object({
        goal: z.string().describe("The goal text to remove"),
      }),
      execute: async ({ goal }) => {
        return reflectionProposalOnly("drop_goal", {
          npcId,
          goal,
        });
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
        return reflectionProposalOnly("set_relationship", {
          npcId,
          target,
          tag,
          reason,
        });
      },
    }),

    promote_identity_change: tool({
      description:
        "Promote an earned deeper identity change after multiple strong evidence points. This is the only tool allowed to alter personality, self-image, attachments, or baseFacts.",
      inputSchema: z.object({
        personality: personalityPatchSchema.optional().describe("Partial personality fields to promote into durable identity."),
        liveDynamicsAttachments: z.array(z.string()).optional().describe("Replace live dynamics attachments with the promoted attachment list."),
        selfImage: z.string().optional().describe("Optional promoted self-image value."),
        hardConstraints: z.array(z.string()).optional().describe("Optional replacement hard-constraint list."),
        evidence: z.array(z.string()).describe("Multiple concrete evidence points supporting the promotion"),
        whyNow: z.string().describe("Why the accumulated evidence justifies a deeper identity shift now"),
      }).strict(),
      execute: async ({
        personality,
        liveDynamicsAttachments,
        selfImage,
        hardConstraints,
        evidence,
        whyNow,
      }) => {
        const strongEvidence = evidence.map((entry) => entry.trim()).filter(Boolean);

        if (strongEvidence.length < REQUIRED_EVIDENCE || whyNow.trim().length < 24) {
          return {
            error: `Deeper identity changes require multiple strong evidence points. Need ${REQUIRED_EVIDENCE}, got ${strongEvidence.length}.`,
          };
        }

        return reflectionProposalOnly("promote_identity_change", {
          npcId,
          personality: personality ?? null,
          liveDynamicsAttachments: liveDynamicsAttachments ?? null,
          selfImage: selfImage?.trim() || null,
          hardConstraints: hardConstraints ?? null,
          evidence: strongEvidence,
          whyNow: whyNow.trim(),
        });
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

        const currentWealthTag = entity.record.capabilities.wealthTier;

        const newIndex = WEALTH_TIERS.indexOf(newTier);

        if (!currentWealthTag) {
          // No existing wealth tag -- only allow Destitute or Poor as starting tier
          if (newIndex > 1) {
            return { error: `No current wealth tier. Can only set Destitute or Poor as starting tier, not ${newTier}.` };
          }
          return reflectionProposalOnly("upgrade_wealth", {
            npcId,
            entityName,
            entityType,
            currentWealthTag: null,
            newTier,
          });
        }

        const currentIndex = WEALTH_TIERS.indexOf(currentWealthTag as typeof WEALTH_TIERS[number]);

        if (newIndex < currentIndex) {
          return { error: `Cannot downgrade wealth from ${currentWealthTag} to ${newTier}. Only one step up is allowed.` };
        }

        if (newIndex !== currentIndex + 1) {
          return { error: `Wealth must progress one step at a time. Current: ${currentWealthTag}, requested: ${newTier}, expected next: ${WEALTH_TIERS[currentIndex + 1] ?? "max reached"}.` };
        }

        return reflectionProposalOnly("upgrade_wealth", {
          npcId,
          entityName,
          entityType,
          currentWealthTag,
          newTier,
        });
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

        const existingSkill = entity.record.capabilities.skills.find((entry) =>
          entry.name.toLowerCase() === skillName.toLowerCase(),
        );

        const newIndex = SKILL_TIERS.indexOf(newTier);

        if (!existingSkill) {
          // No existing skill tag -- only allow Novice as starting tier
          if (newIndex !== 0) {
            return { error: `No existing ${skillName} skill. Can only set Novice as starting tier, not ${newTier}.` };
          }
          return reflectionProposalOnly("upgrade_skill", {
            npcId,
            entityName,
            entityType,
            skillName,
            currentTier: null,
            newTier,
          });
        }

        const currentTier = existingSkill.tier;
        if (!currentTier) {
          return { error: `Could not parse current skill tier from record: ${skillName}` };
        }

        const currentIndex = SKILL_TIERS.indexOf(currentTier);

        if (newIndex < currentIndex) {
          return { error: `Cannot downgrade skill from ${currentTier} to ${newTier} ${skillName}. Only one step up is allowed.` };
        }

        if (newIndex !== currentIndex + 1) {
          return { error: `Skill must progress one step at a time. Current: ${currentTier} ${skillName}, expected next: ${SKILL_TIERS[currentIndex + 1] ?? "max reached"} ${skillName}.` };
        }

        return reflectionProposalOnly("upgrade_skill", {
          npcId,
          entityName,
          entityType,
          skillName,
          currentTier,
          newTier,
        });
      },
    }),
  };
}
