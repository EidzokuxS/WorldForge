import type { ToolSet } from "ai";
import type { SearchProvider } from "@worldforge/shared";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { createLogger } from "./logger.js";

const log = createLogger("mcp-client");

/** Timeout (ms) to wait for the MCP subprocess to initialise */
const MCP_INIT_TIMEOUT_MS = 20_000;

/** MCP server command configs for each search provider */
const SEARCH_MCP_CONFIGS: Record<SearchProvider, { command: string; args: string[] }> = {
  duckduckgo: { command: "npx", args: ["-y", "duckduckgo-mcp-server"] },
  zai: { command: "npx", args: ["-y", "zai-search-mcp"] },
};

/**
 * Runs `fn` with DuckDuckGo MCP tools, falling back to `fallbackFn` on any
 * error (timeout, transport failure, etc.). The MCP client is always closed.
 *
 * @deprecated Use `withSearchMcp` for configurable search provider support.
 */
export async function withMcpClient<T>(
  fn: (tools: ToolSet) => Promise<T>,
  fallbackFn: () => Promise<T>,
): Promise<T> {
  return withSearchMcp("duckduckgo", fn, fallbackFn);
}

/**
 * Runs `fn` with search MCP tools from the specified provider, falling back
 * to `fallbackFn` on any error (timeout, transport failure, etc.).
 * The MCP client is always closed.
 */
export async function withSearchMcp<T>(
  provider: SearchProvider,
  fn: (tools: ToolSet) => Promise<T>,
  fallbackFn: () => Promise<T>,
): Promise<T> {
  const config = SEARCH_MCP_CONFIGS[provider];

  try {
    const transport = new Experimental_StdioMCPTransport({
      command: config.command,
      args: config.args,
    });

    const mcpClient = await Promise.race([
      createMCPClient({ transport }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`MCP init timed out after ${MCP_INIT_TIMEOUT_MS}ms`)),
          MCP_INIT_TIMEOUT_MS,
        ),
      ),
    ]);

    try {
      const tools = await mcpClient.tools() as ToolSet;
      return await fn(tools);
    } finally {
      await mcpClient.close();
    }
  } catch (error) {
    log.warn(`MCP[${provider}] failed (${(error as Error).message}), using fallback`);
    return fallbackFn();
  }
}
