# External Integrations

**Analysis Date:** 2026-03-09

## APIs & External Services

**LLM Providers (Provider-Agnostic via Vercel AI SDK):**
- All LLM calls go through `ai` package (`streamText`, `generateText`, `generateObject`, `embedMany`)
- Provider registry: `backend/src/ai/provider-registry.ts`
- Two protocol adapters:
  - `@ai-sdk/openai` (`createOpenAI`) - OpenAI-compatible endpoints (OpenAI, OpenRouter, Ollama, LM Studio, vLLM, custom)
  - `@ai-sdk/anthropic` (`createAnthropic`) - Anthropic-compatible endpoints
- Protocol auto-detected from base URL (contains "anthropic" -> anthropic-compatible, else openai-compatible)
- Override via `protocol` field on provider config

**Supported Cloud LLM Providers:**
- OpenAI - Built-in preset, base URL `https://api.openai.com/v1`
- Anthropic - Built-in preset, base URL `https://api.anthropic.com`
- OpenRouter - Built-in preset, base URL `https://openrouter.ai/api/v1`
- Any custom OpenAI-compatible endpoint (user-configurable)

**Supported Local LLM Providers:**
- Ollama - Built-in preset, base URL `http://localhost:11434/v1`
- LM Studio, vLLM - Via custom provider configuration

**4 LLM Roles (each independently configurable):**
- Judge - Structured JSON decisions (low temperature)
- Storyteller - Creative narrative prose (high temperature)
- Generator - World generation, character creation (medium temperature)
- Embedder - Text embeddings for vector search

**DuckDuckGo Web Search (via MCP):**
- Package: `@ai-sdk/mcp` + `Experimental_StdioMCPTransport`
- Usage: IP researcher spawns `npx -y duckduckgo-mcp-server` as subprocess
- File: `backend/src/worldgen/ip-researcher.ts`
- Purpose: Research known IP franchises (D&D, Star Wars, etc.) for world generation
- Fallback: If MCP fails, uses LLM internal knowledge instead
- Configuration: `research.enabled` and `research.maxSearchSteps` in settings

## Data Storage

**SQLite (Primary Database):**
- Driver: `better-sqlite3` (synchronous, embedded)
- ORM: `drizzle-orm` with `drizzle-kit` for migrations
- Schema: `backend/src/db/schema.ts`
- Connection: `backend/src/db/index.ts`
- Migrations: `backend/drizzle/` directory
- Location: `campaigns/{uuid}/state.db` (per-campaign)
- 7 tables: `campaigns`, `locations`, `players`, `npcs`, `items`, `factions`, `relationships`, `chronicle`
- JSON columns stored as text (tags, goals, beliefs, connectedTo, equippedItems)

**LanceDB (Vector Database):**
- Package: `@lancedb/lancedb` (Rust-based, embedded, no external server)
- Connection: `backend/src/vectors/connection.ts` - singleton pattern, one campaign at a time
- Location: `campaigns/{uuid}/vectors/` (per-campaign, filesystem-based)
- Tables: `lore_cards` (implemented), `episodic_events` (schema only)
- Operations: `backend/src/vectors/lore-cards.ts` - insert, search (cosine similarity), get all, delete
- Embeddings: `backend/src/vectors/embeddings.ts` - uses Vercel AI SDK `embedMany()` with OpenAI-compatible embedding models
- Batch size: 50 texts per embedding call

**File Storage:**
- Campaign data: `campaigns/{uuid}/` directory structure
  - `state.db` - SQLite database
  - `config.json` - Campaign metadata, premise, world seeds
  - `chat_history.json` - Conversation history
  - `vectors/` - LanceDB data files
- Settings: `settings.json` at project root (auto-created)
- All local filesystem, no cloud storage

**Caching:**
- None (no Redis, no in-memory cache layer)

## Authentication & Identity

**Auth Provider:**
- None - Single-user local application
- No authentication, no user accounts
- API keys for LLM providers stored in `settings.json` (server-side)
- Security: `assertSafeId()` regex validates campaign IDs to prevent path traversal

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, no external error tracking)

**Logs:**
- `console.log` / `console.warn` / `console.error` throughout backend
- No structured logging framework
- Key log prefixes: `[ip-researcher]`, `[scaffold-generator]`

## CI/CD & Deployment

**Hosting:**
- Localhost only - No cloud deployment
- Backend on port 3001, frontend on port 3000

**CI Pipeline:**
- No `.github/` directory detected
- No CI/CD configuration

## Environment Configuration

**Required env vars:**
- None strictly required (all have defaults)

**Optional env vars:**
- `PORT` - Backend port (default: 3001)
- `CORS_ORIGIN` - Allowed CORS origin (default: `http://localhost:3000`)
- `NEXT_PUBLIC_API_BASE` - Frontend API base URL (default: `http://localhost:3001`)

**Settings file (`settings.json`):**
- LLM provider configs (name, base URL, API key, default model)
- Role assignments (provider + model + temperature + maxTokens for each of 4 roles)
- Fallback config (provider, model, timeout, retry count)
- Image generation config (provider, model, style prompt, enabled flag)
- Research config (enabled, maxSearchSteps)
- Managed by `backend/src/settings/manager.ts` with normalization and validation

## Communication Protocols

**HTTP REST:**
- Frontend -> Backend via `fetch()` calls
- API client: `frontend/lib/api.ts` - `apiGet()`, `apiPost()`, `apiDelete()`, `apiStreamPost()`
- Base URL configurable via `NEXT_PUBLIC_API_BASE`

**Server-Sent Events (SSE):**
- World generation pipeline streams progress via SSE (`text/event-stream`)
- Events: `progress` (step updates), `complete` (final result), `error`
- Client parsing: `frontend/lib/api.ts` `generateWorld()` function

**WebSocket:**
- Endpoint: `/ws` on backend
- Currently minimal: connection confirmation + ping/pong
- Set up via `@hono/node-ws` (`createNodeWebSocket`)
- File: `backend/src/index.ts`

**Plain Text Streaming:**
- Chat/narrative responses stream as plain text (not SSE)
- Manual `ReadableStream` parsing on frontend

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## External Tool Integration

**MCP (Model Context Protocol):**
- `@ai-sdk/mcp` `^1.0.25` - Client for MCP tool servers
- `Experimental_StdioMCPTransport` - Spawns MCP servers as child processes
- Currently used: `duckduckgo-mcp-server` (installed on-demand via `npx -y`)
- File: `backend/src/worldgen/ip-researcher.ts`
- Pattern: spawn MCP server -> get tools -> pass to `generateText()` -> close

**SillyTavern V2/V3 Card Import:**
- Client-side parser: `frontend/lib/v2-card-parser.ts`
- Supports JSON files and PNG files with embedded tEXt chunks
- Zero external dependencies (manual PNG chunk parsing)

---

*Integration audit: 2026-03-09*
