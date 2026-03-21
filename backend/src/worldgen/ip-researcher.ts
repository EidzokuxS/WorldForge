import { generateObject, generateText, stepCountIs, type ToolSet } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { GenerateScaffoldRequest } from "./scaffold-generator.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IpResearchContext {
    /** Canonical franchise name, e.g. "Warhammer 40,000" */
    franchise: string;
    /** Up to 15 key lore facts (races, factions, magic systems, tone…) */
    keyFacts: string[];
    /** Up to 5 tonal / atmosphere notes for prompting */
    tonalNotes: string[];
    /** Whether context came from live web search or LLM internal knowledge */
    source: "mcp" | "llm";
}

// ---------------------------------------------------------------------------
// Known IP keyword detection
// ---------------------------------------------------------------------------

const KNOWN_FRANCHISE_KEYWORDS: ReadonlyArray<[string, string]> = [
    ["dungeons.*dragons|d\\&d|dnd|d&d", "Dungeons & Dragons"],
    ["warhammer", "Warhammer"],
    ["star wars", "Star Wars"],
    ["star trek", "Star Trek"],
    ["lord of the rings|lotr|tolkien|middle.earth", "Middle-earth (Tolkien)"],
    ["game of thrones|song of ice and fire|westeros", "A Song of Ice and Fire"],
    ["pathfinder", "Pathfinder"],
    ["forgotten realms|faerun|faerûn", "Forgotten Realms"],
    ["elder scrolls|tamriel|skyrim|oblivion|morrowind", "The Elder Scrolls"],
    ["witcher", "The Witcher"],
    ["warcraft|world of warcraft|wow|azeroth", "World of Warcraft"],
    ["final fantasy", "Final Fantasy"],
    ["mass effect", "Mass Effect"],
    ["dragon age", "Dragon Age"],
    ["starcraft", "StarCraft"],
    ["shadowrun", "Shadowrun"],
    ["cyberpunk", "Cyberpunk"],
    ["vampire.*masquerade|world of darkness", "World of Darkness"],
    ["call of cthulhu|lovecraft|cthulhu", "Lovecraftian/Cthulhu Mythos"],
    ["marvel", "Marvel Universe"],
    ["dc comics|gotham|metropolis|superman|batman", "DC Universe"],
];

function detectFranchise(
    knownIP: string | undefined,
    premise: string,
    name: string
): string | null {
    if (knownIP?.trim()) {
        return knownIP.trim();
    }

    const haystack = `${name} ${premise}`.toLowerCase();

    for (const [pattern, canonical] of KNOWN_FRANCHISE_KEYWORDS) {
        if (new RegExp(pattern, "i").test(haystack)) {
            return canonical;
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ipResearchContextSchema = z.object({
    franchise: z.string().describe("The canonical franchise/IP name"),
    keyFacts: z
        .array(z.string())
        .min(3)
        .max(15)
        .describe(
            "Key lore facts: races, factions, magic systems, history, technology. Each fact is one sentence."
        ),
    tonalNotes: z
        .array(z.string())
        .min(1)
        .max(5)
        .describe("Atmospheric/tonal signals: grimdark, hopepunk, high-magic, etc."),
});

// ---------------------------------------------------------------------------
// MCP primary path
// ---------------------------------------------------------------------------

/** Timeout (ms) to wait for the MCP subprocess to initialise */
const MCP_INIT_TIMEOUT_MS = 20_000;

async function researchViaMCP(
    franchise: string,
    role: ResolvedRole
): Promise<IpResearchContext> {
    const transport = new Experimental_StdioMCPTransport({
        command: "npx",
        args: ["-y", "duckduckgo-mcp-server"],
    });

    const mcpClient = await Promise.race([
        createMCPClient({ transport }),
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error(`MCP init timed out after ${MCP_INIT_TIMEOUT_MS}ms`)),
                MCP_INIT_TIMEOUT_MS
            )
        ),
    ]);

    try {
        const tools = await mcpClient.tools() as ToolSet;

        const searchPrompt = `You are a franchise lore researcher for a tabletop RPG world generator.
Research the franchise "${franchise}" using the available DuckDuckGo search tools.

Your goals:
1. Search for "${franchise} lore overview"
2. Search for "${franchise} races factions"
3. Search for "${franchise} magic system" (or equivalent power/technology system)

After researching, compile:
- Up to 15 concise KEY FACTS about the franchise world (races, factions, notable locations, historical events, power systems)
- Up to 5 TONAL NOTES describing the atmosphere (e.g. "grimdark military sci-fi", "high fantasy epic", "cosmic horror")

Output your final compiled notes in plain text.`;

        const { text: rawResearch } = await generateText({
            model: createModel(role.provider),
            tools,
            stopWhen: stepCountIs(6),
            prompt: searchPrompt,
            temperature: 0.3,
        });

        // Parse the LLM's freeform research into structured data
        const parsePrompt = `You just completed web research on the franchise "${franchise}". Here are your research notes:

${rawResearch}

Now structure these into a clean JSON object.`;

        const { object } = await generateObject({
            model: createModel(role.provider),
            schema: ipResearchContextSchema,
            prompt: parsePrompt,
            temperature: 0.1,
        });

        console.log(`[ip-researcher] MCP research complete for "${franchise}": ${object.keyFacts.length} facts collected`);

        return {
            franchise: object.franchise,
            keyFacts: object.keyFacts,
            tonalNotes: object.tonalNotes,
            source: "mcp",
        };
    } finally {
        await mcpClient.close();
    }
}

// ---------------------------------------------------------------------------
// LLM fallback path
// ---------------------------------------------------------------------------

async function researchViaLLM(
    franchise: string,
    role: ResolvedRole
): Promise<IpResearchContext> {
    const prompt = `You are an expert on tabletop RPGs and popular fiction franchises.

Provide a structured lore overview for the franchise: "${franchise}"

Focus on information useful for building a custom RPG world inspired by this IP:
- KEY FACTS: races, factions, power systems, notable historical events, signature locations (up to 15, one sentence each)
- TONAL NOTES: atmospheric/genre descriptors for the world's feel (up to 5 phrases)`;

    const { object } = await generateObject({
        model: createModel(role.provider),
        schema: ipResearchContextSchema,
        prompt,
        temperature: 0.3,
        maxOutputTokens: role.maxTokens,
    });

    console.log(`[ip-researcher] LLM fallback research complete for "${franchise}": ${object.keyFacts.length} facts`);

    return {
        franchise: object.franchise,
        keyFacts: object.keyFacts,
        tonalNotes: object.tonalNotes,
        source: "llm",
    };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Step 0 of the world generation pipeline.
 *
 * Returns an `IpResearchContext` when the premise or `knownIP` field references
 * a recognisable franchise. Returns `null` when no franchise is detected (pure
 * original world), skipping the step with zero overhead.
 */
export async function researchKnownIP(
    req: GenerateScaffoldRequest,
    role: ResolvedRole
): Promise<IpResearchContext | null> {
    const franchise = detectFranchise(req.knownIP, req.premise, req.name);

    if (!franchise) {
        return null;
    }

    console.log(`[ip-researcher] Detected franchise: "${franchise}" — starting research`);

    try {
        return await researchViaMCP(franchise, role);
    } catch (mcpError) {
        console.warn(
            `[ip-researcher] MCP failed (${(mcpError as Error).message}), using LLM fallback`
        );

        try {
            return await researchViaLLM(franchise, role);
        } catch (llmError) {
            console.error(
                `[ip-researcher] LLM fallback also failed:`,
                llmError
            );
            return null;
        }
    }
}
