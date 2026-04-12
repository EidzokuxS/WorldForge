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
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
  projectNpcRecord,
  projectPlayerRecord,
} from "../character/record-adapters.js";
import type { CharacterRecord } from "@worldforge/shared";

const log = createLogger("reflection-tools");

const MAX_BELIEFS = 10;
const MAX_GOALS_PER_CATEGORY = 5;
const MAX_EARNED_CHANGES = 10;

// -- Tier constants -----------------------------------------------------------

export const WEALTH_TIERS = ["Destitute", "Poor", "Comfortable", "Wealthy", "Obscenely Rich"] as const;
export const SKILL_TIERS = ["Novice", "Skilled", "Master"] as const;
export const RELATIONSHIP_TAGS = ["Trusted Ally", "Friendly", "Neutral", "Suspicious", "Hostile", "Sworn Enemy"] as const;

type EntityType = "player" | "npc";
type DeepIdentityAxis = "self_image" | "core_motive" | "hard_constraint";

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

function persistResolvedEntity(
  entity:
    | { id: string; type: "player"; record: ReturnType<typeof hydrateStoredPlayerRecord> }
    | { id: string; type: "npc"; record: ReturnType<typeof hydrateStoredNpcRecord> },
) {
  const db = getDb();

  if (entity.type === "player") {
    db.update(players)
      .set(projectPlayerRecord(entity.record))
      .where(eq(players.id, entity.id))
      .run();
    return;
  }

  db.update(npcs)
    .set(projectNpcRecord(entity.record))
    .where(eq(npcs.id, entity.id))
    .run();
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function capTrailing(values: string[], max: number): string[] {
  return values.length > max ? values.slice(values.length - max) : values;
}

function persistNpcReflectionRecord(npcId: string, record: CharacterRecord) {
  getDb()
    .update(npcs)
    .set(projectNpcRecord(record))
    .where(eq(npcs.id, npcId))
    .run();
}

function updateLiveDynamicsBeliefs(record: CharacterRecord, belief: string): CharacterRecord {
  const beliefs = capTrailing(
    dedupeCaseInsensitive([...record.motivations.beliefs, belief]),
    MAX_BELIEFS,
  );
  const beliefDrift = capTrailing(
    dedupeCaseInsensitive([...(record.identity.liveDynamics?.beliefDrift ?? []), belief]),
    MAX_BELIEFS,
  );

  return {
    ...record,
    motivations: {
      ...record.motivations,
      beliefs,
    },
    identity: {
      ...record.identity,
      liveDynamics: {
        ...record.identity.liveDynamics,
        activeGoals: record.identity.liveDynamics?.activeGoals ?? [],
        beliefDrift,
        currentStrains: record.identity.liveDynamics?.currentStrains ?? [],
        earnedChanges: record.identity.liveDynamics?.earnedChanges ?? [],
      },
    },
  };
}

function updateLiveDynamicsGoals(
  record: CharacterRecord,
  goal: string,
  priority: "short_term" | "long_term",
): CharacterRecord {
  const shortTermGoals = priority === "short_term"
    ? capTrailing(dedupeCaseInsensitive([...record.motivations.shortTermGoals, goal]), MAX_GOALS_PER_CATEGORY)
    : record.motivations.shortTermGoals;
  const longTermGoals = priority === "long_term"
    ? capTrailing(dedupeCaseInsensitive([...record.motivations.longTermGoals, goal]), MAX_GOALS_PER_CATEGORY)
    : record.motivations.longTermGoals;
  const activeGoals = capTrailing(
    dedupeCaseInsensitive([...(record.identity.liveDynamics?.activeGoals ?? []), goal]),
    MAX_GOALS_PER_CATEGORY * 2,
  );

  return {
    ...record,
    motivations: {
      ...record.motivations,
      shortTermGoals,
      longTermGoals,
    },
    identity: {
      ...record.identity,
      liveDynamics: {
        ...record.identity.liveDynamics,
        activeGoals,
        beliefDrift: record.identity.liveDynamics?.beliefDrift ?? [],
        currentStrains: record.identity.liveDynamics?.currentStrains ?? [],
        earnedChanges: record.identity.liveDynamics?.earnedChanges ?? [],
      },
    },
  };
}

function dropLiveDynamicsGoal(record: CharacterRecord, goal: string): CharacterRecord {
  const lowerGoal = goal.toLowerCase();
  const shortTermGoals = record.motivations.shortTermGoals.filter(
    (entry) => entry.toLowerCase() !== lowerGoal,
  );
  const longTermGoals = record.motivations.longTermGoals.filter(
    (entry) => entry.toLowerCase() !== lowerGoal,
  );
  const activeGoals = (record.identity.liveDynamics?.activeGoals ?? []).filter(
    (entry) => entry.toLowerCase() !== lowerGoal,
  );

  return {
    ...record,
    motivations: {
      ...record.motivations,
      shortTermGoals,
      longTermGoals,
    },
    identity: {
      ...record.identity,
      liveDynamics: {
        ...record.identity.liveDynamics,
        activeGoals,
        beliefDrift: record.identity.liveDynamics?.beliefDrift ?? [],
        currentStrains: record.identity.liveDynamics?.currentStrains ?? [],
        earnedChanges: record.identity.liveDynamics?.earnedChanges ?? [],
      },
    },
  };
}

function minimumEvidenceForPromotion(record: CharacterRecord): number {
  const inertia = record.continuity?.identityInertia ?? "flexible";
  if (inertia === "strict") return 3;
  if (inertia === "anchored") return 2;
  return 1;
}

function summarizeEarnedChange(axis: DeepIdentityAxis, previousValue: string | undefined, nextValue: string, whyNow: string): string {
  const previous = previousValue?.trim();
  return previous
    ? `${axis}: ${previous} -> ${nextValue} | ${whyNow}`
    : `${axis}: ${nextValue} | ${whyNow}`;
}

function appendEarnedIdentityChange(record: CharacterRecord, summary: string): CharacterRecord {
  return {
    ...record,
    identity: {
      ...record.identity,
      liveDynamics: {
        ...record.identity.liveDynamics,
        activeGoals: record.identity.liveDynamics?.activeGoals ?? [],
        beliefDrift: record.identity.liveDynamics?.beliefDrift ?? [],
        currentStrains: record.identity.liveDynamics?.currentStrains ?? [],
        earnedChanges: capTrailing(
          dedupeCaseInsensitive([...(record.identity.liveDynamics?.earnedChanges ?? []), summary]),
          MAX_EARNED_CHANGES,
        ),
      },
    },
  };
}

function promoteIdentityChange(
  record: CharacterRecord,
  axis: DeepIdentityAxis,
  previousValue: string | undefined,
  newValue: string,
  whyNow: string,
): CharacterRecord {
  const summary = summarizeEarnedChange(axis, previousValue, newValue, whyNow);
  let nextRecord = appendEarnedIdentityChange(record, summary);

  if (axis === "self_image") {
    nextRecord = {
      ...nextRecord,
      profile: {
        ...nextRecord.profile,
        personaSummary: newValue,
      },
      identity: {
        ...nextRecord.identity,
        behavioralCore: {
          ...nextRecord.identity.behavioralCore,
          motives: nextRecord.identity.behavioralCore?.motives ?? [],
          pressureResponses: nextRecord.identity.behavioralCore?.pressureResponses ?? [],
          taboos: nextRecord.identity.behavioralCore?.taboos ?? [],
          attachments: nextRecord.identity.behavioralCore?.attachments ?? [],
          selfImage: newValue,
        },
      },
    };
  }

  if (axis === "core_motive") {
    const motives = dedupeCaseInsensitive(
      [
        ...(nextRecord.identity.behavioralCore?.motives ?? []),
        newValue,
      ].filter((entry) => entry.toLowerCase() !== (previousValue ?? "").toLowerCase()),
    );
    nextRecord = {
      ...nextRecord,
      motivations: {
        ...nextRecord.motivations,
        drives: motives,
      },
      identity: {
        ...nextRecord.identity,
        behavioralCore: {
          ...nextRecord.identity.behavioralCore,
          motives,
          pressureResponses: nextRecord.identity.behavioralCore?.pressureResponses ?? [],
          taboos: nextRecord.identity.behavioralCore?.taboos ?? [],
          attachments: nextRecord.identity.behavioralCore?.attachments ?? [],
          selfImage: nextRecord.identity.behavioralCore?.selfImage ?? nextRecord.profile.personaSummary,
        },
      },
    };
  }

  if (axis === "hard_constraint") {
    const hardConstraints = dedupeCaseInsensitive(
      [
        ...(nextRecord.identity.baseFacts?.hardConstraints ?? []),
        newValue,
      ].filter((entry) => entry.toLowerCase() !== (previousValue ?? "").toLowerCase()),
    );
    nextRecord = {
      ...nextRecord,
      identity: {
        ...nextRecord.identity,
        baseFacts: {
          ...nextRecord.identity.baseFacts,
          biography: nextRecord.identity.baseFacts?.biography ?? nextRecord.profile.backgroundSummary,
          socialRole: nextRecord.identity.baseFacts?.socialRole ?? [],
          hardConstraints,
        },
      },
    };
  }

  return nextRecord;
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
          .select()
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const npcRecord = hydrateStoredNpcRecord(npc);
        persistNpcReflectionRecord(npcId, updateLiveDynamicsBeliefs(npcRecord, belief));

        log.info(`NPC ${npcId}: set belief "${belief}"`);
        return { updated: true, beliefs: updateLiveDynamicsBeliefs(npcRecord, belief).motivations.beliefs };
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
          .select()
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const npcRecord = hydrateStoredNpcRecord(npc);
        const updatedRecord = updateLiveDynamicsGoals(npcRecord, goal, priority);
        persistNpcReflectionRecord(npcId, updatedRecord);

        log.info(`NPC ${npcId}: set ${priority} goal "${goal}"`);
        return {
          updated: true,
          goals: {
            short_term: updatedRecord.motivations.shortTermGoals,
            long_term: updatedRecord.motivations.longTermGoals,
          },
        };
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
          .select()
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const npcRecord = hydrateStoredNpcRecord(npc);
        const updatedRecord = dropLiveDynamicsGoal(npcRecord, goal);
        persistNpcReflectionRecord(npcId, updatedRecord);

        log.info(`NPC ${npcId}: dropped goal "${goal}"`);
        return {
          updated: true,
          goals: {
            short_term: updatedRecord.motivations.shortTermGoals,
            long_term: updatedRecord.motivations.longTermGoals,
          },
        };
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

    promote_identity_change: tool({
      description:
        "Promote an earned deeper identity change after multiple strong evidence points. This is the only tool allowed to alter behavioralCore or baseFacts.",
      inputSchema: z.object({
        axis: z.enum(["self_image", "core_motive", "hard_constraint"]).describe("Which deeper identity surface should change"),
        previousValue: z.string().optional().describe("Optional previous value being replaced"),
        newValue: z.string().describe("The new deeper identity value"),
        evidence: z.array(z.string()).describe("Multiple concrete evidence points supporting the promotion"),
        whyNow: z.string().describe("Why the accumulated evidence justifies a deeper identity shift now"),
      }),
      execute: async ({ axis, previousValue, newValue, evidence, whyNow }) => {
        const npc = getDb()
          .select()
          .from(npcs)
          .where(eq(npcs.id, npcId))
          .get();

        if (!npc) return { error: "NPC not found" };

        const npcRecord = hydrateStoredNpcRecord(npc);
        const requiredEvidence = minimumEvidenceForPromotion(npcRecord);
        const strongEvidence = evidence.map((entry) => entry.trim()).filter(Boolean);

        if (strongEvidence.length < requiredEvidence || whyNow.trim().length < 24) {
          return {
            error: `Deeper identity changes require multiple strong evidence points. Need ${requiredEvidence}, got ${strongEvidence.length}.`,
          };
        }

        const updatedRecord = promoteIdentityChange(
          npcRecord,
          axis,
          previousValue,
          newValue.trim(),
          whyNow.trim(),
        );
        persistNpcReflectionRecord(npcId, updatedRecord);

        log.info(`NPC ${npcId}: promoted ${axis} -> "${newValue}"`);
        return {
          updated: true,
          axis,
          newValue,
          earnedChanges: updatedRecord.identity.liveDynamics?.earnedChanges ?? [],
        };
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
          entity.record = {
            ...entity.record,
            capabilities: {
              ...entity.record.capabilities,
              wealthTier: newTier,
            },
          };
          persistResolvedEntity(entity);
          log.info(`${entityName}: set initial wealth tier "${newTier}"`);
          return { updated: true, tags: entity.record.capabilities.wealthTier ? [entity.record.capabilities.wealthTier] : [] };
        }

        const currentIndex = WEALTH_TIERS.indexOf(currentWealthTag as typeof WEALTH_TIERS[number]);

        if (newIndex < currentIndex) {
          return { error: `Cannot downgrade wealth from ${currentWealthTag} to ${newTier}. Only one step up is allowed.` };
        }

        if (newIndex !== currentIndex + 1) {
          return { error: `Wealth must progress one step at a time. Current: ${currentWealthTag}, requested: ${newTier}, expected next: ${WEALTH_TIERS[currentIndex + 1] ?? "max reached"}.` };
        }

        // Replace old tier with new tier
        entity.record = {
          ...entity.record,
          capabilities: {
            ...entity.record.capabilities,
            wealthTier: newTier,
          },
        };
        persistResolvedEntity(entity);
        log.info(`${entityName}: wealth ${currentWealthTag} -> ${newTier}`);
        return { updated: true, tags: [newTier] };
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
          entity.record = {
            ...entity.record,
            capabilities: {
              ...entity.record.capabilities,
              skills: [
                ...entity.record.capabilities.skills,
                { name: skillName, tier: newTier },
              ],
            },
          };
          persistResolvedEntity(entity);
          log.info(`${entityName}: set initial skill "${newTier} ${skillName}"`);
          return { updated: true, tags: [`${newTier} ${skillName}`] };
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

        // Replace old skill tag with new one
        entity.record = {
          ...entity.record,
          capabilities: {
            ...entity.record.capabilities,
            skills: entity.record.capabilities.skills.map((entry) =>
              entry.name.toLowerCase() === skillName.toLowerCase()
                ? { ...entry, tier: newTier }
                : entry,
            ),
          },
        };
        persistResolvedEntity(entity);
        log.info(`${entityName}: skill ${currentTier} ${skillName} -> ${newTier} ${skillName}`);
        return { updated: true, tags: [`${newTier} ${skillName}`] };
      },
    }),
  };
}
