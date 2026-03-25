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
    ? `You are a political analyst for the ${ipContext.franchise} universe. List 3-6 factions using a WORLD-FIRST approach:
STEP 1 — List the franchise's major canonical power structures (governments, military organizations, criminal syndicates, religious orders, etc.) that define the world's politics.
STEP 2 — Check whether the premise creates, destroys, or alters any faction. Note changes in purpose.
STEP 3 — If the premise implies a new faction that doesn't exist in canon, add it — but only if the premise directly requires it.
Use canonical faction names exactly. Never substitute or rename them.`
    : `Generate 3-6 factions that form the political skeleton of this world. Ensure structural variety:
- At least 1 governing authority (state, council, empire)
- At least 1 opposition or rebel force
- At least 1 non-state power (merchant guild, criminal network, religious order, mage circle)
- Each faction must have at least one natural rival among the other factions.`;

  const plan = await generateObject({
    model: createModel(req.role.provider),
    schema: factionPlanSchema,
    prompt: `${planInstruction}

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}
${ipBlock}
CONSTRAINTS:
- purpose: one sentence explaining what ROLE this faction plays in the world's power dynamics (not just its relationship to the premise).
- No two factions may fill the same structural role (e.g., two "secretive criminal organizations").
- Every faction must have at least one point of conflict with another faction in the list.${additionalInstruction ? `\nADDITIONAL: ${additionalInstruction}` : ""}

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  const planned = plan.object.factions;

  // --- Call 2: DETAIL (all factions in one call — typically 3-6, fits in one batch) ---
  const detail = await generateObject({
    model: createModel(req.role.provider),
    schema: factionDetailSchema,
    prompt: `You are writing a faction reference sheet for a text RPG engine. The engine reads these fields mechanically — be precise.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS: ${locationNames.join(", ")}
${ipBlock}
FACTIONS TO DETAIL:
${planned.map((f) => `- ${f.name}: ${f.purpose}`).join("\n")}

FIELD INSTRUCTIONS:
- tags: Mechanical trait tags. Format: [Adjective]. Examples: [Militaristic], [Secretive], [Wealthy], [Religious], [Expansionist], [Decentralized]. 2-4 tags per faction.
- goals: 1-3 SPECIFIC objectives with concrete targets. Bad: "Expand influence." Good: "Annex the northern mining towns before winter." Each goal names a place, person, resource, or deadline.
- assets: 1-3 concrete resources. Not "great power" — name the specific army, spy network, trade fleet, artifact, or territory they control.
- territoryNames: Locations this faction controls or operates from. ONLY use names from this list: ${locationNames.join(", ")}. A faction may control 0 locations if it operates covertly or is nomadic.${ipContext ? `\n- For known-IP factions: describe their canonical state first, then note how the premise's divergence changes their goals, assets, or territory.` : ""}

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
