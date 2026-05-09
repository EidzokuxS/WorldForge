import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type { CharacterDraft, PlayerCharacter } from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { normalizeImportedTags } from "./import-utils.js";
import type { CharacterImportMode } from "./import-utils.js";
import { buildCharacterPromptContract } from "./prompt-contract.js";
import { fromLegacyPlayerCharacter, fromRichParsedCharacter } from "./record-adapters.js";
import type { RichParsedCharacter } from "./record-adapters.js";

const characterSchema = z.object({
  name: z.string().describe("Character's full name"),
  race: z.string().max(100).default("").describe("Character's race or species (e.g. Human, Elf, Dwarf, Android). Empty if unspecified."),
  gender: z.string().max(100).default("").describe("Character's gender (e.g. Male, Female, Non-binary). Empty if unspecified."),
  age: z.string().max(100).default("").describe("Character's age as text. Preserve explicit numeric ages exactly as written (e.g. 18). Empty if unspecified."),
  appearance: z.string().max(1000).default("").describe("Brief physical description in 1-3 sentences. Hair, build, distinguishing features."),
  tags: z
  .array(z.string())
  .min(3)
  .transform((tags) => tags.map((t) => t.replace(/^\[|\]$/g, "")))
  .describe(
    "Character tags covering traits, skills, flaws, background. " +
    "Examples: Charismatic, Veteran Soldier, Limping, Noble-born, Pickpocket, Cowardly. " +
    "Do NOT wrap tags in brackets."
  ),
  hp: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Hit points 1-5. 5=peak health, 3=average, 1=frail/wounded"),
  equippedItems: z
    .array(z.string())
    .max(6)
    .describe("Starting items the character carries. 0-6 items."),
  locationName: z
    .string()
    .describe("Name of the starting location from KNOWN LOCATIONS that best fits this character"),
});

export const richCharacterSchema = z.object({
  name: z.string().describe("Character's full name"),
  race: z.string().max(100).default("").describe("Character's race or species. Empty if unspecified."),
  gender: z.string().max(100).default("").describe("Character's gender. Empty if unspecified."),
  age: z.string().max(100).default("").describe("Character's age as text. Preserve explicit numeric ages exactly."),
  appearance: z.string().max(1000).default("").describe("Brief physical description in 1-3 sentences."),
  backgroundSummary: z.string().max(2000).default("").describe("1-2 sentences — where they come from, what brought them here. Soft hooks, not rigid backstory."),
  personaSummary: z.string().max(2000).default("").describe("1-2 sentences — first impression, how others perceive them. Not a personality prescription."),
  personalitySummary: z.string().max(400).default(""),
  personalityVoice: z.string().max(600).default(""),
  personalityDecisionStyle: z.string().max(400).default(""),
  personalityWorldview: z.string().max(400).default(""),
  personalityContradictions: z.array(z.string().max(300)).max(3).default([]),
  personalityMythology: z.string().max(400).default(""),
  personalitySampleLines: z.array(z.string().max(300)).min(0).max(3).default([]),
  tags: z
    .array(z.string())
    .min(3)
    .transform((tags) => tags.map((t) => t.replace(/^\[|\]$/g, "")))
    .describe(
      "Character tags covering traits, skills, flaws, background. " +
      "Examples: Charismatic, Veteran Soldier, Limping, Noble-born, Pickpocket, Cowardly. " +
      "Do NOT wrap tags in brackets."
    ),
  drives: z.array(z.string()).default([]).describe("Player motivations — leave empty for player characters, they decide themselves."),
  frictions: z.array(z.string()).default([]).describe("Internal conflicts — leave empty for player characters."),
  shortTermGoals: z.array(z.string()).default([]).describe("Immediate goals — leave empty for player characters."),
  longTermGoals: z.array(z.string()).default([]).describe("Long-term ambitions — leave empty for player characters."),
  hp: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(5)
    .describe("Hit points 1-5. Default to 5 for a fresh character unless the description implies injury or frailty."),
  equippedItems: z
    .array(z.string())
    .max(6)
    .describe("Starting items the character carries. 0-6 items."),
  locationName: z
    .string()
    .describe("Name of the starting location from KNOWN LOCATIONS that best fits this character"),
});

