import { generateObject } from "ai";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { WorldScaffold } from "./scaffold-generator.js";

const LORE_CATEGORIES = [
    "location",
    "npc",
    "faction",
    "ability",
    "rule",
    "concept",
    "item",
    "event",
] as const;

const loreCardSchema = z.object({
    term: z.string().describe("Short unique name or title (1-5 words)"),
    definition: z
        .string()
        .describe("Factual 1-2 sentence definition, no narrative"),
    category: z.enum(LORE_CATEGORIES),
});

const loreExtractionSchema = z.object({
    loreCards: z.array(loreCardSchema).min(20).max(60),
});

export type ExtractedLoreCard = z.infer<typeof loreCardSchema>;

function formatScaffoldContext(scaffold: WorldScaffold): string {
    const locationLines = scaffold.locations
        .map(
            (loc) =>
                `- ${loc.name}: ${loc.description} [Tags: ${loc.tags.join(", ")}]`
        )
        .join("\n");

    const factionLines = scaffold.factions
        .map(
            (f) =>
                `- ${f.name}: Goals: ${f.goals.join("; ")} | Assets: ${f.assets.join("; ")} [Tags: ${f.tags.join(", ")}]`
        )
        .join("\n");

    const npcLines = scaffold.npcs
        .map(
            (n) =>
                `- ${n.name} (${n.locationName}${n.factionName ? `, ${n.factionName}` : ""}): ${n.persona} [Tags: ${n.tags.join(", ")}]`
        )
        .join("\n");

    return `WORLD PREMISE:
${scaffold.refinedPremise}

LOCATIONS:
${locationLines}

FACTIONS:
${factionLines}

KEY NPCs:
${npcLines}`;
}

export async function extractLoreCards(
    scaffold: WorldScaffold,
    role: ResolvedRole
): Promise<ExtractedLoreCard[]> {
    const context = formatScaffoldContext(scaffold);

    const prompt = `You are a world-building encyclopedist. Given a generated RPG world, extract 30-50 structured lore cards — factual knowledge entries that define this world.

${context}

EXTRACTION RULES:
- Each location → one "location" card
- Each NPC → one "npc" card  
- Each faction → one "faction" card
- Extract world concepts: magic systems, technologies, political systems, currencies, religions → "concept" cards
- Extract world rules: what is possible, what is forbidden, physical laws → "rule" cards
- Extract notable items, artifacts, or assets mentioned → "item" cards
- Extract any special abilities or powers mentioned → "ability" cards
- Definition must be 1-2 factual sentences, no storytelling or narrative flair
- Term should be a short unique name (1-5 words)
- Aim for 30-50 cards total, covering all aspects of the world`;

    const result = await generateObject({
        model: createModel(role.provider),
        schema: loreExtractionSchema,
        prompt,
        temperature: role.temperature,
        maxOutputTokens: role.maxTokens,
    });

    return result.object.loreCards;
}
