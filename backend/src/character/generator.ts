import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type { CharacterDraft, PlayerCharacter } from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { buildV2CardSections } from "./v2-sections.js";
import { buildImportModeGuidance, normalizeImportedTags } from "./import-utils.js";
import type { CharacterImportMode } from "./import-utils.js";
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

const richCharacterSchema = z.object({
  name: z.string().describe("Character's full name"),
  race: z.string().max(100).default("").describe("Character's race or species. Empty if unspecified."),
  gender: z.string().max(100).default("").describe("Character's gender. Empty if unspecified."),
  age: z.string().max(100).default("").describe("Character's age as text. Preserve explicit numeric ages exactly."),
  appearance: z.string().max(1000).default("").describe("Brief physical description in 1-3 sentences."),
  backgroundSummary: z.string().max(2000).default("").describe("1-2 sentences — where they come from, what brought them here. Soft hooks, not rigid backstory."),
  personaSummary: z.string().max(2000).default("").describe("1-2 sentences — first impression, how others perceive them. Not a personality prescription."),
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

function toCharacterDraftFromRich(
  character: z.infer<typeof richCharacterSchema>,
  opts?: {
    importMode?: CharacterImportMode | null;
    canonicalStatus?: CharacterDraft["identity"]["canonicalStatus"];
    sourceKind?: CharacterDraft["provenance"]["sourceKind"];
  },
): CharacterDraft {
  const rich: RichParsedCharacter = {
    ...character,
    tags: normalizeImportedTags(character.tags, { max: 12 }),
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
- backgroundSummary: 1-2 sentences — where they come from, what brought them here. Soft hooks for roleplay, not rigid backstory.
- personaSummary: 1-2 sentences — first impression, how others perceive them. Not a personality prescription.
- drives: leave EMPTY array [] — player decides their own motivations.
- frictions: leave EMPTY array [] — player discovers their own conflicts.
- shortTermGoals: leave EMPTY array [] — player sets their own goals.
- longTermGoals: leave EMPTY array [] — player sets their own goals.
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

export async function mapV2CardToCharacter(opts: {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  v2Tags: string[];
  importMode: CharacterImportMode;
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
- Integrate the character according to the chosen import mode.
- race: character's race/species fitting the world (leave empty if truly unknown).
- gender: character's gender (leave empty if truly unknown).
- age: if the source card has an explicit age, preserve it exactly. Otherwise use a descriptive age.
- appearance: 1-3 sentences describing physical features — build, hair, distinguishing marks.
- backgroundSummary: 1-2 sentences — where they come from, what brought them here. Soft hooks for roleplay, not rigid backstory. Derive from the card's description.
- personaSummary: 1-2 sentences — first impression, how others perceive them. Derive from the card's personality field.
- drives: leave EMPTY array [] — player decides their own motivations.
- frictions: leave EMPTY array [] — player discovers their own conflicts.
- shortTermGoals: leave EMPTY array [] — player sets their own goals.
- longTermGoals: leave EMPTY array [] — player sets their own goals.
- Convert description + personality into WorldForge tags (4-8 tags).
- Tags must match the same house style as normal WorldForge generation: short Title Case traits, roles, skills, flaws, or background markers.
- Prefer 1-3 word tags like Veteran Scout, Fearless, Signal Analyst, Noble-born.
- Avoid trope/meta sludge, fandom metadata, POV markers, formatting labels, or literal copies of source hyphen-tags.
- Keep outsider/native status in the biography when relevant, not as tags like Offworld Origin.
- HP: Default to 5 for a fresh character unless the description implies injury or frailty.
- equippedItems: extract mentioned weapons, armor, tools, possessions (0-6 items).
- locationName MUST be one of KNOWN LOCATIONS — pick the most fitting one.
- Keep tags evocative and concise: Master Thief, not Is good at stealing things.
- Do NOT wrap tags in square brackets.
- Source tags from SillyTavern are meta-tags — use as context, don't copy verbatim.
${buildImportModeGuidance(opts.importMode)}`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: richCharacterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return toCharacterDraftFromRich(result.object, {
    importMode: opts.importMode,
    canonicalStatus: "imported",
  });
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
- backgroundSummary: 1-2 sentences — where they come from, what brought them here. Soft hooks for roleplay, not rigid backstory.
- personaSummary: 1-2 sentences — first impression, how others perceive them. Not a personality prescription.
- drives: leave EMPTY array [] — player decides their own motivations.
- frictions: leave EMPTY array [] — player discovers their own conflicts.
- shortTermGoals: leave EMPTY array [] — player sets their own goals.
- longTermGoals: leave EMPTY array [] — player sets their own goals.
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
- backgroundSummary: 1-2 sentences — where they come from, what brought them here. Soft hooks for roleplay, not rigid backstory.
- personaSummary: 1-2 sentences — first impression, how others perceive them. Not a personality prescription.
- drives: leave EMPTY array [] — player decides their own motivations.
- frictions: leave EMPTY array [] — player discovers their own conflicts.
- shortTermGoals: leave EMPTY array [] — player sets their own goals.
- longTermGoals: leave EMPTY array [] — player sets their own goals.
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
