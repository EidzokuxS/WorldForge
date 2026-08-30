import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { clampTokens } from "../lib/index.js";
import type { SeedCategory } from "./seed-roller.js";
import type { IpResearchContext, PremiseDivergence, WorldgenResearchArtifactV2 } from "@worldforge/shared";
import { interpretPremiseDivergence } from "./premise-divergence.js";
import {
  buildCharacterStartGuardrail,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildStopSlopRules,
  buildWorldgenResearchContextBlock,
} from "./scaffold-steps/prompt-utils.js";
import {
  buildSeedSuggestionPromptContract,
  buildWorldDnaPacketPromptContract,
} from "./prompt-contracts.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SuggestSeedsRequest {
  premise: string;
  name?: string;
  role: ResolvedRole;
  ipContext?: IpResearchContext | null;
  premiseDivergence?: PremiseDivergence | null;
  researchArtifact?: WorldgenResearchArtifactV2 | null;
  research?: { enabled: boolean; searchProvider?: string; braveApiKey?: string; zaiApiKey?: string; maxSearchSteps?: number };
}

export interface SuggestedSeeds {
  geography: string;
  politicalStructure: string;
  centralConflict: string;
  culturalFlavor: string[];
  environment: string;
  wildcard: string;
}

// ---------------------------------------------------------------------------
// Category metadata (order defines the canonical packet shape)
// ---------------------------------------------------------------------------

const categoryDescriptions: Record<SeedCategory, string> = {
  geography: "physical landscape, terrain, or spatial structure",
  politicalStructure: "how power is organized - government, authority, hierarchy",
  centralConflict: "the core tension or struggle driving the world",
  culturalFlavor: "2-3 concrete in-world cultural practices tied to the premise and current conflict",
  environment: "climate, weather, biomes, and sensory atmosphere: what you SEE, HEAR, SMELL walking through this world",
  wildcard: "one unexpected, unique element that makes this world stand out",
};

/** Per-category rules to prevent overlap between DNA categories */
const categoryConstraints: Partial<Record<SeedCategory, string>> = {
  environment: `CRITICAL: Environment is about the PHYSICAL WORLD the player experiences: weather, light, sounds, smells, flora, fauna, seasons, natural hazards.
NOT about who controls territory (that's Political Structure) or who fights whom (that's Central Conflict).
Describe what a traveler would SENSE, not what armies are doing.
Examples of GOOD environment: "Perpetual fog blankets the lowlands, broken only by volcanic vents that turn nights orange." or "Three moons create unpredictable tides that flood coastal cities twice each day."
Examples of BAD environment (these belong in other categories): "Imperial forces patrol the streets." or "Factions compete for resources."`,
  wildcard: `The wildcard must introduce something NOT covered by any previous category. It should surprise the player: a strange custom, hidden mechanic, cosmic anomaly, unique creature, or cultural quirk that makes this world memorable.`,
};

const DNA_CATEGORIES: ReadonlyArray<{ key: SeedCategory; label: string }> = [
  { key: "geography", label: "Geography" },
  { key: "politicalStructure", label: "Political Structure" },
  { key: "centralConflict", label: "Central Conflict" },
  { key: "culturalFlavor", label: "Cultural Flavor" },
  { key: "environment", label: "Environment" },
  { key: "wildcard", label: "Wildcard" },
];

// ---------------------------------------------------------------------------
// Coherent DNA generation: one call for the complete packet
// ---------------------------------------------------------------------------

const WORLD_DNA_BACKEND_REF_REDACTION_MARKER = "[backend ref hidden]";
const WORLD_DNA_VALUE_MAX_CHARS = 180;
const WORLD_DNA_VALUE_MIN_WORDS = 12;
const WORLD_DNA_VALUE_MAX_WORDS = 24;
const WORLD_DNA_REASONING_MAX_CHARS = 180;
const WORLD_DNA_REASONING_MIN_WORDS = 8;
const WORLD_DNA_REASONING_MAX_WORDS = 18;
const WORLD_DNA_CULTURAL_ITEM_MAX_CHARS = 72;
const WORLD_DNA_CULTURAL_ITEM_MIN_WORDS = 6;
const WORLD_DNA_CULTURAL_ITEM_MAX_WORDS = 10;

function worldDnaWordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function isExactlyOneSentence(value: string): boolean {
  return /^[^.!?]+\.$/u.test(value.trim());
}

function playerFacingWorldDnaText(
  maxLength: number,
  minWords: number,
  maxWords: number,
  requireSingleSentence = false,
) {
  let schema = z.string().min(1).max(maxLength)
    .refine(
      (value) => {
        const wordCount = worldDnaWordCount(value);
        return wordCount >= minWords && wordCount <= maxWords;
      },
      { message: `World DNA text must contain ${minWords}-${maxWords} words` },
    );
  if (requireSingleSentence) {
    schema = schema.refine(
      isExactlyOneSentence,
      { message: "World DNA text must be exactly one sentence" },
    );
  }
  return schema.refine(
    (value) => !value.includes(WORLD_DNA_BACKEND_REF_REDACTION_MARKER),
    { message: "player-facing World DNA value must not contain backend redaction markers" },
  );
}

const dnaCategorySchema = z.object({
  value: playerFacingWorldDnaText(
    WORLD_DNA_VALUE_MAX_CHARS,
    WORLD_DNA_VALUE_MIN_WORDS,
    WORLD_DNA_VALUE_MAX_WORDS,
    true,
  ),
  reasoning: z.string().min(1).max(WORLD_DNA_REASONING_MAX_CHARS)
    .refine(
      (value) => {
        const wordCount = worldDnaWordCount(value);
        return wordCount >= WORLD_DNA_REASONING_MIN_WORDS && wordCount <= WORLD_DNA_REASONING_MAX_WORDS;
      },
      {
        message: `World DNA reasoning must contain ${WORLD_DNA_REASONING_MIN_WORDS}-${WORLD_DNA_REASONING_MAX_WORDS} words`,
      },
    )
    .refine(isExactlyOneSentence, { message: "World DNA reasoning must be exactly one sentence" }),
}).strict();

const culturalFlavorSchema = z.object({
  value: z.array(playerFacingWorldDnaText(
    WORLD_DNA_CULTURAL_ITEM_MAX_CHARS,
    WORLD_DNA_CULTURAL_ITEM_MIN_WORDS,
    WORLD_DNA_CULTURAL_ITEM_MAX_WORDS,
  )).min(2).max(3),
  reasoning: z.string().min(1).max(WORLD_DNA_REASONING_MAX_CHARS)
    .refine(
      (value) => {
        const wordCount = worldDnaWordCount(value);
        return wordCount >= WORLD_DNA_REASONING_MIN_WORDS && wordCount <= WORLD_DNA_REASONING_MAX_WORDS;
      },
      {
        message: `World DNA reasoning must contain ${WORLD_DNA_REASONING_MIN_WORDS}-${WORLD_DNA_REASONING_MAX_WORDS} words`,
      },
    )
    .refine(isExactlyOneSentence, { message: "World DNA reasoning must be exactly one sentence" }),
}).strict();

const worldDnaSchema = z.object({
  geography: dnaCategorySchema,
  politicalStructure: dnaCategorySchema,
  centralConflict: dnaCategorySchema,
  culturalFlavor: culturalFlavorSchema,
  environment: dnaCategorySchema,
  wildcard: dnaCategorySchema,
}).strict();

const WORLD_DNA_OPERATION_BUDGET_MS = 100_000;
const WORLD_DNA_OPERATION_TIMEOUT_MESSAGE =
  "World DNA preparation did not finish within 100 seconds.";

/**
 * Bound this world-DNA operation even when a provider body consumer ignores
 * AbortSignal. The provider promise remains observed after the budget wins so
 * a late settlement cannot become an unhandled rejection or alter the caller.
 */
