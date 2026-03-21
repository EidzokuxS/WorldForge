import { generateObject } from "ai";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";

const characterSchema = z.object({
  name: z.string().describe("Character's full name"),
  tags: z
    .array(z.string())
    .min(3)
    .max(12)
    .describe(
      "Character tags covering traits, skills, flaws, background. " +
      "Examples: [Charismatic], [Veteran Soldier], [Limping], [Noble-born], [Pickpocket], [Cowardly]"
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

export type ParsedCharacter = z.infer<typeof characterSchema>;

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
- Tags should cover: personality traits, skills/abilities, flaws/weaknesses, background/occupation.
- Use the tag-only system: no numeric stats except HP (1-5).
- HP reflects physical condition: 5=peak, 3=average, 1=frail or wounded.
- equippedItems: items the character would realistically carry based on description.
- locationName MUST be one of KNOWN LOCATIONS — pick the most fitting one.
- Keep tags evocative and concise: [Master Thief], not [Is good at stealing things].`;

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
