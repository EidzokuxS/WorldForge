import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import { buildIpContextBlock, buildStopSlopRules } from "./prompt-utils.js";
import type { IpResearchContext } from "../ip-researcher.js";
import type { GenerateScaffoldRequest, ScaffoldLocation } from "../types.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const locationPlanSchema = z.object({
  locations: z.array(z.object({
    name: z.string(),
    purpose: z.string().describe("1 line: why this location matters"),
    isStarting: z.boolean(),
  })).min(5).max(8),
});

const locationDetailSchema = z.object({
  locations: z.array(z.object({
    name: z.string(),
    description: z.string().describe("2-3 concrete sentences: physical details, atmosphere, significance"),
    tags: z.array(z.string()).describe("Structural tags: [Warm], [Crowded], [Dangerous], [Controlled by X]"),
    connectedTo: z.array(z.string()).describe("Names of connected locations from the plan"),
  })),
});

// ---------------------------------------------------------------------------
// generateLocationsStep — plan + detail mini-calls
// ---------------------------------------------------------------------------

export async function generateLocationsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
): Promise<ScaffoldLocation[]> {
  const ipBlock = buildIpContextBlock(ipContext);

  // --- Call 1: PLAN ---
  const planInstruction = ipContext
    ? `List 5-8 canonical locations from "${ipContext.franchise}" that are relevant to this premise. Use REAL canonical names (e.g., "Konohagakure" not "Leaf Village", "Coruscant" not "Capital Planet"). Include the most important locations for the story.`
    : "Generate 5-8 locations that logically arise from this world's premise and DNA. Each location must serve a distinct narrative purpose.";

  const plan = await generateObject({
    model: createModel(req.role.provider),
    schema: locationPlanSchema,
    prompt: `${planInstruction}

WORLD PREMISE:
${refinedPremise}
${ipBlock}
- Exactly ONE location must have isStarting=true (the player's starting location).
- Each location's purpose must be unique — no two locations serving the same narrative role.${additionalInstruction ? `\nADDITIONAL: ${additionalInstruction}` : ""}

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  const planned = plan.object.locations;
  const nameList = planned.map((l) => l.name);

  // --- Calls 2+: DETAIL (batches of 3-4) ---
  const detailed: ScaffoldLocation[] = [];
  const BATCH_SIZE = 4;

  for (let i = 0; i < planned.length; i += BATCH_SIZE) {
    const batch = planned.slice(i, i + BATCH_SIZE);
    const previousSummary = detailed
      .map((l) => `- ${l.name}: ${l.description.slice(0, 80)}`)
      .join("\n");

    const detail = await generateObject({
      model: createModel(req.role.provider),
      schema: locationDetailSchema,
      prompt: `Detail these locations for a text RPG world.

WORLD PREMISE:
${refinedPremise}
${ipBlock}
ALL LOCATION NAMES IN THIS WORLD: ${nameList.join(", ")}

${previousSummary ? `ALREADY DETAILED LOCATIONS:\n${previousSummary}\n` : ""}LOCATIONS TO DETAIL NOW:
${batch.map((b) => `- ${b.name}: ${b.purpose}`).join("\n")}

RULES:
- description: 2-3 concrete sentences about physical appearance, atmosphere, and significance. No purple prose.
- tags: structural tags like [Warm], [Crowded], [Dangerous], [Controlled by FactionName].
- connectedTo: ONLY reference names from the full list: ${nameList.join(", ")}. No self-links.${ipContext ? `\n- For known IPs: describe locations as they canonically are, modified by the premise's butterfly effects.` : ""}

${buildStopSlopRules()}`,
      temperature: req.role.temperature,
      maxOutputTokens: req.role.maxTokens,
    });

    for (const loc of detail.object.locations) {
      const plannedLoc = batch.find((b) => b.name === loc.name);
      detailed.push({
        name: loc.name,
        description: loc.description,
        tags: loc.tags,
        isStarting: plannedLoc?.isStarting ?? false,
        connectedTo: loc.connectedTo.filter((n) => nameList.includes(n)),
      });
    }
  }

  return detailed;
}
