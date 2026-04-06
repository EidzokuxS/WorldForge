import { z } from "zod";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel } from "../../ai/index.js";
import { createLogger } from "../../lib/index.js";
import type { ResolvedRole } from "../../ai/resolve-role-model.js";
import type { ScaffoldLocation, ScaffoldFaction, ScaffoldNpc } from "../types.js";

const log = createLogger("validation");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VALIDATION_ROUNDS = 3;

// ---------------------------------------------------------------------------
// Validation Issue Zod Schema
// ---------------------------------------------------------------------------

export const validationIssueSchema = z.object({
  issues: z.array(z.object({
    entityName: z.string(),
    issueType: z.enum([
      "duplicate_name",
      "semantic_overlap",
      "broken_reference",
      "inconsistent_tags",
      "narrative_collision",
      "vague_description",
      "canon_violation",
      "missing_connection",
    ]),
    description: z.string(),
    severity: z.enum(["critical", "warning"]),
    suggestedFix: z.string(),
  })),
  summary: z.string().describe("'clean' if no critical issues, or brief summary"),
});

export type ValidationIssues = z.infer<typeof validationIssueSchema>;

// ---------------------------------------------------------------------------
// normalizeReference — code-only mechanical reference normalization
// ---------------------------------------------------------------------------

export function normalizeReference(name: string, validNames: readonly string[]): string | null {
  if (validNames.length === 0) return null;
  // Exact match
  const exact = validNames.find(n => n === name);
  if (exact) return exact;
  // Case-insensitive match
  const lower = name.toLowerCase();
  const ciMatch = validNames.find(n => n.toLowerCase() === lower);
  if (ciMatch) return ciMatch;
  return null;
}

// ---------------------------------------------------------------------------
// validateAndFixStage — per-stage LLM validation loop (up to 3 rounds)
// ---------------------------------------------------------------------------

export async function validateAndFixStage<T extends { name: string }>(
  entities: readonly T[],
  judgeRole: ResolvedRole,
  buildValidationPrompt: (entities: readonly T[]) => string,
  regenerateEntity: (entity: T, issue: string, currentEntities: readonly T[]) => Promise<T>,
): Promise<T[]> {
  let current = [...entities]; // immutable -- never mutate input

  for (let round = 0; round < MAX_VALIDATION_ROUNDS; round++) {
    const result = await safeGenerateObject({
      model: createModel(judgeRole.provider),
      schema: validationIssueSchema,
      prompt: buildValidationPrompt(current),
      temperature: judgeRole.temperature,
      // No maxOutputTokens — let the model use its full output window
    });

    const criticalIssues = result.object.issues.filter(i => i.severity === "critical");
    log.info(`Validation round ${round + 1}: ${criticalIssues.length} critical, ${result.object.issues.length - criticalIssues.length} warnings. Summary: ${result.object.summary}`);

    if (criticalIssues.length === 0) break; // Clean

    // Re-generate only flagged entities (immutable)
    const updated = [...current];
    for (const issue of criticalIssues) {
      const idx = updated.findIndex(e =>
        e.name.toLowerCase() === issue.entityName.toLowerCase()
      );
      if (idx >= 0) {
        // REVIEW FIX #4: Pass current-round state to regenerateEntity, not stale closure
        updated[idx] = await regenerateEntity(updated[idx], issue.suggestedFix, updated);
      } else {
        log.warn(`Validation flagged "${issue.entityName}" but no matching entity found`);
      }
    }
    current = updated;
  }

  return current;
}

// ---------------------------------------------------------------------------
// validateCrossStage — cross-stage validation with code normalization + LLM loop
// ---------------------------------------------------------------------------