export function buildFlatOutputStrategy(options?: {
  preservePlayerAgency?: boolean;
}): string {
  return [
    "- Return only the flat generator fields from the schema: name, race, gender, age, appearance, backgroundSummary, personaSummary, personalitySummary, personalityVoice, personalityDecisionStyle, personalityWorldview, personalityContradictions, personalityMythology, personalitySampleLines, drives, frictions, shortTermGoals, longTermGoals, tags, hp, equippedItems, locationName.",
    "- Treat backgroundSummary as authored biography facts that WorldForge can lift into baseFacts without losing explicit wording.",
    "- Treat personaSummary as outward read and self-image cues, not the whole truth of the character.",
    "- Use personalitySummary, personalityVoice, personalityDecisionStyle, personalityWorldview, personalityContradictions, personalityMythology, personalitySampleLines to author interiority. These lift into identity.personality. MUST produce AT LEAST 2 sampleLines that are actual quotable sentences in the character's voice (not descriptions). 3 sampleLines preferred.",
    "- Use drives and frictions for durable motives and pressure cues that WorldForge can lift into behavioralCore.",
    "- Use shortTermGoals and longTermGoals for current direction and pressure that WorldForge can lift into liveDynamics.",
    "- Do NOT emit nested baseFacts, behavioralCore, or liveDynamics objects directly.",
    options?.preservePlayerAgency
      ? "- If the source does not explicitly establish player motivations or conflicts, leave drives, frictions, shortTermGoals, and longTermGoals empty instead of inventing rigid player truth."
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

type LegacyGeneratedPlayer = z.infer<typeof characterSchema>;

export type ParsedCharacter = CharacterDraft;

// Compile-time check: the LLM shape still matches the compatibility player contract.
null as unknown as LegacyGeneratedPlayer satisfies PlayerCharacter;

function normalizeCharacterResult(
  character: LegacyGeneratedPlayer,
  opts?: { maxTags?: number }
): LegacyGeneratedPlayer {
  return {
    ...character,
    tags: normalizeImportedTags(character.tags, { max: opts?.maxTags ?? 12 }),
  };
}

function toCharacterDraft(
  character: LegacyGeneratedPlayer,
  opts?: {
    importMode?: CharacterImportMode | null;
    canonicalStatus?: CharacterDraft["identity"]["canonicalStatus"];
    sourceKind?: CharacterDraft["provenance"]["sourceKind"];
  }
): CharacterDraft {
  return fromLegacyPlayerCharacter(character, {
    canonicalStatus: opts?.canonicalStatus ?? "original",
    sourceKind: opts?.sourceKind ?? (opts?.importMode ? "import" : "generator"),
    originMode: opts?.importMode ?? "native",
  });
}

export function toCharacterDraftFromRich(
  character: z.infer<typeof richCharacterSchema>,
  opts?: {
    importMode?: CharacterImportMode | null;
    canonicalStatus?: CharacterDraft["identity"]["canonicalStatus"];
    sourceKind?: CharacterDraft["provenance"]["sourceKind"];
  },
): CharacterDraft {
  const parsed = richCharacterSchema.parse(character);
  const rich: RichParsedCharacter = {
    ...parsed,
    tags: normalizeImportedTags(parsed.tags, { max: 12 }),
  };
  return fromRichParsedCharacter(rich, {
    canonicalStatus: opts?.canonicalStatus ?? "original",
    sourceKind: opts?.sourceKind ?? (opts?.importMode ? "import" : "generator"),
    originMode: opts?.importMode ?? "native",
    importMode: opts?.importMode ?? null,
  });
}

export async function parseCharacterDescription(opts: {
  description: string;
  premise: string;
  locationNames: string[];
  role: ResolvedRole;
}): Promise<ParsedCharacter> {
  const prompt = `You are parsing a player's character description into structured RPG data.

SHARED CHARACTER CONTRACT:
${buildCharacterPromptContract({
  roleEmphasis:
    "Player-authored descriptions must preserve authored facts verbatim while still capturing the behavior cues and live pressures needed for deterministic richer mapping.",
  includeCanonicalLoadout: false,
})}

FLAT OUTPUT STRATEGY:
${buildFlatOutputStrategy({ preservePlayerAgency: true })}

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

PLAYER'S CHARACTER DESCRIPTION:
${opts.description}

REQUIREMENTS:
- If the description contains explicit profile fields like Name, Full name, Age, Gender, Race, Species, or Appearance, preserve those values exactly.
- If an explicit Name or Full name field is present, copy it verbatim. Do not shorten, normalize, sanitize, reinterpret, or partially trim it.
- Only infer a name when the user did not explicitly provide one.
- race: character's race/species fitting the world (leave empty if truly unknown).
- gender: character's gender (leave empty if truly unknown).
- age: if the user explicitly gave an age, copy it verbatim. Do NOT rewrite "18" into "Young adult". Only use descriptive ages like "Young adult" when no explicit age was given.
- appearance: 1-3 sentences describing physical features — build, hair, distinguishing marks.
- backgroundSummary: 1-2 sentences capturing stable biography facts, authored backstory, and what brought them here. Preserve explicit authored facts verbatim where supplied.
- personaSummary: 1-2 sentences capturing outward read, voice, and self-image cues that help WorldForge build richer identity truth. Do not collapse the whole character into a thin vibe line.
- personalitySummary: 1-2 sentences describing the character's interiority, not just their public vibe.
- personalitySampleLines: provide 2-3 actual quotable lines in the character's voice drawn from the biography phrasing when possible. They must be spoken sentences, not descriptions.
- drives: capture explicit durable motives only when the user authored them. Otherwise leave EMPTY array [].
- frictions: capture explicit pressure points or internal tensions only when the user authored them. Otherwise leave EMPTY array [].
- shortTermGoals: capture explicit immediate aims only when the user authored them. Otherwise leave EMPTY array [].
- longTermGoals: capture explicit longer-horizon aims only when the user authored them. Otherwise leave EMPTY array [].
- Tags should cover: personality traits, skills/abilities, flaws/weaknesses, background/occupation.
- HP: Default to 5 for a fresh character unless the description implies injury or frailty.
- equippedItems: items the character would realistically carry based on description.
- locationName MUST be one of KNOWN LOCATIONS — pick the most fitting one.
- Keep tags evocative and concise: Master Thief, not Is good at stealing things.
- Do NOT wrap tags in square brackets.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: richCharacterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return toCharacterDraftFromRich(result.object, {
    sourceKind: "player-input",
  });
}

// mapV2CardToCharacter removed in Phase 60-04: V2 cards are now INPUT to the
// ingestCharacterDraft pipeline, not a parallel field-mapping path. The
// synthesizer in backend/src/character/ingestion/synthesizer.ts handles V2
// cards as a PRIORITY 2 source with override-wins priority merge rules.

export async function generateCharacter(opts: {
  premise: string;
  locationNames: string[];
  factionNames: string[];
  role: ResolvedRole;
}): Promise<ParsedCharacter> {
  const prompt = `You are creating a player character for a text RPG.

SHARED CHARACTER CONTRACT:
${buildCharacterPromptContract({
  roleEmphasis:
    "Generated player characters must be built from authored facts, behavior cues, and live pressures that WorldForge can map into richer identity truth instead of a thin summary builder.",
  includeCanonicalLoadout: false,
})}

FLAT OUTPUT STRATEGY:
${buildFlatOutputStrategy()}

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS:
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS:
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

REQUIREMENTS:
- Create an interesting, flawed protagonist who fits this world.
- The character should have clear motivations and a reason to explore.
- Ask for authored facts, behavior cues, and pressures that can survive deterministic richer mapping.
- race: character's race/species fitting the world (leave empty if truly unknown).
- gender: character's gender (leave empty if truly unknown).
- age: descriptive age (e.g. "Young adult", "Middle-aged", "Elder").
- appearance: 1-3 sentences describing physical features — build, hair, distinguishing marks.
- backgroundSummary: 1-2 sentences capturing the stable biography and authored facts WorldForge should treat as base truth.
- personaSummary: 1-2 sentences capturing outward read, self-image, and behavioral cues rather than a generic one-line vibe.
- personality*: voice + sampleLines MUST match WORLD premise tone and genre.
- drives: durable motives that explain what this protagonist fundamentally wants.
- frictions: pressure responses or internal tensions that create believable conflict.
- shortTermGoals: immediate aims that establish current momentum.
- longTermGoals: longer-horizon direction or ambition that can persist beyond one scene.
- Tags should cover: personality, skills, flaws, background (6-10 tags total).
- HP: Default to 5 for a fresh character unless the description implies injury or frailty.
- equippedItems: 2-4 items fitting the character's background.
- locationName MUST be one of KNOWN LOCATIONS.
- Make the character compelling but not overpowered — flaws create good stories.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: richCharacterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return toCharacterDraftFromRich(result.object, {
    sourceKind: "generator",
  });
}

export async function generateCharacterFromArchetype(opts: {
  archetype: string;
  premise: string;
  locationNames: string[];
  factionNames: string[];
  role: ResolvedRole;
  researchContext?: string | null;
}): Promise<ParsedCharacter> {
  const researchBlock = opts.researchContext
    ? `\nARCHETYPE RESEARCH:\n${opts.researchContext}\n`
    : "";

  const prompt = `You are creating an ORIGINAL player character inspired by an archetype for a text RPG.

SHARED CHARACTER CONTRACT:
${buildCharacterPromptContract({
  roleEmphasis:
    "Archetype-inspired generation must capture authored facts, behavior cues, and live pressures that map into the richer shared character truth without copying the archetype verbatim.",
  includeCanonicalLoadout: false,
})}

FLAT OUTPUT STRATEGY:
${buildFlatOutputStrategy()}

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS:
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS:
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

ARCHETYPE: "${opts.archetype}"
${researchBlock}
REQUIREMENTS:
- Create a WHOLLY ORIGINAL character inspired by the archetype — new name, new backstory.
- Do NOT copy the archetype directly. Capture the essence, not the specifics.
- race: character's race/species fitting the world (leave empty if truly unknown).
- gender: character's gender (leave empty if truly unknown).
- age: descriptive age (e.g. "Young adult", "Middle-aged", "Elder").
- appearance: 1-3 sentences describing physical features — build, hair, distinguishing marks.
- backgroundSummary: 1-2 sentences capturing the stable biography and setting-grounded facts WorldForge should treat as base truth.
- personaSummary: 1-2 sentences capturing outward read, self-image, and behavioral cues rather than a generic archetype label.
- drives: durable motives the character fundamentally cares about.
- frictions: internal tensions or pressure responses that make the character distinct from a generic archetype.
- shortTermGoals: immediate aims that put the character in motion now.
- longTermGoals: longer-horizon direction that can shape later play.
- Tags: personality, skills, flaws, background (6-10 total). Evocative and concise.
- HP: Default to 5 for a fresh character unless the description implies injury or frailty.
- equippedItems: 2-4 items fitting the archetype adapted to this world.
- locationName MUST be one of KNOWN LOCATIONS.
- Make the character compelling but not overpowered — flaws create good stories.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: richCharacterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });
  return toCharacterDraftFromRich(result.object, {
    sourceKind: opts.researchContext ? "archetype" : "generator",
  });
}
