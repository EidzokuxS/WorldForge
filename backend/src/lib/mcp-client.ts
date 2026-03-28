import type { ToolSet } from "ai";
import type { SearchProvider } from "@worldforge/shared";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { createLogger } from "./logger.js";

const log = createLogger("mcp-client");

/** Timeout (ms) to wait for the MCP subprocess to initialise */
const MCP_INIT_TIMEOUT_MS = 20_000;


/**
 * On Windows, child_process.spawn with .cmd files requires shell: true,
 * but @ai-sdk/mcp hardcodes shell: false. Workaround: spawn node directly
 * and resolve the npx script path, OR use cmd.exe /c as the command.
 */
const IS_WIN = process.platform === "win32";

function mcpConfig(pkg: string): { command: string; args: string[] } {
  if (IS_WIN) {
    // Use cmd.exe /c npx to bypass shell:false limitation in @ai-sdk/mcp
    return { command: "cmd.exe", args: ["/c", "npx", "-y", pkg] };
  }
  return { command: "npx", args: ["-y", pkg] };
}

/** MCP server command configs for stdio-based search providers */
const STDIO_MCP_CONFIGS: Partial<Record<SearchProvider, { command: string; args: string[] }>> = {
  duckduckgo: mcpConfig("duckduckgo-mcp-server"),
};

/** HTTP MCP server configs for remote search providers */
interface HttpMcpConfig {
  url: string;
  apiKeyEnv: string;
}

const HTTP_MCP_CONFIGS: Partial<Record<SearchProvider, HttpMcpConfig>> = {
  zai: {
    url: "https://api.z.ai/api/mcp/web_search_prime/mcp",
    apiKeyEnv: "ZAI_API_KEY",
  },
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
  apiKey?: string,
): Promise<T> {
  const httpConfig = HTTP_MCP_CONFIGS[provider];
  const stdioConfig = STDIO_MCP_CONFIGS[provider];

  if (!httpConfig && !stdioConfig) {
    log.warn(`No MCP config for provider "${provider}", using fallback`);
    return fallbackFn();
  }

  try {
    let mcpClient;

    if (httpConfig) {
      // HTTP-based remote MCP (e.g. Z.AI)
      const key = apiKey || process.env[httpConfig.apiKeyEnv] || "";
      if (!key) {
        log.warn(`MCP[${provider}] requires API key (${httpConfig.apiKeyEnv}), using fallback`);
        return fallbackFn();
      }

      mcpClient = await Promise.race([
        createMCPClient({
          transport: {
            type: "http",
            url: httpConfig.url,
            headers: { Authorization: `Bearer ${key}` },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`MCP init timed out after ${MCP_INIT_TIMEOUT_MS}ms`)),
            MCP_INIT_TIMEOUT_MS,
          ),
        ),
      ]);
    } else {
      // Stdio-based local MCP (e.g. DuckDuckGo)
      const transport = new Experimental_StdioMCPTransport({
        command: stdioConfig!.command,
        args: stdioConfig!.args,
      });

      mcpClient = await Promise.race([
        createMCPClient({ transport }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`MCP init timed out after ${MCP_INIT_TIMEOUT_MS}ms`)),
            MCP_INIT_TIMEOUT_MS,
          ),
        ),
      ]);
    }

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
