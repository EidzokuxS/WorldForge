import { generateText, generateObject, stepCountIs, type ToolSet } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { z } from "zod";
import type { Settings } from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ProviderConfig } from "../ai/provider-registry.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MCPResearchResult {
    /** Synthesised lore context, ready to inject into generation prompts */
    context: string;
    /** URLs or source identifiers collected during research (empty for LLM-only path) */
    sources: string[];
    /** Raw LLM output before synthesis */
    raw: string;
}

// ---------------------------------------------------------------------------
// Helpers: resolve provider config from Settings
// ---------------------------------------------------------------------------

function resolveGeneratorProvider(settings: Settings): ProviderConfig {
    const role = settings.generator;
    const provider = settings.providers.find((p) => p.id === role.providerId);

    if (!provider) {
        throw new Error(
            `Generator provider "${role.providerId}" not found in settings`
        );
    }

    return {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: role.model?.trim() || provider.defaultModel,
    };
}

// ---------------------------------------------------------------------------
// LLM-only fallback
// ---------------------------------------------------------------------------

const llmResearchSchema = z.object({
    context: z
        .string()
        .describe(
            "Synthesised world-building context: key factions, races, power systems, tone, notable events (≤400 words)"
        ),
    sources: z
        .array(z.string())
        .describe("Source names or references used (empty array if unknown)"),
});

async function performLLMOnlyResearch(
    queries: string[],
    providerConfig: ProviderConfig,
    temperature: number,
    maxOutputTokens: number
): Promise<MCPResearchResult> {
    const searchList = queries.map((q, i) => `${i + 1}. ${q}`).join("\n");

    const prompt = `You are a franchise lore researcher for a tabletop RPG world generator.

Research the following topics using your internal knowledge:
${searchList}

Synthesise your findings into a comprehensive world-building context covering:
- Key factions, races, and power structures
- Magic or technology systems
- Tone and atmosphere
- Notable historical events or conflicts
- Signature locations

Be specific and factual. Aim for ≤400 words of context.`;

    const { object } = await generateObject({
        model: createModel(providerConfig),
        schema: llmResearchSchema,
        prompt,
        temperature,
        maxOutputTokens,
    });

    console.log(
        `[mcp-research] LLM-only research complete (${object.context.length} chars)`
    );

    return {
        context: object.context,
        sources: object.sources,
        raw: object.context,
    };
}

// ---------------------------------------------------------------------------
// MCP primary path
// ---------------------------------------------------------------------------

/** How long to wait (ms) for the MCP subprocess to initialise */
const MCP_INIT_TIMEOUT_MS = 20_000;

/** Extract URLs from generateText result steps */
function extractSources(text: string): string[] {
    const urlPattern = /https?:\/\/[^\s"')\]>]+/g;
    const matches = text.match(urlPattern) ?? [];
    return [...new Set(matches)];
}

async function performMCPResearchInternal(
    queries: string[],
    providerConfig: ProviderConfig,
    temperature: number
): Promise<MCPResearchResult> {
    const transport = new Experimental_StdioMCPTransport({
        command: "npx",
        args: ["-y", "duckduckgo-mcp-server"],
    });

    const mcpClient = await Promise.race([
        createMCPClient({ transport }),
        new Promise<never>((_, reject) =>
            setTimeout(
                () =>
                    reject(
                        new Error(`MCP init timed out after ${MCP_INIT_TIMEOUT_MS}ms`)
                    ),
                MCP_INIT_TIMEOUT_MS
            )
        ),
    ]);

    try {
        const tools = (await mcpClient.tools()) as ToolSet;

        const searchList = queries.map((q, i) => `${i + 1}. ${q}`).join("\n");

        const systemPrompt = `You are a franchise lore researcher for a tabletop RPG world generator.
Use the available DuckDuckGo search tools to research the following topics:
${searchList}

Search strategy:
- Issue one search per topic
- Prioritise wiki, fandom, and official sources
- Collect key facts: factions, races, power systems, tone, events, locations

After completing all searches, write a synthesised lore context (≤400 words) with:
- Key factions and power structures
- Magic or technology systems  
- World tone and atmosphere
- Notable historical events
- Signature locations

List any URLs you referenced.`;

        const { text: rawResearch } = await generateText({
            model: createModel(providerConfig),
            tools,
            stopWhen: stepCountIs(10),
            system: systemPrompt,
            prompt: "Begin your research now.",
            temperature,
        });

        const sources = extractSources(rawResearch);

        // Synthesise into clean context block
        const synthPrompt = `You just completed web research. Here are your raw notes:

${rawResearch}

Rewrite these notes as a clean, structured world-building context (≤400 words) suitable for injecting into RPG generation prompts. Remove any search artefacts or formatting noise.`;

        const { object: synthesised } = await generateObject({
            model: createModel(providerConfig),
            schema: llmResearchSchema,
            prompt: synthPrompt,
            temperature: 0.1,
        });

        console.log(
            `[mcp-research] MCP research complete: ${synthesised.context.length} chars, ${sources.length} sources`
        );

        return {
            context: synthesised.context,
            sources: [...new Set([...sources, ...synthesised.sources])],
            raw: rawResearch,
        };
    } finally {
        await mcpClient.close();
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Perform autonomous web research on the provided queries using the DuckDuckGo
 * MCP server subprocess. Falls back to LLM-only research if the MCP server
 * fails to start or encounters an error.
 *
 * @param queries  - Search topics (e.g. ["Warhammer 40k factions", "40k lore overview"])
 * @param settings - App settings; uses the `generator` role for LLM calls
 */
export async function performMCPResearch(
    queries: string[],
    settings: Settings
): Promise<MCPResearchResult> {
    if (queries.length === 0) {
        return { context: "", sources: [], raw: "" };
    }

    const providerConfig = resolveGeneratorProvider(settings);
    const { temperature, maxTokens } = settings.generator;

    try {
        return await performMCPResearchInternal(queries, providerConfig, temperature);
    } catch (mcpError) {
        console.warn(
            `[mcp-research] MCP failed (${(mcpError as Error).message}), falling back to LLM-only research`
        );

        return await performLLMOnlyResearch(
            queries,
            providerConfig,
            temperature,
            maxTokens
        );
    }
}