function withWorldDnaOperationBudget<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearBudgetTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const settle = (settlement: () => void) => {
      if (settled) return;
      settled = true;
      clearBudgetTimer();
      settlement();
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearBudgetTimer();
      controller.abort();
      reject(new Error(WORLD_DNA_OPERATION_TIMEOUT_MESSAGE));
    }, WORLD_DNA_OPERATION_BUDGET_MS);

    let operationPromise: Promise<T>;
    try {
      operationPromise = Promise.resolve(operation(controller.signal));
    } catch (error) {
      settle(() => reject(error));
      return;
    }

    operationPromise.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

function throwIfWorldDnaOperationTimedOut(abortSignal: AbortSignal): void {
  if (abortSignal.aborted) {
    throw new Error(WORLD_DNA_OPERATION_TIMEOUT_MESSAGE);
  }
}

export async function suggestWorldSeeds(
  req: SuggestSeedsRequest
): Promise<{
  seeds: SuggestedSeeds;
  ipContext: IpResearchContext | null;
  premiseDivergence: PremiseDivergence | null;
}> {
  return withWorldDnaOperationBudget(async (abortSignal) => {
    const researchArtifact = req.researchArtifact ?? null;
    const ipContext = researchArtifact ? null : req.ipContext ?? null;
    const premiseDivergence = researchArtifact
      ? null
      : req.premiseDivergence
      ?? await interpretPremiseDivergence(ipContext, req.premise, req.role);
    throwIfWorldDnaOperationTimedOut(abortSignal);

    const ipInstruction = researchArtifact
      ? "Use the approved research context below to define one coherent World DNA packet from the raw premise and artifact-authored source usage rules."
      : ipContext
        ? `This world is the ${ipContext.franchise} universe. Define one coherent World DNA packet by starting from canon and then applying only the interpreted divergence consequences. Use the franchise's own terminology.`
        : "This is an original world. Generate one specific, concrete World DNA packet that follows logically from the premise.";
    const ipBlock = buildWorldgenResearchContextBlock({
      researchArtifact,
      ipContext,
      target: "World DNA packet",
    });
    const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
    const knownIpContract = researchArtifact
      ? ""
      : buildKnownIpGenerationContract(ipContext, premiseDivergence, "World DNA packet");
    const characterStartGuardrail = buildCharacterStartGuardrail();
    const outputContract = buildWorldDnaPacketPromptContract();

    const categoryRequirements = DNA_CATEGORIES.map(({ key, label }) => {
      const categoryRule = categoryConstraints[key];
      const outputShape = key === "culturalFlavor"
        ? `value is an array of 2-3 compact, concrete diegetic practices; each item is ${WORLD_DNA_CULTURAL_ITEM_MIN_WORDS}-${WORLD_DNA_CULTURAL_ITEM_MAX_WORDS} words and at most ${WORLD_DNA_CULTURAL_ITEM_MAX_CHARS} characters; each item names a ritual, custom, value, language habit, or material practice plus a situation or consequence tied to the premise/world; use diegetic facts only, not real-world culture names, genre/style labels, or inspiration lists`
        : `value is exactly one compact sentence of ${WORLD_DNA_VALUE_MIN_WORDS}-${WORLD_DNA_VALUE_MAX_WORDS} words and at most ${WORLD_DNA_VALUE_MAX_CHARS} characters; name specific places, systems, or conditions, not vague adjectives`;
      return `- ${label} (${categoryDescriptions[key]}): ${outputShape}; reasoning is exactly one sentence of ${WORLD_DNA_REASONING_MIN_WORDS}-${WORLD_DNA_REASONING_MAX_WORDS} words and at most ${WORLD_DNA_REASONING_MAX_CHARS} characters explaining why it follows from the premise and the other packet fields.${categoryRule ? `\n  ${categoryRule}` : ""}`;
    }).join("\n");

    const prompt = `You are defining a complete World DNA packet for a text RPG engine.

${outputContract}

${ipInstruction}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
${characterStartGuardrail}
PREMISE: "${req.premise}"

WORLD DNA PACKET TASK:
Return all six categories as one mutually consistent packet in this canonical order: Geography, Political Structure, Central Conflict, Cultural Flavor, Environment, Wildcard. Every category must be present with exactly a value and reasoning field. The reasoning for each category must explain its relationship to the same packet, not to an isolated category call.

CATEGORY REQUIREMENTS:
${categoryRequirements}

MUTUAL CONSISTENCY AND NON-OVERLAP:
- Make the six values describe one world with a shared premise, causal logic, terminology, and current state; do not contradict another category.
- Keep Geography focused on physical landscape and spatial structure, Political Structure focused on how power is organized, and Central Conflict focused on the core struggle driving the world.
- Keep Environment strictly physical and sensory: climate, weather, biomes, light, sounds, smells, seasons, flora, fauna, or natural hazards. Do not put territorial control, institutions, patrols, faction ownership, or who fights whom in Environment; those belong in Political Structure or Central Conflict.
- Make Wildcard one unexpected, unique element that is not already covered or restated by Geography, Political Structure, Central Conflict, Cultural Flavor, or Environment.

OUTPUT:
- Return exactly one structured object containing the six nested category objects in the canonical order above.
${buildStopSlopRules()}`;
    throwIfWorldDnaOperationTimedOut(abortSignal);

    const result = await generateObject({
      model: createModel(req.role.provider, { role: "generator", reasoningMode: "bypass" }),
      schema: worldDnaSchema,
      prompt,
      temperature: req.role.temperature,
      maxOutputTokens: clampTokens(req.role.maxTokens),
      timeout: { totalMs: 90_000 },
      abortSignal,
      retries: 1,
      allowTextFallback: false,
      allowRepair: true,
      maxRepairAttempts: 2,
      strictSchema: true,
      mode: "auto",
    });

    const dna = result.object;
    const seeds: SuggestedSeeds = {
      geography: dna.geography.value,
      politicalStructure: dna.politicalStructure.value,
      centralConflict: dna.centralConflict.value,
      culturalFlavor: dna.culturalFlavor.value,
      environment: dna.environment.value,
      wildcard: dna.wildcard.value,
    };

    return { seeds, ipContext, premiseDivergence };
  });
}

