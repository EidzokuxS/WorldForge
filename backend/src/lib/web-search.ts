/**
 * Unified web search dispatcher.
 *
 * Routes to the configured search provider (Brave, DDG HTML, MCP-based).
 * All providers return the same SearchResult shape.
 */

import type { SearchProvider } from "@worldforge/shared";
import { braveSearch } from "./brave-search.js";
import { ddgSearch } from "./ddg-search.js";
import { withSearchMcp } from "./mcp-client.js";
import { createLogger } from "./logger.js";
import type { ProviderConfig } from "../ai/provider-registry.js";

const log = createLogger("web-search");

export interface SearchResult {
  title: string;
  description: string;
  url: string;
}

export interface SearchConfig {
  provider: SearchProvider;
  /** Brave API key — required when provider is "brave" */
  braveApiKey?: string;
  /** Z.AI API key — required when provider is "zai" */
  zaiApiKey?: string;
  /** LLM provider config — required for MCP-based providers that use tool calling */
  llmProvider?: ProviderConfig;
}

/**
 * Perform a web search using the configured provider.
 */
export async function webSearch(
  query: string,
  config: SearchConfig,
  count = 10,
): Promise<SearchResult[]> {
  switch (config.provider) {
    case "brave":
      return braveSearch(query, config.braveApiKey ?? process.env.BRAVE_SEARCH_API_KEY ?? "", count);

    case "duckduckgo":
      return ddgSearch(query, count);

    case "zai":
      return searchViaMcp(query, config, count, config.zaiApiKey);

    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown search provider: ${_exhaustive}`);
    }
  }
}

/**
 * MCP-based search (ZAI or other MCP search providers).
 * Calls the MCP tool directly — no intermediate LLM needed.
 */
async function searchViaMcp(
  query: string,
  config: SearchConfig,
  count: number,
  apiKey?: string,
): Promise<SearchResult[]> {
  return withSearchMcp(
    config.provider,
    async (tools) => {
      const toolNames = Object.keys(tools);
      log.info(`MCP[${config.provider}] available tools: ${toolNames.join(", ")}`);

      // Find the search tool (web_search_prime, search, etc.)
      const searchToolName = toolNames.find((n) => n.includes("search")) ?? toolNames[0];
      const searchTool = tools[searchToolName];

      if (!searchTool?.execute) {
        log.warn(`MCP[${config.provider}] no executable search tool found`);
        return [];
      }

      // Call MCP tool directly with the search query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exec = searchTool.execute as (args: Record<string, unknown>, opts?: unknown) => Promise<unknown>;
      const raw = await exec({ search_query: query, query, count });
      log.info(`MCP[${config.provider}] tool "${searchToolName}" called for "${query}"`);

      // Parse the result into SearchResult[]
      const results = parseMcpSearchResults(raw, config.provider);
      log.info(`MCP[${config.provider}]: ${results.length} results for "${query}"`);
      return results.slice(0, count);
    },
    async () => {
      log.warn(`MCP[${config.provider}] failed, no results`);
      return [];
    },
    apiKey,
  );
}

/**
 * Parse various MCP tool result formats into SearchResult[].
 */
function parseMcpSearchResults(raw: unknown, provider: string): SearchResult[] {
  // If string, try parsing as JSON
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      // Maybe it's freeform text with URLs
      return parseTextForUrls(data as string);
    }
  }

  // Array of result objects
  if (Array.isArray(data)) {
    const results: SearchResult[] = [];
    for (const item of data) {
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        const url = String(obj.url ?? obj.link ?? obj.href ?? "");
        const title = String(obj.title ?? obj.name ?? "");
        const description = String(obj.description ?? obj.snippet ?? obj.content ?? obj.summary ?? "");
        if (url.startsWith("http")) {
          results.push({ title: title.slice(0, 200), description, url });
        }
      }
    }
    return results;
  }

  // Single object with various wrapper patterns
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;

    // MCP content format: { content: [{ type: "text", text: "..." }], isError: false }
    if (Array.isArray(obj.content)) {
      const textParts = (obj.content as Array<{ type: string; text?: string }>)
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!);
      if (textParts.length > 0) {
        const combined = textParts.join("\n");
        return parseMcpSearchResults(combined, provider);
      }
    }

    // Common wrapper patterns: { results: [...] }, { web: { results: [...] } }, { data: [...] }
    const nested = obj.results ?? obj.web ?? obj.data ?? obj.items;
    if (nested) {
      return parseMcpSearchResults(nested, provider);
    }
  }

  log.warn(`MCP[${provider}] unexpected result format: ${typeof data}`);
  return [];
}

/** Fallback: parse freeform text for URLs */
function parseTextForUrls(text: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const line of text.split("\n").filter((l) => l.trim())) {
    const urlMatch = line.match(/https?:\/\/[^\s)]+/);
    if (urlMatch) {
      results.push({
        title: line.replace(urlMatch[0], "").replace(/[-|:*]/g, "").trim().slice(0, 200),
        description: line.trim(),
        url: urlMatch[0],
      });
    }
  }
  return results;
}
