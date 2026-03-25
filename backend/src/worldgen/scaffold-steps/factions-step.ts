import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import { buildIpContextBlock, buildStopSlopRules, formatNameList } from "./prompt-utils.js";
import type { IpResearchContext } from "../ip-researcher.js";
import type { GenerateScaffoldRequest, ScaffoldFaction } from "../types.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const factionPlanSchema = z.object({
  factions: z.array(z.object({
    name: z.string(),
    purpose: z.string().describe("1 line: what role this faction plays in the world"),
  })).min(3).max(6),
});

const factionDetailSchema = z.object({
  factions: z.array(z.object({
    name: z.string(),
    tags: z.array(z.string()).describe("Faction traits: [Militaristic], [Secretive], [Trade-focused]"),
    goals: z.array(z.string()).min(1).max(3).describe("1-3 concrete faction goals"),
    assets: z.array(z.string()).min(1).max(3).describe("1-3 faction resources or advantages"),
    territoryNames: z.array(z.string()).describe("Controlled locations from the known locations list"),
  })),
});

// ---------------------------------------------------------------------------
// generateFactionsStep — plan + detail mini-calls
// ---------------------------------------------------------------------------

export async function generateFactionsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
): Promise<ScaffoldFaction[]> {
  const ipBlock = buildIpContextBlock(ipContext);

  // --- Call 1: PLAN ---
  const planInstruction = ipContext
    ? `List 3-6 canonical factions/organizations from "${ipContext.franchise}" relevant to this premise. Use REAL canonical names (e.g., "Akatsuki" not "Serpent's Coil Ascetics", "Galactic Empire" not "The Dominion"). Do NOT invent fictional replacements for real franchise organizations.`
    : "Generate 3-6 factions that create tension and player-facing opportunities in this world.";

  const plan = await generateObject({
    model: createModel(req.role.provider),
    schema: factionPlanSchema,
    prompt: `${planInstruction}

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}
${ipBlock}
- Each faction must serve a distinct role in the world's power dynamics.
- Factions should have natural conflicts with at least one other faction.${additionalInstruction ? `\nADDITIONAL: ${additionalInstruction}` : ""}

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  const planned = plan.object.factions;

  // --- Call 2: DETAIL (all factions in one call — typically 3-6, fits in one batch) ---
  const detail = await generateObject({
    model: createModel(req.role.provider),
    schema: factionDetailSchema,
    prompt: `Detail these factions for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS: ${locationNames.join(", ")}
${ipBlock}
FACTIONS TO DETAIL:
${planned.map((f) => `- ${f.name}: ${f.purpose}`).join("\n")}

RULES:
- tags: structural traits like [Militaristic], [Secretive], [Wealthy], [Religious].
- goals: 1-3 concrete objectives. Not vague aspirations — specific targets or actions.
- assets: 1-3 resources the faction commands (armies, spies, trade routes, magical artifacts).
- territoryNames: ONLY names from this list: ${locationNames.join(", ")}. A faction can control 0 or more locations.${ipContext ? `\n- For known IPs: describe factions as they canonically are, modified by the premise's butterfly effects. If Orochimaru trains Sakura instead of forming Sound Village, Sound Village may still exist but with different dynamics.` : ""}

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  // Filter territoryNames to only include valid location names
  return detail.object.factions.map((f) => ({
    ...f,
    territoryNames: f.territoryNames.filter((t) => locationNames.includes(t)),
  }));
}
