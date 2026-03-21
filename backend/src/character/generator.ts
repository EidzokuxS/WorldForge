import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type { PlayerCharacter } from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { buildV2CardSections } from "./v2-sections.js";

const characterSchema = z.object({
  name: z.string().describe("Character's full name"),
  race: z.string().max(100).default("").describe("Character's race or species (e.g. Human, Elf, Dwarf, Android). Empty if unspecified."),
  gender: z.string().max(100).default("").describe("Character's gender (e.g. Male, Female, Non-binary). Empty if unspecified."),
  age: z.string().max(100).default("").describe("Character's age as text (e.g. Young adult, 47, Ancient). Empty if unspecified."),
  appearance: z.string().max(1000).default("").describe("Brief physical description in 1-3 sentences. Hair, build, distinguishing features."),
  tags: z
    .array(z.string())
    .min(3)
    .max(12)
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

/** Zod-inferred type — structurally identical to PlayerCharacter from shared. */
export type ParsedCharacter = z.infer<typeof characterSchema>;

// Compile-time check: ParsedCharacter must be assignable to PlayerCharacter
null as unknown as ParsedCharacter satisfies PlayerCharacter;

export async function parseCharacterDescription(opts: {
  description: string;
  premise: string;
  locationNames: string[];
  role: ResolvedRole;
}): Promise<ParsedCharacter> {
  const prompt = `You are parsing a player's character description into structured RPG data.

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

PLAYER'S CHARACTER DESCRIPTION:
${opts.description}

REQUIREMENTS:
- Extract or infer a name from the description. If none given, create a fitting one.
- race: character's race/species fitting the world (leave empty if truly unknown).
- gender: character's gender (leave empty if truly unknown).
- age: descriptive age (e.g. "Young adult", "Middle-aged", "Elder").
- appearance: 1-3 sentences describing physical features — build, hair, distinguishing marks.
- Tags should cover: personality traits, skills/abilities, flaws/weaknesses, background/occupation.
- Use the tag-only system: no numeric stats except HP (1-5).
- HP reflects physical condition: 5=peak, 3=average, 1=frail or wounded.
- equippedItems: items the character would realistically carry based on description.
- locationName MUST be one of KNOWN LOCATIONS — pick the most fitting one.
- Keep tags evocative and concise: Master Thief, not Is good at stealing things.
- Do NOT wrap tags in square brackets.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: characterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return result.object;
}

export async function mapV2CardToCharacter(opts: {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  v2Tags: string[];
  premise: string;
  locationNames: string[];
  role: ResolvedRole;
}): Promise<ParsedCharacter> {
  const sections = buildV2CardSections(opts);

  const prompt = `You are converting a SillyTavern character card into structured RPG data.

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

${sections}

REQUIREMENTS:
- Keep the character's name as "${opts.name}".
- race: character's race/species fitting the world (leave empty if truly unknown).
- gender: character's gender (leave empty if truly unknown).
- age: descriptive age (e.g. "Young adult", "Middle-aged", "Elder").
- appearance: 1-3 sentences describing physical features — build, hair, distinguishing marks.
- Convert description + personality into WorldForge tags (3-12 tags).
- Tags should cover: personality traits, skills/abilities, flaws/weaknesses, background, wealth level.
- HP reflects physical condition: 5=peak, 3=average, 1=frail/wounded.
- equippedItems: extract mentioned weapons, armor, tools, possessions (0-6 items).
- locationName MUST be one of KNOWN LOCATIONS — pick the most fitting one.
- Keep tags evocative and concise: Master Thief, not Is good at stealing things.
- Do NOT wrap tags in square brackets.
- Source tags from SillyTavern are meta-tags — use as context, don't copy verbatim.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: characterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return result.object;
}

export async function generateCharacter(opts: {
  premise: string;
  locationNames: string[];
  factionNames: string[];
  role: ResolvedRole;
}): Promise<ParsedCharacter> {
  const prompt = `You are creating a player character for a text RPG.

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS:
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS:
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

REQUIREMENTS:
- Create an interesting, flawed protagonist who fits this world.
- The character should have clear motivations and a reason to explore.
- race: character's race/species fitting the world (leave empty if truly unknown).
- gender: character's gender (leave empty if truly unknown).
- age: descriptive age (e.g. "Young adult", "Middle-aged", "Elder").
- appearance: 1-3 sentences describing physical features — build, hair, distinguishing marks.
- Tags should cover: personality, skills, flaws, background (6-10 tags total).
- HP: 4-5 (new adventure, healthy).
- equippedItems: 2-4 items fitting the character's background.
- locationName MUST be one of KNOWN LOCATIONS.
- Make the character compelling but not overpowered — flaws create good stories.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: characterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return result.object;
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
- Tags: personality, skills, flaws, background (6-10 total). Evocative and concise.
- HP: 4-5 (new adventure, healthy).
- equippedItems: 2-4 items fitting the archetype adapted to this world.
- locationName MUST be one of KNOWN LOCATIONS.
- Make the character compelling but not overpowered — flaws create good stories.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: characterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });
  return result.object;
}
