import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type {
  CharacterStartConditions,
  ResolvedStartConditions,
} from "@worldforge/shared";
import { START_CONDITIONS_CONTRACT } from "../character/prompt-contract.js";
import { buildStartingLocationPromptContract } from "./prompt-contracts.js";

type StartingLocationCandidate = {
  id: string;
  name: string;
  isStarting?: boolean | null;
  kind?: string | null;
  parentLocationId?: string | null;
};

const resolvedStartSchema = z.object({
  locationName: z.string().describe("One of the known locations"),
  arrivalMode: z.string().describe("A short phrase like on-foot, hidden, escorted, by train"),
  immediateSituation: z.string().describe("What is happening to the character right now"),
  entryPressure: z.array(z.string()).default([]).describe("Immediate pressures shaping the opening moment"),
  companions: z.array(z.string()).default([]).describe("Companions or dependents arriving with the character"),
  startingVisibility: z.string().describe("How noticed the character is on arrival"),
  resolvedNarrative: z.string().describe("1-2 sentences summarizing the opening state"),
});

export async function resolveStartingLocation(opts: {
  premise: string;
  locations: StartingLocationCandidate[];
  userPrompt?: string;
  role: ResolvedRole;
}): Promise<ResolvedStartConditions> {
  const starting =
    opts.locations.find((location) => location.isStarting) ?? opts.locations[0];
  if (!starting) {
    throw new Error("No locations available for start resolution.");
  }

  if (!opts.userPrompt?.trim()) {
    const startConditions: CharacterStartConditions = {
      startLocationId: starting.id,
      arrivalMode: "settled",
      immediateSituation: `You begin in ${starting.name}.`,
      entryPressure: [],
      companions: [],
      startingVisibility: "expected",
      resolvedNarrative: null,
      sourcePrompt: null,
    };

    return {
      locationId: starting.id,
      locationName: starting.name,
      startConditions,
      narrative: null,
    };
  }

  const locationList = opts.locations
    .map((location) => {
      const kind = location.kind ?? "macro";
      const parentLocationId = location.parentLocationId ?? "null";
      return `- ${location.name} (id=${location.id}; kind=${kind}; parentLocationId=${parentLocationId})`;
    })
    .join("\n");
  const outputContract = buildStartingLocationPromptContract();

  const { object } = await generateObject({
    model: createModel(opts.role.provider),
    schema: resolvedStartSchema,
    prompt: `${outputContract}

WORLD PREMISE: ${opts.premise}

KNOWN LOCATIONS: ${locationList}

PLAYER REQUEST: "${opts.userPrompt}"

STRUCTURED START CONTRACT:
${START_CONDITIONS_CONTRACT}

Choose the best starting location from the known list, then resolve one authoritative startConditions object.
- startConditions.startLocationId resolves through locationName from KNOWN LOCATIONS.
- startConditions.arrivalMode describes how the character enters the scene.
- startConditions.immediateSituation states what is happening right now.
- startConditions.entryPressure lists immediate pressures shaping the opening moment.
- startConditions.companions lists companions or dependents arriving with the character.
- startConditions.startingVisibility states how noticed the character is on arrival.
- startConditions.resolvedNarrative is the compatibility narrative summary of the opening state.
Return locationName and resolvedNarrative as compatibility aliases, but reason about the opening state through startConditions first.`,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  const matched =
    opts.locations.find(
      (location) => location.name.toLowerCase() === object.locationName.toLowerCase(),
    ) ?? starting;

  const startConditions: CharacterStartConditions = {
    startLocationId: matched.id,
    arrivalMode: object.arrivalMode,
    immediateSituation: object.immediateSituation,
    entryPressure: object.entryPressure,
    companions: object.companions,
    startingVisibility: object.startingVisibility,
    resolvedNarrative: object.resolvedNarrative,
    sourcePrompt: opts.userPrompt,
  };

  return {
    locationId: matched.id,
    locationName: matched.name,
    startConditions,
    narrative: object.resolvedNarrative,
  };
}