export async function validateCrossStage(
  locations: readonly ScaffoldLocation[],
  factions: readonly ScaffoldFaction[],
  npcs: readonly ScaffoldNpc[],
  judgeRole: ResolvedRole,
  contextBlock: string,
  regenerateNpc: (npc: ScaffoldNpc, fix: string) => Promise<ScaffoldNpc>,
  regenerateFaction: (faction: ScaffoldFaction, fix: string) => Promise<ScaffoldFaction>,
): Promise<{
  locations: ScaffoldLocation[];
  factions: ScaffoldFaction[];
  npcs: ScaffoldNpc[];
}> {
  const locationNameList = locations.map(l => l.name);
  const factionNameList = factions.map(f => f.name);

  // Phase 1: Code-level reference normalization (always runs, no LLM)
  const fixedLocations = locations.map(l => ({
    ...l,
    connectedTo: l.connectedTo
      .map(c => normalizeReference(c, locationNameList))
      .filter((c): c is string => c !== null)
      .filter(c => c.toLowerCase() !== l.name.toLowerCase()), // no self-links
  }));

  let fixedFactions = factions.map(f => ({
    ...f,
    territoryNames: f.territoryNames
      .map(t => normalizeReference(t, locationNameList))
      .filter((t): t is string => t !== null),
  }));

  let fixedNpcs = npcs.map(npc => ({
    ...npc,
    locationName: normalizeReference(npc.locationName, locationNameList) ?? locationNameList[0] ?? npc.locationName,
    factionName: npc.factionName ? normalizeReference(npc.factionName, factionNameList) : null,
  }));

  // Phase 2: LLM semantic validation loop (up to 3 rounds per D-03)
  for (let round = 0; round < MAX_VALIDATION_ROUNDS; round++) {
    const prompt = buildCrossStageValidationPrompt(fixedLocations, fixedFactions, fixedNpcs, contextBlock);

    const result = await safeGenerateObject({
      model: createModel(judgeRole.provider),
      schema: validationIssueSchema,
      prompt,
      temperature: judgeRole.temperature,
      // No maxOutputTokens — let the model use its full output window
    });

    const criticals = result.object.issues.filter(i => i.severity === "critical");
    log.info(`Cross-stage validation round ${round + 1}: ${criticals.length} critical, ${result.object.issues.length - criticals.length} warnings. Summary: ${result.object.summary}`);

    if (criticals.length === 0) break; // Clean

    // Re-generate flagged entities based on entity type match
    for (const issue of criticals) {
      // Try NPC match first (most common cross-stage issues)
      const npcIdx = fixedNpcs.findIndex(n => n.name.toLowerCase() === issue.entityName.toLowerCase());
      if (npcIdx >= 0) {
        const updated = [...fixedNpcs];
        updated[npcIdx] = await regenerateNpc(fixedNpcs[npcIdx], issue.suggestedFix);
        fixedNpcs = updated;
        continue;
      }
      // Try faction match
      const facIdx = fixedFactions.findIndex(f => f.name.toLowerCase() === issue.entityName.toLowerCase());
      if (facIdx >= 0) {
        const updated = [...fixedFactions];
        updated[facIdx] = await regenerateFaction(fixedFactions[facIdx], issue.suggestedFix);
        fixedFactions = updated;
        continue;
      }
      // Location issues at cross-stage are typically reference-only (handled by code normalization)
      log.warn(`Cross-stage issue for "${issue.entityName}" -- no NPC or faction match, skipping regen`);
    }
  }

  return { locations: fixedLocations, factions: fixedFactions, npcs: fixedNpcs };
}

// ---------------------------------------------------------------------------
// buildCrossStageValidationPrompt — private helper
// ---------------------------------------------------------------------------

function buildCrossStageValidationPrompt(
  locations: readonly ScaffoldLocation[],
  factions: readonly ScaffoldFaction[],
  npcs: readonly ScaffoldNpc[],
  contextBlock: string,
): string {
  return `You are a worldbuilding consistency auditor. Review ALL entities below for cross-stage coherence.

${contextBlock}

LOCATIONS:
${locations.map(l => `- ${l.name}: ${l.description} [Tags: ${l.tags.join(", ")}] [Connected: ${l.connectedTo.join(", ")}]`).join("\n")}

FACTIONS:
${factions.map(f => `- ${f.name}: Goals: ${f.goals.join("; ")} [Territory: ${f.territoryNames.join(", ")}] [Tags: ${f.tags.join(", ")}]`).join("\n")}

NPCs:
${npcs.map(n => `- ${n.name} (${n.tier ?? "unknown"}) at ${n.locationName}, faction: ${n.factionName ?? "none"}: ${n.persona}`).join("\n")}

CHECK FOR SEMANTIC ISSUES ONLY (reference normalization is already done by code):
1. No two entities across stages have contradictory descriptions (e.g., faction claims territory but location says controlled by different faction).
2. NPCs assigned to a faction should have goals/persona consistent with that faction's goals.
3. NPC personas should be consistent with their assigned location's nature.
4. Faction goals should not be identical or contradictory without narrative justification.
5. All locations should be reachable via connectedTo graph (no orphan islands).

Only report CRITICAL issues that would cause incoherent gameplay. Minor flavor inconsistencies are WARNINGS.
Output an empty issues array if everything is clean.`;
}
