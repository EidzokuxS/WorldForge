# External Integrations

**Analysis Date:** 2026-03-19

## APIs & External Services

**LLM Providers (user-configurable, not hardcoded):**
All LLM API calls go through the Vercel AI SDK. Provider URLs and keys are stored in `settings.json` and resolved at runtime via `backend/src/ai/provider-registry.ts`.

- **OpenAI** — `https://api.openai.com/v1`
  - SDK: `@ai-sdk/openai` via `createOpenAI()`
  - Protocol: `openai-compatible`
  - Auth: API key stored in `settings.json` under provider config

- **Anthropic** — `https://api.anthropic.com/v1`
  - SDK: `@ai-sdk/anthropic` via `createAnthropic()`
  - Protocol: `anthropic-compatible` (detected by URL pattern `/anthropic` or `anthropic.com`)
  - Auth: `authToken` + `x-api-key` header

- **OpenRouter** — `https://openrouter.ai/api/v1`
  - SDK: `@ai-sdk/openai` (OpenAI-compatible protocol)
  - Used in production for Embedder role (qwen/qwen3-embedding-8b)

- **Ollama (local)** — `http://localhost:11434/v1`
  - SDK: `@ai-sdk/openai` (OpenAI-compatible)
  - No API key required (`"ollama"` placeholder used)

- **Custom providers** — any OpenAI-compatible or Anthropic-compatible endpoint
  - Detected by `resolveProviderProtocol()` in `backend/src/ai/provider-registry.ts`

**Image Generation:**
- Any OpenAI-compatible `/v1/images/generations` endpoint
  - Implementation: raw `fetch()` in `backend/src/images/generate.ts`
  - Returns `b64_json`, cached to `campaigns/{id}/images/`
  - Disabled by default (`settings.images.enabled = false`, `providerId = "none"`)

**Web Search (via MCP):**
- **DuckDuckGo MCP Server** — `npx -y duckduckgo-mcp-server` (spawned as subprocess)
  - Used by: `backend/src/worldgen/ip-researcher.ts` (Step 0 of world generation pipeline)
  - Client: `@ai-sdk/mcp` via `createMCPClient()` with `Experimental_StdioMCPTransport`
  - Fallback: LLM internal knowledge if MCP fails or times out (20s timeout)
  - Config: `backend/src/lib/mcp-client.ts`

- **Z.AI Search MCP** — `npx -y zai-search-mcp` (spawned as subprocess)
  - Alternative to DuckDuckGo, selectable via `settings.research.searchProvider`
  - Same MCP transport mechanism

## Data Storage

**Databases:**
- **SQLite** via `better-sqlite3` + `drizzle-orm`
  - Per-campaign database: `campaigns/{uuid}/state.db`
  - WAL mode enabled, foreign keys ON, busy timeout 5000ms
  - Client: `backend/src/db/index.ts` — `connectDb()` / `getDb()`
  - Schema: `backend/src/db/schema.ts` — 7 tables: `campaigns`, `locations`, `players`, `npcs`, `items`, `factions`, `relationships`, `chronicle`
  - Migrations: `backend/drizzle/` (4 migration files), generated via `drizzle-kit`

**Vector Database:**
- **LanceDB** (`@lancedb/lancedb` ^0.26.2) — embedded, file-based, no Python
  - Per-campaign storage: `campaigns/{uuid}/vectors/`
  - Connection: `backend/src/vectors/connection.ts` — single-connection singleton
  - Use: semantic search for lore cards (cosine similarity)
  - Embedding: via `embedMany()` from Vercel AI SDK using configured Embedder role
  - Implementation: `backend/src/vectors/lore-cards.ts`, `backend/src/vectors/embeddings.ts`

**File Storage:**
- Local filesystem only
  - Campaign configs: `campaigns/{uuid}/config.json` (world seeds, campaign metadata)
  - Chat history: `campaigns/{uuid}/chat_history.json`
  - Images cache: `campaigns/{uuid}/images/` (generated portrait/location/scene images)
  - App settings: `settings.json` at backend root

**Caching:**
- In-memory singleton for active DB connection and vector DB connection
- Image caching: filesystem at `campaigns/{uuid}/images/`

## Authentication & Identity

**Auth Provider:**
- None — no user authentication system
- Single-user local application
- LLM API keys stored plaintext in `settings.json`
- Campaign ID path traversal protection via `assertSafeId()` regex in routes

## Monitoring & Observability

**Error Tracking:**
- None (no external service)

**Logs:**
- Custom structured logger: `backend/src/lib/logger.ts`
- Log files written to `backend/logs/`
- Usage: `createLogger("module-name")` returns `{ info, warn, error }` logger
- Frontend uses no logging library

## CI/CD & Deployment

**Hosting:**
- No deployment config detected (no Dockerfile, no Vercel/Railway/Fly config)
- Development-only setup (local machine)

**CI Pipeline:**
- Not detected

## Environment Configuration

**Required env vars:**
- None strictly required — all defaults are hardcoded
- `PORT` — optional, defaults to `3001`
- `CORS_ORIGIN` — optional, defaults to `http://localhost:3000`

**Secrets location:**
- LLM API keys: `settings.json` at project root (not in environment variables)
- No `.env` files present in the project

## Webhooks & Callbacks

**Incoming:**
- None — no webhook receivers

**Outgoing:**
- None — all external calls are request-response (LLM API calls, MCP subprocess tool calls)

## WebSocket

**Internal WebSocket endpoint:**
- `ws://localhost:3001/ws` — implemented via `@hono/node-ws`
- Current use: ping/pong keepalive only (`backend/src/index.ts`)
- LLM streaming is done via HTTP SSE (Server-Sent Events), not WebSocket

---

*Integration audit: 2026-03-19*