// ---------------------------------------------------------------------------
// Single seed suggestion (independent: no sequential dependency)
// ---------------------------------------------------------------------------

export async function suggestSingleSeed(
  req: SuggestSeedsRequest & {
    category: SeedCategory;
    ipContext?: IpResearchContext | null;
    premiseDivergence?: PremiseDivergence | null;
  }
): Promise<string | string[]> {
  const isCultural = req.category === "culturalFlavor";
  const researchArtifact = req.researchArtifact ?? null;
  const ipContext = researchArtifact ? null : req.ipContext ?? null;
  const premiseDivergence = researchArtifact
    ? null
    : req.premiseDivergence
    ?? await interpretPremiseDivergence(ipContext, req.premise, req.role);
  const ipBlock = buildWorldgenResearchContextBlock({
    researchArtifact,
    ipContext,
    target: `${req.category} DNA`,
  });
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = researchArtifact
    ? ""
    : buildKnownIpGenerationContract(
        ipContext,
        premiseDivergence,
        `${req.category} DNA`,
      );
  const characterStartGuardrail = buildCharacterStartGuardrail();
  const outputContract = buildSeedSuggestionPromptContract();

  const prompt = `Define the ${req.category} (${categoryDescriptions[req.category]}) for a text RPG world.
${outputContract}

${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
${characterStartGuardrail}
PREMISE: "${req.premise}"

OUTPUT: ${isCultural ? "An array of 2-3 compact, concrete diegetic practices. Each item names a ritual, custom, value, language habit, or material practice plus a situation or consequence tied to the premise/world. Use diegetic facts only, not real-world culture names, genre/style labels, or inspiration lists." : "A concrete 1-2 sentence description. Name specific places, systems, or conditions."}
${buildStopSlopRules()}`;

  if (isCultural) {
    const result = await generateObject({
      model: createModel(req.role.provider),
      schema: z.object({ value: z.array(z.string()).min(2).max(3) }),
      prompt,
      temperature: req.role.temperature,
      maxOutputTokens: clampTokens(req.role.maxTokens),
    });
    return result.object.value;
  }

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({ value: z.string() }),
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: clampTokens(req.role.maxTokens),
  });
  return result.object.value;
}
